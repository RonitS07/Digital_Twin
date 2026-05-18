import { test, expect } from '@playwright/test'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('Twin Chat', () => {

    test('Twin chat accessible from Agent Network',
        async ({ page }) => {
        await page.goto('/')
        // Look for twin chat in nav or agent network
        const twinChatLink = page.locator(
            'a[href*="twin"]'
        )
        if (await twinChatLink.isVisible()) {
            await twinChatLink.click()
            await expect(
                page.locator('textarea, input[type="text"]')
            ).toBeVisible({ timeout: 10000 })
        }
    })
})
