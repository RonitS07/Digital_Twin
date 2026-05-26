const { Client, LocalAuth } = require('whatsapp-web.js')
const express = require('express')
const http = require('http')

function pushStatus(ready, qr) {
    try {
        const data = JSON.stringify({ ready, qr });
        
        // Use BACKEND_URL from environment if available (e.g. https://digitaltwin-production-5683.up.railway.app)
        const targetUrl = process.env.BACKEND_URL 
            ? `${process.env.BACKEND_URL.replace(/\/$/, '')}/mcp/whatsapp/webhook`
            : `http://127.0.0.1:${process.env.PORT || 8080}/mcp/whatsapp/webhook`;
            
        const parsedUrl = new URL(targetUrl);
        const requestModule = parsedUrl.protocol === 'https:' ? require('https') : require('http');
        
        const req = requestModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        });
        
        req.on('error', (e) => { console.error('[WA Bridge] Webhook push failed:', e.message); }); 
        req.write(data);
        req.end();
    } catch (e) {
        console.error('[WA Bridge] Webhook URL error:', e.message);
    }
}

const app = express()
app.use(express.json())

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 180000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-features=site-per-process',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ],
        timeout: 180000
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
    pushStatus(false, qr)
})

client.on('authenticated', () => {
    qrCode = null
    console.log('[WA Bridge] WhatsApp authenticated!')
})

client.on('ready', () => {
    isReady = true
    qrCode = null
    isInitializing = false
    console.log('[WA Bridge] WhatsApp client ready')
    pushStatus(true, null)
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
    pushStatus(false, null)
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

        // Detached frame or execution context destroyed = WhatsApp page reloaded internally — run clean destroy & re-init
        if (e.message && (e.message.includes('detached Frame') || e.message.includes('Execution context was destroyed'))) {
            isReady = false
            qrCode = null
            console.log('[WA Bridge] Detached frame or execution context destroyed detected — performing clean session reset...');
            
            // Execute clean destroy and re-init asynchronously
            (async () => {
                try {
                    await client.destroy()
                } catch (destroyErr) {
                    console.warn('[WA Bridge] Error destroying client during recovery:', destroyErr.message)
                }
                setTimeout(() => {
                    console.log('[WA Bridge] Re-initializing WhatsApp client after clean reset...')
                    client.initialize().catch(err => console.error('[WA Bridge] Re-init error:', err))
                }, 2000)
            })()

            return res.status(503).json({
                ok: false,
                error: 'WhatsApp session restarting due to frame detachment. Please try again in 15-30 seconds.'
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
        pushStatus(false, null);

        // 1. Logout clears the WhatsApp session server-side.
        // This automatically triggers the 'disconnected' event listener above,
        // which handles the clean destroy() and re-initialize() flow.
        try {
            await client.logout();
        } catch (logoutErr) {
            console.warn('[WA Bridge] logout() error (may already be logged out):', logoutErr.message);
            // If logout fails (e.g. already logged out), trigger manual fallback destroy
            try { await client.destroy() } catch (e) {}
            if (!isInitializing) {
                isInitializing = true;
                setTimeout(() => {
                    console.log('[WA Bridge] Re-initializing after manual disconnect fallback...');
                    client.initialize().catch(e => { isInitializing = false });
                }, 1500);
            }
        }

        res.json({ success: true, message: 'WhatsApp disconnected' });
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
