import React, { useState, useEffect } from 'react'
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
    Shield,
    ArrowRight
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { apiFetch } from '../utils/apiClient'
import { db, auth } from '../firebase'
import { doc, setDoc } from 'firebase/firestore'

// --- Shared Components ---

const OnboardingLayout = ({ step, title, subtitle, children, totalSteps = 8 }) => (
    <div className="min-h-screen bg-surface-base flex overflow-hidden">
        {/* Progress Sidebar (Desktop) */}
        <div className="hidden lg:flex w-80 bg-surface-container border-r border-outline-variant/30 flex-col p-10 justify-between">
            <div>
                <div className="flex items-center gap-3 mb-12">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center ai-glow shadow-primary/30">
                        <Sparkles size={22} className="text-white" fill="currentColor" />
                    </div>
                    <div>
                        <p className="font-manrope font-extrabold tracking-tighter text-on-surface leading-none">AI Twin</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral/70 mt-1">Identity Sync</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {[
                        'Executive Origin',
                        'Neural Context',
                        'Tool Connectivity',
                        'Aether Protocol',
                        'Operational Logic',
                        'Privacy Core',
                        'System Sync',
                        'Deployment'
                    ].map((label, i) => (
                        <div key={i} className="flex items-center gap-4 group">
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-black transition-all duration-500
                                ${step > i + 1 ? 'bg-primary border-primary text-white' :
                                    step === i + 1 ? 'border-primary text-primary shadow-[0_0_15px_rgba(103,96,253,0.3)]' :
                                        'border-outline-variant text-neutral opacity-40'}`}>
                                {step > i + 1 ? <CheckCircle size={14} /> : i + 1}
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-widest transition-all duration-300
                                ${step === i + 1 ? 'text-on-surface' : 'text-neutral opacity-50'}`}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10">
                <Shield size={18} className="text-primary mb-3" />
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    All authentication and preference data is siloed and encrypted at rest using AES-256 protocols.
                </p>
            </div>
        </div>

        {/* Global Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-y-auto relative custom-scrollbar">
            {/* Mobile Progress Header */}
            <div className="lg:hidden p-6 border-b border-outline-variant/30 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Protocol Step {step} of {totalSteps}</span>
                <div className="flex gap-1">
                    {[...Array(totalSteps)].map((_, i) => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < step ? 'w-4 bg-primary' : 'w-2 bg-neutral/20'}`} />
                    ))}
                </div>
            </div>

            <main className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 md:p-16 max-w-5xl mx-auto w-full">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                >
                    <div className="mb-12">
                        <h2 className="text-4xl sm:text-5xl font-manrope font-extrabold tracking-tighter text-on-surface mb-4 leading-none italic">{title}</h2>
                        <p className="text-lg text-on-surface-variant max-w-2xl leading-relaxed">{subtitle}</p>
                    </div>
                    {children}
                </motion.div>
            </main>
        </div>
    </div>
);

// --- Step 1: Welcome ---
export const Welcome = ({ onNext }) => (
    <OnboardingLayout
        step={1}
        title="Greetings, Executive."
        subtitle="Your AI Twin is an autonomous counterpart designed to reclaim your time. Let's initialize your neural workspace profile."
    >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {[
                { icon: Clock, label: 'Temporal Recovery', desc: 'Saves 12+ hours weekly on scheduling/email triage.', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                { icon: Brain, label: 'Cognitive Mirroring', desc: 'Learns your decision patterns to act in your voice.', color: 'text-primary', bg: 'bg-primary/10' },
                { icon: ShieldCheck, label: 'Privacy Sanctum', desc: 'Zero data leakage. Your Twin is strictly yours.', color: 'text-green-500', bg: 'bg-green-500/10' },
                { icon: Zap, label: 'Autonomous Flow', desc: 'Operates in the background while you focus on deep work.', color: 'text-amber-500', bg: 'bg-amber-500/10' }
            ].map((b, i) => (
                <div key={i} className="p-6 rounded-3xl bg-surface-container border border-outline-variant flex gap-5 group transition-all hover:bg-surface-container-high shadow-lg shadow-black/5">
                    <div className={`w-12 h-12 rounded-2xl ${b.bg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                        <b.icon size={20} className={b.color} />
                    </div>
                    <div>
                        <h4 className="font-bold text-on-surface mb-1">{b.label}</h4>
                        <p className="text-sm text-on-surface-variant leading-snug">{b.desc}</p>
                    </div>
                </div>
            ))}
        </div>

        <button
            onClick={onNext}
            className="group relative flex items-center gap-3 bg-primary text-white pl-10 pr-8 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all shadow-xl shadow-primary/30"
        >
            Begin Initialization
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <ArrowRight size={16} />
            </div>
        </button>
    </OnboardingLayout>
);

