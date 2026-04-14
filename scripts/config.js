'use strict';

require('dotenv').config();
const path = require('path');

/**
 * Central configuration for platform-test-automation.
 * All values resolve from environment variables with sane defaults.
 */
const config = {
  // ─── AI ──────────────────────────────────────────────────────────────────────
  ai: {
    provider: process.env.AI_PROVIDER || 'openai', // 'openai' | 'azure'

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },

    azure: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-01',
    },
  },

  // ─── Repositories ─────────────────────────────────────────────────────────────
  repos: {
    server: {
      name: 'platform-server',
      path: process.env.PLATFORM_SERVER_REPO || path.resolve('../platform-server'),
      type: 'backend',
    },
    web: {
      name: 'platform-web',
      path: process.env.PLATFORM_WEB_REPO || path.resolve('../platform-web'),
      type: 'frontend',
    },
  },

  // ─── Git Diff ─────────────────────────────────────────────────────────────────
  diff: {
    defaultRange: process.env.DEFAULT_DIFF_RANGE || 'HEAD~1',

    // Files to ignore when analyzing diffs
    ignorePatterns: [
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.gitignore',
      '.DS_Store',
      '*.md',
      '*.txt',
      'CHANGELOG*',
      '.env*',
      '*.log',
      'dist/**',
      'build/**',
      'target/**',
      'node_modules/**',
      '*.class',
      '*.jar',
    ],

    // Backend: files that indicate a new/changed API endpoint
    backendPatterns: {
      controller:   /Controller\.(java|kt)$/,
      service:      /Service\.(java|kt)$/,
      repository:   /Repository\.(java|kt)$/,
      entity:       /Entity\.(java|kt)$/,
      dto:          /(DTO|Request|Response)\.(java|kt)$/,
      migration:    /V\d+__.*\.sql$/,
      router:       /(router|routes)\.(js|ts)$/,
    },

    // Frontend: files that indicate a new/changed UI feature
    frontendPatterns: {
      page:         /(pages?|views?)\/.+\.(vue|jsx|tsx)$/i,
      component:    /components?\/.+\.(vue|jsx|tsx)$/i,
      api:          /(api|services?|http)\/.+\.(js|ts)$/i,
      store:        /(store|pinia|redux|vuex)\/.+\.(js|ts)$/i,
      router:       /(router|routes)\.(js|ts)$/i,
    },
  },

  // ─── Test Generation ──────────────────────────────────────────────────────────
  generation: {
    outputDir: path.resolve(
      __dirname,
      '..',
      process.env.GENERATED_TESTS_DIR || 'cypress/e2e/generated'
    ),
    promptsDir: path.resolve(__dirname, '..', 'prompts'),

    // Max diff chunk size to send to AI (characters). Large diffs are truncated.
    maxDiffChars: 12000,

    // AI temperature for test generation (lower = more deterministic)
    temperature: 0.2,
  },

  // ─── Cypress ──────────────────────────────────────────────────────────────────
  cypress: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8080',
  },

  // ─── Logging ──────────────────────────────────────────────────────────────────
  verbose: process.env.VERBOSE === 'true',
};

// ─── Validation ───────────────────────────────────────────────────────────────
function validate() {
  const errors = [];

  if (config.ai.provider === 'openai' && !config.ai.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }
  if (config.ai.provider === 'azure') {
    if (!config.ai.azure.apiKey) errors.push('AZURE_OPENAI_API_KEY is required');
    if (!config.ai.azure.endpoint) errors.push('AZURE_OPENAI_ENDPOINT is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map(e => `  ✗ ${e}`).join('\n')}\n\nCopy .env.example → .env and fill in the required values.`);
  }
}

module.exports = { config, validate };
