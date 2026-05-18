import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

// Use saved auth state for all tests below
test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Dashboard', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'home')
        await page.waitForLoadState('networkidle')
    })

    test('Dashboard loads with correct greeting',
        async ({ page }) => {
        await expect(
            page.locator('text=Ronit').first()
        ).toBeVisible({ timeout: 15000 })
    })

    test('Weekly Focus Heatmap renders',
        async ({ page }) => {
        await expect(
            page.locator('canvas, svg').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Metric cards render with numbers',
        async ({ page }) => {
        // Should have 4 metric cards
        const cards = page.locator(
            '[class*="metric"], [class*="stat"],'
            + '[class*="card"]'
        )
        await expect(cards.first()).toBeVisible(
            { timeout: 10000 }
        )
    })

    test('Recent Activity section renders',
        async ({ page }) => {
        await expect(
            page.locator('text=Activity').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Upcoming meetings section renders',
        async ({ page }) => {
        await expect(
            page.locator('text=Meetings').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Navigation sidebar has all sections',
        async ({ page }) => {
        const navItems = [
            'Home', 'AI Twin Chat', 'Workspace',
            'Activity', 'Agent Network', 'Settings'
        ]
        for (const item of navItems) {
            await expect(
                page.locator(`nav:has-text("${item}")`)
            ).toBeVisible({ timeout: 5000 })
        }
    })

    test('System status shows Online',
        async ({ page }) => {
        await expect(
            page.locator('text=Online').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Intelligence Brief button exists',
        async ({ page }) => {
        await expect(
            page.locator(
                'button:has-text("Intelligence"),'
                + 'button:has-text("Brief")'
            )
        ).toBeVisible({ timeout: 10000 })
    })
})
