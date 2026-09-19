import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const production = process.env.E2E_PRODUCTION === '1';
const baseURL = `http://127.0.0.1:${production ? 8312 : 8311}`;
const readinessURL = production ? baseURL : 'http://127.0.0.1:8411/healthz';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: production ? 'npm start' : 'npm run dev',
    url: readinessURL,
    reuseExistingServer: !production && !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_PATH: production
        ? './data/production-browser-tests.sqlite'
        : './data/browser-tests.sqlite',
      ...(production ? { NODE_ENV: 'production', API_PORT: '8312' } : {}),
    },
  },
});
