import { test, expect } from '@playwright/test'
import { TEST_CONFIG } from './config'

// These tests run WITHOUT saved auth state
test.describe('Authentication', () => {

    test('Login page renders correctly', async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveTitle(/AI Twin/)
        await expect(
            page.locator('text=Welcome back').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('input[type="email"]')
        ).toBeVisible()
        await expect(
            page.locator('input[type="password"]')
        ).toBeVisible()
        await expect(
            page.locator('button:has-text("Sign In")')
        ).toBeVisible()
        await expect(
            page.locator('text=Continue with Google')
        ).toBeVisible()
        await expect(
            page.locator('text=Forgot password')
        ).toBeVisible()
        await expect(
            page.locator('text=Create account')
        ).toBeVisible()
    })

    test('Login with wrong password shows error',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.fill(
            'input[type="email"]', TEST_CONFIG.email
        )
        await page.fill(
            'input[type="password"]', 'wrongpassword123'
        )
        await page.click(
            'button[type="submit"],'
            + 'button:has-text("Sign In")'
        )
        // Should show error, NOT redirect to dashboard
        await expect(
            page.locator('text=password').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(page).not.toHaveURL(
            /.*home.*|.*dashboard.*/
        )
    })

    test('Login with empty fields shows validation',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.click(
            'button[type="submit"],'
            + 'button:has-text("Sign In")'
        )
        // Should stay on login page
        await expect(page).not.toHaveURL(
            /.*home.*|.*dashboard.*/
        )
    })

    test('Successful email/password login',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.fill(
            'input[type="email"]', TEST_CONFIG.email
        )
        await page.fill(
            'input[type="password"]', TEST_CONFIG.password
        )
        await page.click(
            'button[type="submit"],'
            + 'button:has-text("Sign In")'
        )
        await page.waitForSelector('nav', { timeout: 20000 })
        await expect(
            page.locator('text=Ronit').first()
        ).toBeVisible({ timeout: 15000 })
    })

    test('Forgot password link navigates correctly',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.click('text=Forgot password')
        await expect(
            page.locator('text=Reset your password').first()
        ).toBeVisible({ timeout: 5000 })
    })

    test('Create account link navigates correctly',
        async ({ page }) => {
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.click('text=Create account')
        await expect(
            page.locator('text=Create your account').first()
        ).toBeVisible({ timeout: 5000 })
    })
})
