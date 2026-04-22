import React from 'react'
import { API_BASE } from '../config'
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
    HelpCircle,
    X
} from 'lucide-react'
import { useStore } from '../store/useStore'

const TaskModal = ({ onClose }) => {
    const { auth: storeAuth, addTask } = useStore();
    const [title, setTitle] = React.useState('');
    const [desc, setDesc] = React.useState('');
    const [priority, setPriority] = React.useState('Medium');
    const [auto, setAuto] = React.useState(false);
    const [isDelegating, setIsDelegating] = React.useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(!title) return;
        
        if (auto) {
            setIsDelegating(true);
            try {
                await fetch(`${API_BASE}/ai/process`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(storeAuth.user?.accessToken ? { Authorization: `Bearer ${storeAuth.user.accessToken}` } : {}),
                    },
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
    const [isTaskModalOpen, setTaskModalOpen] = React.useState(false);
    const [history, setHistory] = React.useState([]);
    const [loadingHistory, setLoadingHistory] = React.useState(false);

    React.useEffect(() => {
        if (user.uid) {
            setLoadingHistory(true);
            fetch(`${API_BASE}/history`, {
                headers: {
                    ...(user?.accessToken ? { Authorization: `Bearer ${user.accessToken}` } : {}),
                },
            })
                .then(res => res.json())
                .then(data => {
                    setHistory(data.history || []);
                    setLoadingHistory(false);
                })
                .catch(err => {
                    console.error("History fetch failed", err);
                    setLoadingHistory(false);
                });
        }
    }, [user.uid]);

    // Group history by date
    const groupedHistory = history.reduce((groups, item) => {
        const date = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
        return groups;
    }, {});

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
                    <SidebarItem icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setView('settings')} />
                </nav>

                {/* Previous Chats Section */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    <h3 className="text-[10px] font-bold text-neutral uppercase tracking-widest mb-4 px-4 flex items-center justify-between">
                        Recent History
                        {loadingHistory && <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>}
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(groupedHistory).slice(0, 3).map(([date, items]) => (
                            <div key={date} className="space-y-2">
                                <p className="text-[9px] text-neutral font-medium px-4 opacity-50">{date}</p>
                                {items.slice(0, 3).map((item, idx) => (
                                    <div 
                                        key={idx} 
                                        onClick={() => setView('chat')}
                                        className="mx-2 px-3 py-2 rounded-lg text-xs text-on-surface-variant hover:bg-primary/5 hover:text-on-surface transition-all cursor-pointer group flex items-center gap-2"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-tertiary/40 group-hover:bg-tertiary transition-colors"></div>
                                        <span className="truncate">{item.input}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {history.length === 0 && !loadingHistory && (
                            <p className="px-4 text-[10px] text-neutral italic">No sessions yet</p>
                        )}
                    </div>
                </div>

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
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-primary text-[11px] font-bold">
                                    {user.name?.split(' ').map(n=>n[0]).join('').toUpperCase() || user.email?.slice(0,2).toUpperCase() || 'U'}
                                </span>
                            )}
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