// --- Step 2: Choose Role ---
export const ChooseRole = ({ onNext }) => {
    const { updateUser } = useStore();
    return (
        <OnboardingLayout
            step={2}
            title="Define your context."
            subtitle="Your Twin's prioritization logic shifts based on your professional landscape. Select the foundation of your role."
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {[
                    { title: 'Product Leader', desc: 'Focuses on vision alignment, roadmap sync, and stakeholder triage.', icon: LayoutGrid, color: 'text-blue-400' },
                    { title: 'Engineering Head', desc: 'Optimizes technical workflows, PR velocity, and architectural debt.', icon: Terminal, color: 'text-emerald-400' },
                    { title: 'Executive / Founder', desc: 'High-level synthesis, strategic outreach, and hiring momentum.', icon: Brain, color: 'text-primary' }
                ].map((role, i) => (
                    <motion.div
                        key={i}
                        whileHover={{ y: -6 }}
                        onClick={() => { updateUser({ role: role.title }); onNext(); }}
                        className="p-8 rounded-[2rem] bg-surface-container border border-outline-variant hover:border-primary transition-all text-left group cursor-pointer shadow-xl shadow-black/5"
                    >
                        <div className={`w-14 h-14 rounded-2xl bg-surface-base border border-outline-variant flex items-center justify-center mb-6 group-hover:bg-primary group-hover:border-primary transition-all shadow-inner`}>
                            <role.icon size={26} className={`${role.color} group-hover:text-white transition-colors`} />
                        </div>
                        <h3 className="text-xl font-extrabold text-on-surface mb-2 tracking-tight italic">{role.title}</h3>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{role.desc}</p>
                        <div className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">Select Role →</div>
                    </motion.div>
                ))}
            </div>
        </OnboardingLayout>
    );
};

