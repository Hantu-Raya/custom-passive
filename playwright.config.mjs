import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide'
    }
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /(custom-passive|categoryBoards|tierBoard|shopRail)\.spec\.js$/
    },
    {
      name: 'visual',
      testMatch: 'visual.spec.js',
      use: {
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'
      }
    }
  ],
  use: {
    baseURL: 'http://127.0.0.1:4321/custom-passive/'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4321/custom-passive/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
