E2E test scaffold (Playwright)

Run locally:
  cd e2e
  npm install
  npx playwright install  # optional: installs browsers
  npm test

CI: .github/workflows/e2e.yml will start backend and run tests.
