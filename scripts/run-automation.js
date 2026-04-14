'use strict';

/**
 * run-automation.js
 *
 * Main orchestrator for the platform-test-automation pipeline.
 *
 * Pipeline:
 *   1. Analyze git diffs from platform-server and/or platform-web
 *   2. Generate Cypress tests via AI
 *   3. Run Cypress (unless --generate-only)
 *   4. Print summary report
 *
 * Usage:
 *   node scripts/run-automation.js                          # full pipeline, both repos, HEAD~1
 *   node scripts/run-automation.js --repo server            # only backend
 *   node scripts/run-automation.js --repo web               # only frontend
 *   node scripts/run-automation.js --range abc123..def456   # specific commit range
 *   node scripts/run-automation.js --generate-only          # generate tests, don't run Cypress
 *   node scripts/run-automation.js --run-only               # skip generation, just run Cypress
 *   node scripts/run-automation.js --spec baseline          # run only baseline tests
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { Command } = require('commander');
const { config } = require('./config');
const { analyzeDiff } = require('./analyze-diff');
const { generateTests } = require('./generate-tests');

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   Platform Test Automation — AI + Cypress    ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Time: ${new Date().toLocaleString()}`));
  console.log(chalk.gray(`  AI Provider: ${config.ai.provider.toUpperCase()}`));
  console.log(chalk.gray(`  Frontend URL: ${config.cypress.baseUrl}`));
  console.log(chalk.gray(`  Backend URL: ${config.cypress.apiBaseUrl}`));
  console.log('');
}

// ─── Cypress Runner ───────────────────────────────────────────────────────────

/**
 * Builds the Cypress run command arguments based on CLI options.
 */
function buildCypressArgs(opts, generatedFiles) {
  const args = ['run'];

  // Determine which specs to run
  if (opts.spec === 'generated') {
    args.push('--spec', 'cypress/e2e/generated/**/*.cy.js');
  } else if (opts.spec === 'baseline') {
    args.push('--spec', 'cypress/e2e/baseline/**/*.cy.js');
  } else if (opts.spec === 'all') {
    args.push('--spec', 'cypress/e2e/**/*.cy.js');
  } else if (opts.spec) {
    // User passed a specific pattern
    args.push('--spec', opts.spec);
  } else if (generatedFiles.length > 0) {
    // Run only the files we just generated
    const specs = generatedFiles.map(f => path.relative(process.cwd(), f.filePath)).join(',');
    args.push('--spec', specs);
  } else {
    // Fallback: run baseline
    args.push('--spec', 'cypress/e2e/baseline/**/*.cy.js');
  }

  if (opts.browser) args.push('--browser', opts.browser);
  if (opts.headed) args.push('--headed');

  return args;
}

/**
 * Runs Cypress and returns exit code.
 */
function runCypress(args) {
  return new Promise((resolve) => {
    console.log(chalk.blue('\n🚀 Running Cypress...'));
    console.log(chalk.gray(`   npx cypress ${args.join(' ')}`));
    console.log('');

    const child = spawn('npx', ['cypress', ...args], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      shell: true,
    });

    child.on('close', (code) => resolve(code));
    child.on('error', (err) => {
      console.error(chalk.red('Cypress spawn error:'), err.message);
      resolve(1);
    });
  });
}

// ─── Report Generation ────────────────────────────────────────────────────────

/**
 * Merges mochawesome JSON reports and generates HTML report.
 * Only runs if reports directory has output.
 */
function generateHTMLReport() {
  const reportsDir = path.resolve(__dirname, '..', 'cypress', 'reports');
  if (!fs.existsSync(reportsDir)) return;

  const jsonFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) return;

  console.log(chalk.blue('\n📊 Generating HTML report...'));

  try {
    execSync(
      'npx mochawesome-merge cypress/reports/*.json -o cypress/reports/combined.json && ' +
      'npx marge cypress/reports/combined.json -o cypress/reports/html --reportTitle "Platform Test Report"',
      { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' }
    );

    const htmlPath = path.resolve(__dirname, '..', 'cypress', 'reports', 'html', 'combined.html');
    if (fs.existsSync(htmlPath)) {
      console.log(chalk.green(`  ✅ HTML report: ${htmlPath}`));
    }
  } catch (err) {
    console.log(chalk.yellow('  ⚠ Could not generate HTML report:', err.message));
  }
}

// ─── Summary Printer ──────────────────────────────────────────────────────────

