import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { Mail, Calendar, MessageSquare, ExternalLink, Unlink, MessageCircle, QrCode, Cpu, Power, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const Workspace = () => {
    const { preferences, togglePreference, setPreference, auth: storeAuth, whatsappReady, setWhatsappReady, setAllIntegrations, setIntegration, invalidateIntegrationCache } = useStore();
    const [connecting, setConnecting] = useState(false);

    const [gmailConnected, setGmailConnected] = useState(false);
    const [calendarConnected, setCalendarConnected] = useState(false);
    const [slackConnected, setSlackConnected] = useState(false);
    const [whatsappStatus, setWhatsappStatus] = useState(() => {
        // Initialize from store if already known
        if (whatsappReady === true) return 'ok';
        if (whatsappReady === false) return 'offline';
        return 'unknown';
    });
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
                if (wa) {
                    setWhatsappStatus(wa.status);
                    setWhatsappReady(wa.status === 'ok');
                }
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
                    if (wa) {
                        setWhatsappStatus(wa.status);
                        setWhatsappReady(wa.status === 'ok');
                    }
                }
            } catch (e) { console.error('MCP status failed', e); }
        } finally {
            setMcpLoading(false);
        }
    }, [setWhatsappReady]);

    // Sync Zustand whatsappReady into local whatsappStatus immediately
    useEffect(() => {
        if (whatsappReady === true) {
            setWhatsappStatus('ok');
            setIntegration('whatsapp', true);
            if (showQrModal) {
                setShowQrModal(false);
                showQrModalRef.current = false;
            }
        } else if (whatsappReady === false) {
            setWhatsappStatus('offline');
        }
    }, [whatsappReady, showQrModal, setIntegration]);

    // QR Code polling (only active when the QR Modal is displayed)
    useEffect(() => {
        if (!showQrModal) {
            setQrCode(null);
            return;
        }

        let isStopped = false;
        const fetchQr = async () => {
            try {
                const data = await apiFetch(`/mcp/whatsapp/qr`);
                if (isStopped) return;
                setQrCode(data?.qr || null);
                if (data?.ready) {
                    setWhatsappStatus('ok');
                    setWhatsappReady(true);
                    setIntegration('whatsapp', true);
                    setShowQrModal(false);
                    showQrModalRef.current = false;
                }
            } catch (err) {
                console.error("Error polling WhatsApp QR:", err);
            }
        };

        fetchQr();
        const qrInt = setInterval(fetchQr, 5000);
        return () => {
            isStopped = true;
            clearInterval(qrInt);
        };
    }, [showQrModal, setWhatsappReady, setIntegration]);

    // ── Cache-aware integration status fetch ──────────────────────────────────
    useEffect(() => {
        if (!storeAuth.user?.uid) return;

        const fetchStatus = async () => {
            const { integrations } = useStore.getState();
            const cacheAge = integrations.lastFetched
                ? Date.now() - integrations.lastFetched
                : Infinity;

            if (cacheAge < CACHE_TTL) {
                // Cache is fresh — restore from store, skip all network calls
                setGmailConnected(!!integrations.gmail);
                setCalendarConnected(!!integrations.calendar);
                setSlackConnected(!!integrations.slack);
                if (integrations.whatsapp) setWhatsappStatus('ok');
                setConnecting(false);
            } else {
                // Cache stale or empty — fetch fresh from all APIs in parallel
                setConnecting(true);
                try {
                    const [googleRes, slackRes, mcpRes] = await Promise.allSettled([
                        apiFetch('/integrations/google/status'),
                        apiFetch('/integrations/slack/status'),
                        apiFetch('/mcp/status'),
                    ]);

                    const newState = {};

                    if (googleRes.status === 'fulfilled') {
                        newState.gmail = !!googleRes.value?.gmail_connected;
                        newState.calendar = !!googleRes.value?.calendar_connected;
                        setGmailConnected(newState.gmail);
                        setCalendarConnected(newState.calendar);
                    }
                    if (slackRes.status === 'fulfilled') {
                        newState.slack = !!slackRes.value?.connected;
                        setSlackConnected(newState.slack);
                    }
                    if (mcpRes.status === 'fulfilled') {
                        const wa = mcpRes.value?.servers?.find(s => s.name === 'whatsapp');
                        newState.whatsapp = wa?.status === 'ok';
                        if (newState.whatsapp) setWhatsappStatus('ok');
                    }

                    // Persist to store (saved to localStorage)
                    setAllIntegrations(newState);
                } catch (err) {
                    console.error('Integration status fetch failed:', err);
                } finally {
                    setConnecting(false);
                }
            }
        };

        fetchStatus();
        loadMcpStatus();

        const pollInterval = setInterval(() => {
            loadMcpStatus();
        }, 30000);

        return () => {
            clearInterval(pollInterval);
        };
    }, [storeAuth.user?.uid, loadMcpStatus])

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
                        setWhatsappReady(false);
                        setPreference('whatsappSync', false);
                        // Update cache immediately
                        setIntegration('whatsapp', false);
                    } else {
                        const provider = (tool.name === 'Gmail' || tool.name === 'Calendar') ? 'google' : 'slack';
                        await apiFetch(`/integrations/${provider}/disconnect`, { method: 'POST' });
                        setPreference(tool.key, false);
                        if (provider === 'google') {
                            setGmailConnected(false);
                            setCalendarConnected(false);
                            setPreference('gmailSync', false);
                            setPreference('calendarSync', false);
                            // Update cache immediately
                            setAllIntegrations({ gmail: false, calendar: false });
                        } else if (provider === 'slack') {
                            setSlackConnected(false);
                            setPreference('slackSync', false);
                            setIntegration('slack', false);
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
                        <MessageCircle size={32} className="text-[#2D6A4F]" />
                        <h3 className="font-fraunces font-semibold text-xl text-[#1A1814]">Scan to connect WhatsApp</h3>
                        <p className="font-dm text-sm text-[#7A7065] text-center">Open WhatsApp on your phone → Linked Devices → Link a Device</p>
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
                <p className="wi-label mb-2">Integrations</p>
                <h2 className="font-fraunces font-semibold text-3xl lg:text-4xl text-[#1A1814] mb-2">Connected Services</h2>
                <p className="font-dm text-sm lg:text-base text-[#7A7065] max-w-2xl">Manage the external applications and permissions your AI Twin utilizes to execute autonomous actions.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {tools.map((tool, i) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={i}
                        className={`wi-card p-6 flex flex-col relative transition-all ${tool.active ? 'wi-card-accent' : ''}`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tool.active ? 'bg-[#2D6A4F] text-white shadow-md' : 'bg-[#F7F5F2] text-[#7A7065]'}`}>
                                <tool.icon size={22} fill={tool.active ? 'currentColor' : 'none'} />
                            </div>
                            <span className={`badge ${tool.active ? 'badge-connected' : 'badge-disconnected'}`}>
                                {tool.statusLabel || (tool.active ? 'Connected' : 'Disconnected')}
                            </span>
                        </div>

                        <h3 className="font-fraunces font-semibold text-xl text-[#1A1814] mb-2">{tool.name}</h3>
                        <p className="font-dm text-sm text-[#7A7065] leading-relaxed mb-8 flex-1">{tool.desc}</p>

                        <button
                            disabled={connecting}
                            onClick={() => handleConnect(tool)}
                            className={`w-full py-3 rounded-lg font-dm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm ${tool.active ? 'btn-secondary text-[#C0392B] hover:bg-[#FFF0EE] border-[#C0392B]/20' : 'btn-primary'}`}
                        >
                            {tool.active
                                ? <><Unlink size={16} /> Disconnect</>
                                : tool.name === 'WhatsApp'
                                    ? <><QrCode size={16} /> Scan QR</>
                                    : <><ExternalLink size={16} /> Authorize</>}
                        </button>
                    </motion.div>
                ))}
            </div>

            <div className="wi-card border-[#E8E4DE] bg-[#F7F5F2]">
                <h3 className="font-fraunces font-semibold text-lg mb-3 text-[#1A1814]">Security &amp; API Gateway</h3>
                <p className="font-dm text-sm text-[#7A7065] mb-6 max-w-3xl">All authenticated requests transit securely utilizing OAuth 2.0. Service credentials reside exclusively encrypted atop active memory banks and flush strictly adhering to established TTL thresholds.</p>
                <div className="bg-white border border-[#E8E4DE] rounded-xl p-4 font-mono-ji text-[11px] text-[#A09488] overflow-x-auto whitespace-pre">
                    {'// Backend Access Policies\nallow_origins = ["*"]\ncredential_binding = true\nttl = 3600\nmode = "zero_trust"'}
                </div>
            </div>

            {/* MCP Server Status Panel */}
            <div className="wi-card p-0 overflow-hidden border-[#E8E4DE]">
                {/* Header row — always visible */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#F7F5F2]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mcpData.mcp_enabled ? 'bg-[#E6F4EC] text-[#2D6A4F]' : 'bg-[#FEF3C7] text-[#B45309]'}`}>
                            <Cpu size={16} />
                        </div>
                        <div>
                            <span className="font-dm font-semibold text-sm text-[#1A1814]">MCP Tool Gateway</span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${mcpData.mcp_enabled ? 'bg-[#2D6A4F] animate-pulse' : 'bg-[#B45309]'}`} />
                                <span className="font-mono-ji text-[11px] text-[#7A7065]">
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
                                ? 'bg-[#E6F4EC] text-[#2D6A4F] border-[#2D6A4F]/20 hover:bg-[#FFF0EE] hover:text-[#C0392B] hover:border-[#C0392B]/20'
                                : 'bg-[#FEF3C7] text-[#B45309] border-[#B45309]/20 hover:bg-[#E6F4EC] hover:text-[#2D6A4F] hover:border-[#2D6A4F]/20'
                                }`}
                        >
                            <Power size={11} />
                            {mcpData.mcp_enabled ? 'Enabled' : 'Disabled'}
                        </button>

                        {/* Expand/collapse */}
                        <button
                            onClick={() => setMcpExpanded(e => !e)}
                            className="text-[#A09488] hover:text-[#1A1814] transition-colors p-1"
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
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono-ji text-[10px] font-medium border ${!mcpData.mcp_enabled
                                    ? 'bg-[#FEF3C7] border-[#B45309]/15 text-[#B45309]'
                                    : server.status === 'ok'
                                        ? 'bg-[#E6F4EC] border-[#2D6A4F]/15 text-[#2D6A4F]'
                                        : 'bg-[#FFF0EE] border-[#C0392B]/15 text-[#C0392B]'
                                    }`}
                                title={`${server.tool_count ?? 0} tools`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${!mcpData.mcp_enabled ? 'bg-[#B45309]'
                                    : server.status === 'ok' ? 'bg-[#2D6A4F]'
                                        : 'bg-[#C0392B]'
                                    }`} />
                                {server.name}
                                <span className="opacity-60">·{server.tool_count ?? 0}</span>
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
                            <div className="border-t border-[#E8E4DE] divide-y divide-[#E8E4DE] bg-white">
                                {mcpData.servers.map((server) => (
                                    <div key={server.name} className="flex items-start gap-4 px-6 py-4 hover:bg-[#F7F5F2] transition-colors">
                                        <div className="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#E8E4DE] text-[#7A7065]">
                                            <Zap size={12} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-dm font-semibold text-sm text-[#1A1814] capitalize">{server.name}</span>
                                                <span className={`badge ${!mcpData.mcp_enabled ? 'badge-offline'
                                                    : server.status === 'ok' ? 'badge-connected'
                                                        : 'badge-danger'
                                                    }`}>
                                                    {!mcpData.mcp_enabled ? 'disabled' : server.status}
                                                </span>
                                                <span className="font-dm text-[11px] text-[#A09488] ml-auto">{server.tool_count ?? 0} tool{server.tool_count !== 1 ? 's' : ''}</span>
                                            </div>
                                            {server.tools?.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {server.tools.map(t => (
                                                        <span key={t} className="font-mono-ji text-[10px] px-1.5 py-0.5 rounded bg-[#F7F5F2] border border-[#E8E4DE] text-[#7A7065]">
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {server.error && (
                                                <p className="font-dm text-xs text-[#C0392B] mt-1.5">{server.error}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Refresh button */}
                            <div className="px-6 py-3 border-t border-[#E8E4DE] bg-[#F7F5F2] flex justify-end">
                                <button
                                    onClick={loadMcpStatus}
                                    disabled={mcpLoading}
                                    className="font-dm text-xs font-medium text-[#7A7065] hover:text-[#2D6A4F] transition-colors disabled:opacity-40"
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
