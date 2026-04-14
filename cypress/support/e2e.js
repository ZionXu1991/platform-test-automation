// cypress/support/e2e.js
// Global setup file — runs before every Cypress test

import './commands';

// ─── Global Hooks ─────────────────────────────────────────────────────────────

// Silence uncaught exceptions from the app under test
// (to prevent unrelated app errors from failing your Cypress tests)
Cypress.on('uncaught:exception', (err, runnable) => {
  // Common framework errors that are safe to ignore:
  if (
    err.message.includes('ResizeObserver loop') ||
    err.message.includes('Non-Error promise rejection') ||
    err.message.includes('Navigation cancelled') ||
    err.message.includes('ChunkLoadError')
  ) {
    return false; // Prevent test failure
  }
  // Let other errors fail the test
  return true;
});

// ─── Before All ───────────────────────────────────────────────────────────────

before(() => {
  // Optional: seed test data or health-check the API before the suite
  // cy.request(`${Cypress.env('API_BASE_URL')}/actuator/health`).its('status').should('eq', 200);
});

// ─── Before Each ──────────────────────────────────────────────────────────────

beforeEach(() => {
  // Preserve localStorage between tests (avoids re-login overhead)
  // If auth is cookie-based, use cy.preserveCookies() instead
  Cypress.on('window:before:load', (win) => {
    // Clear any leftover state from previous specs
    // win.localStorage.clear(); // Uncomment if you need a clean slate
  });
});

// ─── After Each ───────────────────────────────────────────────────────────────

afterEach(function () {
  // Log test result to terminal
  const state = this.currentTest?.state || 'unknown';
  const title = this.currentTest?.title || 'unknown';
  if (state === 'failed') {
    cy.task('log', `❌ FAILED: ${title}`);
  }
});
