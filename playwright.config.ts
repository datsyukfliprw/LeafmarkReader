import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'iPad Pro', use: { ...devices['iPad Pro 11'] } }, { name: 'Desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev -w @leafmark/server', url: 'http://127.0.0.1:8787/health', reuseExistingServer: true },
    { command: 'npm run dev -w @leafmark/web -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: true }
  ]
});
