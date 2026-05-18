import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Agent Network', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'agent')
        await page.waitForLoadState('networkidle')
    })

    test('Agent Network page renders',
        async ({ page }) => {
        await expect(
            page.locator(
                'text=Agent Network'
            ).first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Privacy guarantee banner visible',
        async ({ page }) => {
        await expect(
            page.locator('text=Privacy').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Inbox and Discover Twins tabs exist',
        async ({ page }) => {
        await expect(
            page.locator('text=Inbox').first()
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator('text=Discover').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Discover Twins tab shows available twins',
        async ({ page }) => {
        await page.click(
            'text=Discover'
        )
        await page.waitForTimeout(2000)
        // Should show twins or empty state
        const content = await page.locator(
            'main, [class*="content"]'
        ).last().innerText()
        expect(content.length).toBeGreaterThan(0)
    })

    test('WebSocket shows connected status',
        async ({ page }) => {
        await page.waitForTimeout(3000)
        await expect(
            page.locator('text=Online').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Inbox items have Accept and Reject buttons',
        async ({ page }) => {
        const pendingItems = page.locator(
            'text=Awaiting Approval,'
            + '[class*="pending"]'
        )
        if (await pendingItems.count() > 0) {
            await expect(
                page.locator(
                    'button:has-text("Accept")'
                ).first()
            ).toBeVisible()
            await expect(
                page.locator(
                    'button:has-text("Reject")'
                ).first()
            ).toBeVisible()
        }
    })

    test('Cannot schedule meeting with self',
        async ({ page }) => {
        await page.click(
            'text=Discover'
        )
        await page.waitForTimeout(2000)
        // Check self is not in the list
        const twins = page.locator(
            '[class*="twin-card"],'
            + '[class*="agent-card"]'
        )
        const count = await twins.count()
        for (let i = 0; i < count; i++) {
            const text = await twins.nth(i).innerText()
            // Own email should not appear as a twin
            expect(text).not.toContain(
                'ronitshah0099@gmail.com'
            )
        }
    })
})
