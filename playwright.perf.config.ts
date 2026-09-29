import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Profiling runs (npm run perf). Uses the optimized production build and the
 * real GPU when available (ANGLE/Metal on macOS) so numbers reflect a player's
 * browser rather than CPU-emulated WebGL.
 */
export default defineConfig({
  testDir: './perf',
  outputDir: './test-results/perf',
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
