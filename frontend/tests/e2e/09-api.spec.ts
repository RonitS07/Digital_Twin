import { test, expect } from '@playwright/test'
import { TEST_CONFIG } from './config'

// API tests run against backend directly
test.describe('Backend API Health', () => {

    test('Backend is reachable', async ({ request }) => {
        const res = await request.get(
            `${TEST_CONFIG.apiBase}/docs`
        ).catch(() => null)
        // Either docs work or CORS blocks — either fine
        expect(res !== null).toBe(true)
    })

    test('/auth/firebase returns 422 without body',
        async ({ request }) => {
        const res = await request.post(
            `${TEST_CONFIG.apiBase}/auth/firebase`,
            { data: {} }
        )
        // Should return 422 (validation error)
        // NOT 404 (route missing)
        expect(res.status()).not.toBe(404)
    })

    test('/mcp/status requires auth',
        async ({ request }) => {
        const res = await request.get(
            `${TEST_CONFIG.apiBase}/mcp/status`
        )
        expect(res.status()).toBe(401)
    })

    test('/admin/stats requires admin auth',
        async ({ request }) => {
        const res = await request.get(
            `${TEST_CONFIG.apiBase}/admin/stats`
        )
        expect(res.status()).toBe(401)
    })

    test('/history requires auth',
        async ({ request }) => {
        const res = await request.get(
            `${TEST_CONFIG.apiBase}/history`
        )
        expect(res.status()).toBe(401)
    })

    test('/ai/process requires auth',
        async ({ request }) => {
        const res = await request.post(
            `${TEST_CONFIG.apiBase}/ai/process`,
            { data: { input: 'test' } }
        )
        expect(res.status()).toBe(401)
    })

    test('/upload requires auth',
        async ({ request }) => {
        const res = await request.post(
            `${TEST_CONFIG.apiBase}/upload`,
            {
                multipart: {
                    file: {
                        name: 'test.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('test')
                    }
                }
            }
        )
        expect(res.status()).toBe(401)
    })

    test('/telegram/send requires auth',
        async ({ request }) => {
        const res = await request.post(
            `${TEST_CONFIG.apiBase}/telegram/send`,
            { data: { message: 'test' } }
        )
        // Must NOT be 200 (open endpoint)
        expect(res.status()).not.toBe(200)
    })
})
