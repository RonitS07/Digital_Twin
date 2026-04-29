import React, { useState } from 'react'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Home,
    MessageSquare,
    LayoutGrid,
    Activity as ActivityIcon,
    Settings,
    Plus,
    Bell,
    Sparkles,
    BrainCircuit,
    HelpCircle,
    X,
    Users,
    Menu,
    ChevronRight,
} from 'lucide-react'
import { useStore } from '../store/useStore'

const TaskModal = ({ onClose }) => {
    const { auth: storeAuth, addTask } = useStore();
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [auto, setAuto] = useState(false);
    const [isDelegating, setIsDelegating] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title) return;

        if (auto) {
            setIsDelegating(true);
            try {
                await apiFetch(`/ai/process`, {
                    method: 'POST',
                    body: JSON.stringify({
                        input: `Task: ${title}\nDescription: ${desc}\nPriority: ${priority}`,
                        user_id: storeAuth.user?.uid || 'default_user'
                    })
                });
            } catch (err) {
                console.error("AI delegation failed", err);
            } finally {
                setIsDelegating(false);
            }
        }

        addTask({ title, description: desc, priority, autoDelegate: auto });
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-surface-container w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-neutral/10 shadow-2xl relative"
            >
                {/* Drag handle for mobile */}
                <div className="w-10 h-1 bg-neutral/30 rounded-full mx-auto mb-5 sm:hidden" />
                <button onClick={onClose} className="absolute right-5 top-5 text-neutral hover:text-on-surface transition-colors p-1"><X size={20} /></button>
                <h2 className="text-xl sm:text-2xl font-manrope font-extrabold text-on-surface mb-5">Create New Task</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Task Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} required className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none" type="text" placeholder="e.g. Prepare Q4 OKRs" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Description</label>
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows="2" className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none resize-none" placeholder="Provide context for the AI twin..." />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Priority</label>
                        <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface outline-none">
                            <option>Low</option>
                            <option>Medium</option>
                            <option>High</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-neutral/10 bg-surface-base/50 cursor-pointer" onClick={() => setAuto(!auto)}>
                        <div>
                            <p className="text-sm font-bold text-on-surface">Auto-delegate to AI</p>
                            <p className="text-xs text-neutral">Twin will attempt to complete without prompting</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${auto ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                            <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${auto ? 'right-[3px]' : 'left-[3px]'}`} />
                        </div>
                    </div>
                    <button type="submit" disabled={isDelegating} className="w-full py-4 bg-primary text-surface-base font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all outline-none disabled:opacity-50">
                        {isDelegating ? 'Delegating to AI Twin...' : 'Save Task'}
                    </button>
                </form>
            </motion.div>
        </div>
    )
}

// Desktop sidebar item
const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
    <motion.div
        whileHover={{ x: 3 }}
        onClick={onClick}
        className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${active
            ? 'bg-primary/15 text-primary border-l-4 border-primary pl-3'
            : 'text-on-surface-variant hover:bg-primary/8 hover:text-on-surface border-l-4 border-transparent pl-3'
            }`}
    >
        <Icon size={19} />
        <span className="font-manrope font-medium text-sm">{label}</span>
        {badge > 0 && (
            <span className="ml-auto w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[9px] font-black text-white">
                {badge}
            </span>
        )}
    </motion.div>
)

// Mobile bottom nav tab
const MobileTab = ({ icon: Icon, label, active, onClick, badge }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all relative ${active ? 'text-primary' : 'text-neutral'}`}
    >
        <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-primary/15' : ''}`}>
            <Icon size={21} />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
        {badge > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-14px)] w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] font-black text-white">
                {badge}
            </span>
        )}
    </button>
)

