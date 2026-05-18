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
        await page.waitForLoadState('domcontentloaded')
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
        await expect(
            page.locator('text=Emails Monitored').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Meetings Synced').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Tasks Executed').first()
        ).toBeVisible({ timeout: 10000 })
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
            'Home', 'Chat', 'Integrations',
            'Activity', 'Network', 'Settings'
        ]
        for (const item of navItems) {
            await expect(
                page.locator(`nav :has-text("${item}")`).first()
            ).toBeVisible({ timeout: 10000 })
        }
    })

    test('System status shows Optimal',
        async ({ page }) => {
        await expect(
            page.locator('text=Optimal').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Intelligence Brief button exists',
        async ({ page }) => {
        await expect(
            page.locator('button:has-text("Brief")').first()
        ).toBeVisible({ timeout: 10000 })
    })
})
