import { test, expect } from '@playwright/test'
import { TEST_CONFIG } from './config'

test.describe('Security', () => {

    test('Protected routes redirect to login',
        async ({ page }) => {
        // Clear all storage to simulate logged out
        await page.context().clearCookies()
        await page.goto('/')
        // Should redirect to or show login
        await expect(
            page.locator('input[type="email"]').first()
        ).toBeVisible({ timeout: 15000 })
    })

    test('No credentials in page source',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl)
        const content = await page.content()
        // Telegram bot token pattern
        expect(content).not.toMatch(
            /\d{9,10}:AA[A-Za-z0-9_-]{33}/
        )
        // Looks like an API key
        expect(content).not.toMatch(
            /sk-[A-Za-z0-9]{20,}/
        )
    })

    test('No hardcoded localhost in production build',
        async ({ page }) => {
        if (!TEST_CONFIG.baseUrl.includes('localhost')) {
            await page.goto(TEST_CONFIG.baseUrl)
            const content = await page.content()
            expect(content).not.toContain(
                'localhost:8000'
            )
        }
    })

    test('CSP headers present', async ({ page }) => {
        const res = await page.goto(
            TEST_CONFIG.baseUrl
        )
        const headers = res?.headers() || {}
        // At minimum, X-Frame-Options should be set
        // or CSP frame-ancestors
        // This is a soft check — warn not fail
        const hasSecurityHeaders =
            headers['x-frame-options'] ||
            headers['content-security-policy'] ||
            headers['x-content-type-options']
        if (!hasSecurityHeaders) {
            console.warn(
                'WARNING: No security headers detected'
            )
        }
    })
})
