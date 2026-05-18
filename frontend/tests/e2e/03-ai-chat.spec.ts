import { test, expect } from '@playwright/test'
import {
    navigateTo, sendChatMessage, waitForAIResponse
} from './helpers'

test.use({
    storageState: './tests/e2e/.auth-state.json'
})

test.describe('AI Chat', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await navigateTo(page, 'chat')
        await page.waitForLoadState('domcontentloaded')
    })

    test('Chat UI renders correctly',
        async ({ page }) => {
        await expect(
            page.locator(
                'textarea[placeholder*="Instruct"],'
                + 'textarea[placeholder*="Twin"]'
            )
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.locator(
                'button[title="Add"],'
                + 'button:has-text("+")'
            )
        ).toBeVisible()
    })

    test('Plus menu opens on click',
        async ({ page }) => {
        await page.click(
            'button[title="Add"],'
            + 'button:has-text("+")'
        )
        await expect(
            page.locator('text=Draft email').first()
        ).toBeVisible({ timeout: 5000 })
    })

    test('Plus menu closes on outside click',
        async ({ page }) => {
        await page.click(
            'button[title="Add"],'
            + 'button:has-text("+")'
        )
        await page.click('body', { position: { x: 10, y: 10 } })
        await expect(
            page.locator('text=Add photos & files')
        ).not.toBeVisible({ timeout: 3000 })
    })

    test('New chat button creates empty chat',
        async ({ page }) => {
        await page.click(
            'button:has-text("New Chat"),'
            + '[class*="new-chat"]'
        )
        const messages = page.locator(
            '[class*="message"]'
        )
        // A new chat has exactly 2 message elements for the default welcome greeting
        await expect(messages).toHaveCount(2, {
            timeout: 5000
        })
    })

    test('General query gets AI response',
        async ({ page }) => {
        await sendChatMessage(
            page, 'Hello, what can you do for me?'
        )
        const response = await waitForAIResponse(page)
        expect(response.length).toBeGreaterThan(20)
        // Should not contain raw JSON or action tags
        expect(response).not.toContain('<action>')
        expect(response).not.toContain('"intent":')
    })

    test('Email read intent classified correctly',
        async ({ page }) => {
        // Intercept the /ai/process request
        let capturedIntent = ''
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                capturedIntent = body.intent || ''
            }
        })
        await sendChatMessage(
            page, 'show me my latest emails'
        )
        await waitForAIResponse(page)
        expect(capturedIntent).toMatch(
            /email_read|email/i
        )
    })

    test('Image generation intent routes to visual',
        async ({ page }) => {
        let capturedIntent = ''
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                capturedIntent = body.intent || ''
            }
        })
        await sendChatMessage(
            page, 'generate an image of a mountain'
        )
        await waitForAIResponse(
            page, 45000
        )
        expect(capturedIntent).toMatch(/visual/i)
    })

    test('Image response renders as img tag',
        async ({ page }) => {
        await sendChatMessage(
            page, 'generate an image of a blue ocean'
        )
        // Wait for visual response
        await page.waitForSelector(
            'img[src*="pollinations"],'
            + 'img[src*="image"],'
            + '[class*="image-response"]',
            { timeout: 45000 }
        )
    })

    test('Calendar intent classified correctly',
        async ({ page }) => {
        let capturedIntent = ''
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                capturedIntent = body.intent || ''
            }
        })
        await sendChatMessage(
            page, 'what meetings do I have today'
        )
        await waitForAIResponse(page)
        expect(capturedIntent).toMatch(/calendar/i)
    })

    test('Slack intent classified correctly',
        async ({ page }) => {
        let capturedIntent = ''
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                capturedIntent = body.intent || ''
            }
        })
        await sendChatMessage(
            page, 'post hello to #general on slack'
        )
        await waitForAIResponse(page)
        expect(capturedIntent).toMatch(/slack/i)
    })

    test('Telegram intent classified correctly',
        async ({ page }) => {
        let capturedIntent = ''
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                capturedIntent = body.intent || ''
            }
        })
        await sendChatMessage(
            page, 'send hi on telegram'
        )
        await waitForAIResponse(page)
        expect(capturedIntent).toMatch(/telegram/i)
    })

    test('HITL card shows correct action title',
        async ({ page }) => {
        await sendChatMessage(
            page,
            'send an email to test@example.com '
            + 'saying hello'
        )
        await page.waitForSelector(
            'text=Approve',
            { timeout: 30000 }
        )
        // Must NOT show "Untitled Action"
        await expect(
            page.locator('text=Untitled Action')
        ).not.toBeVisible()
        // Reject to clean up
        const rejectBtn = page.locator(
            'button:has-text("Reject")'
        ).first()
        if (await rejectBtn.isVisible()) {
            await rejectBtn.click()
        }
    })

    test('Email draft saves to Drafts (no approval)',
        async ({ page }) => {
        let approvalRequired = false
        page.on('response', async (res) => {
            if (res.url().includes('/ai/process')) {
                const body = await res.json()
                    .catch(() => ({}))
                approvalRequired =
                    body.approval_required === true
            }
        })
        await sendChatMessage(
            page,
            'draft an email to test@example.com '
            + 'about project update'
        )
        await waitForAIResponse(page)
        // Draft should NOT require approval
        expect(approvalRequired).toBe(false)
        // Should mention Drafts folder
        const response = await page.locator(
            '.assistant-message-content,'
            + '[data-testid="assistant-message"]'
        ).last().innerText().catch(() => '')
        expect(response.toLowerCase()).toMatch(
            /draft|drafts|gmail/i
        )
    })

    test('File upload via paperclip',
        async ({ page }) => {
        // Create a test file
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click(
                '[title="Attach file"],'
                + 'button:has(svg[data-lucide="paperclip"])'
            )
        ])
        // Upload a small test file
        await fileChooser.setFiles({
            name: 'test.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from(
                'This is a test document for AI Twin.'
            )
        })
        // Wait for file to be processed
        await page.waitForSelector(
            'text=test.txt',
            { timeout: 15000 }
        )
    })

    test('Chat history persists after reload',
        async ({ page }) => {
        // Send a message
        await sendChatMessage(
            page, 'Remember the number 42'
        )
        await waitForAIResponse(page)

        // Get message count before reload
        const beforeCount = await page.locator(
            '[class*="message"]'
        ).count()

        // Reload page
        await page.reload()
        await navigateTo(page, 'chat')
        await page.waitForLoadState('domcontentloaded')

        // Check messages are restored
        const afterCount = await page.locator(
            '[class*="message"]'
        ).count()
        expect(afterCount).toBeGreaterThanOrEqual(
            beforeCount
        )
    })

    test('Chat sidebar shows previous conversations',
        async ({ page }) => {
        await expect(
            page.locator(
                '[class*="sidebar"] [class*="chat"],'
                + '[class*="conversation"],'
                + '[class*="history"]'
            ).first()
        ).toBeVisible({ timeout: 10000 })
    })

    test('No raw action tags in responses',
        async ({ page }) => {
        await sendChatMessage(
            page, 'what time is it in Tokyo?'
        )
        const response = await waitForAIResponse(page)
        expect(response).not.toContain('<action>')
        expect(response).not.toContain('</action>')
        expect(response).not.toContain('"intent":')
    })
})
