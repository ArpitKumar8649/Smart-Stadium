import { defineConfig, devices } from '@playwright/test';

// Dedicated ports make local runs deterministic even when a developer already
// has the regular app running on Vite's default 5173/8080 pair.
const frontendPort = 41731;
const backendPort = 48081;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;
const externallyManagedServer = Boolean(process.env.E2E_BASE_URL);
const adminToken = process.env.E2E_ADMIN_TOKEN ?? 'playwright-local-admin-token';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externallyManagedServer ? undefined : [
    {
      command: 'npm run build -w shared && npx tsx watch --env-file=/dev/null backend/src/server.ts',
      cwd: '..',
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(backendPort),
        ADMIN_DEMO_TOKEN: adminToken,
        ALLOWED_ORIGINS: `http://127.0.0.1:${frontendPort}`,
        DASHSCOPE_API_KEY: undefined,
      },
    },
    {
      command: `npm run dev -w frontend -- --port ${frontendPort} --strictPort`,
      cwd: '..',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

