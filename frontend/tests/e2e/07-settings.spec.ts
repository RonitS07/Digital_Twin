import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Settings', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'settings')
        await page.waitForLoadState('networkidle')
    })

    test('Settings page renders',
        async ({ page }) => {
        await expect(
            page.locator('text=Settings').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Account section shows correct email',
        async ({ page }) => {
        await expect(
            page.locator(
                'text=ronitshah0099@gmail.com'
            )
        ).toBeVisible({ timeout: 10000 })
    })

    test('Display name shows Ronit',
        async ({ page }) => {
        await expect(
            page.locator('text=Ronit').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Timezone shows Asia/Kolkata',
        async ({ page }) => {
        await expect(
            page.locator('text=Kolkata').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('AI Behaviour toggles visible',
        async ({ page }) => {
        await expect(
            page.locator(
                'text=Autonomous Mode'
            )
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator(
                'text=Memory Retention'
            )
        ).toBeVisible({ timeout: 10000 })
    })

    test('Integrations section visible',
        async ({ page }) => {
        await expect(
            page.locator('text=Integrations').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Gmail Sync')
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Google Calendar')
        ).toBeVisible({ timeout: 10000 })
    })

    test('Gmail and Calendar are SEPARATE toggles',
        async ({ page }) => {
        const gmailRow = page.locator(
            ':has-text("Gmail Sync")'
        ).last()
        const calendarRow = page.locator(
            ':has-text("Google Calendar")'
        ).last()
        // Both must be visible and separate
        await expect(gmailRow).toBeVisible()
        await expect(calendarRow).toBeVisible()
        // They must be different elements
        const gmailBox = await gmailRow.boundingBox()
        const calBox = await calendarRow.boundingBox()
        expect(gmailBox?.y).not.toEqual(calBox?.y)
    })

    test('Notification preferences section visible',
        async ({ page }) => {
        await expect(
            page.locator('text=Notification').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Sign Out button visible',
        async ({ page }) => {
        await expect(
            page.locator(
                'button:has-text("Sign Out")'
            )
        ).toBeVisible({ timeout: 10000 })
    })

    test('Export My Data button visible',
        async ({ page }) => {
        await expect(
            page.locator('button:has-text("Export")').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Reset Memory button visible',
        async ({ page }) => {
        await expect(
            page.locator('button:has-text("Reset")').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Theme preference has 3 options',
        async ({ page }) => {
        await expect(
            page.locator('text=Light')
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Dark')
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=System')
        ).toBeVisible({ timeout: 10000 })
    })
})
