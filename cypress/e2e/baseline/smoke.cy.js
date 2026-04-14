/**
 * baseline/smoke.cy.js
 *
 * Baseline smoke tests — always run regardless of code changes.
 * These verify that the system is up and the core flows work.
 *
 * These tests are NEVER overwritten by AI generation.
 * Add your critical user journeys here manually.
 */

describe('Platform Smoke Tests', () => {
  // ─── API Health ─────────────────────────────────────────────────────────────
  describe('Backend Health', () => {
    it('API server is reachable and healthy', () => {
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/actuator/health`,
        failOnStatusCode: false,
      }).then(response => {
        // Accept 200 (Spring Boot Actuator) or any 2xx
        expect(response.status).to.be.oneOf([200, 204]);
      });
    });

    it('API returns 401 for unauthenticated requests to protected endpoints', () => {
      cy.request({
        method: 'GET',
        url: `${Cypress.env('API_BASE_URL')}/api/v1/users`,
        failOnStatusCode: false,
        headers: { Authorization: 'Bearer invalid-token-12345' },
      }).then(response => {
        expect(response.status).to.eq(401);
      });
    });
  });

  // ─── Frontend Availability ───────────────────────────────────────────────────
  describe('Frontend Availability', () => {
    it('homepage loads successfully', () => {
      cy.visit('/');
      cy.document().should('have.property', 'readyState', 'complete');
      // Assert a root element exists (adjust selector to match your app)
      cy.get('#app, #root, [data-testid="app-root"]', { timeout: 10000 }).should('exist');
    });

    it('page title is not empty', () => {
      cy.visit('/');
      cy.title().should('not.be.empty');
    });
  });

  // ─── Auth Flow ───────────────────────────────────────────────────────────────
  describe('Authentication Flow', () => {
    it('can obtain auth token via API', () => {
      cy.loginViaApi().then(token => {
        expect(token).to.be.a('string');
        expect(token.length).to.be.greaterThan(10);
      });
    });

    it('login page is accessible', () => {
      // Adjust route to your login page
      cy.visit('/login', { failOnStatusCode: false });
      cy.document().should('have.property', 'readyState', 'complete');
    });
  });
});
