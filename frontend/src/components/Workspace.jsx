import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { Mail, Calendar, MessageSquare, ExternalLink, Unlink, MessageCircle, QrCode } from 'lucide-react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'

const Workspace = () => {
    const { preferences, togglePreference, setPreference, auth: storeAuth } = useStore();
    const [connecting, setConnecting] = useState(false);

    const [googleConnected, setGoogleConnected] = useState(false);
    const [slackConnected, setSlackConnected] = useState(false);
    const [whatsappStatus, setWhatsappStatus] = useState('unknown'); // 'ok' | 'error' | 'unknown'
    const [mcpServers, setMcpServers] = useState([]);
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrCode, setQrCode] = useState(null);

    useEffect(() => {
        if (storeAuth.user?.uid) {
            setConnecting(true)
            apiFetch(`/integrations/google/status`)
                .then((data) => setGoogleConnected(!!data?.connected))
                .catch(console.error)
                .finally(() => setConnecting(false))

            apiFetch(`/integrations/slack/status`)
                .then((data) => setSlackConnected(!!data?.connected))
                .catch(console.error)

            // Load MCP status (public endpoint)
            apiFetch(`/mcp/status`)
                .then((data) => {
                    if (data?.servers) {
                        setMcpServers(data.servers);
                        const wa = data.servers.find(s => s.name === 'whatsapp');
                        if (wa) setWhatsappStatus(wa.status);
                    }
                })
                .catch(() => {
                    // fallback: try admin endpoint
                    apiFetch(`/admin/mcp/status`)
                        .then((data) => {
                            if (data?.servers) {
                                setMcpServers(data.servers.map(s => ({ name: s.name, status: s.status, tool_count: s.tool_count })));
                                const wa = data.servers.find(s => s.name === 'whatsapp');
                                if (wa) setWhatsappStatus(wa.status);
                            }
                        })
                        .catch(console.error)
                })
        }
    }, [storeAuth.user?.uid])

    const handleConnect = async (tool) => {
        if (tool.active) {
            if (window.confirm(`Are you sure you want to disconnect ${tool.name}?`)) {
                setConnecting(true);
                try {
                    const provider = (tool.name === 'Gmail' || tool.name === 'Calendar') ? 'google' : 'slack';
                    await apiFetch(`/integrations/${provider}/disconnect`, { method: 'POST' });
                    setPreference(tool.key, false);
                    if (provider === 'google') {
                        setGoogleConnected(false);
                        setPreference('gmailSync', false);
                        setPreference('calendarSync', false);
                    } else if (provider === 'slack') {
                        setSlackConnected(false);
                        setPreference('slackSync', false);
                    }
                } catch (e) {
                    console.error("Disconnect failed", e);
                } finally {
                    setConnecting(false);
                }
            }
            return;
        }

        if (tool.name === "Telegram") {
            window.open('https://t.me/aitwin_assistant_bot', '_blank');
            togglePreference(tool.key);
            return;
        }

        if (tool.name === "WhatsApp") {
            if (whatsappStatus === 'ok') return;
            setConnecting(true);
            try {
                const data = await apiFetch(`/mcp/whatsapp/qr`);
                setQrCode(data?.qr || null);
                setShowQrModal(true);
            } catch (e) {
                alert("WhatsApp QR not available: " + e.message);
            } finally {
                setConnecting(false);
            }
            return;
        }

        if (tool.name === "Slack") {
            setConnecting(true);
            try {
                const data = await apiFetch(`/oauth/slack/start`);
                window.location.href = data.auth_url;
            } catch (e) {
                console.error("Slack connection failed", e);
                alert("Slack connection failed: " + e.message);
            } finally {
                setConnecting(false);
            }
            return;
        }

        setConnecting(true);
        try {
            const scopes = tool.name === 'Gmail' ? 'gmail' : tool.name === 'Calendar' ? 'calendar' : 'gmail,calendar';
            const data = await apiFetch(`/oauth/google/start?scopes=${encodeURIComponent(scopes)}&frontend_url=${encodeURIComponent(window.location.origin)}`);

            window.location.href = data.auth_url;
        } catch (e) {
            console.error("Connection failed", e);
            alert("Failed to connect: " + e.message);
        } finally {
            setConnecting(false);
        }
    }

    const tools = [
        { name: "Gmail", icon: Mail, key: 'gmailSync', active: googleConnected, desc: "Allows twin to draft, reply, and send messages on your behalf." },
        { name: "Calendar", icon: Calendar, key: 'calendarSync', active: googleConnected, desc: "Allows twin to negotiate times and automatically schedule events." },
        { name: "Telegram", icon: MessageSquare, key: 'telegramSync', active: preferences.telegramSync, desc: "Acts as a rapid push notification and communication channel." },
        { name: "Slack", icon: MessageSquare, key: 'slackSync', active: slackConnected, desc: "Connect your workspaces for real-time team collaboration and updates." },
        {
            name: "WhatsApp",
            icon: MessageCircle,
            key: 'whatsappSync',
            active: whatsappStatus === 'ok',
            desc: "Send and receive WhatsApp messages via your AI Twin",
            statusLabel: whatsappStatus === 'ok' ? 'CONNECTED' : whatsappStatus === 'error' ? 'SCAN QR' : 'OFFLINE',
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto space-y-8 lg:space-y-12 w-full pb-36">
            {/* WhatsApp QR Modal */}
            {showQrModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={() => setShowQrModal(false)}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-surface-container border border-neutral/20 rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <MessageCircle size={32} className="text-green-400" />
                        <h3 className="font-bold text-lg text-on-surface">Scan to connect WhatsApp</h3>
                        <p className="text-sm text-on-surface-variant text-center">Open WhatsApp on your phone → Linked Devices → Link a Device</p>
                        {qrCode ? (
                            <div className="bg-white p-4 rounded-xl">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`}
                                    alt="WhatsApp QR"
                                    className="w-48 h-48"
                                />
                            </div>
                        ) : (
                            <p className="text-sm text-neutral">QR code not available yet. Start the WhatsApp bridge first.</p>
                        )}
                        <button
                            onClick={() => setShowQrModal(false)}
                            className="text-xs text-neutral hover:text-on-surface transition-colors"
                        >
                            Close
                        </button>
                    </motion.div>
                </div>
            )}

            <div>
                <h2 className="text-3xl lg:text-4xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2">Connected Workspace</h2>
                <p className="text-on-surface-variant text-sm lg:text-base max-w-2xl">Manage the external applications and permissions your AI Twin utilizes to execute autonomous actions.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {tools.map((tool, i) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={i}
                        className={`p-5 lg:p-8 rounded-3xl border flex flex-col relative transition-all ${tool.active ? 'bg-primary/5 border-primary/20 shadow-xl shadow-primary/5' : 'bg-surface-container border-neutral/5'}`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tool.active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-base text-neutral'}`}>
                                <tool.icon size={24} fill={tool.active ? 'currentColor' : 'none'} />
                            </div>
                            <span className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full ${tool.active ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-neutral/10 text-neutral'}`}>
                                {tool.statusLabel || (tool.active ? 'Connected' : 'Disconnected')}
                            </span>
                        </div>

                        <h3 className="font-bold text-xl text-on-surface mb-2">{tool.name}</h3>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-8 flex-1">{tool.desc}</p>

                        <button
                            disabled={connecting}
                            onClick={() => handleConnect(tool)}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${tool.active ? 'bg-surface-base text-on-surface hover:text-red-400 hover:bg-red-400/10' : 'bg-primary text-surface-base hover:brightness-110 active:scale-95'}`}
                        >
                            {tool.active
                                ? <><Unlink size={16} /> Disconnect</>
                                : tool.name === 'WhatsApp'
                                    ? <><QrCode size={16} /> Scan QR to Connect</>
                                    : <><ExternalLink size={16} /> Authorize Connection</>}
                        </button>
                    </motion.div>
                ))}
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-neutral/10">
                <h3 className="font-bold text-lg mb-4 text-on-surface">Security &amp; API Gateway</h3>
                <p className="text-sm text-on-surface-variant mb-6 max-w-3xl">All authenticated requests transit securely utilizing OAuth 2.0. Service credentials reside exclusively encrypted atop active memory banks and flush strictly adhering to established TTL thresholds.</p>
                <div className="bg-surface-container-highest rounded-xl p-4 font-mono text-[11px] text-primary/80 overflow-x-auto whitespace-pre">
                    {'// Backend Access Policies\nallow_origins = ["*"]\ncredential_binding = true\nttl = 3600\nmode = "zero_trust"'}
                </div>
            </div>

            {/* MCP Server Status Row */}
            {mcpServers.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-xs text-white/30 uppercase tracking-wider font-bold mr-1">MCP Servers</span>
                    {mcpServers.map(server => (
                        <div
                            key={server.name}
                            className="flex items-center gap-1.5"
                            title={`${server.name}: ${server.tool_count ?? 0} tools`}
                        >
                            <span className={`w-2 h-2 rounded-full ${server.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-xs text-white/40">{server.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default Workspace
