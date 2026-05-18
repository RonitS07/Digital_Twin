import { chromium, FullConfig } from '@playwright/test'
import { TEST_CONFIG } from './config'

async function globalSetup(config: FullConfig) {
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const context = await browser.newContext({
        ignoreHTTPSErrors: true
    })
    const page = await context.newPage()

    console.log('Global setup: logging in...')
    await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })

    // Wait for login page
    await page.waitForSelector(
        'input[type="email"], input[placeholder*="email"]',
        { timeout: 15000 }
    )

    // Fill email
    await page.fill(
        'input[type="email"], input[placeholder*="email"]',
        TEST_CONFIG.email
    )

    // Fill password
    await page.fill(
        'input[type="password"]',
        TEST_CONFIG.password
    )

    // Click sign in
    await page.click(
        'button[type="submit"], button:has-text("Sign In")'
    )

    // Wait for dashboard to load
    await page.waitForSelector('nav', { timeout: 20000 })
    console.log('Global setup: logged in successfully')

    // Save auth state for all tests
    await page.context().storageState({
        path: './tests/e2e/.auth-state.json'
    })

    await browser.close()
    console.log('Global setup: auth state saved')
}

export default globalSetup
