'use strict';

/**
 * analyze-diff.js
 *
 * Reads Git diffs from platform-server and/or platform-web,
 * classifies changed files, extracts relevant code, and returns
 * a structured DiffContext for the AI test generator.
 *
 * Usage (standalone):
 *   node scripts/analyze-diff.js --repo server --range HEAD~1
 *   node scripts/analyze-diff.js --repo web --range abc123..def456
 *   node scripts/analyze-diff.js --repo all
 */

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { config } = require('./config');

// ─── Types / JSDoc ───────────────────────────────────────────────────────────
/**
 * @typedef {Object} ChangedFile
 * @property {string} filePath      - Relative file path within repo
 * @property {string} changeType    - 'added' | 'modified' | 'deleted'
 * @property {string} category      - 'controller' | 'service' | 'page' | 'component' | 'api' | 'migration' | 'other'
 * @property {string} diff          - Raw git diff for this file
 * @property {string} content       - Current file content (empty if deleted)
 * @property {string[]} addedLines  - Lines that were added
 * @property {string[]} removedLines- Lines that were removed
 */

/**
 * @typedef {Object} RepoDiff
 * @property {string} repoName     - 'platform-server' | 'platform-web'
 * @property {string} repoType     - 'backend' | 'frontend'
 * @property {string} repoPath     - Absolute path to the local repo
 * @property {string} diffRange    - The git range used (e.g. 'HEAD~1')
 * @property {string} commitInfo   - Summary of commits in range
 * @property {ChangedFile[]} files - All relevant changed files
 */

/**
 * @typedef {Object} DiffContext
 * @property {string} timestamp      - ISO timestamp
 * @property {RepoDiff[]} repos      - One entry per analyzed repo
 * @property {Object} summary        - Quick counts for logging
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks if a file path should be ignored based on config.diff.ignorePatterns.
 */
function shouldIgnore(filePath) {
  const patterns = config.diff.ignorePatterns;
  return patterns.some(pattern => {
    // Convert glob-like to a simple matching approach
    if (pattern.includes('**')) {
      const prefix = pattern.split('**')[0];
      return filePath.includes(prefix);
    }
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return filePath.endsWith(ext);
    }
    return filePath === pattern || filePath.endsWith('/' + pattern);
  });
}

/**
 * Determines the semantic category of a file change.
 * Returns one of: controller | service | repository | entity | dto | migration | router |
 *                 page | component | api | store | other
 */
function classifyFile(filePath, repoType) {
  if (repoType === 'backend') {
    const bp = config.diff.backendPatterns;
    for (const [category, pattern] of Object.entries(bp)) {
      if (pattern.test(filePath)) return category;
    }
  } else {
    const fp = config.diff.frontendPatterns;
    for (const [category, pattern] of Object.entries(fp)) {
      if (pattern.test(filePath)) return category;
    }
  }
  return 'other';
}

/**
 * Parses a raw git diff string into addedLines and removedLines arrays.
 */
function parseDiffLines(rawDiff) {
  const addedLines = [];
  const removedLines = [];
  const lines = rawDiff.split('\n');

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines.push(line.slice(1));
    }
  }

  return { addedLines, removedLines };
}

/**
 * Truncates a diff string to maxDiffChars, appending a notice if truncated.
 */
function truncateDiff(diff, filePath) {
  const max = config.generation.maxDiffChars;
  if (diff.length <= max) return diff;

  console.log(chalk.yellow(`  ⚠ Diff truncated for ${filePath} (${diff.length} → ${max} chars)`));
  return diff.slice(0, max) + `\n\n[... diff truncated at ${max} chars ...]`;
}

/**
 * Reads the current content of a file from disk.
 * Returns empty string if the file was deleted or cannot be read.
 */
function readFileContent(repoPath, filePath) {
  try {
    const absPath = path.join(repoPath, filePath);
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf8');
      // Truncate very large files
      return content.length > 8000 ? content.slice(0, 8000) + '\n// [... file truncated ...]' : content;
    }
  } catch (_) {
    // Ignore read errors (binary files, deleted, etc.)
  }
  return '';
}

// ─── Core: analyze one repository ────────────────────────────────────────────

/**
 * Analyzes a single repository's git diff for the given range.
 *
 * @param {'server'|'web'} repoKey
 * @param {string} [rangeOverride]  - Override the diff range from config
 * @returns {Promise<RepoDiff>}
 */
