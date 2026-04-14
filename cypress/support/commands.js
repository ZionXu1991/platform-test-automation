// cypress/support/commands.js
// Custom Cypress commands for platform-test-automation

// ─────────────────────────────────────────────────────────────────────────────
// cy.loginViaApi()
//
// Logs in via the backend API and returns the Bearer token.
// Used in API tests (cy.request based) to get an auth token.
//
// Usage:
//   cy.loginViaApi().then(token => { authToken = token; });
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('loginViaApi', (
  username = Cypress.env('TEST_USERNAME'),
  password = Cypress.env('TEST_PASSWORD'),
) => {
  const apiBase = Cypress.env('API_BASE_URL');

  return cy.request({
    method: 'POST',
    url: `${apiBase}/api/v1/auth/login`,   // ← adjust to your actual login endpoint
    body: { username, password },
    failOnStatusCode: false,
  }).then(response => {
    if (response.status !== 200) {
      throw new Error(
        `loginViaApi failed: HTTP ${response.status}. ` +
        `Check TEST_USERNAME/TEST_PASSWORD in .env and the login endpoint URL.`
      );
    }
    // Support common token response shapes:
    //   { token: '...' }  |  { accessToken: '...' }  |  { data: { token: '...' } }
    const body = response.body;
    const token = body.token || body.accessToken || body.data?.token || body.data?.accessToken;
    if (!token) {
      throw new Error(`loginViaApi: could not extract token from response: ${JSON.stringify(body)}`);
    }
    return token;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cy.login()
//
// Logs in via the UI or API and establishes a session cookie/token
// for subsequent cy.visit() calls (E2E UI tests).
//
// Uses cy.session() to cache the session between tests for speed.
//
// Usage:
//   beforeEach(() => { cy.login(); cy.visit('/dashboard'); });
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('login', (
  username = Cypress.env('TEST_USERNAME'),
  password = Cypress.env('TEST_PASSWORD'),
) => {
  cy.session(
    ['login', username],                    // session cache key
    () => {
      const apiBase = Cypress.env('API_BASE_URL');

      cy.request({
        method: 'POST',
        url: `${apiBase}/api/v1/auth/login`,  // ← adjust to your actual login endpoint
        body: { username, password },
      }).then(response => {
        const body = response.body;
        const token = body.token || body.accessToken || body.data?.token;

        if (!token) {
          throw new Error(`cy.login: no token in response: ${JSON.stringify(body)}`);
        }

        // Store token so app can pick it up on cy.visit()
        // Strategy 1: Set as localStorage (common for SPA apps)
        window.localStorage.setItem('auth_token', token);
        window.localStorage.setItem('access_token', token);

        // Strategy 2: Set as cookie (for cookie-based auth)
        // cy.setCookie('auth_token', token);
      });
    },
    {
      // Re-validate session: check if token still in localStorage
      validate() {
        const token = window.localStorage.getItem('auth_token') ||
                      window.localStorage.getItem('access_token');
        return !!token;
      },
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// cy.apiRequest(method, url, body?, options?)
//
// Convenience wrapper for authenticated API requests.
// Automatically adds Authorization header.
//
// Usage:
//   cy.apiRequest('GET', '/api/v1/users/123').then(res => { ... });
//   cy.apiRequest('POST', '/api/v1/users', { name: 'Alice' });
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('apiRequest', (method, endpoint, body = null, options = {}) => {
  const apiBase = Cypress.env('API_BASE_URL');
  const authHeader = Cypress.env('AUTH_HEADER') || 'Authorization';

  // Try to read token from localStorage (set by cy.login)
  return cy.window().then(win => {
    const token = win.localStorage.getItem('auth_token') ||
                  win.localStorage.getItem('access_token') || '';

    const requestOptions = {
      method,
      url: `${apiBase}${endpoint}`,
      headers: {
        [authHeader]: token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      failOnStatusCode: false,
      ...options,
    };

    if (body !== null) requestOptions.body = body;

    return cy.request(requestOptions);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cy.waitForPageLoad()
//
// Waits for the page to be fully loaded (no pending network requests).
// Useful after navigation to ensure dynamic content is rendered.
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('waitForPageLoad', () => {
  cy.document().should('have.property', 'readyState', 'complete');
});

// ─────────────────────────────────────────────────────────────────────────────
// cy.getByTestId(testId)
//
// Shorthand for cy.get('[data-testid="..."]')
//
// Usage:
//   cy.getByTestId('submit-btn').click();
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('getByTestId', (testId) => {
  return cy.get(`[data-testid="${testId}"]`);
});

// ─────────────────────────────────────────────────────────────────────────────
// cy.assertToast(message)
//
// Asserts that a toast/notification containing the given text appears.
// Adjust the selector to match your UI framework's toast implementation.
// ─────────────────────────────────────────────────────────────────────────────
Cypress.Commands.add('assertToast', (message) => {
  // Common selectors — adjust to your UI component library:
  //   Ant Design: .ant-message-notice-content
  //   Element Plus: .el-message
  //   Vuetify: .v-snack__content
  //   React Hot Toast: [data-testid="toast"]
  cy.get('[data-testid="toast"], .toast, .notification, .message, .el-message, .ant-message-notice')
    .should('be.visible')
    .and('contain.text', message);
});