function printSummary({ diffContext, generationResult, cypressExitCode, opts, startTime }) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const status = cypressExitCode === 0 ? chalk.bold.green('✅ PASSED') :
                 cypressExitCode === null ? chalk.bold.yellow('⏭ SKIPPED') :
                 chalk.bold.red('❌ FAILED');

  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║                   SUMMARY                   ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝'));
  console.log(`  Status: ${status}`);
  console.log(`  Elapsed: ${elapsed}s`);

  if (diffContext) {
    console.log(`\n  📂 Diff Analysis:`);
    for (const repo of diffContext.repos) {
      console.log(`     ${repo.repoName}: ${repo.files.length} relevant file(s) changed`);
    }
  }

  if (generationResult) {
    console.log(`\n  🤖 Test Generation:`);
    console.log(`     ${generationResult.totalFiles} Cypress test file(s) generated`);
    for (const f of generationResult.generated || []) {
      const relPath = path.relative(path.resolve(__dirname, '..'), f.filePath);
      console.log(`     ✓ ${relPath}`);
    }
  }

  if (cypressExitCode !== null) {
    console.log(`\n  🎯 Cypress exit code: ${cypressExitCode}`);
  }

  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(opts) {
  const startTime = Date.now();
  printBanner();

  let diffContext = null;
  let generationResult = null;
  let cypressExitCode = null;

  try {
    // ── Step 1: Git Diff Analysis ──────────────────────────────────────────────
    if (!opts.runOnly) {
      console.log(chalk.bold('\n[Step 1/3] Analyzing Git Diffs'));
      console.log(chalk.gray(`  Repo: ${opts.repo} | Range: ${opts.range}`));

      diffContext = await analyzeDiff({ repo: opts.repo, range: opts.range });

      if (diffContext.summary.totalFiles === 0) {
        console.log(chalk.yellow('\n⚠ No relevant code changes found. Nothing to test.'));
        if (!opts.runBaseline) {
          printSummary({ diffContext, generationResult, cypressExitCode, opts, startTime });
          return;
        }
        console.log(chalk.gray('  Running baseline tests anyway (--run-baseline active)...'));
      }

      // Save DiffContext for debugging
      const dumpPath = path.resolve(__dirname, '..', 'cypress', 'reports', 'last-diff-context.json');
      fs.ensureDirSync(path.dirname(dumpPath));
      fs.writeJsonSync(dumpPath, diffContext, { spaces: 2 });

      // ── Step 2: AI Test Generation ─────────────────────────────────────────
      if (diffContext.summary.totalFiles > 0) {
        console.log(chalk.bold('\n[Step 2/3] Generating Cypress Tests with AI'));
        generationResult = await generateTests(diffContext);
      } else {
        console.log(chalk.gray('\n[Step 2/3] Skipping generation (no relevant changes)'));
        generationResult = { generated: [], totalFiles: 0 };
      }
    } else {
      console.log(chalk.gray('\n[Step 1-2/3] Skipped (--run-only mode)'));
    }

    // ── Step 3: Run Cypress ────────────────────────────────────────────────────
    if (!opts.generateOnly) {
      console.log(chalk.bold('\n[Step 3/3] Running Cypress Tests'));

      if (generationResult && generationResult.totalFiles === 0 && !opts.runBaseline && opts.spec !== 'all') {
        console.log(chalk.yellow('  ⚠ No generated tests to run. Use --run-baseline or --spec all to run existing tests.'));
        cypressExitCode = null;
      } else {
        const cypressArgs = buildCypressArgs(opts, generationResult?.generated || []);

        // Add baseline tests as well if requested
        if (opts.runBaseline && generationResult?.generated?.length > 0) {
          // Already handled via --spec all or the generated specs alone
        }

        cypressExitCode = await runCypress(cypressArgs);
        generateHTMLReport();
      }
    } else {
      console.log(chalk.gray('\n[Step 3/3] Skipped (--generate-only mode)'));
    }

  } catch (err) {
    console.error(chalk.red('\n❌ Pipeline error:'), err.message);
    if (config.verbose) console.error(err.stack);
    process.exitCode = 1;
  }

  printSummary({ diffContext, generationResult, cypressExitCode, opts, startTime });

  if (cypressExitCode && cypressExitCode !== 0) {
    process.exitCode = cypressExitCode;
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('run-automation')
  .description('Full pipeline: Git Diff → AI Test Generation → Cypress Execution')
  .option('--repo <name>', 'Repos to analyze: server | web | all', 'all')
  .option('--range <range>', 'Git diff range (e.g. HEAD~1, abc..def)', config.diff.defaultRange)
  .option('--generate-only', 'Only analyze diff and generate tests, do not run Cypress')
  .option('--run-only', 'Skip diff analysis and generation, only run Cypress')
  .option('--run-baseline', 'Also run baseline tests alongside generated tests')
  .option('--spec <pattern>', 'Cypress spec pattern: generated | baseline | all | custom glob')
  .option('--browser <name>', 'Browser to use (chrome | firefox | electron)', 'electron')
  .option('--headed', 'Run Cypress in headed mode (interactive browser)')
  .parse(process.argv);

main(program.opts()).catch(err => {
  console.error(chalk.red('\n💥 Unexpected error:'), err.message);
  process.exit(1);
});
