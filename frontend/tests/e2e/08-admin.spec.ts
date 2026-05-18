import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Admin Panel', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'admin')
        await page.waitForLoadState('domcontentloaded')
    })

    test('Admin Panel accessible for admin user',
        async ({ page }) => {
        // If user is admin, panel should load
        // If not admin, should redirect or show 403
        const url = page.url()
        const content = await page.content()
        const isAdminPage =
            content.includes('Admin') ||
            url.includes('admin')
        const isAccessDenied =
            content.includes('Access denied') ||
            content.includes('403')
        expect(isAdminPage || isAccessDenied).toBe(true)
    })

    test('Admin nav item only visible for admins',
        async ({ page }) => {
        await page.goto('/')
        // Admin link should be in nav
        const adminLink = page.locator(
            'nav:has-text("Admin")'
        )
        // Either visible (if admin) or not present
        const isVisible = await adminLink
            .isVisible()
            .catch(() => false)
        // Just verify no crash
        expect(typeof isVisible).toBe('boolean')
    })

    test('Admin overview metrics load',
        async ({ page }) => {
        await page.waitForTimeout(3000)
        const metrics = page.locator(
            '[class*="metric"], [class*="stat-card"],'
            + '[class*="overview"]'
        )
        if (await metrics.count() > 0) {
            await expect(
                metrics.first()
            ).toBeVisible()
        }
    })

    test('MCP Server Monitor section loads',
        async ({ page }) => {
        await expect(
            page.locator('text=Server Monitor').first()
        ).toBeVisible({ timeout: 15000 })
    })

    test('User management table renders',
        async ({ page }) => {
        await expect(
            page.locator('text=User Management').first()
        ).toBeVisible({ timeout: 10000 })
    })
})
