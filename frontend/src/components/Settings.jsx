import React, { useState } from 'react'
import { API_BASE } from '../config'
import { motion } from 'framer-motion'
import {
    User, Palette, Plug, Brain, ShieldCheck, LogOut,
    Sun, Moon, Monitor, Bell, Zap, Mail, Calendar,
    Lock, Trash2, ChevronRight, Check, Globe, Clock
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { auth } from '../firebase'
import { signOut } from 'firebase/auth'

const Section = ({ icon: Icon, title, children }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-surface-container border border-outline-variant/40 overflow-hidden"
    >
        <div className="flex items-center gap-3 px-7 py-5 border-b border-outline-variant/30 bg-surface-container-high/40">
            <Icon size={18} className="text-primary" />
            <h3 className="font-manrope font-bold text-on-surface tracking-tight">{title}</h3>
        </div>
        <div className="divide-y divide-outline-variant/20">{children}</div>
    </motion.div>
)

const Row = ({ label, description, children }) => (
    <div className="flex items-center justify-between gap-4 px-7 py-5 hover:bg-surface-container-high/30 transition-colors">
        <div>
            <p className="font-semibold text-sm text-on-surface">{label}</p>
            {description && <p className="text-xs text-on-surface-variant mt-0.5 opacity-80">{description}</p>}
        </div>
        {children}
    </div>
)

const Toggle = ({ value, onChange }) => (
    <button
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full relative p-1 transition-colors duration-200 ${value ? 'bg-primary' : 'bg-outline'}`}
    >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
)

const Settings = () => {
    const { auth: storeAuth, theme, setTheme, preferences, togglePreference, logout } = useStore()
    const user = storeAuth.user || {}
    const [saved, setSaved] = useState(false)
    const [gmailConnected, setGmailConnected] = useState(false)
    const [autonomous, setAutonomous] = useState(() => {
        const val = localStorage.getItem(`autonomous_mode_${user.uid}`)
        return val === 'true'
    })

    const themeOptions = [
        { key: 'light', icon: Sun, label: 'Light' },
        { key: 'dark', icon: Moon, label: 'Dark' },
        { key: 'system', icon: Monitor, label: 'System' }
    ]

    React.useEffect(() => {
        // Check Gmail Status
        const token = useStore.getState().auth?.user?.accessToken;
        if (!token) return;
        fetch(`${API_BASE}/auth/gmail/status`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(data => setGmailConnected(data.connected))
            .catch(() => setGmailConnected(false))
    }, [])

    const handleSave = () => {
        localStorage.setItem(`autonomous_mode_${user.uid}`, autonomous)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handleResetMemory = async () => {
        if (window.confirm('Clear all AI memory and history? This action is permanent.')) {
            try {
                const res = await fetch(`${API_BASE}/memory/reset?user_id=${user.uid}`, { method: 'DELETE' })
                if (res.ok) alert('Memory cleared successfully.')
            } catch (e) {
                alert('Failed to reset memory.')
            }
        }
    }

    const handleSignOut = async () => {
        await signOut(auth)
        logout()
    }

    return (
        <div className="p-10 max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between mb-2">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Configuration</p>
                    <h2 className="text-4xl font-manrope font-extrabold text-on-surface tracking-tight">Settings</h2>
                    <p className="text-on-surface-variant mt-1 text-sm">Manage your AI Twin behaviour, integrations &amp; account.</p>
                </div>
                <button
                    onClick={handleSave}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? 'bg-green-500/20 text-green-500' : 'bg-primary text-white hover:brightness-110'}`}
                >
                    {saved ? <><Check size={16} /> Saved!</> : 'Save Changes'}
                </button>
            </div>

            {/* Profile */}
            <Section icon={User} title="Account">
                <Row label="Display Name" description="Used in greetings and AI responses">
                    <span className="text-on-surface font-semibold text-sm bg-surface-container-high px-4 py-1.5 rounded-lg">{user.name || 'Not set'}</span>
                </Row>
                <Row label="Email" description="Your primary login email">
                    <span className="text-on-surface-variant text-sm">{user.email || '—'}</span>
                </Row>
                <Row label="Role" description="Determines AI Twin tone and prioritisation">
                    <span className="text-primary font-bold text-xs uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full">{user.role || 'Executive'}</span>
                </Row>
                <Row label="Time Zone" description="Affects calendar scheduling defaults">
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant"><Clock size={14} /> Asia/Kolkata (IST)</span>
                </Row>
            </Section>

            {/* Theme */}
            <Section icon={Palette} title="Appearance">
                <Row label="Theme Preference" description="Controls interface colour scheme">
                    <div className="flex gap-2">
                        {themeOptions.map(({ key, icon: Icon, label }) => (
                            <button
                                key={key}
                                onClick={() => setTheme(key)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold capitalize transition-all ${theme === key
                                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                    : 'bg-surface-container-high text-on-surface hover:bg-outline-variant/40'
                                    }`}
                            >
                                <Icon size={13} />
                                {label}
                            </button>
                        ))}
                    </div>
                </Row>
            </Section>            {/* AI Behaviour */}
            <Section icon={Brain} title="AI Behaviour">
                <Row label="Autonomous Mode" description="Allow Twin to execute emails/events without your approval">
                    <Toggle value={autonomous} onChange={setAutonomous} />
                </Row>
                <Row label="Proactive Notifications" description="Receive AI-generated reminders and briefings">
                    <Toggle value={preferences.notifications ?? false} onChange={() => togglePreference('notifications')} />
                </Row>
                <Row label="Memory Retention" description="Store conversation context across sessions">
                    <Toggle value={preferences.memoryRetention ?? true} onChange={() => togglePreference('memoryRetention')} />
                </Row>
                <Row label="Response Language" description="Language used for all AI responses">
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant"><Globe size={14} /> English (US)</span>
                </Row>
            </Section>

            {/* Integrations */}
            <Section icon={Plug} title="Integrations">
                <Row label="Gmail Sync" description="Live inbox monitoring &amp; drafting">
                    <div className="flex items-center gap-3">
                        <span className={`${gmailConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {gmailConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        <Toggle value={preferences.gmailSync} onChange={() => togglePreference('gmailSync')} />
                    </div>
                </Row>
                <Row label="Google Calendar" description="Event creation &amp; invite management">
                    <div className="flex items-center gap-3">
                        <span className={`${gmailConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {gmailConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        <Toggle value={preferences.calendarSync} onChange={() => togglePreference('calendarSync')} />
                    </div>
                </Row>
                <Row label="Telegram" description="Real-time alerts and message automation">
                    <div className="flex items-center gap-3">
                        <span className="text-neutral text-xs font-bold bg-neutral/10 px-3 py-1 rounded-full border border-neutral/20">Phase 2</span>
                        <Toggle value={preferences.telegramSync} onChange={() => togglePreference('telegramSync')} />
                    </div>
                </Row>
            </Section>

            {/* Notifications */}
            <Section icon={Bell} title="Notification Preferences">
                <Row label="Email Summary" description="Daily digest of actions taken by the Twin">
                    <Toggle value={preferences.emailSummary ?? false} onChange={() => togglePreference('emailSummary')} />
                </Row>
                <Row label="Action Alerts" description="Notify when approvals are needed">
                    <Toggle value={preferences.actionAlerts ?? true} onChange={() => togglePreference('actionAlerts')} />
                </Row>
            </Section>

            {/* Danger Zone */}
            <Section icon={ShieldCheck} title="Account &amp; Security">
                <Row label="Privacy Policy" description="Review data handling practices">
                    <button className="flex items-center gap-1 text-primary text-sm font-semibold hover:underline">View <ChevronRight size={14} /></button>
                </Row>
                <Row label="Export My Data" description="Download everything the Twin knows about you">
                    <button className="text-xs font-bold px-4 py-2 border border-outline-variant/60 rounded-xl text-on-surface hover:bg-surface-container-high transition-colors">Export</button>
                </Row>
                <Row label="Reset Memory" description="Clear all stored AI context &amp; preferences">
                    <button
                        onClick={handleResetMemory}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 size={13} /> Reset
                    </button>
                </Row>
                <Row label="Sign Out" description="Log out of this device">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-5 py-2 bg-red-500/10 text-red-500 font-bold rounded-xl hover:bg-red-500/20 transition-colors text-sm"
                    >
                        <LogOut size={15} /> Sign Out
                    </button>
                </Row>
            </Section>
        </div>
    )
}

export default Settings
