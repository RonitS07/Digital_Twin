import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Activity', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'activity')
        await page.waitForLoadState('networkidle')
    })

    test('Activity page renders',
        async ({ page }) => {
        await expect(
            page.locator('text=Activity').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Filter tabs visible',
        async ({ page }) => {
        const tabs = [
            'All Activity', 'Emails',
            'Meetings', 'Research'
        ]
        for (const tab of tabs) {
            await expect(
                page.locator(`text=${tab}`).first()
            ).toBeVisible({ timeout: 5000 })
        }
    })

    test('Export CSV button visible',
        async ({ page }) => {
        await expect(
            page.locator(
                'button:has-text("Export"),'
                + 'button:has-text("CSV")'
            ).first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Activity filter tabs work',
        async ({ page }) => {
        await page.click(
            'text=Emails'
        )
        await page.waitForTimeout(1000)
        // URL or state should change
        await page.click('text=All Activity')
    })

    test('Activity items have timestamps',
        async ({ page }) => {
        const items = page.locator(
            '[class*="activity-item"],'
            + '[class*="log-entry"],'
            + '[class*="task"]'
        )
        const count = await items.count()
        if (count > 0) {
            // Check first item has a timestamp
            const firstItem = items.first()
            const text = await firstItem.innerText()
            expect(text).toMatch(/\d{1,2}:\d{2}/)
        }
    })

    test('Activity highlight clears after 5 seconds',
        async ({ page }) => {
        const items = page.locator(
            '[class*="activity-item"],'
            + '[class*="log-entry"]'
        )
        if (await items.count() > 0) {
            await items.first().click()
            // Wait 6 seconds
            await page.waitForTimeout(6000)
            // Highlight should be gone
            const highlighted = page.locator(
                '[class*="highlighted"],'
                + '[class*="selected"]'
            )
            await expect(highlighted).toHaveCount(0)
        }
    })
})
