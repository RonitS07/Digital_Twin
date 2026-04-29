import React from 'react'
import { API_BASE } from '../config'
import { motion } from 'framer-motion'
import {
    Sparkles,
    Clock,
    Zap,
    ShieldCheck,
    Fingerprint,
    Mail,
    Calendar,
    CheckCircle,
    LayoutGrid,
    Settings,
    Brain,
    Terminal,
    Lock,
    MessageSquare,
    Shield
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { db, auth } from '../firebase'
import { doc, updateDoc } from 'firebase/firestore'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

// Shared progress bar
const StepProgress = ({ step, total }) => (
    <div className="mb-10 flex flex-col items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-neutral font-bold">Step {step} of {total}</span>
        <div className="flex gap-1.5 mt-1">
            {[...Array(total)].map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < step ? 'w-8 bg-primary' : 'w-4 bg-surface-container-highest'}`} />
            ))}
        </div>
    </div>
)

// --- Step 1: Welcome ---
export const Welcome = ({ onNext }) => (
    <div className="min-h-screen overflow-y-auto flex flex-col items-center justify-center p-8 bg-surface-base">
        <StepProgress step={1} total={7} />

        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
                        <Sparkles size={28} className="text-primary" />
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                </div>

                <div>
                    <h1 className="font-manrope text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-[1.15]">
                        Welcome to{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">AI Twin</span>
                    </h1>
                    <p className="font-inter text-base text-on-surface-variant leading-relaxed mt-3 max-w-sm">
                        Let's configure your intelligent workspace assistant. Your digital counterpart augments productivity while maintaining absolute privacy.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                    {[
                        { icon: Clock, label: 'Save time', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                        { icon: Zap, label: 'Automate tasks', color: 'text-amber-500', bg: 'bg-amber-500/10' },
                        { icon: Settings, label: 'Stay in control', color: 'text-primary', bg: 'bg-primary/10' },
                        { icon: ShieldCheck, label: 'Secure memory', color: 'text-green-500', bg: 'bg-green-500/10' }
                    ].map((b, i) => (
                        <div key={i} className="p-4 rounded-xl bg-surface-container border border-outline-variant flex items-center gap-3 shadow-sm">
                            <div className={`w-8 h-8 rounded-lg ${b.bg} flex items-center justify-center flex-shrink-0`}>
                                <b.icon size={16} className={b.color} />
                            </div>
                            <span className="font-semibold text-sm text-on-surface">{b.label}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-4">
                    <button
                        onClick={onNext}
                        className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-full font-bold text-base hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-primary/25"
                    >
                        Get Started
                        <Zap size={16} fill="currentColor" />
                    </button>
                </div>
            </div>

            <div className="relative hidden md:flex items-center justify-center">
                <div className="w-72 h-72 rounded-3xl bg-surface-container border border-outline-variant shadow-xl flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5" />
                    <div className="relative w-32 h-32 rounded-full border-2 border-primary/20 flex items-center justify-center animate-pulse">
                        <div className="w-24 h-24 rounded-full border-2 border-primary/40 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-[0_0_30px_rgba(79,70,229,0.4)]">
                                <Fingerprint size={28} className="text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
)

// --- Step 2: Choose Role ---
export const ChooseRole = ({ onNext }) => {
    const { updateUser } = useStore();
    return (
        <div className="min-h-screen overflow-y-auto flex flex-col items-center justify-center p-8 bg-surface-base">
            <StepProgress step={2} total={7} />
            <div className="text-center mb-10">
                <h2 className="text-3xl font-manrope font-extrabold text-on-surface mb-2">Define your executive role</h2>
                <p className="text-on-surface-variant max-w-md mx-auto text-sm">This helps your Twin customize communication style and prioritization logic.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full">
                {[
                    { title: 'Product Manager', desc: 'Prioritizes roadmaps, user feedback, and cross-team alignment.', icon: LayoutGrid },
                    { title: 'Engineering Lead', desc: 'Focuses on technical debt, PR reviews, and sprint velocity.', icon: Terminal },
                    { title: 'Founder / CEO', desc: 'Monitors high-level strategy, investor relations, and hiring.', icon: Brain }
                ].map((role, i) => (
                    <motion.div
                        key={i}
                        whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(79,70,229,0.12)' }}
                        onClick={() => { updateUser({ role: role.title }); onNext(); }}
                        className="p-7 rounded-2xl bg-surface-container border border-outline-variant hover:border-primary/50 transition-all text-left group cursor-pointer shadow-sm"
                    >
                        <div className="w-12 h-12 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-5 group-hover:bg-primary group-hover:border-primary transition-all">
                            <role.icon size={22} className="text-primary group-hover:text-white transition-colors" />
                        </div>
                        <h3 className="text-base font-bold text-on-surface mb-1.5">{role.title}</h3>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{role.desc}</p>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

// --- Step 3: Connect Tools ---
export const ConnectTools = ({ onNext }) => {
    const { auth: storeAuth, preferences, togglePreference, setPreference } = useStore();
    const [connecting, setConnecting] = React.useState(false);

    React.useEffect(() => {
        // If we just returned from backend OAuth callback, refresh connection status.
        const params = new URLSearchParams(window.location.search)
        if (params.get('google') !== 'connected') return

        const accessToken = storeAuth.user?.accessToken
        if (!accessToken) return

        fetch(`${API_BASE}/integrations/google/status`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then(r => r.json())
            .then((data) => {
                if (data?.connected) {
                    // One Google connection enables both Gmail + Calendar scopes in our backend flow.
                    setPreference('gmailSync', true)
                    setPreference('calendarSync', true)
                }
            })
            .catch(() => {})
    }, [storeAuth.user?.accessToken, setPreference])

    const handleConnect = async (tool) => {
        if (tool.active) { togglePreference(tool.key); return; }
        if (tool.name === 'Telegram') { window.open('https://telegram.org/', '_blank'); togglePreference(tool.key); return; }

        setConnecting(true);
        try {
            const accessToken = storeAuth.user?.accessToken
            if (!accessToken) throw new Error('Missing backend access token')

            const scopes = tool.name === 'Gmail' ? 'gmail' : tool.name === 'Calendar' ? 'calendar' : 'gmail,calendar'
            const res = await fetch(`${API_BASE}/oauth/google/start?scopes=${encodeURIComponent(scopes)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
            const data = await res.json()
            if (!data?.auth_url) throw new Error('No auth_url received')
            window.location.href = data.auth_url
        } catch (e) {
            console.error('Popup suppressed or closed', e);
        } finally {
            setConnecting(false);
        }
    }

    return (
        <div className="min-h-screen overflow-y-auto flex flex-col items-center justify-center p-8 bg-surface-base">
            <StepProgress step={3} total={7} />
            <div className="text-center mb-10">
                <h2 className="text-3xl font-manrope font-extrabold text-on-surface mb-2">Sync your workspace</h2>
                <p className="text-on-surface-variant text-sm">The Twin learns faster when connected to your daily tools.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl w-full">
                {[
                    { name: 'Gmail', icon: Mail, key: 'gmailSync', active: preferences.gmailSync },
                    { name: 'Calendar', icon: Calendar, key: 'calendarSync', active: preferences.calendarSync },
                    { name: 'Telegram', icon: MessageSquare, key: 'telegramSync', active: preferences.telegramSync }
                ].map((tool, i) => (
                    <div
                        key={i}
                        onClick={() => !connecting && handleConnect(tool)}
                        className={`p-7 cursor-pointer rounded-2xl border flex flex-col gap-4 items-center transition-all shadow-sm
                            ${tool.active
                                ? 'bg-primary/5 border-primary/30 shadow-primary/10'
                                : 'bg-surface-container border-outline-variant hover:border-primary/30 opacity-70 hover:opacity-100'
                            } ${connecting ? 'pointer-events-none' : ''}`}
                    >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tool.active ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-surface-container text-neutral'}`}>
                            <tool.icon size={26} />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-on-surface text-sm">{tool.name}</p>
                            <p className={`text-[11px] uppercase font-bold tracking-widest mt-1 ${tool.active ? 'text-primary' : 'text-neutral'}`}>
                                {tool.active ? '✓ Connected' : 'Connect'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={onNext}
                className="mt-10 bg-primary text-white px-10 py-3.5 rounded-full font-bold hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-primary/25"
            >
                Continue
            </button>
            <button onClick={onNext} className="mt-3 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                Skip for now
            </button>
        </div>
    )
}

// --- Step 4: Control Preferences ---
export const ControlPreferences = ({ onNext }) => (
    <div className="min-h-screen overflow-y-auto flex flex-col items-center justify-center p-8 bg-surface-base">
        <StepProgress step={4} total={7} />
        <div className="text-center mb-10">
            <h2 className="text-3xl font-manrope font-extrabold text-on-surface mb-2">Automation Guardrails</h2>
            <p className="text-on-surface-variant text-sm max-w-md mx-auto">Set the boundaries for your twin's autonomous actions.</p>
        </div>

        <div className="max-w-xl w-full space-y-3">
            {[
                { title: 'Drafting Emails', desc: 'Allow Twin to draft replies for your review.', icon: Mail, active: true },
                { title: 'Calendar Optimization', desc: 'Automatically resolve simple scheduling conflicts.', icon: Calendar, active: true },
                { title: 'Slack Summaries', desc: 'Synthesize overnight channel activity.', icon: MessageSquare, active: false }
            ].map((pref, i) => (
                <div key={i} className="p-5 rounded-2xl bg-surface-container border border-outline-variant flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pref.active ? 'bg-primary/10' : 'bg-surface-container'}`}>
                            <pref.icon size={18} className={pref.active ? 'text-primary' : 'text-neutral'} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm text-on-surface">{pref.title}</h4>
                            <p className="text-xs text-on-surface-variant mt-0.5">{pref.desc}</p>
                        </div>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative flex-shrink-0 ${pref.active ? 'bg-primary' : 'bg-surface-container-high'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${pref.active ? 'right-1' : 'left-1'}`} />
                    </div>
                </div>
            ))}
        </div>

        <button
            onClick={onNext}
            className="mt-10 bg-primary text-white px-12 py-3.5 rounded-full font-bold hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-primary/25"
        >
            Confirm Preferences
        </button>
    </div>
)

// --- Step 5: Privacy & Permissions ---
export const PrivacyPermissions = ({ onNext }) => (
    <div className="min-h-screen overflow-y-auto flex flex-col items-center justify-center p-8 bg-surface-base">
        <StepProgress step={5} total={7} />
        <div className="text-center mb-10">
            <h2 className="text-3xl font-manrope font-extrabold text-on-surface mb-2">Privacy Lock</h2>
            <p className="text-on-surface-variant text-sm">Your data is yours. Period.</p>
        </div>

        <div className="max-w-md w-full bg-surface-container p-8 rounded-2xl border border-outline-variant shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Lock size={120} />
            </div>
            <div className="space-y-6 relative z-10">
                <div className="flex gap-4 p-4 bg-primary/5 rounded-xl border border-primary/15">
                    <Shield className="text-primary flex-shrink-0 mt-0.5" size={20} />
                    <p className="text-sm leading-relaxed text-on-surface">
                        We use differential privacy to ensure your Twin learns patterns, not raw text. No data is ever sold or used to train public models.
                    </p>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl">
                        <span className="text-sm font-semibold text-on-surface">Biometric Unlock</span>
                        <div className="w-10 h-5 bg-primary rounded-full relative flex-shrink-0">
                            <div className="w-3.5 h-3.5 bg-white rounded-full absolute right-0.5 top-0.5 shadow" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl">
                        <span className="text-sm font-semibold text-on-surface">Encrypted Storage</span>
                        <span className="text-xs font-bold text-green-500 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">Active</span>
                    </div>
                </div>
            </div>
        </div>

        <button
            onClick={onNext}
            className="mt-10 bg-primary text-white px-12 py-3.5 rounded-full font-bold hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-primary/25"
        >
            Accept & Proceed
        </button>
    </div>
)

// --- Step 6: Initializing ---
export const Initializing = ({ onComplete }) => {
    React.useEffect(() => {
        const timer = setTimeout(onComplete, 3000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-surface-base relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative w-48 h-48 mb-14 flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-2 border-primary/20"
                />
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-6 rounded-full border border-primary/10"
                />
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-[0_0_50px_rgba(79,70,229,0.3)] z-10">
                    <Brain size={34} className="text-white" fill="currentColor" />
                </div>
            </div>

            <div className="text-center">
                <h1 className="text-3xl font-manrope font-extrabold text-on-surface mb-5">Setting up your Twin...</h1>
                <div className="w-56 h-1.5 bg-surface-container-high rounded-full overflow-hidden mx-auto mb-3">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 3 }}
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                    />
                </div>
                <p className="text-xs font-inter uppercase tracking-[0.25em] text-neutral animate-pulse">Neural Link Active</p>
            </div>
        </div>
    )
}

// --- Step 7: Success ---
export const Success = ({ onFinish }) => {
    const { auth: storeAuth, updateUser } = useStore();

    const handleFinish = async () => {
        onFinish();
        try {
            updateUser({ onboardingCompleted: true });
            if (auth.currentUser) {
                const userRef = doc(db, 'users', auth.currentUser.uid);
                await updateDoc(userRef, {
                    onboardingCompleted: true,
                    role: storeAuth.user?.role || 'Executive'
                });
            }
        } catch (e) {
            console.error('Failed to commit final onboarding state:', e);
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-surface-base text-center">
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-24 h-24 rounded-full bg-green-100 border-4 border-green-200 flex items-center justify-center mb-8 shadow-lg shadow-green-100"
            >
                <CheckCircle size={44} className="text-green-600" fill="currentColor" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h1 className="text-4xl font-manrope font-extrabold text-on-surface mb-3">You're all set!</h1>
                <p className="text-on-surface-variant max-w-sm mx-auto mb-10 text-sm leading-relaxed">
                    Your AI Twin is configured and ready. It will handle your emails, meetings, and tasks — always with your approval.
                </p>
                <button
                    onClick={handleFinish}
                    className="bg-primary text-white px-12 py-3.5 rounded-full font-bold text-base hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-primary/25 uppercase tracking-wide"
                >
                    Enter Workspace
                </button>
            </motion.div>
        </div>
    )
}
