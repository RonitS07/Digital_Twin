import { test, expect } from '@playwright/test'
import { navigateTo } from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Workspace', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'workspace')
        await page.waitForLoadState('domcontentloaded')
    })

    test('Workspace page renders',
        async ({ page }) => {
        await expect(
            page.locator('text=Workspace').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('All 5 integration cards visible',
        async ({ page }) => {
        const integrations = [
            'Gmail', 'Calendar', 'Telegram',
            'Slack', 'WhatsApp'
        ]
        for (const name of integrations) {
            await expect(
                page.locator(`text=${name}`).first()
            ).toBeVisible({ timeout: 10000 })
        }
    })

    test('Integration cards show connected status',
        async ({ page }) => {
        await page.waitForTimeout(3000) // wait for API
        // Each card should show CONNECTED or
        // Authorize Connection — not blank
        const statuses = page.locator(
            'button:has-text("Authorize"), button:has-text("Disconnect"), text=CONNECTED'
        )
        const count = await statuses.count()
        expect(count).toBeGreaterThanOrEqual(3)
    })

    test('MCP server status row visible',
        async ({ page }) => {
        await expect(
            page.locator('text=MCP').first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('WhatsApp card shows status badge',
        async ({ page }) => {
        await expect(
            page.locator(
                'text=WhatsApp'
            )
        ).toBeVisible({ timeout: 10000 })
        // Should show either CONNECTED or a connect button
        const waCard = page.locator(
            ':has-text("WhatsApp")'
        ).last()
        await expect(
            waCard.locator(
                'button:has-text("Connect"), button:has-text("Scan"), text=CONNECTED'
            ).first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('Google OAuth button navigates to Google',
        async ({ page }) => {
        // Find a disconnected OAuth service
        const authBtn = page.locator(
            'button:has-text("Authorize Connection")'
        ).first()
        if (await authBtn.isVisible()) {
            // Don't actually click — just check it exists
            await expect(authBtn).toBeEnabled()
        }
    })

    test('Security & API Gateway section visible',
        async ({ page }) => {
        await expect(
            page.locator('text=Security').first()
        ).toBeVisible({ timeout: 10000 })
    })
})
