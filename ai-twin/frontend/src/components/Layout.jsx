import React from 'react'
import { motion } from 'framer-motion'
import {
    Home,
    MessageSquare,
    LayoutGrid,
    Activity as ActivityIcon,
    Settings,
    Plus,
    Search,
    Bell,
    Sparkles,
    ShieldCheck,
    HelpCircle
} from 'lucide-react'

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
    <motion.div
        whileHover={{ x: 4 }}
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer ${active
                ? 'bg-primary/20 text-primary border-l-4 border-primary'
                : 'text-on-surface-variant hover:bg-primary/10 hover:text-on-surface'
            }`}
    >
        <Icon size={20} />
        <span className="font-manrope font-medium text-sm">{label}</span>
    </motion.div>
)

const Layout = ({ children, currentView, setView }) => {
    return (
        <div className="flex min-h-screen bg-surface-base text-on-surface font-inter">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container border-r border-neutral/10 flex flex-col p-6 z-40">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center ai-glow text-surface-base">
                        <Sparkles size={24} fill="currentColor" />
                    </div>
                    <div>
                        <h1 className="text-primary font-manrope font-extrabold tracking-tighter text-lg leading-tight uppercase">AI Twin</h1>
                        <p className="text-[10px] text-neutral font-bold uppercase tracking-widest opacity-70">Workspace</p>
                    </div>
                </div>

                <nav className="flex-1 space-y-2">
                    <SidebarItem icon={Home} label="Home" active={currentView === 'home'} onClick={() => setView('home')} />
                    <SidebarItem icon={MessageSquare} label="AI Twin Chat" active={currentView === 'chat'} onClick={() => setView('chat')} />
                    <SidebarItem icon={LayoutGrid} label="Workspace" active={currentView === 'workspace'} onClick={() => setView('workspace')} />
                    <SidebarItem icon={ActivityIcon} label="Activity" active={currentView === 'activity'} onClick={() => setView('activity')} />
                    <SidebarItem icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setView('settings')} />
                </nav>

                <div className="mt-auto pt-6 border-t border-neutral/10 space-y-2">
                    <button className="w-full bg-primary text-surface-base rounded-xl py-3 font-bold ai-glow hover:brightness-110 active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
                        <Plus size={16} />
                        New Task
                    </button>
                    <div className="opacity-60 space-y-1">
                        <SidebarItem icon={ShieldCheck} label="Admin" />
                        <SidebarItem icon={HelpCircle} label="Support" />
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="ml-64 flex-1 flex flex-col">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 bg-surface-base/80 backdrop-blur-3xl sticky top-0 z-30 border-b border-neutral/5">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral" size={16} />
                        <input
                            type="text"
                            placeholder="Ask AI Twin..."
                            className="w-full bg-surface-container/50 border-none rounded-full pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase tracking-widest text-neutral font-bold">System Status</span>
                            <span className="text-xs text-primary font-medium flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                Optimal
                            </span>
                        </div>
                        <button className="text-neutral hover:text-on-surface transition-colors">
                            <Bell size={20} />
                        </button>
                        <div className="h-8 w-8 rounded-full overflow-hidden border border-primary/20 bg-primary/10 flex items-center justify-center">
                            <span className="text-primary text-[11px] font-bold">AS</span>
                        </div>
                    </div>
                </header>

                {/* Dynamic Page Content */}
                <main className="flex-1 overflow-y-auto no-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    )
}

export default Layout
