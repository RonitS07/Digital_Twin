const { Client, LocalAuth } = require('whatsapp-web.js')
const express = require('express')
const app = express()
app.use(express.json())

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        timeout: 60000
    }
})

let isReady = false
let qrCode = null

client.on('qr', (qr) => {
    qrCode = qr
    isReady = false
    console.log('[WA Bridge] QR ready — scan in admin panel')
})

client.on('ready', () => {
    isReady = true
    qrCode = null
    console.log('[WA Bridge] WhatsApp client ready')
})

client.on('auth_failure', (msg) => {
    isReady = false
    qrCode = null
    console.error('[WA Bridge] Authentication failure:', msg)
})

client.on('disconnected', async (reason) => {
    isReady = false
    qrCode = null
    console.log('[WA Bridge] Client was logged out/disconnected:', reason)
    try {
        await client.destroy()
    } catch (e) {
        console.error('[WA Bridge] Error destroying client on disconnect:', e)
    }
    console.log('[WA Bridge] Re-initializing WhatsApp client...')
    client.initialize()
})

app.get('/status', (req, res) => {
    res.json({ ready: isReady, qr: qrCode })
})

app.post('/send', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({
            error: 'WhatsApp not ready'
        })
    }
    const { to, message } = req.body
    // Format: 919876543210@c.us for Indian numbers
    const chatId = to.includes('@') ? to : `${to}@c.us`
    try {
        await client.sendMessage(chatId, message)
        res.json({ ok: true, to: chatId })
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message })
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

client.initialize()
const PORT = process.env.PORT || 3001

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WA Bridge] Listening on port ${PORT}`)
})
