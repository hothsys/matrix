const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /safari-.*\.spec\.js/ },
  ],
});