// --- Step 3: Connect Tools ---
export const ConnectTools = ({ onNext }) => {
    const { auth: storeAuth, preferences, togglePreference, setPreference } = useStore();
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('google') !== 'connected') return;
        const accessToken = storeAuth.user?.accessToken;
        if (!accessToken) return;
        apiFetch(`/integrations/google/status`)
            .then((data) => {
                if (data?.connected) {
                    setPreference('gmailSync', true);
                    setPreference('calendarSync', true);
                }
            })
            .catch(err => console.error(err));
    }, [storeAuth.user?.accessToken, setPreference]);

    const handleConnect = async (tool) => {
        if (tool.active) { togglePreference(tool.key); return; }
        if (tool.name === 'Telegram') { togglePreference(tool.key); return; }

        setConnecting(true);
        try {
            const scopes = 'gmail,calendar';
            const data = await apiFetch(`/oauth/google/start?scopes=${encodeURIComponent(scopes)}&frontend_url=${encodeURIComponent(window.location.origin)}`);
            if (data?.auth_url) window.location.href = data.auth_url;
        } catch (e) {
            console.error(e);
        } finally {
            setConnecting(false);
        }
    };

    return (
        <OnboardingLayout
            step={3}
            title="Integrate neural sources."
            subtitle="The Twin is most effective when it understands your communication channels. Connect your primary workspace tools."
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl">
                {[
                    { name: 'Gmail', icon: Mail, key: 'gmailSync', active: preferences.gmailSync, desc: 'Email synthesis & triage' },
                    { name: 'Calendar', icon: Calendar, key: 'calendarSync', active: preferences.calendarSync, desc: 'Schedule management' },
                    { name: 'Telegram', icon: MessageSquare, key: 'telegramSync', active: preferences.telegramSync, desc: 'Mobile command center' }
                ].map((tool, i) => (
                    <div
                        key={i}
                        onClick={() => !connecting && handleConnect(tool)}
                        className={`p-8 cursor-pointer rounded-[2rem] border-2 flex flex-col gap-5 transition-all shadow-xl shadow-black/5
                            ${tool.active
                                ? 'bg-primary/5 border-primary shadow-primary/10'
                                : 'bg-surface-container border-transparent hover:border-primary/30 opacity-70 hover:opacity-100 hover:bg-surface-container-high'
                            } ${connecting ? 'pointer-events-none' : ''}`}
                    >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${tool.active ? 'bg-primary text-white shadow-xl shadow-primary/30' : 'bg-surface-base text-neutral shadow-inner'}`}>
                            <tool.icon size={26} />
                        </div>
                        <div>
                            <p className="font-extrabold text-on-surface text-lg tracking-tight mb-1">{tool.name}</p>
                            <p className="text-xs text-on-surface-variant leading-tight mb-4">{tool.desc}</p>
                            <p className={`text-[10px] uppercase font-black tracking-widest ${tool.active ? 'text-primary' : 'text-neutral opacity-50'}`}>
                                {tool.active ? '✓ Connection Verified' : 'Click to Authorize'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={onNext}
                    className="bg-primary text-white px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all shadow-xl shadow-primary/25"
                >
                    Continue Journey
                </button>
                <button onClick={onNext} className="text-xs font-bold text-neutral hover:text-on-surface transition-colors uppercase tracking-widest">
                    Skip Connection
                </button>
            </div>
        </OnboardingLayout>
    );
};

// --- STEP 4: Protocol Education (New) ---
export const ConnectProtocol = ({ onNext }) => (
    <OnboardingLayout
        step={4}
        title="The Aether Protocol."
        subtitle="When your Twin communicates on your behalf, it adheres to the 'Aether Obsidian' standard — high-contrast, executive summaries that prioritize speed over fluff."
    >
        <div className="max-w-3xl bg-surface-container border border-outline-variant/50 rounded-[2.5rem] p-1 shadow-2xl mb-12">
            <div className="bg-surface-base rounded-[2.2rem] p-8 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-outline-variant/30 pb-6 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Sparkles size={16} className="text-primary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral">Sample Briefing Output</span>
                    </div>
                    <div className="h-1.5 w-12 bg-primary/20 rounded-full animate-pulse" />
                </div>

                <div className="space-y-4">
                    <h3 className="text-3xl font-manrope font-extrabold tracking-tight text-on-surface flex items-center gap-3 italic">
                        Weekly Focus Heatmap
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </h3>
                    <p className="text-sm text-on-surface-variant font-medium max-w-lg mb-8 italic">
                        "Your synthesis is complete. Most intensive communication period detected Tuesday AM. Priority focus identified: Roadmap Alignment."
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-outline-variant/30">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-neutral opacity-60">Status Code</span>
                            <span className="text-[10px] font-bold text-primary italic uppercase tracking-tighter">Aether-Obsidian-v2.0</span>
                        </div>
                        <div className="flex flex-col gap-1 text-right">
                            <span className="text-[9px] font-black uppercase tracking-widest text-neutral opacity-60">Security Level</span>
                            <span className="text-[10px] font-bold text-green-500 italic uppercase tracking-tighter">Encrypted - AES256</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <button
            onClick={onNext}
            className="flex items-center gap-3 bg-primary text-white pl-12 pr-10 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all shadow-xl shadow-primary/30"
        >
            I Understand the Protocol
            <ArrowRight size={16} />
        </button>
    </OnboardingLayout>
);

// --- Step 5: Control Preferences ---
export const ControlPreferences = ({ onNext }) => (
    <OnboardingLayout
        step={5}
        title="Execution Guardrails."
        subtitle="Maintain ultimate sovereignty. Configure where your Twin has autonomous permissions vs. where it requires manual audit."
    >
        <div className="max-w-2xl w-full space-y-4 mb-12">
            {[
                { title: 'Email Triage', desc: 'Allows Twin to draft context-aware replies for your review.', icon: Mail, active: true },
                { title: 'Calendar Intelligence', desc: 'Automatically proposes meeting times based on historical energy levels.', icon: Calendar, active: true },
                { title: 'Proactive Alerting', desc: 'Directly pings Telegram when critical project shifts are detected.', icon: MessageSquare, active: true }
            ].map((pref, i) => (
                <div key={i} className="p-6 rounded-[1.5rem] bg-surface-container border border-outline-variant flex items-center justify-between group hover:border-primary/30 transition-all shadow-lg shadow-black/5">
                    <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${pref.active ? 'bg-primary/10 text-primary' : 'bg-surface-base text-neutral'}`}>
                            <pref.icon size={22} className={pref.active ? 'text-primary' : 'text-neutral'} />
                        </div>
                        <div>
                            <h4 className="font-extrabold text-on-surface tracking-tight italic">{pref.title}</h4>
                            <p className="text-xs text-on-surface-variant mt-0.5">{pref.desc}</p>
                        </div>
                    </div>
                    <div className={`w-12 h-7 rounded-full relative flex-shrink-0 transition-all duration-500 ${pref.active ? 'bg-primary ai-glow shadow-primary/30' : 'bg-surface-container-high border border-outline-variant'}`}>
                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${pref.active ? 'right-1' : 'left-1'}`} />
                    </div>
                </div>
            ))}
        </div>

        <button
            onClick={onNext}
            className="bg-primary text-white px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all shadow-xl shadow-primary/25"
        >
            Commit Guardrails
        </button>
    </OnboardingLayout>
);

// --- Step 6: Privacy & Permissions ---
export const PrivacyPermissions = ({ onNext }) => (
    <OnboardingLayout
        step={6}
        title="Privacy Sovereignty."
        subtitle="The AI Twin architecture is designed for zero-trust environments. Your neural patterns are never used to train public datasets."
    >
        <div className="max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {[
                { title: 'Neural Isolation', desc: 'Data is siloed per user. No cross-account pattern leakage.', icon: ShieldCheck },
                { title: 'Zero Public Training', desc: 'Your executive decisions are kept in a private local vector DB.', icon: Lock },
                { title: 'Differential Privacy', desc: 'Raw text is anonymized before AI processing occurs.', icon: Fingerprint },
                { title: 'Instant Deletion', desc: 'One-click removal of all stored neural patterns and tool syncs.', icon: Shield }
            ].map((p, i) => (
                <div key={i} className="p-8 rounded-[2rem] bg-surface-base border border-outline-variant/50 shadow-inner flex flex-col gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <p.icon size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-on-surface mb-1">{p.title}</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed">{p.desc}</p>
                    </div>
                </div>
            ))}
        </div>

        <button
            onClick={onNext}
            className="flex items-center gap-3 bg-on-surface text-surface-base px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-2xl"
        >
            I Accept the Privacy Pact
            <ShieldCheck size={18} fill="currentColor" />
        </button>
    </OnboardingLayout>
);

// --- Step 7: Initializing ---
export const Initializing = ({ onComplete }) => {
    const { auth: storeAuth, updateUser } = useStore();

    useEffect(() => {
        const finalize = () => {
            // Save state (in background)
            try {
                updateUser({ onboardingCompleted: true });
                if (auth.currentUser) {
                    const userRef = doc(db, 'users', auth.currentUser.uid);
                    setDoc(userRef, {
                        onboardingCompleted: true,
                        role: storeAuth.user?.role || 'Executive'
                    }, { merge: true });
                }
            } catch (e) { console.error(e); }

            // Auto transition to main dashboard immediately after timer
            onComplete();
        };

        const timer = setTimeout(finalize, 4000)
        return () => clearTimeout(timer)
    }, [onComplete, storeAuth.user?.role, updateUser])

    return (
        <OnboardingLayout
            step={7}
            title="System Sync."
            subtitle="Finalizing your neural workspace and establishing secure tool handshakes..."
        >
            <div className="flex flex-col items-center justify-center py-12">
                <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
                    />
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-[0_0_50px_rgba(103,96,253,0.4)] z-10">
                        <Brain size={32} className="text-white" fill="currentColor" />
                    </div>
                </div>

                <div className="w-72 h-1.5 bg-surface-container-high rounded-full overflow-hidden mb-4">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 4 }}
                        className="h-full bg-primary rounded-full"
                    />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse italic">Identity Mapping in Progress</p>
                <p className="text-[9px] text-neutral mt-6 opacity-40 font-bold uppercase tracking-widest">Entering Central Command shortly...</p>
            </div>
        </OnboardingLayout>
    );
};
