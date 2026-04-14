#!/usr/bin/env node

/**
 * platform-test-mcp-server
 *
 * MCP Server for VS Code Copilot — provides tools that Copilot can't do itself:
 *   - analyze_diff      — Read & classify git changes across repos
 *   - run_tests         — Execute Cypress tests and report results
 *   - list_generated    — List existing generated test files
 *
 * Test code GENERATION is done by Copilot itself (it IS the LLM).
 * No external API key needed.
 *
 * Transport: stdio (VS Code auto-launches via .vscode/mcp.json)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTOMATION_ROOT = process.env.AUTOMATION_ROOT || path.resolve(__dirname, '..');

// ─── Helper: run a script ─────────────────────────────────────────────────────

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

    const chunks = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk.toString().replace(/\x1b\[[0-9;]*m/g, ''));
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode || 0, stdout: chunks.join(''), stderr });
    });
  });
}

// ─── Helper: list test files ──────────────────────────────────────────────────

function listTestFiles(subdir) {
  const dir = path.join(AUTOMATION_ROOT, 'cypress', 'e2e', subdir);
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.cy.js')) {
        const full = path.join(d, e.name);
        const stat = fs.statSync(full);
        results.push({
          path: path.relative(AUTOMATION_ROOT, full),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  }
  walk(dir);
  return results;
}

// ─── Helper: read file content ────────────────────────────────────────────────

function readFileContent(filePath) {
  const full = path.resolve(AUTOMATION_ROOT, filePath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ─── Create MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: 'platform-test',
  version: '2.0.0',
  description: 'Cypress test automation tools for platform-server and platform-web',
});

// ─── Tool: analyze_diff ─────────────────────────────────────────────────────

server.tool(
  'analyze_diff',
  'Analyze git diffs from platform-server and/or platform-web. Returns changed files classified by type (controller, service, page, component, etc.) with diff content. Use this to understand what changed before generating tests.',
  {
    repo: z.enum(['server', 'web', 'all']).default('all').describe('Which repo to analyze: server, web, or all'),
    range: z.string().default('HEAD~1').describe('Git diff range, e.g. HEAD~1, main..develop, abc123..def456'),
  },
  async ({ repo, range }) => {
    try {
      const result = await runScript('scripts/analyze-diff.js', [
        '--repo', repo,
        '--range', range,
        '--output', 'json',
      ]);

      return {
        content: [{
          type: 'text',
          text: result.exitCode === 0
            ? `Diff analysis (${repo}, range: ${range}):\n\n${result.stdout}`
            : `Analysis failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: run_tests ─────────────────────────────────────────────────────────

server.tool(
  'run_tests',
  'Execute Cypress tests and return pass/fail results. Can run generated tests, baseline smoke tests, or all tests.',
  {
    spec: z.enum(['generated', 'baseline', 'all']).default('generated').describe('Which tests to run'),
    browser: z.enum(['electron', 'chrome', 'firefox']).default('electron').describe('Browser to use'),
    headed: z.boolean().default(false).describe('Show browser window (for debugging)'),
  },
  async ({ spec, browser, headed }) => {
    try {
      const args = ['--run-only', '--spec', spec, '--browser', browser];
      if (headed) args.push('--headed');

      const result = await runScript('scripts/run-automation.js', args);

      return {
        content: [{
          type: 'text',
          text: result.exitCode === 0
            ? `✅ Tests PASSED (${spec}):\n\n${result.stdout}`
            : `❌ Tests FAILED (exit ${result.exitCode}):\n\n${result.stdout}\n${result.stderr}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Tool: list_generated ────────────────────────────────────────────────────

server.tool(
  'list_generated',
  'List all generated and baseline Cypress test files.',
  {},
  async () => {
    const generated = listTestFiles('generated');
    const baseline = listTestFiles('baseline');

    const lines = [];
    if (baseline.length > 0) {
      lines.push(`Baseline tests (${baseline.length}):`);
      baseline.forEach(f => lines.push(`  • ${f.path}`));
    }
    if (generated.length > 0) {
      lines.push(`\nGenerated tests (${generated.length}):`);
      generated.forEach(f => lines.push(`  • ${f.path}  (${f.modified})`));
    }
    if (lines.length === 0) {
      lines.push('No test files found. Use Copilot to generate tests after analyzing diffs.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ─── Tool: get_prompt_template ───────────────────────────────────────────────

server.tool(
  'get_prompt_template',
  'Read the AI prompt template for test generation. Returns the template content that guides how Cypress tests should be structured. Copilot should use this template as guidance when generating test code.',
  {
    type: z.enum(['api', 'e2e']).describe('api = backend API tests, e2e = frontend UI tests'),
  },
  async ({ type }) => {
    const fileName = type === 'api' ? 'api-test-prompt.md' : 'e2e-test-prompt.md';
    const content = readFileContent(path.join('prompts', fileName));

    if (!content) {
      return { content: [{ type: 'text', text: `Template not found: prompts/${fileName}` }] };
    }

    return { content: [{ type: 'text', text: content }] };
  }
);

// ─── Tool: save_test_file ────────────────────────────────────────────────────

server.tool(
  'save_test_file',
  'Save a generated Cypress test file to the generated tests directory. Use this after Copilot has generated test code.',
  {
    fileName: z.string().describe('Test file name, e.g. user-api.cy.js or login-page.cy.js'),
    repo: z.enum(['server', 'web']).describe('Which repo the test is for (determines subdirectory)'),
    content: z.string().describe('The Cypress test code content'),
  },
  async ({ fileName, repo, content }) => {
    try {
      const dir = path.join(AUTOMATION_ROOT, 'cypress', 'e2e', 'generated', repo);
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');

      const relativePath = path.relative(AUTOMATION_ROOT, filePath);
      return {
        content: [{
          type: 'text',
          text: `✅ Test saved: ${relativePath}\n\nRun it with the run_tests tool (spec: "generated").`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error saving file: ${err.message}` }] };
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});