const Layout = ({ children, currentView, setView }) => {
    const { auth } = useStore();
    const user = auth.user || {};
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const [agentUnread, setAgentUnread] = useState(0);
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Poll for unread agent inbox messages every 30s
    React.useEffect(() => {
        if (!auth.user?.accessToken) return;
        const checkInbox = async () => {
            try {
                const data = await apiFetch('/agent/inbox');
                const pending = (data.messages || []).filter(m =>
                    ['pending', 'delivered'].includes(m.status) &&
                    ['scheduling_proposal', 'scheduling_confirm'].includes(m.msg_type)
                ).length;
                setAgentUnread(pending);
            } catch { }
        };
        checkInbox();
        const id = setInterval(checkInbox, 30000);
        return () => clearInterval(id);
    }, [auth.user?.accessToken]);

    const navItems = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'workspace', icon: LayoutGrid, label: 'Workspace' },
        { id: 'activity', icon: ActivityIcon, label: 'Activity' },
        { id: 'agents', icon: Users, label: 'Network', badge: agentUnread },
        { id: 'settings', icon: Settings, label: 'Settings' },
    ];

    const viewLabel = navItems.find(n => n.id === currentView)?.label || 'Dashboard';

    return (
        <div className="flex h-screen overflow-hidden bg-surface-base text-on-surface font-inter">
            <AnimatePresence>
                {isTaskModalOpen && <TaskModal onClose={() => setTaskModalOpen(false)} />}
            </AnimatePresence>

            {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
            <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-surface-container border-r border-neutral/10 flex-col p-5 z-40">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center ai-glow text-surface-base">
                        <BrainCircuit size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-primary font-manrope font-extrabold tracking-tighter text-base leading-tight uppercase">AI Twin</h1>
                        <p className="text-[9px] text-neutral font-bold uppercase tracking-widest opacity-60">Control Center</p>
                    </div>
                </div>

                <nav className="space-y-1 mb-8">
                    {navItems.map(item => (
                        <SidebarItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            active={currentView === item.id}
                            onClick={() => setView(item.id)}
                            badge={item.badge}
                        />
                    ))}
                </nav>

                <div className="flex-1" />

                <div className="mt-4 pt-4 border-t border-neutral/10 space-y-2">
                    <button onClick={() => setTaskModalOpen(true)} className="w-full bg-primary text-surface-base rounded-xl py-2.5 font-bold ai-glow hover:brightness-110 active:scale-95 transition-transform flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest">
                        <Plus size={14} />
                        New Task
                    </button>
                    <div className="opacity-60">
                        <SidebarItem icon={HelpCircle} label="Help & Center" onClick={() => alert("Support Phase 3")} />
                    </div>
                </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="lg:ml-64 flex-1 flex flex-col min-w-0 h-full">

                {/* ── HEADER ── */}
                <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 bg-surface-base/90 backdrop-blur-3xl sticky top-0 z-30 border-b border-neutral/5 shrink-0">
                    {/* Mobile: logo + view title */}
                    <div className="flex items-center gap-3 lg:hidden">
                        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center ai-glow text-white">
                            <BrainCircuit size={16} className="text-white" />
                        </div>
                        <span className="font-manrope font-extrabold text-sm tracking-tight text-on-surface">{viewLabel}</span>
                    </div>

                    {/* Desktop: welcome text */}
                    <div className="hidden lg:flex flex-col">
                        {currentView !== 'home' ? (
                            <>
                                <h2 className="text-sm font-manrope font-bold text-on-surface">Welcome back, {user.name?.split(' ')[0] || 'User'}</h2>
                                <p className="text-[10px] text-neutral font-medium">Your digital twin is ready to assist you.</p>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={15} className="text-primary animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral/70">System Oversight Active</span>
                            </div>
                        )}
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center gap-3 lg:gap-6">
                        {/* New Task button - mobile only (+ icon) */}
                        <button
                            onClick={() => setTaskModalOpen(true)}
                            className="lg:hidden p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            aria-label="New Task"
                        >
                            <Plus size={18} />
                        </button>

                        <div className="hidden lg:flex flex-col items-end">
                            <span className="text-[10px] uppercase tracking-widest text-neutral font-bold">System Status</span>
                            <span className="text-xs text-primary font-medium flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                Optimal
                            </span>
                        </div>
                        <button className="hidden lg:block text-neutral hover:text-on-surface transition-colors">
                            <Bell size={20} />
                        </button>
                        <div className="h-8 w-8 rounded-full overflow-hidden border border-primary/20 bg-primary/10 flex items-center justify-center">
                            {user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                />
                            ) : null}
                            <span
                                className="text-primary text-[11px] font-bold"
                                style={{ display: user.photoURL ? 'none' : 'flex' }}
                            >
                                {user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || user.email?.slice(0, 2).toUpperCase() || 'U'}
                            </span>
                        </div>
                    </div>
                </header>

                {/* ── PAGE CONTENT ── */}
                <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
                    {children}
                </main>
            </div>

            {/* ── MOBILE BOTTOM NAV BAR ── */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-container/95 backdrop-blur-xl border-t border-neutral/10 flex items-center z-40 safe-area-pb"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {navItems.slice(0, 5).map(item => (
                    <MobileTab
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        active={currentView === item.id}
                        onClick={() => setView(item.id)}
                        badge={item.badge}
                    />
                ))}
                <MobileTab
                    icon={Settings}
                    label="Settings"
                    active={currentView === 'settings'}
                    onClick={() => setView('settings')}
                />
            </nav>
        </div>
    )
}

export default Layout
