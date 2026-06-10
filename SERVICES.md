# Digital Twin Services

| Service              | Port | Start command          |
|----------------------|------|------------------------|
| FastAPI backend      | 8080 | uvicorn main:app       | https://digitaltwin-production-8dfb.up.railway.app |
| React frontend       | 5173 | npm run dev            | https://digital-twin-ten-sand.vercel.app |
| WhatsApp bridge      | 3001 | bash scripts/start_wa_bridge.sh | |
| ChromaDB             | —    | embedded               |
| Telegram bot         | —    | auto (startup)         |

## WhatsApp Integration
To enable WhatsApp:
1. Run: `bash backend/scripts/start_wa_bridge.sh`
2. Scan the QR code shown in terminal with WhatsApp
3. Bridge stays connected until you restart the process
4. QR code visible in Admin Panel → MCP Server Status → whatsapp card
