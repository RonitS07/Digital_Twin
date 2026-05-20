import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { Mail, Calendar, MessageSquare, ExternalLink, Unlink, MessageCircle, QrCode, Cpu, Power, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'

const Workspace = () => {
    const { preferences, togglePreference, setPreference, auth: storeAuth } = useStore();
    const [connecting, setConnecting] = useState(false);

    const [gmailConnected, setGmailConnected] = useState(false);
    const [calendarConnected, setCalendarConnected] = useState(false);
    const [slackConnected, setSlackConnected] = useState(false);
    const [whatsappStatus, setWhatsappStatus] = useState('unknown');
    const [mcpData, setMcpData] = useState({ servers: [], mcp_enabled: true, total_tools: 0 });
    const [mcpLoading, setMcpLoading] = useState(false);
    const [mcpExpanded, setMcpExpanded] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    // Use a ref so the polling interval can read the latest modal state
    // without being in the dependency array (prevents interval recreation loop)
    const showQrModalRef = useRef(false);
    const waReadyConfirmRef = useRef(null);  // debounce timer for auto-close

    const loadMcpStatus = useCallback(async () => {
        setMcpLoading(true);
        try {
            const data = await apiFetch(`/mcp/status`);
            if (data?.servers) {
                setMcpData({
                    servers: data.servers,
                    mcp_enabled: data.mcp_enabled ?? true,
                    total_tools: data.total_tools ?? 0,
                });
                const wa = data.servers.find(s => s.name === 'whatsapp');
                if (wa) setWhatsappStatus(wa.status);
            }
        } catch {
            // fallback: admin endpoint
            try {
                const data = await apiFetch(`/admin/mcp/status`);
                if (data?.servers) {
                    setMcpData(prev => ({
                        ...prev,
                        servers: data.servers.map(s => ({ name: s.name, status: s.status, tool_count: s.tool_count, tools: s.tools || [] })),
                        total_tools: data.total_tools ?? 0,
                    }));
                    const wa = data.servers.find(s => s.name === 'whatsapp');
                    if (wa) setWhatsappStatus(wa.status);
                }
            } catch (e) { console.error('MCP status failed', e); }
        } finally {
            setMcpLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!storeAuth.user?.uid) return;

        apiFetch(`/integrations/google/status`)
            .then((data) => {
                setGmailConnected(!!data?.gmail_connected);
                setCalendarConnected(!!data?.calendar_connected);
            })
            .catch(console.error)
            .finally(() => setConnecting(false))

        apiFetch(`/integrations/slack/status`)
            .then((data) => setSlackConnected(!!data?.connected))
            .catch(console.error)

        loadMcpStatus();

        const pollInterval = setInterval(() => {
            loadMcpStatus();

            // Use ref instead of closure over showQrModal state to avoid
            // making showQrModal a dep (which would restart the interval each open/close)
            if (showQrModalRef.current) {
                apiFetch(`/mcp/whatsapp/qr`)
                    .then(data => {
                        setQrCode(data?.qr || null);
                        if (data?.ready) {
                            // Confirm ready for 2s before auto-closing to avoid
                            // a brief ready=false flash kicking the QR back open
                            if (!waReadyConfirmRef.current) {
                                waReadyConfirmRef.current = setTimeout(() => {
                                    setShowQrModal(false);
                                    showQrModalRef.current = false;
                                    setWhatsappStatus('ok');
                                    waReadyConfirmRef.current = null;
                                }, 2000);
                            }
                        } else {
                            // Not ready — cancel any pending auto-close confirmation
                            if (waReadyConfirmRef.current) {
                                clearTimeout(waReadyConfirmRef.current);
                                waReadyConfirmRef.current = null;
                            }
                        }
                    })
                    .catch(console.error);
            }
        }, 5000);

        return () => {
            clearInterval(pollInterval);
            if (waReadyConfirmRef.current) clearTimeout(waReadyConfirmRef.current);
        };
    }, [storeAuth.user?.uid, loadMcpStatus]) // intentionally excludes showQrModal — use ref instead

    const handleMcpToggle = async () => {
        const newEnabled = !mcpData.mcp_enabled;
        try {
            const res = await apiFetch('/mcp/toggle', {
                method: 'POST',
                body: JSON.stringify({ enabled: newEnabled }),
            });
            if (res?.ok) {
                setMcpData(prev => ({ ...prev, mcp_enabled: res.mcp_enabled }));
            }
        } catch (e) {
            console.error('MCP toggle failed', e);
            alert('MCP toggle failed: ' + e.message);
        }
    };

    const handleConnect = async (tool) => {
        if (tool.active) {
            if (window.confirm(`Are you sure you want to disconnect ${tool.name}?`)) {
                setConnecting(true);
                try {
                    if (tool.name === 'WhatsApp') {
                        await apiFetch(`/mcp/whatsapp/disconnect`, { method: 'POST' });
                        setWhatsappStatus('offline');
                        setPreference('whatsappSync', false);
                    } else {
                        const provider = (tool.name === 'Gmail' || tool.name === 'Calendar') ? 'google' : 'slack';
                        await apiFetch(`/integrations/${provider}/disconnect`, { method: 'POST' });
                        setPreference(tool.key, false);
                        if (provider === 'google') {
                            setGmailConnected(false);
                            setCalendarConnected(false);
                            setPreference('gmailSync', false);
                            setPreference('calendarSync', false);
                        } else if (provider === 'slack') {
                            setSlackConnected(false);
                            setPreference('slackSync', false);
                        }
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
                showQrModalRef.current = true;
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
        { name: "Gmail", icon: Mail, key: 'gmailSync', active: gmailConnected, desc: "Allows twin to draft, reply, and send messages on your behalf." },
        { name: "Calendar", icon: Calendar, key: 'calendarSync', active: calendarConnected, desc: "Allows twin to negotiate times and automatically schedule events." },
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

    const serverIconColor = (s) => {
        if (!mcpData.mcp_enabled) return 'bg-yellow-500/20 text-yellow-400';
        if (s.status === 'ok') return 'bg-green-500/15 text-green-400';
        if (s.status === 'error') return 'bg-red-500/15 text-red-400';
        return 'bg-neutral/10 text-neutral';
    };

    return (
        <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto space-y-8 lg:space-y-12 w-full pb-36">
            {/* WhatsApp QR Modal */}
            {showQrModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={() => { setShowQrModal(false); showQrModalRef.current = false; }}
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
                            onClick={() => { setShowQrModal(false); showQrModalRef.current = false; }}
                            className="text-xs text-neutral hover:text-on-surface transition-colors"
                        >
                            Close
                        </button>
                    </motion.div>
                </div>
            )}

            <div>
                <h2 className="text-3xl lg:text-4xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2">Connected Integrations</h2>
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

            {/* MCP Server Status Panel */}
            <div className="rounded-3xl border border-white/8 bg-white/[0.03] overflow-hidden">
                {/* Header row — always visible */}
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mcpData.mcp_enabled ? 'bg-primary/20 text-primary' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            <Cpu size={16} />
                        </div>
                        <div>
                            <span className="text-sm font-bold text-on-surface">MCP Tool Gateway</span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${mcpData.mcp_enabled ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                                <span className="text-[11px] text-on-surface-variant">
                                    {mcpLoading ? 'Loading...' : mcpData.mcp_enabled
                                        ? `${mcpData.servers.length} servers · ${mcpData.total_tools} tools`
                                        : 'Disabled'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Toggle button */}
                        <button
                            onClick={handleMcpToggle}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${mcpData.mcp_enabled
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20'
                                }`}
                        >
                            <Power size={11} />
                            {mcpData.mcp_enabled ? 'Enabled' : 'Disabled'}
                        </button>

                        {/* Expand/collapse */}
                        <button
                            onClick={() => setMcpExpanded(e => !e)}
                            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
                        >
                            {mcpExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>
                </div>

                {/* Quick pill row */}
                {!mcpExpanded && mcpData.servers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
                        {mcpData.servers.map(server => (
                            <div
                                key={server.name}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${!mcpData.mcp_enabled
                                        ? 'bg-yellow-500/5 border-yellow-500/15 text-yellow-400/70'
                                        : server.status === 'ok'
                                            ? 'bg-green-500/5 border-green-500/15 text-green-400'
                                            : 'bg-red-500/5 border-red-500/15 text-red-400'
                                    }`}
                                title={`${server.tool_count ?? 0} tools`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${!mcpData.mcp_enabled ? 'bg-yellow-500/50'
                                        : server.status === 'ok' ? 'bg-green-500'
                                            : 'bg-red-500'
                                    }`} />
                                {server.name}
                                <span className="opacity-50">·{server.tool_count ?? 0}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Expanded detailed table */}
                <AnimatePresence>
                    {mcpExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="border-t border-white/5 divide-y divide-white/5">
                                {mcpData.servers.map((server) => (
                                    <div key={server.name} className="flex items-start gap-4 px-6 py-3 hover:bg-white/[0.02] transition-colors">
                                        <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${serverIconColor(server)}`}>
                                            <Zap size={11} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-on-surface capitalize">{server.name}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${!mcpData.mcp_enabled ? 'bg-yellow-500/10 text-yellow-400'
                                                        : server.status === 'ok' ? 'bg-green-500/10 text-green-400'
                                                            : 'bg-red-500/10 text-red-400'
                                                    }`}>
                                                    {!mcpData.mcp_enabled ? 'disabled' : server.status}
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant ml-auto">{server.tool_count ?? 0} tool{server.tool_count !== 1 ? 's' : ''}</span>
                                            </div>
                                            {server.tools?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {server.tools.map(t => (
                                                        <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-on-surface-variant">
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {server.error && (
                                                <p className="text-[10px] text-red-400/70 mt-1">{server.error}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Refresh button */}
                            <div className="px-6 py-3 border-t border-white/5 flex justify-end">
                                <button
                                    onClick={loadMcpStatus}
                                    disabled={mcpLoading}
                                    className="text-[11px] text-primary/60 hover:text-primary transition-colors disabled:opacity-40"
                                >
                                    {mcpLoading ? 'Refreshing...' : '↻ Refresh status'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

export default Workspace
