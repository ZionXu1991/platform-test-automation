const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    // ─── Base URL ───────────────────────────────────────────────────────────────
    // Override via CYPRESS_BASE_URL env var or .env
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',

    // ─── Test files ─────────────────────────────────────────────────────────────
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',

    // ─── Video & Screenshots ─────────────────────────────────────────────────────
    video: true,
    videosFolder: 'cypress/videos',
    screenshotsFolder: 'cypress/screenshots',
    screenshotOnRunFailure: true,

    // ─── Timeouts ────────────────────────────────────────────────────────────────
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    pageLoadTimeout: 30000,

    // ─── Viewport ────────────────────────────────────────────────────────────────
    viewportWidth: 1280,
    viewportHeight: 800,

    // ─── Reporter ─────────────────────────────────────────────────────────────────
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: 'cypress/reports',
      overwrite: false,
      html: false,
      json: true,
      timestamp: 'mmddyyyy_HHMMss',
    },

    // ─── Environment variables ───────────────────────────────────────────────────
    env: {
      // Backend API base URL (for cy.request() API tests)
      API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8080',

      // Test user credentials (override in .env or CI)
      TEST_USERNAME: process.env.TEST_USERNAME || 'test@example.com',
      TEST_PASSWORD: process.env.TEST_PASSWORD || 'Test@123',

      // Auth token header name (e.g., 'Authorization' or 'X-Auth-Token')
      AUTH_HEADER: process.env.AUTH_HEADER || 'Authorization',
    },

    setupNodeEvents(on, config) {
      // Load .env file values into Cypress config
      require('dotenv').config();

      // Allow runtime env overrides
      config.baseUrl = process.env.CYPRESS_BASE_URL || config.baseUrl;
      config.env.API_BASE_URL = process.env.API_BASE_URL || config.env.API_BASE_URL;
      config.env.TEST_USERNAME = process.env.TEST_USERNAME || config.env.TEST_USERNAME;
      config.env.TEST_PASSWORD = process.env.TEST_PASSWORD || config.env.TEST_PASSWORD;

      // Task: log to terminal
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        },
      });

      return config;
    },
  },
});
