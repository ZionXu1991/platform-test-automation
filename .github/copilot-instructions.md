# Platform Test Automation — Copilot Custom Instructions

You are working inside the `platform-test-automation` project, an AI-powered Cypress test automation system.

## Project Overview

This project automates E2E testing for two sibling repositories:
- **platform-server** — Java/Spring Boot backend
- **platform-web** — Frontend web application

The workflow is:
1. **Analyze git diffs** from either/both repos → classify changed files
2. **Generate Cypress tests** via AI (API tests for backend, E2E UI tests for frontend)
3. **Run Cypress** and produce HTML reports

## Key Scripts (all run via `node`)

| Script | Purpose | Example |
|--------|---------|---------|
| `scripts/analyze-diff.js` | Read & classify git changes | `node scripts/analyze-diff.js --repo all --range HEAD~1` |
| `scripts/generate-tests.js` | Generate Cypress tests via AI | `node scripts/generate-tests.js --repo server --range HEAD~1` |
| `scripts/run-automation.js` | Full pipeline (analyze + generate + run) | `node scripts/run-automation.js --repo all` |

## CLI Flags for `run-automation.js`

- `--repo <name>` — Which repo(s): `server`, `web`, or `all` (default: `all`)
- `--range <range>` — Git diff range: `HEAD~1`, `main..feature/x`, `abc123..def456` (default: `HEAD~1`)
- `--generate-only` — Only analyze + generate tests, skip Cypress execution
- `--run-only` — Skip generation, run existing Cypress tests
- `--spec <pattern>` — Which tests to run: `generated`, `baseline`, `all`, or a glob
- `--browser <name>` — Browser: `chrome`, `firefox`, `electron` (default: `electron`)
- `--headed` — Open browser visually (default is headless)

## Important Paths

- Generated tests: `cypress/e2e/generated/` (overwritten by AI)
- Baseline tests: `cypress/e2e/baseline/` (manually maintained, never overwritten)
- AI prompts: `prompts/api-test-prompt.md` and `prompts/e2e-test-prompt.md`
- Config: `scripts/config.js` reads from `.env`
- Reports: `cypress/reports/html/combined.html`

## Environment Setup

Before running, ensure `.env` is configured with:
- `OPENAI_API_KEY` or `AZURE_OPENAI_*` — AI provider credentials
- `PLATFORM_SERVER_REPO` / `PLATFORM_WEB_REPO` — Absolute paths to local repo clones
- `CYPRESS_BASE_URL` / `API_BASE_URL` — Frontend & backend URLs

## When answering questions about this project

1. Always suggest running scripts via `node scripts/...` (not `npm run`)
2. For test generation, first run `--generate-only` to preview, then full run
3. Generated tests go to `cypress/e2e/generated/{server,web}/`
4. Users can move valuable generated tests to `baseline/` to preserve them
5. Modify `prompts/*.md` to tune AI test output quality
