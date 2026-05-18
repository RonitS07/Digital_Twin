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
    // Automatically ensure the user is logged in before navigating
    await loginIfRequired(page)

    const navMap: Record<string, string> = {
        'home': 'Home, Dashboard',
        'chat': 'AI Twin Chat, Chat',
        'workspace': 'Workspace, Integrations, Connected',
        'activity': 'Activity',
        'agent': 'Agent Network, Network',
        'settings': 'Settings',
        'admin': 'Admin Panel, Admin',
    }
    const labels = navMap[section]?.split(', ') || [section]
    
    // Wait up to 15 seconds for nav sidebar to render (auth check and route rendering)
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null)

    for (const label of labels) {
        const link = page.locator(
            `nav :has-text("${label}")`
        ).first()
        if (await link.isVisible().catch(() => false)) {
            await link.click()
            return
        }
    }

    // Try a delayed fallback check for the first label in case of hydration delay
    const fallbackLabel = labels[0]
    const fallbackLink = page.locator(`nav :has-text("${fallbackLabel}")`).first()
    await fallbackLink.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
    if (await fallbackLink.isVisible().catch(() => false)) {
        await fallbackLink.click()
        return
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

export async function loginIfRequired(page: Page): Promise<void> {
    // Check if login inputs are visible
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first()
    const isLoginScreen = await emailInput.isVisible().catch(() => false)
    if (!isLoginScreen) {
        // Wait a brief moment to see if route redirects to login
        await page.waitForTimeout(1000)
        const checkVisible = await emailInput.isVisible().catch(() => false)
        if (!checkVisible) return
    }

    // Fill email
    await page.fill(
        'input[type="email"], input[placeholder*="email"]',
        TEST_CONFIG.email
    )

    // Fill password
    await page.fill(
        'input[type="password"]',
        TEST_CONFIG.password
    )

    // Click sign in
    await page.click(
        'button[type="submit"], button:has-text("Sign In")'
    )

    // Wait for dashboard to load
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 20000 })
}
