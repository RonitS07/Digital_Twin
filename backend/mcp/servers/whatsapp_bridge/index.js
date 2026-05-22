const { Client, LocalAuth } = require('whatsapp-web.js')
const express = require('express')
const app = express()
app.use(express.json())

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--disable-software-rasterizer'
        ],
        timeout: 60000
    }
})

let isReady = false
let qrCode = null
let isInitializing = false

// Reasons that require a full re-init (user explicitly logged out or account conflict)
const REINIT_REASONS = new Set(['LOGOUT', 'CONFLICT', 'UNLAUNCHED'])

client.on('qr', (qr) => {
    qrCode = qr
    isReady = false
    isInitializing = false  // QR received — init cycle complete
    console.log('[WA Bridge] QR ready — scan in admin panel')
})

client.on('ready', () => {
    isReady = true
    qrCode = null
    isInitializing = false
    console.log('[WA Bridge] WhatsApp client ready')
})

client.on('auth_failure', (msg) => {
    isReady = false
    qrCode = null
    console.error('[WA Bridge] Authentication failure:', msg)
    // Auth failure always needs a fresh init
    if (!isInitializing) {
        isInitializing = true
        setTimeout(() => {
            console.log('[WA Bridge] Re-initializing after auth failure...')
            client.initialize().catch(e => {
                console.error('[WA Bridge] Re-init error:', e)
                isInitializing = false
            })
        }, 3000)
    }
})

client.on('disconnected', async (reason) => {
    isReady = false
    console.log('[WA Bridge] Disconnected:', reason)

    // Only fully re-initialize on explicit logouts — NOT on transient network issues.
    // CONNECTION_LOST, NAVIGATING, etc. are temporary and will self-recover.
    if (!REINIT_REASONS.has(reason)) {
        console.log(`[WA Bridge] Transient disconnect (${reason}) — skipping re-init to preserve session.`)
        qrCode = null
        return
    }

    if (isInitializing) {
        console.log('[WA Bridge] Already re-initializing, skipping duplicate.')
        return
    }

    isInitializing = true
    qrCode = null

    try {
        await client.destroy()
    } catch (e) {
        console.error('[WA Bridge] Error destroying client on disconnect:', e)
    }

    // Small cooldown before re-init to let WhatsApp servers settle
    setTimeout(() => {
        console.log('[WA Bridge] Re-initializing WhatsApp client after logout...')
        client.initialize().catch(e => {
            console.error('[WA Bridge] Re-init error:', e)
            isInitializing = false
        })
    }, 2000)
})

app.get('/status', (req, res) => {
    res.json({ ready: isReady, qr: qrCode })
})

app.post('/send', async (req, res) => {
    if (!isReady || !client.info) {
        return res.status(503).json({
            ok: false,
            error: 'WhatsApp not ready'
        })
    }

    const { to, message } = req.body || {}

    // Guard: both fields are required
    if (!to || !message) {
        return res.status(400).json({
            ok: false,
            error: 'Missing required fields: to, message'
        })
    }

    try {
        const cleanNumber = String(to).replace(/\D/g, '')
        if (!cleanNumber) {
            return res.status(400).json({ ok: false, error: 'Invalid phone number' })
        }
        const chatId = `${cleanNumber}@c.us`

        // Skip isRegisteredUser — it causes Puppeteer ProtocolError in containers.
        // WhatsApp will reject invalid numbers natively via sendMessage.
        const result = await client.sendMessage(chatId, message)
        res.json({
            ok: true,
            to: chatId,
            id: result.id._serialized
        })

    } catch (e) {
        console.error('WhatsApp send failed:', e)

        // Detached frame = WhatsApp Web page reloaded internally — re-init
        if (e.message && e.message.includes('detached Frame')) {
            isReady = false
            qrCode = null
            console.log('[WA Bridge] Detached frame detected — re-initializing session...')
            client.initialize().catch(err => console.error('[WA Bridge] Re-init error:', err))
            return res.status(503).json({
                ok: false,
                error: 'WhatsApp session restarting. Please try again in 15-30 seconds.'
            })
        }

        res.status(500).json({
            ok: false,
            error: e.message
        })
    }
})

app.get('/messages/:chatId', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({
            error: 'WhatsApp not ready'
        })
    }
    try {
        const chat = await client.getChatById(
            req.params.chatId
        )
        const messages = await chat.fetchMessages({ limit: 10 })
        res.json({
            messages: messages.map(m => ({
                from: m.from,
                body: m.body,
                timestamp: m.timestamp,
                fromMe: m.fromMe
            }))
        })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.post('/disconnect', async (req, res) => {
    try {
        isReady = false;
        qrCode = null;

        // 1. Logout clears the WhatsApp session server-side
        try {
            await client.logout();
        } catch (logoutErr) {
            console.warn('[WA Bridge] logout() error (may already be logged out):', logoutErr.message);
        }

        // 2. Destroy the browser instance
        try {
            await client.destroy();
        } catch (destroyErr) {
            console.warn('[WA Bridge] destroy() error:', destroyErr.message);
        }

        res.json({ success: true, message: 'WhatsApp disconnected' });

        // 3. Re-initialize so bridge is ready for a fresh QR scan immediately
        if (!isInitializing) {
            isInitializing = true;
            setTimeout(() => {
                console.log('[WA Bridge] Re-initializing after manual disconnect...');
                client.initialize().catch(e => {
                    console.error('[WA Bridge] Re-init error:', e);
                    isInitializing = false;
                });
            }, 1500);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
})

// Health / reinit endpoint — allows the Python backend to trigger a fresh init
app.post('/reinit', async (req, res) => {
    if (isInitializing) {
        return res.json({ ok: true, message: 'Already initializing' });
    }
    if (isReady) {
        return res.json({ ok: true, message: 'Already connected' });
    }
    isInitializing = true;
    try {
        await client.destroy().catch(() => {});
    } catch (_) {}
    setTimeout(() => {
        client.initialize().catch(e => {
            console.error('[WA Bridge] Reinit error:', e);
            isInitializing = false;
        });
    }, 1000);
    res.json({ ok: true, message: 'Re-initializing' });
})

isInitializing = true
client.initialize().then(() => { isInitializing = false }).catch(e => {
    console.error('[WA Bridge] Initial startup error:', e)
    isInitializing = false
})
const PORT = process.env.PORT || 3001

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WA Bridge] Listening on port ${PORT}`)
})
