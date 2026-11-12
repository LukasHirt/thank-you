import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke tests against the production build. Reduced motion is on, so the
// show doesn't autoplay and the tests don't depend on animation timing.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    // WebGL in headless Chromium via SwiftShader
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } }
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: 'pnpm run build && pnpm exec vp preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
