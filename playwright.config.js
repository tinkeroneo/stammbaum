const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // Separate test files use isolated browser contexts and can run safely in parallel.
  // Tests inside one file retain their declared order. Override with --workers when needed.
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: 'line',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/server.cjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 15_000
  }
});
