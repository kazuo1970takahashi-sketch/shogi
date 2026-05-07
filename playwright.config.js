// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test',
  testMatch: ['e2e/**/*.spec.js', 'helpers/**/*.test.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      // A-4.5 §3.7: visual_regression_mobile.spec.js は mobile-375 project でのみ撮影
      // (chromium-desktop では撮影しないことで snapshot ファイル名衝突回避)
      testIgnore: /visual_regression_mobile\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-375',
      // visual_regression.spec.js(従来 baseline)は chromium-desktop project のみで実行
      // (viewport を test 内で setViewportSize 上書きするため deviceScaleFactor / hasTouch /
      // userAgent による微小な描画差異を排除、Stage 6 仕様書 §3.2)。
      // 一方、A-4.5 で追加した visual_regression_mobile.spec.js は **本 project でのみ撮影**
      // することで iOS Safari 特有の rendering を再現(A-4.4 失敗の再発防止)。
      testIgnore: /visual_regression\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 800 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 3000',
    url: 'http://localhost:3000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
