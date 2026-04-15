import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, CheckCircle, Brain, Database, Terminal, HelpCircle } from 'lucide-react'

const StepCard = ({ title, status, icon: Icon, active = false, completed = false, queued = false }) => (
    <div className={`p-6 rounded-lg border transition-all flex items-center gap-4 ${active ? 'bg-surface-container border-primary/30 shadow-[0px_0px_20px_rgba(103,96,253,0.1)]' :
            completed ? 'bg-surface-container-low border-outline-variant/10' :
                'bg-surface-container-lowest border-outline-variant/5 opacity-50'
        }`}>
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${active ? 'bg-primary text-surface-base animate-pulse' :
                completed ? 'bg-primary/20 text-primary' :
                    'bg-surface-container-high text-neutral'
            }`}>
            <Icon size={20} fill={active || completed ? "currentColor" : "none"} />
        </div>
        <div className="relative z-10">
            <p className={`font-bold text-sm tracking-tight font-manrope ${active || completed ? 'text-white' : 'text-on-surface-variant'}`}>{title}</p>
            <p className={`text-xs font-inter uppercase tracking-widest ${active ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}>{status}</p>
        </div>
        {active && <div className="absolute bottom-0 left-0 h-1 bg-primary w-2/3"></div>}
    </div>
)

const Initialization = () => {
    return (
        <div className="flex h-screen bg-surface text-on-surface font-inter overflow-hidden">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col gap-6 p-6 h-screen sticky left-0 bg-neutral/5 rounded-r-3xl shadow-[10px_0px_40px_rgba(0,0,0,0.3)] w-72">
                <div className="flex flex-col gap-2 mb-8">
                    <h2 className="text-white font-black font-manrope text-xl uppercase tracking-tighter">Setup</h2>
                    <p className="text-neutral text-sm uppercase tracking-widest">Step 3 of 4</p>
                </div>
                <nav className="flex flex-col gap-4 opacity-40">
                    <div className="flex items-center gap-3 px-4 py-2 uppercase tracking-widest text-xs font-bold">Profile</div>
                    <div className="flex items-center gap-3 px-4 py-2 uppercase tracking-widest text-xs font-bold">Preferences</div>
                    <div className="flex items-center gap-3 text-primary bg-primary/10 rounded-full px-4 py-2 uppercase tracking-widest text-xs font-bold">Integration</div>
                    <div className="flex items-center gap-3 px-4 py-2 uppercase tracking-widest text-xs font-bold">Finish</div>
                </nav>
                <div className="mt-auto">
                    <button className="w-full py-4 px-6 bg-surface-container-highest rounded-full text-xs font-bold tracking-widest uppercase hover:text-white transition-all liquid-movement">
                        Save Progress
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-hidden">
                {/* Top Bar */}
                <header className="w-full top-0 sticky flex justify-between items-center px-8 py-4 bg-neutral/5 backdrop-blur-xl z-50">
                    <div className="text-xl font-bold text-on-surface tracking-tight font-manrope uppercase">Executive Shadow AI</div>
                    <div className="flex items-center gap-6">
                        <HelpCircle className="text-neutral hover:text-on-surface cursor-pointer transition-colors" size={20} />
                        <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/15 overflow-hidden">
                            <div className="w-full h-full bg-primary/20" />
                        </div>
                    </div>
                </header>

                {/* Central View */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ai-orb-glow rounded-full"></div>

                    <div className="relative w-64 h-64 mb-16 flex items-center justify-center">
                        <motion.div
                            animate={{ scale: [1.2, 1.3, 1.2], rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border-2 border-primary/20"
                        ></motion.div>
                        <motion.div
                            animate={{ scale: [1.5, 1.6, 1.5], rotate: -360 }}
                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border border-secondary/10"
                        ></motion.div>

                        <div className="w-32 h-32 rounded-full ai-orb-core flex items-center justify-center z-10">
                            <Sparkles size={40} className="text-surface-base" fill="currentColor" />
                        </div>
                    </div>

                    <div className="max-w-xl w-full text-center z-10">
                        <h1 className="text-4xl md:text-5xl font-manrope font-extrabold text-white tracking-tight mb-6">Preparing your AI Twin...</h1>
                        <p className="text-on-surface-variant text-lg mb-12 max-w-md mx-auto">
                            Our neural engine is analyzing your executive patterns to create a seamless digital reflection of your workflow.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                            <StepCard title="Syncing workspace" status="Completed" icon={CheckCircle} completed />
                            <StepCard title="Learning preferences" status="Processing..." icon={Brain} active />
                            <StepCard title="Building memory index" status="Queued" icon={Database} queued />
                            <StepCard title="Preparing assistant logic" status="Queued" icon={Terminal} queued />
                        </div>
                    </div>

                    <div className="absolute bottom-12 right-12 flex items-center gap-4 px-6 py-3 bg-surface-container-high/40 backdrop-blur-md rounded-full border border-white/5">
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_#6760fd]"></div>
                        <span className="text-xs font-inter uppercase tracking-widest text-on-surface-variant">Neural Link: Active</span>
                    </div>
                </div>

                <footer className="p-8 text-center">
                    <p className="text-neutral text-xs font-inter tracking-widest uppercase">This process usually takes 15-30 seconds depending on data volume</p>
                </footer>
            </main>
        </div>
    )
}

export default Initialization
