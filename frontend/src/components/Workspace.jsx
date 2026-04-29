import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { Mail, Calendar, MessageSquare, ExternalLink, Unlink } from 'lucide-react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
const Workspace = () => {
    const { preferences, togglePreference, setPreference, auth: storeAuth } = useStore();
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        if (storeAuth.user?.uid) {
            setConnecting(true)
            apiFetch(`/integrations/google/status`)
                .then((data) => {
                    setPreference('gmailSync', !!data?.connected)
                    setPreference('calendarSync', !!data?.connected)
                })
                .catch(console.error)
                .finally(() => setConnecting(false))
            
            apiFetch(`/integrations/slack/status`)
                .then((data) => setPreference('slackSync', !!data?.connected))
                .catch(console.error)
        }
    }, [storeAuth.user?.uid, setPreference])

    const handleConnect = async (tool) => {
        if (tool.active) {
            if (window.confirm(`Are you sure you want to disconnect ${tool.name}?`)) {
                setConnecting(true);
                try {
                    const provider = (tool.name === 'Gmail' || tool.name === 'Calendar') ? 'google' : 'slack';
                    await apiFetch(`/integrations/${provider}/disconnect`, { method: 'POST' });
                    setPreference(tool.key, false);
                    if (provider === 'google') {
                        setPreference('gmailSync', false);
                        setPreference('calendarSync', false);
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

    return (
        <div className="p-10 max-w-7xl mx-auto space-y-12 w-full">
            <div>
                <h2 className="text-4xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2">Connected Workspace</h2>
                <p className="text-on-surface-variant max-w-2xl">Manage the external applications and permissions your AI Twin utilizes to execute autonomous actions.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[
                    { name: "Gmail", icon: Mail, key: 'gmailSync', active: preferences.gmailSync, desc: "Allows twin to draft, reply, and send messages on your behalf." },
                    { name: "Calendar", icon: Calendar, key: 'calendarSync', active: preferences.calendarSync, desc: "Allows twin to negotiate times and automatically schedule events." },
                    { name: "Telegram", icon: MessageSquare, key: 'telegramSync', active: preferences.telegramSync, desc: "Acts as a rapid push notification and communication channel." },
                    { name: "Slack", icon: MessageSquare, key: 'slackSync', active: preferences.slackSync, desc: "Connect your workspaces for real-time team collaboration and updates." }
                ].map((tool, i) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={i}
                        className={`p-8 rounded-3xl border flex flex-col relative transition-all ${tool.active ? 'bg-primary/5 border-primary/20 shadow-xl shadow-primary/5' : 'bg-surface-container border-neutral/5'}`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tool.active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-base text-neutral'}`}>
                                <tool.icon size={24} fill={tool.active ? 'currentColor' : 'none'} />
                            </div>
                            <span className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full ${tool.active ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-neutral/10 text-neutral'}`}>
                                {tool.active ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>

                        <h3 className="font-bold text-xl text-on-surface mb-2">{tool.name}</h3>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-8 flex-1">{tool.desc}</p>

                        <button
                            disabled={connecting}
                            onClick={() => handleConnect(tool)}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${tool.active ? 'bg-surface-base text-on-surface hover:text-red-400 hover:bg-red-400/10' : 'bg-primary text-surface-base hover:brightness-110 active:scale-95'}`}
                        >
                            {tool.active ? <><Unlink size={16} /> Disconnect</> : <><ExternalLink size={16} /> Authorize Connection</>}
                        </button>
                    </motion.div>
                ))}
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-neutral/10">
                <h3 className="font-bold text-lg mb-4 text-on-surface">Security & API Gateway</h3>
                <p className="text-sm text-on-surface-variant mb-6 max-w-3xl">All authenticated requests transit securely utilizing OAuth 2.0. Service credentials reside exclusively encrypted atop active memory banks and flush strictly adhering to established TTL thresholds.</p>
                <div className="bg-surface-container-highest rounded-xl p-4 font-mono text-[11px] text-primary/80 overflow-x-auto whitespace-pre">
                    {"// Backend Access Policies\nallow_origins = [\"*\"]\ncredential_binding = true\nttl = 3600\nmode = \"zero_trust\""}
                </div>
            </div>
        </div>
    )
}

export default Workspace