async function analyzeRepo(repoKey, rangeOverride) {
  const repoConfig = config.repos[repoKey];
  if (!repoConfig) throw new Error(`Unknown repo key: ${repoKey}. Use 'server' or 'web'.`);

  const { name, path: repoPath, type } = repoConfig;
  const range = rangeOverride || config.diff.defaultRange;

  if (!fs.existsSync(repoPath)) {
    throw new Error(
      `Repo not found at: ${repoPath}\n` +
      `Set ${repoKey === 'server' ? 'PLATFORM_SERVER_REPO' : 'PLATFORM_WEB_REPO'} in .env`
    );
  }

  console.log(chalk.blue(`\n📂 Analyzing ${name} (${repoPath}) — range: ${range}`));

  const git = simpleGit(repoPath);

  // ── 1. Validate the repository ──────────────────────────────────────────────
  const isRepo = await git.checkIsRepo();
  if (!isRepo) throw new Error(`${repoPath} is not a git repository`);

  // ── 2. Get commit log for the range ─────────────────────────────────────────
  let commitInfo = '';
  try {
    const log = await git.log({ from: range.split('..')[0], to: range.split('..')[1] || 'HEAD', maxCount: 10 });
    commitInfo = log.all
      .map(c => `  ${c.hash.slice(0, 7)} - ${c.message} (${c.author_name})`)
      .join('\n');
  } catch (_) {
    // log may fail for single-commit ranges like HEAD~1 — use git show instead
    try {
      const show = await git.show(['--stat', '--oneline', range]);
      commitInfo = show.split('\n').slice(0, 5).join('\n');
    } catch (_2) {
      commitInfo = `[could not read commit log for range: ${range}]`;
    }
  }

  // ── 3. Get list of changed files ─────────────────────────────────────────────
  const diffSummary = await git.diffSummary([range]);
  const allFiles = diffSummary.files;

  console.log(chalk.gray(`  Total changed files: ${allFiles.length}`));

  // ── 4. Filter and process each file ──────────────────────────────────────────
  const processedFiles = [];

  for (const fileEntry of allFiles) {
    const filePath = fileEntry.file;

    // Skip ignored files
    if (shouldIgnore(filePath)) {
      if (config.verbose) console.log(chalk.gray(`  ↳ skip (ignored): ${filePath}`));
      continue;
    }

    // Classify the file
    const category = classifyFile(filePath, type);

    // Skip truly irrelevant 'other' files for backend
    // (frontend 'other' can still be useful for config changes)
    if (category === 'other' && type === 'backend') {
      if (config.verbose) console.log(chalk.gray(`  ↳ skip (other/backend): ${filePath}`));
      continue;
    }

    // Get the raw diff for this specific file
    let rawDiff = '';
    try {
      rawDiff = await git.diff([range, '--', filePath]);
    } catch (_) {
      rawDiff = '[diff unavailable]';
    }

    rawDiff = truncateDiff(rawDiff, filePath);
    const { addedLines, removedLines } = parseDiffLines(rawDiff);

    // Determine change type
    let changeType = 'modified';
    if (fileEntry.binary) changeType = 'binary';
    else if (addedLines.length > 0 && removedLines.length === 0) changeType = 'added';
    else if (addedLines.length === 0 && removedLines.length > 0) changeType = 'deleted';

    // Read current file content
    const content = readFileContent(repoPath, filePath);

    processedFiles.push({
      filePath,
      changeType,
      category,
      diff: rawDiff,
      content,
      addedLines,
      removedLines,
    });

    console.log(chalk.green(`  ✓ ${category.padEnd(12)} [${changeType}]  ${filePath}`));
  }

  return {
    repoName: name,
    repoType: type,
    repoPath,
    diffRange: range,
    commitInfo,
    files: processedFiles,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyzes one or both repositories and returns a combined DiffContext.
 *
 * @param {Object} options
 * @param {'server'|'web'|'all'} [options.repo='all'] - Which repo(s) to analyze
 * @param {string} [options.range] - Override git range (e.g. 'HEAD~1', 'abc..def')
 * @returns {Promise<DiffContext>}
 */
async function analyzeDiff({ repo = 'all', range } = {}) {
  const repos = [];

  if (repo === 'all' || repo === 'server') {
    repos.push(await analyzeRepo('server', range));
  }
  if (repo === 'all' || repo === 'web') {
    repos.push(await analyzeRepo('web', range));
  }

  const summary = {
    totalFiles: repos.reduce((n, r) => n + r.files.length, 0),
    byRepo: Object.fromEntries(repos.map(r => [r.repoName, r.files.length])),
    byCategory: repos
      .flatMap(r => r.files)
      .reduce((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1;
        return acc;
      }, {}),
  };

  console.log(chalk.bold.cyan('\n📊 Diff Summary:'));
  console.log(`  Total relevant files: ${chalk.bold(summary.totalFiles)}`);
  console.log('  By category:', summary.byCategory);

  return {
    timestamp: new Date().toISOString(),
    diffRange: range || config.diff.defaultRange,
    repos,
    summary,
  };
}

module.exports = { analyzeDiff };

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const { Command } = require('commander');
  const program = new Command();

  program
    .name('analyze-diff')
    .description('Analyze git diffs from platform repos')
    .option('--repo <name>', 'Repo to analyze: server | web | all', 'all')
    .option('--range <range>', 'Git diff range (e.g. HEAD~1, abc..def)', config.diff.defaultRange)
    .option('--output <file>', 'Save DiffContext JSON to file')
    .parse(process.argv);

  const opts = program.opts();

  analyzeDiff({ repo: opts.repo, range: opts.range })
    .then(ctx => {
      if (opts.output) {
        fs.writeJsonSync(opts.output, ctx, { spaces: 2 });
        console.log(chalk.green(`\n✅ DiffContext saved to ${opts.output}`));
      } else {
        console.log(chalk.green('\n✅ Analysis complete'));
      }
    })
    .catch(err => {
      console.error(chalk.red('\n❌ Error:'), err.message);
      process.exit(1);
    });
}
