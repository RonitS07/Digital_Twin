import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    retries: 1,
    workers: 1,  // Sequential — auth state depends on order

    reporter: [
        ['list'],
        ['html', {
            outputFolder: 'playwright-report',
            open: 'never'
        }],
        ['json', {
            outputFile: 'playwright-report/results.json'
        }]
    ],

    use: {
        baseURL: process.env.TEST_BASE_URL
            || 'http://localhost:5174',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        headless: process.env.CI === 'true',
        ignoreHTTPSErrors: true,
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            },
        },
    ],

    // Global setup: log in once, save auth state
    globalSetup: './tests/e2e/global-setup.ts',
})
