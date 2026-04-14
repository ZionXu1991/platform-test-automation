#!/usr/bin/env node

/**
 * platform-test-mcp-server
 *
 * An MCP (Model Context Protocol) Server that exposes the
 * platform-test-automation scripts as tools for VS Code Copilot.
 *
 * Tools exposed:
 *   - analyze_diff     — Read & classify git changes from platform repos
 *   - generate_tests   — AI-generate Cypress tests from git diff
 *   - run_tests        — Execute Cypress tests
 *   - full_pipeline    — End-to-end: analyze → generate → run → report
 *   - list_generated   — List currently generated test files
 *
 * Transport: stdio (VS Code launches this process directly)
 *
 * Configuration:
 *   Set AUTOMATION_ROOT env var to the platform-test-automation project root.
 *   Defaults to the parent directory of this server file.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ─── Resolve paths ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTOMATION_ROOT = process.env.AUTOMATION_ROOT || path.resolve(__dirname, '..');

// ─── Helper: run a script and capture output ─────────────────────────────────

function runScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(AUTOMATION_ROOT, script);

    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Script not found: ${scriptPath}`));
      return;
    }

    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: AUTOMATION_ROOT,
      env: { ...process.env },
      shell: false,
    });

    const outputLines = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI
      outputLines.push(text);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
    });

    child.on('error', (err) => reject(err));

    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode || 0,
        stdout: outputLines.join(''),
        stderr,
      });
    });
  });
}

// ─── Helper: list generated test files ────────────────────────────────────────

function listGeneratedTests() {
  const generatedDir = path.join(AUTOMATION_ROOT, 'cypress', 'e2e', 'generated');
  if (!fs.existsSync(generatedDir)) return [];

  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.cy.js')) {
        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);
        results.push({
          path: path.relative(AUTOMATION_ROOT, fullPath),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  }
  walk(generatedDir);
  return results;
}

// ─── Create MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: 'platform-test',
  version: '1.0.0',
  description: 'AI-powered Cypress test automation for platform-server and platform-web',
});

// ─── Tool: analyze_diff ─────────────────────────────────────────────────────

server.tool(
  'analyze_diff',
  'Analyze git diffs from platform-server and/or platform-web. Classifies changed files into categories (controller, service, page, component, etc.) without generating tests.',
  {
    repo: z.enum(['server', 'web', 'all']).default('all').describe('Which repo to analyze'),
    range: z.string().default('HEAD~1').describe('Git diff range, e.g. HEAD~1, main..develop, abc123..def456'),
  },
  async ({ repo, range }) => {
    try {
      const result = await runScript('scripts/analyze-diff.js', [
        '--repo', repo,
        '--range', range,
      ]);

      return {
        content: [
          {
            type: 'text',
            text: result.exitCode === 0
              ? `✅ Diff analysis complete (${repo}, range: ${range}):\n\n${result.stdout}`
              : `❌ Analysis failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: generate_tests ────────────────────────────────────────────────────

server.tool(
  'generate_tests',
  'Analyze git diff and generate Cypress test files using AI. Backend changes produce API contract tests (cy.request), frontend changes produce E2E UI tests (cy.visit). Generated tests are written to cypress/e2e/generated/.',
  {
    repo: z.enum(['server', 'web', 'all']).default('all').describe('Which repo to analyze'),
    range: z.string().default('HEAD~1').describe('Git diff range'),
  },
  async ({ repo, range }) => {
    try {
      const result = await runScript('scripts/run-automation.js', [
        '--repo', repo,
        '--range', range,
        '--generate-only',
      ]);

      const generatedFiles = listGeneratedTests();
      const fileList = generatedFiles.length > 0
        ? '\n\nGenerated files:\n' + generatedFiles.map(f => `  • ${f.path}`).join('\n')
        : '\n\nNo test files were generated.';

      return {
        content: [
          {
            type: 'text',
            text: result.exitCode === 0
              ? `✅ Test generation complete (${repo}, range: ${range}):${fileList}\n\n${result.stdout}`
              : `❌ Generation failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: run_tests ─────────────────────────────────────────────────────────

server.tool(
  'run_tests',
  'Run Cypress tests. Can run generated tests, baseline smoke tests, or all. Returns pass/fail results.',
  {
    spec: z.enum(['generated', 'baseline', 'all']).default('generated').describe('Which test suite to run'),
    browser: z.enum(['electron', 'chrome', 'firefox']).default('electron').describe('Browser to use'),
    headed: z.boolean().default(false).describe('Run with visible browser window'),
  },
  async ({ spec, browser, headed }) => {
    try {
      const args = ['--run-only', '--spec', spec, '--browser', browser];
      if (headed) args.push('--headed');

      const result = await runScript('scripts/run-automation.js', args);

      return {
        content: [
          {
            type: 'text',
            text: result.exitCode === 0
              ? `✅ Cypress tests PASSED (spec: ${spec}):\n\n${result.stdout}`
              : `❌ Cypress tests FAILED (exit code ${result.exitCode}):\n\n${result.stdout}\n${result.stderr}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: full_pipeline ─────────────────────────────────────────────────────

server.tool(
  'full_pipeline',
  'Run the complete automation pipeline: analyze git diff → generate Cypress tests with AI → execute tests → produce HTML report. This is the one-command end-to-end flow.',
  {
    repo: z.enum(['server', 'web', 'all']).default('all').describe('Which repo to analyze'),
    range: z.string().default('HEAD~1').describe('Git diff range'),
    runBaseline: z.boolean().default(false).describe('Also run baseline smoke tests alongside generated ones'),
  },
  async ({ repo, range, runBaseline }) => {
    try {
      const args = ['--repo', repo, '--range', range];
      if (runBaseline) args.push('--run-baseline');

      const result = await runScript('scripts/run-automation.js', args);

      const reportPath = path.join(AUTOMATION_ROOT, 'cypress', 'reports', 'html', 'combined.html');
      const reportExists = fs.existsSync(reportPath);

      return {
        content: [
          {
            type: 'text',
            text: [
              result.exitCode === 0
                ? `✅ Full pipeline complete (${repo}, range: ${range})`
                : `❌ Pipeline finished with errors (exit code ${result.exitCode})`,
              '',
              result.stdout,
              result.stderr ? `\nStderr:\n${result.stderr}` : '',
              reportExists ? `\n📊 HTML Report: ${reportPath}` : '',
            ].join('\n'),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: list_generated ────────────────────────────────────────────────────

server.tool(
  'list_generated',
  'List all currently generated Cypress test files with their paths and last modified timestamps.',
  {},
  async () => {
    const files = listGeneratedTests();

    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: 'No generated test files found in cypress/e2e/generated/.\nRun generate_tests first.' }],
      };
    }

    const table = files
      .map(f => `  • ${f.path}  (${f.size} bytes, ${f.modified})`)
      .join('\n');

    return {
      content: [{ type: 'text', text: `📂 Generated test files (${files.length}):\n${table}` }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running, listening on stdin/stdout
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});
