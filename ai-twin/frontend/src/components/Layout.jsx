import React, { useState } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion } from 'framer-motion'
import {
    Home,
    MessageSquare,
    LayoutGrid,
    Activity as ActivityIcon,
    Settings,
    Plus,
    Bell,
    Sparkles,
    ShieldCheck,
    HelpCircle,
    X,
    Users,
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
        if(!title) return;
        
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
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface-container w-full max-w-lg rounded-3xl p-8 border border-neutral/10 shadow-2xl relative">
                <button onClick={onClose} className="absolute right-6 top-6 text-neutral hover:text-on-surface transition-colors"><X size={20}/></button>
                <h2 className="text-2xl font-manrope font-extrabold text-on-surface mb-6">Create New Task</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Task Title</label>
                        <input value={title} onChange={e=>setTitle(e.target.value)} required className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none" type="text" placeholder="e.g. Prepare Q4 OKRs" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Description</label>
                        <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows="3" className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none resize-none" placeholder="Provide context for the AI twin..." />
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-neutral tracking-widest pl-1 mb-1 block">Priority</label>
                            <select value={priority} onChange={e=>setPriority(e.target.value)} className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface outline-none">
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                            </select>
                        </div>
                    </div>
                    <div className="pt-2 flex items-center justify-between p-4 rounded-xl border border-neutral/10 bg-surface-base/50 cursor-pointer" onClick={() => setAuto(!auto)}>
                        <div>
                            <p className="text-sm font-bold text-on-surface">Auto-delegate to AI</p>
                            <p className="text-xs text-neutral">Twin will attempt to complete without prompting</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${auto ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                            <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${auto ? 'right-[3px]' : 'left-[3px]'}`}></div>
                        </div>
                    </div>
                    <button type="submit" disabled={isDelegating} className="w-full py-4 mt-4 bg-primary text-surface-base font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all outline-none disabled:opacity-50">
                        {isDelegating ? 'Delegating to AI Twin...' : 'Save Task'}
                    </button>
                </form>
            </motion.div>
        </div>
    )
}


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
    const { auth } = useStore();
    const user = auth.user || {};
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const [agentUnread, setAgentUnread] = useState(0);

    // Poll for unread agent inbox messages every 30s
    React.useEffect(() => {
        if (!auth.user?.accessToken) return;
        const checkInbox = async () => {
            try {
                const { apiFetch } = await import('../utils/apiClient');
                const data = await apiFetch('/agent/inbox');
                const pending = (data.messages || []).filter(m =>
                    ['pending', 'delivered'].includes(m.status) &&
                    ['scheduling_proposal', 'scheduling_confirm'].includes(m.msg_type)
                ).length;
                setAgentUnread(pending);
            } catch {}
        };
        checkInbox();
        const id = setInterval(checkInbox, 30000);
        return () => clearInterval(id);
    }, [auth.user?.accessToken]);


    return (
        <div className="flex h-screen overflow-hidden bg-surface-base text-on-surface font-inter">
            {isTaskModalOpen && <TaskModal onClose={() => setTaskModalOpen(false)} />}
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container border-r border-neutral/10 flex flex-col p-5 z-40">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center ai-glow text-surface-base">
                        <Sparkles size={20} fill="currentColor" />
                    </div>
                    <div>
                        <h1 className="text-primary font-manrope font-extrabold tracking-tighter text-base leading-tight uppercase">AI Twin</h1>
                        <p className="text-[9px] text-neutral font-bold uppercase tracking-widest opacity-60">Control Center</p>
                    </div>
                </div>

                <nav className="space-y-1 mb-8">
                    <SidebarItem icon={Home} label="Home" active={currentView === 'home'} onClick={() => setView('home')} />
                    <SidebarItem icon={MessageSquare} label="AI Twin Chat" active={currentView === 'chat'} onClick={() => setView('chat')} />
                    <SidebarItem icon={LayoutGrid} label="Workspace" active={currentView === 'workspace'} onClick={() => setView('workspace')} />
                    <SidebarItem icon={ActivityIcon} label="Activity" active={currentView === 'activity'} onClick={() => setView('activity')} />
                    {/* Agent Network nav with unread badge */}
                    <div className="relative">
                        <SidebarItem icon={Users} label="Agent Network" active={currentView === 'agents'} onClick={() => setView('agents')} />
                        {agentUnread > 0 && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[9px] font-black text-surface-base ai-glow">
                                {agentUnread}
                            </span>
                        )}
                    </div>
                    <SidebarItem icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setView('settings')} />
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

            {/* Main Content Area */}
            <div className="ml-64 flex-1 flex flex-col">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 bg-surface-base/80 backdrop-blur-3xl sticky top-0 z-30 border-b border-neutral/5">
                    <div className="flex flex-col">
                        {currentView !== 'home' ? (
                            <>
                                <h2 className="text-sm font-manrope font-bold text-on-surface">Welcome back, {user.name?.split(' ')[0] || 'User'}</h2>
                                <p className="text-[10px] text-neutral font-medium">Your digital twin is ready to assist you.</p>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-primary animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral/70">System Oversight Active</span>
                            </div>
                        )}
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
                            {user.photoURL ? (
                                <img 
                                    src={user.photoURL} 
                                    alt="Avatar" 
                                    className="h-full w-full object-cover" 
                                    onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
                                />
                            ) : null}
                            <span 
                                className="text-primary text-[11px] font-bold"
                                style={{ display: user.photoURL ? 'none' : 'flex' }}
                            >
                                {user.name?.split(' ').map(n=>n[0]).join('').toUpperCase() || user.email?.slice(0,2).toUpperCase() || 'U'}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Dynamic Page Content */}
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}

export default Layout
