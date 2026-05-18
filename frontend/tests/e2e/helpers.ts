import { Page, expect } from '@playwright/test'
import { TEST_CONFIG } from './config'

export async function waitForAIResponse(
    page: Page,
    timeout = TEST_CONFIG.aiTimeout
): Promise<string> {
    // Wait for assistant message to appear
    await page.waitForSelector(
        '[data-testid="assistant-message"],'
        + '.assistant-message,'
        + 'text=ASSISTANT',
        { timeout }
    )
    // Wait for loading to finish
    await page.waitForFunction(() => {
        const loaders = document.querySelectorAll(
            '.loading, .spinner, [data-loading="true"]'
        )
        return loaders.length === 0
    }, { timeout })

    // Get last assistant message
    const messages = page.locator(
        '[data-testid="assistant-message"],'
        + '.assistant-message-content'
    )
    const count = await messages.count()
    if (count === 0) return ''
    return messages.nth(count - 1).innerText()
}

export async function sendChatMessage(
    page: Page,
    message: string
): Promise<void> {
    const input = page.locator(
        'textarea[placeholder*="Instruct"],'
        + 'textarea[placeholder*="Twin"],'
        + 'input[placeholder*="Instruct"]'
    )
    await input.fill(message)
    await page.keyboard.press('Enter')
}

export async function navigateTo(
    page: Page,
    section: string
): Promise<void> {
    const navMap: Record<string, string> = {
        'home': 'Home, Dashboard',
        'chat': 'AI Twin Chat, Chat',
        'workspace': 'Workspace, Connected',
        'activity': 'Activity',
        'agent': 'Agent Network',
        'settings': 'Settings',
        'admin': 'Admin Panel, Admin',
    }
    const labels = navMap[section]?.split(', ') || [section]
    for (const label of labels) {
        const link = page.locator(
            `nav a:has-text("${label}")`
        ).first()
        if (await link.isVisible().catch(() => false)) {
            await link.click()
            return
        }
    }
    throw new Error(`Could not navigate to: ${section}`)
}

export async function waitForToast(
    page: Page,
    text?: string
): Promise<void> {
    const toast = page.locator(
        '[role="alert"], .toast, .notification'
    )
    await toast.waitFor({ timeout: 5000 })
    if (text) {
        await expect(toast).toContainText(text)
    }
}
