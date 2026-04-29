import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion } from 'framer-motion'
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
);

const Row = ({ label, description, children }) => (
    <div className="flex items-center justify-between gap-4 px-7 py-5 hover:bg-surface-container-high/30 transition-colors">
        <div>
            <p className="font-semibold text-sm text-on-surface">{label}</p>
            {description && <p className="text-xs text-on-surface-variant mt-0.5 opacity-80">{description}</p>}
        </div>
        {children}
    </div>
);

const Toggle = ({ value, onChange }) => (
    <button
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full relative p-1 transition-colors duration-200 ${value ? 'bg-primary' : 'bg-outline'}`}
    >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
);

const Settings = () => {
    const { auth: storeAuth, theme, setTheme, preferences, setPreferences, logout } = useStore();
    const user = storeAuth.user || {};
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [gmailConnected, setGmailConnected] = useState(false);
    const [autonomous, setAutonomous] = useState(() => {
        const val = localStorage.getItem(`autonomous_mode_${user.uid}`);
        return val === 'true';
    });
    const [teleConfig, setTeleConfig] = useState({ chat_id: '', enabled: false });
    const [slackConnected, setSlackConnected] = useState(false);
    const [draftPreferences, setDraftPreferences] = useState(preferences);
    const [toast, setToast] = useState(null);
    const [resetConfirm, setResetConfirm] = useState(false);
    
    const [editName, setEditName] = useState(user.name || '');
    const [editEmail, setEditEmail] = useState(user.email || '');
    const [editPhoto, setEditPhoto] = useState(user.photoURL || '');
    const [editRole, setEditRole] = useState(user.role || 'Executive');

    const themeOptions = [
        { key: 'light', icon: Sun, label: 'Light' },
        { key: 'dark', icon: Moon, label: 'Dark' },
        { key: 'system', icon: Monitor, label: 'System' }
    ];

    // Depend on uid (stable string) not user object to prevent double-fetch on updateUser
    useEffect(() => {
        if (!user.uid) return;
        let isMounted = true;

        apiFetch(`/auth/gmail/status`)
            .then(data => { if (isMounted) setGmailConnected(data.connected); })
            .catch(() => { if (isMounted) setGmailConnected(false); });

        apiFetch(`/settings/telegram`)
            .then(data => { if (isMounted) setTeleConfig(data); })
            .catch(err => console.error(err));
        
        apiFetch(`/integrations/slack/status`)
            .then(data => { if (isMounted) setSlackConnected(data.connected); })
            .catch(() => { if (isMounted) setSlackConnected(false); });

        return () => { isMounted = false; };
    }, [user.uid]); // uid is a stable string — only re-runs if the user actually changes

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
        localStorage.setItem(`autonomous_mode_${user.uid}`, autonomous);
        
        try {
            await apiFetch(`/settings/telegram`, {
                method: 'POST',
                body: JSON.stringify(teleConfig)
            });

            setPreferences(draftPreferences);

            await apiFetch(`/settings/preferences`, {
                method: 'PUT',
                body: JSON.stringify(draftPreferences)
            });

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
        <div className="p-10 max-w-3xl mx-auto space-y-8 relative">
            {toast && (
                <div className={`fixed top-6 right-6 z-[200] px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-3 transition-all ${
                    toast.type === 'error'
                        ? 'bg-red-500/90 text-white border border-red-400/30'
                        : 'bg-primary/90 text-white border border-primary/30'
                }`}>
                    {toast.type === 'error' ? '\u274c' : '\u2705'} {toast.msg}
                </div>
            )}
            <div className="flex items-end justify-between mb-2">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Configuration</p>
                    <h2 className="text-4xl font-manrope font-extrabold text-on-surface tracking-tight">Settings</h2>
                    <p className="text-on-surface-variant mt-1 text-sm">Manage your AI Twin behaviour, integrations & account.</p>
                </div>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 ${saved ? 'bg-green-500/20 text-green-500 shadow-none' : 'bg-primary text-white hover:brightness-110'} ${isSaving ? 'opacity-80 cursor-wait' : ''}`}
                >
                    {isSaving ? (
                        <><Loader2 size={16} className="animate-spin" /> Saving...</>
                    ) : saved ? (
                        <><Check size={16} /> Saved!</>
                    ) : (
                        'Save Changes'
                    )}
                </motion.button>
            </div>

            <Section icon={User} title="Account">
                <Row label="Display Name" description="Used in greetings and AI responses">
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-on-surface font-semibold text-sm bg-surface-container-high px-4 py-1.5 rounded-lg border border-outline-variant/30 focus:border-primary focus:outline-none w-48 text-right"
                    />
                </Row>
                <Row label="Profile Image" description="Publicly visible in Agent Network">
                    <div className="flex items-center gap-3">
                        {editPhoto && (
                            <img src={editPhoto} className="w-8 h-8 rounded-full border border-primary/20" alt="Preview" />
                        )}
                        <input
                            type="text"
                            value={editPhoto}
                            onChange={(e) => setEditPhoto(e.target.value)}
                            placeholder="https://..."
                            className="text-on-surface font-semibold text-xs bg-surface-container-high px-4 py-1.5 rounded-lg border border-outline-variant/30 focus:border-primary focus:outline-none w-64 text-right"
                        />
                    </div>
                </Row>
                <Row label="Email" description="Your primary login email">
                    <input
                        type="text"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="text-on-surface font-semibold text-sm bg-surface-container-high px-4 py-1.5 rounded-lg border border-outline-variant/30 focus:border-primary focus:outline-none w-72 text-right"
                    />
                </Row>
                <Row label="Role" description="Determines AI Twin tone and prioritisation">
                    <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="text-primary font-bold text-xs uppercase tracking-wider bg-primary/10 px-3 py-1.5 rounded-full outline-none focus:ring-1 focus:ring-primary/50 text-right appearance-none cursor-pointer"
                    >
                        <option value="Product Manager">Product Manager</option>
                        <option value="Engineering Lead">Engineering Lead</option>
                        <option value="Founder / CEO">Founder / CEO</option>
                        <option value="Executive">Executive</option>
                    </select>
                </Row>
                <Row label="Time Zone" description="Affects calendar scheduling defaults">
                    <span className="flex items-center gap-1.5 text-sm text-on-surface-variant"><Clock size={14} /> Asia/Kolkata (IST)</span>
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
                    <Toggle value={autonomous} onChange={setAutonomous} />
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
                <Row label="Gmail & Calendar" description="Live inbox monitoring, drafting & event management">
                    <div className="flex items-center gap-3">
                        <span className={`${gmailConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {gmailConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {!gmailConnected && (
                            <button
                                onClick={handleGoogleConnect}
                                className="text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all"
                            >
                                Connect
                            </button>
                        )}
                        {gmailConnected && (
                            <div className="flex items-center gap-2">
                                <Toggle value={draftPreferences.gmailSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, gmailSync: val }))} />
                                <Toggle value={draftPreferences.calendarSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, calendarSync: val }))} />
                            </div>
                        )}
                    </div>
                </Row>
                <Row label="Slack Integration" description="Team messaging & channel updates">
                    <div className="flex items-center gap-3">
                        <span className={`${slackConnected ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-neutral bg-neutral/10 border-neutral/20'} text-xs font-bold px-3 py-1 rounded-full border`}>
                            {slackConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        <Toggle value={draftPreferences.slackSync ?? false} onChange={(val) => setDraftPreferences(p => ({ ...p, slackSync: val }))} />
                    </div>
                </Row>
                <Row label="Telegram" description="Real-time alerts and message automation">
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

            <Section icon={ShieldCheck} title="Account & Security">
                <Row label="Privacy Policy" description="Review data handling practices">
                    <button className="flex items-center gap-1 text-primary text-sm font-semibold hover:underline">View <ChevronRight size={14} /></button>
                </Row>
                <Row label="Export My Data" description="Download everything the Twin knows about you">
                    <button className="text-xs font-bold px-4 py-2 border border-outline-variant/60 rounded-xl text-on-surface hover:bg-surface-container-high transition-colors">Export</button>
                </Row>
                <Row label="Reset Memory" description="Clear all stored AI context & preferences">
                    <button
                        onClick={handleResetMemory}
                        className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 border rounded-xl transition-all ${
                            resetConfirm
                                ? 'bg-red-500 text-white border-red-500 animate-pulse'
                                : 'border-red-500/30 text-red-500 hover:bg-red-500/10'
                        }`}
                    >
                        <Trash2 size={13} /> {resetConfirm ? 'Click again to confirm' : 'Reset'}
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
    );
};

export default Settings;
