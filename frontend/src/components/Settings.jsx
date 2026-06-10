import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    User, Palette, Plug, Brain, ShieldCheck, LogOut,
    Sun, Moon, Monitor, Bell, Zap, Mail, Calendar,
    Lock, Trash2, ChevronRight, Check, Globe, Clock, Loader2
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { auth, db } from '../firebase'
import { signOut, updateProfile } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'

const Section = ({ icon: Icon, title, children }) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="wi-card overflow-hidden"
    >
        <div className="flex items-center gap-3 pb-4 mb-0 border-b border-[#E8E4DE]">
            <Icon size={16} className="text-[#2D6A4F]" />
            <h3 className="font-fraunces font-500 text-base text-[#1A1814]">{title}</h3>
        </div>
        <div className="divide-y divide-[#E8E4DE]">{children}</div>
    </motion.div>
);

const Row = ({ label, description, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-5 py-4 hover:bg-[#F7F5F2] transition-colors">
        <div className="flex-1 min-w-0">
            <p className="font-dm font-medium text-sm text-[#1A1814]">{label}</p>
            {description && <p className="font-dm text-xs text-[#7A7065] mt-0.5">{description}</p>}
        </div>
        <div className="shrink-0 w-full sm:w-auto">{children}</div>
    </div>
);

const Toggle = ({ value, onChange }) => (
    <button
        onClick={() => onChange(!value)}
        className={`w-10 h-[22px] rounded-full relative p-[3px] transition-colors duration-150 ${value ? 'bg-[#2D6A4F]' : 'bg-[#F0F0EE]'}`}
    >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-all duration-150 ${value ? 'translate-x-[18px]' : 'translate-x-0'}`} />
    </button>
);

const Settings = () => {
    const { auth: storeAuth, theme, setTheme, preferences, setPreferences, setPreference, logout, whatsappReady, integrations } = useStore();
    const user = storeAuth.user || {};
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Integration connection status: read from cached store first, then verify on mount
    const [gmailConnected, setGmailConnected] = useState(() => !!integrations?.gmail);
    const [calendarConnected, setCalendarConnected] = useState(() => !!integrations?.calendar);
    const [whatsappConnected, setWhatsappConnected] = useState(() => whatsappReady === true || !!integrations?.whatsapp);
    const [slackConnected, setSlackConnected] = useState(() => !!integrations?.slack);
    const [teleConfig, setTeleConfig] = useState({ chat_id: '', enabled: false });
    // draftPreferences mirrors the store — this is the source of truth after hydration
    const [draftPreferences, setDraftPreferences] = useState(() => ({ ...preferences }));
    const [toast, setToast] = useState(null);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);

    const [editName, setEditName] = useState(user.name || '');
    const [editEmail, setEditEmail] = useState(user.email || '');
    const [editPhoto, setEditPhoto] = useState(user.photoURL || '');
    const [editRole, setEditRole] = useState(user.role || 'Executive');

    // Keep draftPreferences in sync if store updates externally
    useEffect(() => {
        setDraftPreferences(prev => ({ ...preferences, ...prev }));
    }, []);

    // Sync WhatsApp status from global store (driven by WebSocket push)
    useEffect(() => {
        if (whatsappReady !== null) setWhatsappConnected(whatsappReady);
    }, [whatsappReady]);

    const themeOptions = [
        { key: 'light', icon: Sun, label: 'Light' },
        { key: 'dark', icon: Moon, label: 'Dark' },
        { key: 'system', icon: Monitor, label: 'System' }
    ];

    // Fetch Telegram config and verify integration connections on mount.
    // We do NOT overwrite gmail/calendar/slack from API — we use the cached store
    // (populated by Workspace.jsx) to avoid a flash of stale state.
    useEffect(() => {
        if (!user.uid) return;
        let isMounted = true;

        // Only fetch telegram config (not persisted in store)
        apiFetch(`/settings/telegram`)
            .then(data => { if (isMounted) setTeleConfig(data); })
            .catch(err => console.error(err));

        // Verify WhatsApp live status (not cached via integration store)
        apiFetch(`/mcp/whatsapp/qr`)
            .then(data => { if (isMounted) setWhatsappConnected(!!data.ready); })
            .catch(() => { if (isMounted && whatsappReady === null) setWhatsappConnected(false); });

        const handleMessage = (event) => {
            if (event.data === 'google_oauth_success') {
                setToast({ msg: 'Google connected successfully!', type: 'success' });
                setTimeout(() => setToast(null), 4000);
                // Force a fresh fetch next time Workspace is visited
                useStore.getState().invalidateIntegrationCache();
                setGmailConnected(true);
                setCalendarConnected(true);
            }
        };
        window.addEventListener('message', handleMessage);

        return () => {
            isMounted = false;
            window.removeEventListener('message', handleMessage);
        };
    }, [user.uid]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleGoogleConnect = async () => {
        try {
            const frontendUrl = window.location.origin;
            const data = await apiFetch(`/oauth/google/start?scopes=gmail,calendar&frontend_url=${encodeURIComponent(frontendUrl)}`);
            if (data.auth_url) window.open(data.auth_url, '_blank', 'width=500,height=700');
        } catch (err) {
            showToast('Failed to start Google OAuth. Are you logged in?', 'error');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);

        // Merge autonomousMode into draftPreferences for unified save
        const prefsToSave = { ...draftPreferences };

        try {
            await apiFetch(`/settings/telegram`, {
                method: 'POST',
                body: JSON.stringify(teleConfig)
            });

            // Update store (persisted to localStorage) immediately
            setPreferences(prefsToSave);

            // Sync to backend in background
            apiFetch(`/settings/preferences`, {
                method: 'PUT',
                body: JSON.stringify(prefsToSave)
            }).catch(err => console.warn('Preference backend sync failed:', err));

            useStore.getState().updateUser({
                name: editName,
                email: editEmail,
                photoURL: editPhoto,
                role: editRole
            });

            if (auth.currentUser) {
                updateProfile(auth.currentUser, {
                    displayName: editName,
                    photoURL: editPhoto
                }).catch(console.error);

                const userRef = doc(db, 'users', auth.currentUser.uid);
                setDoc(userRef, {
                    name: editName,
                    email: editEmail,
                    photoURL: editPhoto,
                    role: editRole,
                }, { merge: true }).catch(console.error);
            }
        } catch (e) {
            console.error("Failed to save settings", e);
            showToast('Failed to save settings.', 'error');
        } finally {
            setIsSaving(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    const handleExportData = () => {
        try {
            const exportData = {
                exportedAt: new Date().toISOString(),
                user: {
                    uid: user.uid,
                    name: editName,
                    email: editEmail,
                    role: editRole,
                    timezone: 'Asia/Kolkata (IST)'
                },
                preferences: draftPreferences,
                themePreference: theme,
                telegramConfig: teleConfig,
                about: "This file contains the complete local preferences and profile details stored for your AI Twin."
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `aitwin_profile_export_${user.uid || 'guest'}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showToast('Profile data exported successfully.');
        } catch (err) {
            console.error("Export data failed", err);
            showToast('Failed to export data.', 'error');
        }
    };

    const handleResetMemory = async () => {
        if (!resetConfirm) {
            setResetConfirm(true);
            setTimeout(() => setResetConfirm(false), 5000);
            return;
        }
        setResetConfirm(false);
        try {
            await apiFetch(`/memory/reset?user_id=${user.uid}`, { method: 'DELETE' });
            showToast('Memory cleared successfully.');
        } catch (e) {
            showToast('Failed to reset memory.', 'error');
        }
    };

    const handleSignOut = async () => {
        await signOut(auth);
        logout();
    };

    return (
        <div className="p-4 sm:p-6 lg:p-10 max-w-3xl mx-auto space-y-5 relative pb-32">
            {toast && (
                <div className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] text-sm font-dm font-medium flex items-center gap-2 ${toast.type === 'error'
                    ? 'bg-[#FFF0EE] text-[#C0392B] border border-[#C0392B]/20'
                    : 'bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20'
                    }`}>
                    {toast.type === 'error' ? '✕' : '✓'} {toast.msg}
                </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
                <div>
                    <p className="wi-label mb-2">Configuration</p>
                    <h2 className="font-fraunces font-semibold text-3xl text-[#1A1814]">Settings</h2>
                    <p className="font-dm text-sm text-[#7A7065] mt-1">Manage your AI Twin behaviour, integrations &amp; account.</p>
                </div>
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-dm font-medium text-sm transition-all w-full sm:w-fit ${saved ? 'bg-[#E6F4EC] text-[#2D6A4F]' : 'bg-[#2D6A4F] text-white hover:brightness-105'
                        } ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                >
                    {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? <><Check size={14} /> Saved</> : 'Save Changes'}
                </motion.button>
            </div>

            <Section icon={User} title="Account">
                <Row label="Display Name" description="Used in greetings and AI responses">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="wi-input sm:w-48 text-right"
                    />
                </Row>
                <Row label="Email" description="Your primary login email">
                    <input type="text" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                        className="wi-input sm:w-64 text-right"
                    />
                </Row>
                <Row label="Role" description="Determines AI Twin tone and prioritisation">
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                        className="font-dm font-medium text-xs text-[#2D6A4F] bg-[#E8F5EE] px-3 py-1.5 rounded-full border border-[#2D6A4F]/20 outline-none cursor-pointer appearance-none"
                    >
                        <option value="Product Manager">Product Manager</option>
                        <option value="Engineering Lead">Engineering Lead</option>
                        <option value="Founder / CEO">Founder / CEO</option>
                        <option value="Executive">Executive</option>
                    </select>
                </Row>
                <Row label="Time Zone" description="Affects calendar scheduling defaults">
                    <span className="font-mono-ji text-xs text-[#7A7065]">Asia/Kolkata (IST)</span>
                </Row>
            </Section>

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
            </Section>

            <Section icon={Brain} title="AI Behaviour">
                <Row label="Autonomous Mode" description="Allow Twin to execute emails/events without your approval">
                    <Toggle value={draftPreferences.autonomousMode ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, autonomousMode: val }))} />
                </Row>
                <Row label="Proactive Notifications" description="Receive AI-generated reminders and briefings">
                    <Toggle value={draftPreferences.notifications ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, notifications: val }))} />
                </Row>
                <Row label="Memory Retention" description="Store conversation context across sessions">
                    <Toggle value={draftPreferences.memoryRetention ?? true} onChange={(val) => setDraftPreferences(p => ({ ...p, memoryRetention: val }))} />
                </Row>
                <Row label="Response Language" description="Language used for all AI responses">
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant"><Globe size={14} /> English (US)</span>
                </Row>
            </Section>

            <Section icon={Plug} title="Integrations">
                <Row label="Gmail Integration" description="Live inbox monitoring, drafting & email triage">
                    <div className="flex items-center gap-3">
                        <span className={`${gmailConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {gmailConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {gmailConnected ? (
                            <Toggle value={draftPreferences.gmailSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, gmailSync: val }))} />
                        ) : (
                            <button
                                onClick={handleGoogleConnect}
                                className="text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all"
                            >
                                Connect
                            </button>
                        )}
                    </div>
                </Row>
                <Row label="Calendar Integration" description="Autonomous scheduling, time negotiation & event management">
                    <div className="flex items-center gap-3">
                        <span className={`${calendarConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {calendarConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {calendarConnected ? (
                            <Toggle value={draftPreferences.calendarSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, calendarSync: val }))} />
                        ) : (
                            <button
                                onClick={handleGoogleConnect}
                                className="text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all"
                            >
                                Connect
                            </button>
                        )}
                    </div>
                </Row>
                <Row label="Slack Integration" description="Team workspace messaging & channel updates">
                    <div className="flex items-center gap-3">
                        <span className={`${slackConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {slackConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {slackConnected && (
                            <Toggle value={draftPreferences.slackSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, slackSync: val }))} />
                        )}
                    </div>
                </Row>
                <Row label="WhatsApp Integration" description="Secure bridge status and message automation">
                    <div className="flex items-center gap-3">
                        <span className={`${whatsappConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {whatsappConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {whatsappConnected && (
                            <Toggle value={draftPreferences.whatsappSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, whatsappSync: val }))} />
                        )}
                    </div>
                </Row>
                <Row label="Telegram" description="Real-time alerts and command center execution">
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                placeholder="Chat ID"
                                value={teleConfig.chat_id || ''}
                                onChange={(e) => setTeleConfig(prev => ({ ...prev, chat_id: e.target.value }))}
                                className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-1 text-xs text-on-surface focus:outline-none focus:border-primary w-32"
                            />
                            <Toggle value={teleConfig.enabled} onChange={(val) => setTeleConfig(prev => ({ ...prev, enabled: val }))} />
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-on-surface-variant opacity-80 decoration-primary/40 underline-offset-2">
                                1. Open <a href="https://t.me/aitwin_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline">@aitwin_assistant_bot</a>
                            </p>
                            <p className="text-[10px] text-on-surface-variant opacity-80">
                                2. Send <b>/start</b> to get your ID
                            </p>
                        </div>
                    </div>
                </Row>
            </Section>

            <Section icon={Bell} title="Notification Preferences">
                <Row label="Email Summary" description="Daily digest of actions taken by the Twin">
                    <Toggle value={draftPreferences.emailSummary ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, emailSummary: val }))} />
                </Row>
                <Row label="Action Alerts" description="Notify when approvals are needed">
                    <Toggle value={draftPreferences.actionAlerts ?? true} onChange={(val) => setDraftPreferences(p => ({ ...p, actionAlerts: val }))} />
                </Row>
            </Section>

            <Section icon={ShieldCheck} title="Account &amp; Security">
                <Row label="Privacy Policy" description="Review data handling practices">
                    <button onClick={() => setShowPrivacyModal(true)} className="font-dm text-sm text-[#2D6A4F] hover:underline">View &rsaquo;</button>
                </Row>
                <Row label="Export My Data" description="Download everything the Twin knows about you">
                    <button onClick={handleExportData} className="btn-secondary text-xs py-1.5 px-4">Export</button>
                </Row>
                <Row label="Reset Memory" description="Clear all stored AI context &amp; preferences">
                    <button
                        onClick={handleResetMemory}
                        className={`font-dm text-sm font-medium transition-colors ${resetConfirm ? 'text-[#C0392B] underline' : 'text-[#C0392B] hover:underline'
                            }`}
                    >
                        {resetConfirm ? 'Click again to confirm' : 'Reset Memory'}
                    </button>
                </Row>
                <Row label="Sign Out" description="Log out of this device">
                    <button onClick={handleSignOut} className="font-dm text-sm text-[#C0392B] hover:underline flex items-center gap-1.5">
                        <LogOut size={14} /> Sign Out
                    </button>
                </Row>
            </Section>

            <AnimatePresence>
                {showPrivacyModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowPrivacyModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: 'spring', duration: 0.4 }}
                            className="bg-surface border border-surface-border rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-8 relative z-10 shadow-2xl flex flex-col gap-6 text-[var(--text-primary)]"
                        >
                            <div className="flex items-center gap-3 pb-4 border-b border-surface-border">
                                <ShieldCheck size={24} className="text-[#2D6A4F]" />
                                <h3 className="font-fraunces font-semibold text-xl">Privacy Sovereignty Protocol</h3>
                            </div>
                            <div className="space-y-5 text-sm leading-relaxed text-[var(--text-secondary)] font-dm">
                                <p>
                                    Your AI Twin operates under a strict Zero-Trust Privacy Pact. All workspace operations are isolated to your local domain.
                                </p>
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-[#2D6A4F] shrink-0 font-bold text-sm">1</div>
                                        <div>
                                            <h4 className="font-bold text-[var(--text-primary)]">Neural Isolation</h4>
                                            <p className="text-xs mt-0.5">All executive behavior patterns and memories are stored on secure private databases siloed strictly to your user profile.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-[#2D6A4F] shrink-0 font-bold text-sm">2</div>
                                        <div>
                                            <h4 className="font-bold text-[var(--text-primary)]">Zero Public Training</h4>
                                            <p className="text-xs mt-0.5">Your email replies, calendar updates, and decisions are never used to train public models or shared with third parties.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-[#2D6A4F] shrink-0 font-bold text-sm">3</div>
                                        <div>
                                            <h4 className="font-bold text-[var(--text-primary)]">Anonymized Processing</h4>
                                            <p className="text-xs mt-0.5">Data accessed through connected APIs (Gmail/Calendar) is sanitized locally to protect sensitive user details before model inference.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-[#2D6A4F] shrink-0 font-bold text-sm">4</div>
                                        <div>
                                            <h4 className="font-bold text-[var(--text-primary)]">Sovereign Control</h4>
                                            <p className="text-xs mt-0.5">You can delete all vector context and purge tool integrations instantly from the database using the "Reset Memory" tool.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-surface-border flex justify-end">
                                <button
                                    onClick={() => setShowPrivacyModal(false)}
                                    className="btn-primary w-full justify-center rounded-xl py-2.5 font-bold"
                                >
                                    Acknowledge & Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Settings;
