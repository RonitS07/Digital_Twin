import React from 'react'
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
    TrendingUp,
    Box,
    Terminal,
    Lock,
    MessageSquare,
    Shield
} from 'lucide-react'

// --- Step 1: Welcome ---
export const Welcome = ({ onNext }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10">
        <div className="mb-8 flex flex-col items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold opacity-60">Step 1 of 7</span>
            <div className="flex gap-1.5 mt-2">
                <div className="h-1 w-8 rounded-full bg-primary"></div>
                {[...Array(6)].map((_, i) => <div key={i} className="h-1 w-4 rounded-full bg-surface-container-highest"></div>)}
            </div>
        </div>

        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4 group">
                    <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center shadow-lg transition-all border border-neutral/5">
                        <Sparkles size={40} className="text-primary" />
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-neutral/20 to-transparent"></div>
                </div>
                <h1 className="font-manrope text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
                    Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">AI Twin</span>
                </h1>
                <p className="font-inter text-lg text-on-surface-variant leading-relaxed">
                    Let’s configure your intelligent workspace assistant. Your digital counterpart is designed to augment your productivity while maintaining absolute privacy.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                    {[
                        { icon: Clock, label: "Save time", color: "text-secondary" },
                        { icon: Zap, label: "Automate tasks", color: "text-tertiary" },
                        { icon: Settings, label: "Stay in control", color: "text-primary" },
                        { icon: ShieldCheck, label: "Secure memory", color: "text-green-400" }
                    ].map((benefit, i) => (
                        <div key={i} className="p-4 rounded-lg bg-surface-container-low border border-neutral/10 flex flex-col gap-3">
                            <benefit.icon size={18} className={benefit.color} fill="currentColor" />
                            <span className="font-inter text-xs font-bold uppercase tracking-wider text-white">{benefit.label}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4 mt-8">
                    <button onClick={onNext} className="bg-primary text-surface-base px-8 py-4 rounded-full font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-primary/20">
                        Get Started
                    </button>
                </div>
            </div>

            <div className="relative hidden md:block">
                <div className="aspect-square rounded-2xl overflow-hidden glass-panel border border-neutral/10 shadow-2xl relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-32 h-32 rounded-full border border-primary/30 flex items-center justify-center animate-pulse">
                            <div className="w-24 h-24 rounded-full border border-primary/50 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_30px_#6760fd]">
                                    <Fingerprint size={32} className="text-surface-base" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
)

// --- Step 2: Choose Role ---
export const ChooseRole = ({ onNext }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10 text-center">
        <div className="mb-12">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold opacity-60">Step 2 of 7</span>
            <h2 className="text-4xl font-manrope font-extrabold text-white mt-4 mb-4">Define your executive role</h2>
            <p className="text-on-surface-variant max-w-lg mx-auto">This helps your Twin customize its communication style and prioritization logic.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
            {[
                { title: "Product Manager", desc: "Prioritizes roadmaps, user feedback, and cross-team alignment.", icon: LayoutGrid },
                { title: "Engineering Lead", desc: "Focuses on technical debt, PR reviews, and sprint velocity.", icon: Terminal },
                { title: "Founder / CEO", desc: "Monitors high-level strategy, investor relations, and hiring.", icon: Brain }
            ].map((role, i) => (
                <motion.div
                    key={i}
                    whileHover={{ y: -5 }}
                    onClick={onNext}
                    className="p-8 rounded-3xl bg-surface-container border border-neutral/10 hover:border-primary transition-all text-left group cursor-pointer"
                >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-surface-base transition-all">
                        <role.icon size={24} className="group-hover:text-surface-base" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{role.title}</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{role.desc}</p>
                </motion.div>
            ))}
        </div>
    </div>
)

// --- Step 3: Connect Tools ---
export const ConnectTools = ({ onNext }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10">
        <div className="mb-12 text-center">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold opacity-60">Step 3 of 7</span>
            <h2 className="text-4xl font-manrope font-extrabold text-white mt-4 mb-4">Sync your workspace</h2>
            <p className="text-on-surface-variant">The Twin learns faster when connected to your daily tools.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
            {[
                { name: "Gmail", icon: Mail, status: "Connected" },
                { name: "Calendar", icon: Calendar, status: "Connected" },
                { name: "Slack", icon: MessageSquare, status: "Pending" },
                { name: "Jira", icon: Zap, status: "Pending" },
                { name: "Notion", icon: Box, status: "Pending" },
                { name: "LinkedIn", icon: TrendingUp, status: "Pending" }
            ].map((tool, i) => (
                <div key={i} className={`p-6 rounded-2xl border flex flex-col gap-4 items-center transition-all ${tool.status === 'Connected' ? 'bg-primary/5 border-primary/20' : 'bg-surface-container border-neutral/5 opacity-40'}`}>
                    <tool.icon size={32} className={tool.status === 'Connected' ? 'text-primary' : 'text-neutral'} />
                    <div className="text-center">
                        <p className="font-bold text-white">{tool.name}</p>
                        <p className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${tool.status === 'Connected' ? 'text-primary' : 'text-neutral'}`}>{tool.status}</p>
                    </div>
                </div>
            ))}
        </div>

        <button onClick={onNext} className="mt-12 bg-primary text-surface-base px-10 py-4 rounded-full font-bold hover:brightness-110 active:scale-95 transition-all">
            Continue with Sync
        </button>
    </div>
)

// --- Step 4: Control Preferences ---
export const ControlPreferences = ({ onNext }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10">
        <div className="mb-12 text-center">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold opacity-60">Step 4 of 7</span>
            <h2 className="text-4xl font-manrope font-extrabold text-white mt-4 mb-4">Automation Guardrails</h2>
            <p className="text-on-surface-variant max-w-lg mx-auto">Set the boundaries for your twin's autonomous actions.</p>
        </div>

        <div className="max-w-2xl w-full space-y-4">
            {[
                { title: "Drafting Emails", desc: "Allow Twin to draft replies for your review.", icon: Mail, active: true },
                { title: "Calendar Optimization", desc: "Automatically resolve simple scheduling conflicts.", icon: Calendar, active: true },
                { title: "Slack Summaries", desc: "Synthesize overnight channel activity.", icon: MessageSquare, active: false }
            ].map((pref, i) => (
                <div key={i} className="p-6 rounded-3xl bg-surface-container border border-neutral/10 flex items-center justify-between group hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-neutral/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <pref.icon size={20} className="text-neutral group-hover:text-primary" />
                        </div>
                        <div>
                            <h4 className="font-bold text-white">{pref.title}</h4>
                            <p className="text-xs text-on-surface-variant opacity-60">{pref.desc}</p>
                        </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${pref.active ? 'bg-primary' : 'bg-neutral/20'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-surface-base rounded-full transition-all ${pref.active ? 'right-1' : 'left-1'}`}></div>
                    </div>
                </div>
            ))}
        </div>

        <button onClick={onNext} className="mt-12 bg-primary text-surface-base px-12 py-4 rounded-full font-bold hover:brightness-110 active:scale-95 transition-all">
            Confirm Preferences
        </button>
    </div>
)

// --- Step 5: Privacy & Permissions ---
export const PrivacyPermissions = ({ onNext }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10">
        <div className="mb-12 text-center">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold opacity-60">Step 5 of 7</span>
            <h2 className="text-4xl font-manrope font-extrabold text-white mt-4 mb-4">Privacy Lock</h2>
            <p className="text-on-surface-variant">Your data is yours. Period.</p>
        </div>

        <div className="max-w-xl w-full bg-surface-container-high p-8 rounded-3xl border border-neutral/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Lock size={120} />
            </div>
            <div className="space-y-6 relative z-10">
                <div className="flex gap-4">
                    <Shield className="text-primary flex-shrink-0" size={24} />
                    <p className="text-sm leading-relaxed text-on-surface">We use differential privacy to ensure your Twin learns patterns, not raw text. No data is ever sold or used to train public models.</p>
                </div>
                <div className="p-6 bg-surface-base/50 rounded-2xl border border-neutral/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-neutral">Biometric Unlock</span>
                        <div className="w-8 h-4 bg-primary rounded-full relative"><div className="w-2 h-2 bg-surface-base rounded-full absolute right-1 top-1"></div></div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-neutral">Encrypted Storage</span>
                        <div className="flex items-center gap-2 text-green-400 font-bold text-[10px] uppercase">Active</div>
                    </div>
                </div>
            </div>
        </div>

        <button onClick={onNext} className="mt-12 bg-primary text-surface-base px-12 py-4 rounded-full font-bold hover:brightness-110 active:scale-95 transition-all">
            Accept & Proceed
        </button>
    </div>
)

// --- Step 6: Initializing ---
export const Initializing = ({ onComplete }) => {
    React.useEffect(() => {
        const timer = setTimeout(onComplete, 4000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ai-orb-glow rounded-full"></div>
            <div className="relative w-64 h-64 mb-16 flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-0 rounded-full border-2 border-primary/20 scale-110"></motion.div>
                <div className="w-32 h-32 rounded-full ai-orb-core flex items-center justify-center z-10">
                    <Brain size={40} className="text-surface-base" fill="currentColor" />
                </div>
            </div>
            <div className="text-center">
                <h1 className="text-4xl font-manrope font-extrabold text-white mb-6">Learning your shadow...</h1>
                <div className="w-64 h-1 bg-surface-container rounded-full overflow-hidden mx-auto mb-4">
                    <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 4 }} className="h-full bg-primary" />
                </div>
                <p className="text-xs font-inter uppercase tracking-[0.3em] text-neutral animate-pulse">Neural Link Active</p>
            </div>
        </div>
    )
}

// --- Step 7: Success ---
export const Success = ({ onFinish }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 z-10 text-center">
        <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mb-8 shadow-2xl shadow-green-500/20"
        >
            <CheckCircle size={48} className="text-surface-base" fill="currentColor" />
        </motion.div>
        <h1 className="text-5xl font-manrope font-extrabold text-white mb-4">You're all set.</h1>
        <p className="text-on-surface-variant max-w-md mx-auto mb-12 italic opacity-80">"The digital reflection of your executive patterns is now complete. I am ready to serve."</p>
        <button onClick={onFinish} className="bg-primary text-surface-base px-12 py-4 rounded-full font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-primary/20 uppercase tracking-widest">
            Enter Workspace
        </button>
    </div>
)
