import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../utils/apiClient'
import { API_BASE } from '../config'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Home,
    MessageSquare,
    LayoutGrid,
    Activity as ActivityIcon,
    Settings,
    Plus,
    Bell,
    HelpCircle,
    X,
    Users,
    Menu,
    ChevronRight,
    HardDrive,
    Keyboard,
    Zap,
    Shield,
    BookOpen,
    MoreHorizontal,
    Cpu,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { playNotificationSound } from '../utils/audio'

const WhatsAppModal = ({ onClose }) => {
    const { whatsappReady, setIntegration } = useStore();
    const [qr, setQr] = useState(null);
    const [ready, setReady] = useState(whatsappReady === true);
    const [loading, setLoading] = useState(whatsappReady === null);

    // Sync from store state reactively (WebSocket updates)
    useEffect(() => {
        if (whatsappReady === true) {
            setReady(true);
            setQr(null);
            setLoading(false);
            setIntegration('whatsapp', true);
        } else if (whatsappReady === false) {
            setReady(false);
        }
    }, [whatsappReady, setIntegration]);

    // Fast-polling for QR code specifically (only when not ready)
    useEffect(() => {
        if (whatsappReady === true) return;

        let stopped = false;
        const checkStatus = async () => {
            try {
                const data = await apiFetch('/mcp/whatsapp/qr');
                if (stopped) return;
                setLoading(false);

                if (data.ready) {
                    setReady(true);
                    setQr(null);
                    useStore.getState().setWhatsappReady(true);
                    useStore.getState().setIntegration('whatsapp', true);
                } else {
                    setReady(false);
                    setQr(data.qr || null);
                }
            } catch (err) {
                if (!stopped) {
                    console.error("WA Bridge unreachable", err);
                    setLoading(false);
                }
            }
        };

        checkStatus();
        const intervalId = setInterval(checkStatus, 5000);
        return () => {
            stopped = true;
            clearInterval(intervalId);
        };
    }, [whatsappReady]);

    return (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                className="bg-surface-container w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-neutral/10 shadow-2xl relative"
            >
                <button onClick={onClose} className="absolute right-5 top-5 text-neutral hover:text-on-surface transition-colors p-1"><X size={20} /></button>
                <h2 className="text-xl sm:text-2xl font-manrope font-extrabold text-on-surface mb-2">WhatsApp Connection</h2>
                <p className="text-sm text-on-surface-variant mb-6">Link your WhatsApp to allow your Twin to send notifications and read messages.</p>

                <div className="flex flex-col items-center justify-center py-8 bg-surface-base rounded-2xl border border-neutral/5">
                    {loading ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-neutral">Connecting to Bridge...</p>
                        </div>
                    ) : ready ? (
                        <div className="flex flex-col items-center gap-3 text-emerald-500">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                <Zap size={32} fill="currentColor" />
                            </div>
                            <p className="font-bold">WhatsApp Connected</p>
                            <p className="text-xs text-emerald-500/60">Your Twin is online</p>
                        </div>
                    ) : qr ? (
                        <div className="flex flex-col items-center gap-6">
                            <div className="p-4 bg-white rounded-2xl shadow-xl">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`}
                                    alt="WhatsApp QR Code"
                                    className="w-[200px] h-[200px]"
                                />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-on-surface">Scan this QR Code</p>
                                <p className="text-xs text-neutral mt-1">Open WhatsApp {'{>}'} Linked Devices {'>'} Link a Device</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-red-500">
                            <p className="text-sm font-bold">Bridge Offline</p>
                            <p className="text-xs text-neutral text-center px-6">Make sure the WhatsApp Bridge is running in your terminal.</p>
                        </div>
                    )}
                </div>

                <button onClick={onClose} className="w-full mt-6 py-3 bg-primary text-white font-bold rounded-xl hover:brightness-110 transition-all">Done</button>
            </motion.div>
        </div>
    );
};

const HelpModal = ({ onClose }) => (
    <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-surface-container w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-neutral/10 shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar"
        >
            <div className="w-10 h-1 bg-neutral/30 rounded-full mx-auto mb-5 sm:hidden" />
            <button onClick={onClose} className="absolute right-5 top-5 text-neutral hover:text-on-surface transition-colors p-1"><X size={20} /></button>
            <h2 className="text-xl sm:text-2xl font-manrope font-extrabold text-on-surface mb-6 flex items-center gap-2">
                <BookOpen size={22} className="text-primary" /> Help & Documentation
            </h2>

            <div className="space-y-6">
                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral mb-3 flex items-center gap-2"><Keyboard size={14} /> Keyboard Shortcuts</h3>
                    <div className="space-y-2">
                        {[
                            ['Enter', 'Send message'],
                            ['Shift + Enter', 'New line in chat'],
                            ['Ctrl + /', 'Focus chat input'],
                        ].map(([key, desc]) => (
                            <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-surface-base">
                                <span className="text-sm text-on-surface-variant">{desc}</span>
                                <kbd className="px-2 py-0.5 rounded bg-surface-container-highest text-[11px] font-mono text-on-surface font-bold">{key}</kbd>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral mb-3 flex items-center gap-2"><Zap size={14} /> Assistant Commands</h3>
                    <div className="space-y-2">
                        {[
                            ['"Draft an email to..."', 'Compose & send email'],
                            ['"Schedule a meeting on..."', 'Create calendar event'],
                            ['"Send a Slack message to #..."', 'Post to Slack channel'],
                            ['"Send a WhatsApp message to..."', 'Message via active WhatsApp bridge'],
                            ['"Push to Telegram"', 'Send Telegram notification'],
                            ['"Generate an image of..."', 'Create AI visual'],
                            ['"Summarize my inbox"', 'Get email digest'],
                        ].map(([cmd, desc]) => (
                            <div key={cmd} className="p-3 rounded-xl bg-surface-base">
                                <p className="text-sm font-mono text-primary font-medium">{cmd}</p>
                                <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral mb-3 flex items-center gap-2"><Cpu size={14} /> MCP Integrations</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                        Features like WhatsApp utilize the Model Context Protocol (MCP) gateway. Navigate to the <b>Workspace</b> dashboard to monitor active MCP servers, check client connection readiness, and link active accounts securely using dynamically generated QR codes.
                    </p>
                </div>

                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral mb-3 flex items-center gap-2"><Shield size={14} /> Privacy & Safety</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                        Your communication credentials transit securely using OAuth 2.0. Messages, email records, and scheduling defaults are only monitored when explicit sync permissions are toggled in your Settings.
                    </p>
                </div>
            </div>

            <button onClick={onClose} className="w-full mt-6 py-3 bg-primary text-white font-bold rounded-xl hover:brightness-110 transition-all">Close</button>
        </motion.div>
    </div>
)

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
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows="2" className="w-full bg-surface-base border-none rounded-xl py-3 px-4 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none resize-none" placeholder="Provide context for the assistant..." />
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
                    <button type="submit" disabled={isDelegating} className="w-full py-4 bg-primary text-surface-base font-bold rounded-xl hover:brightness-110 active:scale-95 transition-transform flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest outline-none disabled:opacity-50">
                        {isDelegating ? 'Delegating to assistant...' : 'Save Task'}
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

// ── FLOATING MOBILE NAV TAB ──
const FloatingTab = ({ icon: Icon, active, onClick, badge, isCenter }) => (
    <button
        onClick={onClick}
        className={`relative flex items-center justify-center transition-all duration-300 ${isCenter
            ? 'w-[54px] h-[54px] -mt-7 rounded-[18px] bg-primary text-white active:scale-90'
            : 'w-12 h-12 rounded-xl active:scale-90'
            } ${!isCenter && active ? 'text-primary' : !isCenter ? 'text-neutral/60' : ''
            }`}
        style={isCenter ? {
            boxShadow: '0 0 20px rgba(var(--primary-rgb), 0.4), 0 4px 16px rgba(var(--primary-rgb), 0.3), 0 0 40px rgba(var(--primary-rgb), 0.15)'
        } : active ? {
            filter: 'drop-shadow(0 0 6px rgba(var(--primary-rgb), 0.3))'
        } : {}}
    >
        <div className={`transition-all duration-200 ${isCenter
            ? ''
            : active
                ? 'p-2 rounded-xl bg-primary/15 ring-1 ring-primary/20'
                : 'p-2'
            }`}>
            <Icon size={isCenter ? 22 : 21} strokeWidth={isCenter || active ? 2.4 : 1.7} />
        </div>
        {badge > 0 && (
            <span className={`absolute ${isCenter ? '-top-1 -right-1' : 'top-1 right-0.5'} w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-black text-white ring-2 ring-surface-base`}>
                {badge}
            </span>
        )}
        {/* Glowing active indicator pill */}
        {active && !isCenter && (
            <motion.div
                layoutId="activeNavTab"
                className="absolute -bottom-0.5 w-5 h-[3px] rounded-full bg-primary"
                style={{ boxShadow: '0 0 8px rgba(var(--primary-rgb), 0.6), 0 0 20px rgba(var(--primary-rgb), 0.3)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
        )}
    </button>
)

// ── MORE MENU (overflow items) ──
const MoreMenu = ({ items, currentView, setView, onClose }) => (
    <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="absolute bottom-full right-2 mb-3 bg-surface-container/95 backdrop-blur-2xl border border-neutral/10 rounded-2xl shadow-2xl p-1.5 min-w-[170px] z-50"
    >
        {items.map(item => (
            <button
                key={item.id}
                onClick={() => { setView(item.id); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all ${currentView === item.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
            >
                <item.icon size={17} />
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge > 0 && (
                    <span className="ml-auto w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[8px] font-black text-white">
                        {item.badge}
                    </span>
                )}
            </button>
        ))}
    </motion.div>
)

const Layout = ({ children, currentView, setView }) => {
    const { auth, isAdmin, authInitialized, twinChatActiveSessionId, addUnreadTwinChat, unreadTwinChats } = useStore();
    const user = auth.user || {};
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const [isHelpOpen, setHelpOpen] = useState(false);
    const [isWAOpen, setWAOpen] = useState(false);
    const [agentUnread, setAgentUnread] = useState(0);
    const [isMoreOpen, setMoreOpen] = useState(false);
    const [isNotificationsOpen, setNotificationsOpen] = useState(false);
    const [popupNotification, setPopupNotification] = useState(null);
    const wsRef = useRef(null);
    const notifRef = useRef(null);
    // Track currentView in a ref so the WS handler can read it without being in deps
    const currentViewRef = useRef(currentView);

    // Global Twin Chat WebSocket
    // Gate on authInitialized to prevent connecting with a stale/partial token
    // during Firebase's async init, which causes the "closed before established" error.
    useEffect(() => {
        currentViewRef.current = currentView;
    }, [currentView]);

    // Close notifications panel on outside click
    useEffect(() => {
        const handler = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setNotificationsOpen(false);
            }
        };
        if (isNotificationsOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isNotificationsOpen]);

    useEffect(() => {
        if (!authInitialized || !user?.accessToken) return;
        let alive = true;
        let retryDelay = 1200;

        const connect = () => {
            const proto = (API_BASE ? API_BASE.startsWith('https') : window.location.protocol === 'https:') ? 'wss' : 'ws';
            const host = API_BASE ? API_BASE.replace(/^https?:\/\//, '') : window.location.host;
            const url = `${proto}://${host}/twin-chat/ws`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ event: 'auth', token: user.accessToken }));
                retryDelay = 1200; // reset backoff on successful connect
            };

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.event === 'new_message' && data.message.sender_id !== user.uid) {
                        // Use currentViewRef instead of currentView to avoid WS reconnects on nav
                        const isViewingChat = currentViewRef.current === 'twin-chat';
                        const isActiveSession = useStore.getState().twinChatActiveSessionId === data.message.session_id;
                        if (!(isViewingChat && isActiveSession)) {
                            addUnreadTwinChat(data.message);
                            playNotificationSound();
                            setPopupNotification({
                                id: data.message.id,
                                sessionId: data.message.session_id,
                                senderName: data.message.sender_name || 'New message',
                                content: data.message.content || '',
                            });
                            setTimeout(() => {
                                setPopupNotification(prev => (prev?.id === data.message.id ? null : prev));
                            }, 3500);
                        }
                    }
                    // Instant WhatsApp status push — updates all open tabs immediately
                    if (data.event === 'whatsapp_status') {
                        useStore.getState().setWhatsappReady(data.ready === true);
                    }
                } catch (err) {
                    console.error("Twin WS message error:", err);
                }
            };
            ws.onclose = (ev) => {
                // 4001/4003 = auth errors — do NOT retry, token is bad
                if (ev.code === 4001 || ev.code === 4003) return;
                if (alive) {
                    setTimeout(connect, retryDelay);
                    retryDelay = Math.min(retryDelay * 1.5, 8000); // exponential backoff, cap at 8s
                }
            };
        };
        connect();
        return () => { alive = false; wsRef.current?.close(); };
    // NOTE: currentView intentionally omitted — we read it via currentViewRef to avoid reconnects on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authInitialized, user?.accessToken, user?.uid, addUnreadTwinChat]);

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
            } catch (err) {
                console.error("Inbox poll error:", err);
            }
        };
        checkInbox();
        const id = setInterval(checkInbox, 30000); // 30s — was 10s (too aggressive)
        return () => clearInterval(id);
    }, [auth.user?.accessToken]);

    const navItems = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'files', icon: HardDrive, label: 'Files' },
        { id: 'integrations', icon: LayoutGrid, label: 'Integrations' },
        { id: 'activity', icon: ActivityIcon, label: 'Activity' },
        { id: 'agents', icon: Users, label: 'Network', badge: agentUnread + unreadTwinChats.length },
        { id: 'settings', icon: Settings, label: 'Settings' },
        ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin Panel' }] : []),
    ];

    // Mobile: 4 primary tabs + More for overflow
    const primaryMobileTabs = [navItems[0], navItems[1], navItems[4], navItems[6]]; // Home, Chat, Activity, Settings
    const overflowItems = navItems.filter(item => !primaryMobileTabs.some(p => p.id === item.id));

    const viewLabel = navItems.find(n => n.id === currentView)?.label || 'Dashboard';
    const isOverflowActive = overflowItems.some(item => item.id === currentView);

    // Hide layout chrome on Chat view (Chat has its own header)
    const isChatView = currentView === 'chat' || currentView === 'twin-chat';

    return (
        <div className="flex h-screen overflow-hidden bg-surface-base text-on-surface font-inter">
            <AnimatePresence>
                {isTaskModalOpen && <TaskModal onClose={() => setTaskModalOpen(false)} />}
                {isHelpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
                {isWAOpen && <WhatsAppModal onClose={() => setWAOpen(false)} />}
                {popupNotification && (
                    <motion.button
                        key={popupNotification.id}
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        onClick={() => {
                            setPopupNotification(null);
                            if (popupNotification.sessionId) {
                                useStore.getState().setTwinChatActiveSessionId(popupNotification.sessionId);
                                setView('twin-chat');
                            } else {
                                setNotificationsOpen(true);
                            }
                        }}
                        className="fixed top-4 right-4 z-[120] w-[320px] text-left bg-surface-container/95 backdrop-blur-xl border border-neutral/15 rounded-2xl shadow-2xl p-3"
                    >
                        <p className="text-[10px] uppercase tracking-widest font-black text-primary mb-1">New Message</p>
                        <p className="text-sm font-semibold text-on-surface truncate">{popupNotification.senderName}</p>
                        <p className="text-xs text-on-surface-variant truncate">{popupNotification.content}</p>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
            <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-surface-container border-r border-neutral/10 flex-col p-5 z-40">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ai-glow">
                        <img src="/logo.png" alt="Assistant Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-primary font-manrope font-extrabold tracking-tighter text-base leading-tight uppercase">Assistant</h1>
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
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setWAOpen(true)}
                            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors border border-neutral/5"
                        >
                            <MessageSquare size={16} className="text-emerald-500" />
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral">WhatsApp</span>
                        </button>
                        <button
                            onClick={() => setHelpOpen(true)}
                            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors border border-neutral/5"
                        >
                            <HelpCircle size={16} className="text-primary" />
                            <span className="text-[9px] font-black uppercase tracking-tighter text-neutral">Support</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="lg:ml-64 flex-1 flex flex-col min-w-0 h-full relative">

                {/* ── HEADER (hidden on mobile when in Chat view — Chat has its own) ── */}
                <header className={`h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 bg-surface-base/90 backdrop-blur-3xl sticky top-0 z-50 border-b border-neutral/5 shrink-0 ${isChatView ? 'hidden lg:flex' : ''}`}>
                    {/* Mobile: logo + view title */}
                    <div className="flex items-center gap-3 lg:hidden">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden ai-glow">
                            <img src="/logo.png" alt="Assistant Logo" className="w-full h-full object-cover" />
                        </div>
                        <h1 className="text-on-surface font-manrope font-bold">{viewLabel}</h1>
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
                                <div className="w-8 h-8 overflow-hidden animate-pulse">
                                    <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral/70">System Oversight Active</span>
                            </div>
                        )}
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center gap-3 lg:gap-6">
                        <div className="hidden lg:flex flex-col items-end">
                            <span className="text-[10px] uppercase tracking-widest text-neutral font-bold">System Status</span>
                            <span className="text-xs text-primary font-medium flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                Optimal
                            </span>
                        </div>
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                                className={`text-neutral hover:text-on-surface transition-colors p-2 rounded-xl relative ${isNotificationsOpen ? 'bg-surface-container' : ''}`}
                            >
                                <Bell size={20} />
                                {unreadTwinChats.length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                                )}
                            </button>

                            <AnimatePresence>
                                {isNotificationsOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 top-full mt-2 w-80 lg:w-96 bg-surface-container/95 backdrop-blur-3xl border border-neutral/10 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden z-[100]"
                                    >
                                        <div className="p-4 border-b border-neutral/10 flex justify-between items-center bg-surface-base/50">
                                            <h3 className="text-sm font-bold text-on-surface">Notifications</h3>
                                            {unreadTwinChats.length > 0 && (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">{unreadTwinChats.length} new</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); useStore.setState({ unreadTwinChats: [] }); }} 
                                                        className="text-[10px] font-bold uppercase tracking-widest text-neutral hover:text-on-surface transition-colors"
                                                    >
                                                        Clear All
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-h-96 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                            {unreadTwinChats.length === 0 ? (
                                                <div className="p-4 text-center text-neutral text-xs py-10 flex flex-col items-center justify-center">
                                                    <div className="w-12 h-12 rounded-full bg-neutral/5 flex items-center justify-center mb-3">
                                                        <Bell size={20} className="opacity-40" />
                                                    </div>
                                                    <span className="font-medium">No new notifications</span>
                                                </div>
                                            ) : (
                                                unreadTwinChats.map((msg, i) => (
                                                    <button
                                                        key={`${msg.id}-${i}`}
                                                        onClick={() => {
                                                            setNotificationsOpen(false);
                                                            useStore.getState().setTwinChatActiveSessionId(msg.session_id);
                                                            setView('twin-chat');
                                                        }}
                                                        className="w-full text-left p-3 hover:bg-white/5 active:bg-white/10 rounded-xl transition-all flex items-start gap-3 group border border-transparent hover:border-white/5"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary group-hover:bg-primary group-hover:text-white group-hover:scale-105 transition-all shadow-inner">
                                                            {(msg.sender_name || msg.sender?.name || '?')[0]}
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1 flex justify-between items-center">
                                                                Twin Message
                                                                <span className="text-[9px] font-medium text-neutral normal-case opacity-60">Just now</span>
                                                            </p>
                                                            <p className="text-sm font-bold text-on-surface truncate mb-0.5">{msg.sender_name || msg.sender?.name || 'Contact'}</p>
                                                            <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed opacity-80">{msg.content}</p>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
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
                <main className={`flex-1 overflow-y-auto lg:pb-0 ${isChatView ? 'pb-0' : 'pb-32'}`}>
                    {children}
                </main>
            </div>

            {/* ── MORE MENU BACKDROP ── */}
            <AnimatePresence>
                {isMoreOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMoreOpen(false)}
                        className="fixed inset-0 bg-black/10 z-40 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* ── FUTURISTIC FLOATING MOBILE NAV BAR ── */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none ${isChatView ? 'hidden' : ''}`}
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
                <nav className="pointer-events-auto relative mx-5 w-full max-w-sm">
                    {/* More Menu Popover */}
                    <AnimatePresence>
                        {isMoreOpen && (
                            <MoreMenu
                                items={overflowItems}
                                currentView={currentView}
                                setView={setView}
                                onClose={() => setMoreOpen(false)}
                            />
                        )}
                    </AnimatePresence>

                    {/* The floating bar */}
                    <div className="floating-nav flex items-end justify-around px-1 pt-2 pb-2 rounded-[20px]">
                        {/* Left tabs */}
                        {primaryMobileTabs.slice(0, 2).map(item => (
                            <FloatingTab
                                key={item.id}
                                icon={item.icon}
                                active={currentView === item.id}
                                onClick={() => { setView(item.id); setMoreOpen(false); }}
                                badge={item.badge}
                            />
                        ))}

                        {/* Center FAB — New Task */}
                        <FloatingTab
                            icon={Plus}
                            active={false}
                            isCenter
                            onClick={() => { setTaskModalOpen(true); setMoreOpen(false); }}
                        />

                        {/* Right tabs */}
                        {primaryMobileTabs.slice(2).map(item => (
                            <FloatingTab
                                key={item.id}
                                icon={item.icon}
                                active={currentView === item.id}
                                onClick={() => { setView(item.id); setMoreOpen(false); }}
                                badge={item.badge}
                            />
                        ))}

                        {/* More button */}
                        <FloatingTab
                            icon={MoreHorizontal}
                            active={isOverflowActive}
                            onClick={() => setMoreOpen(prev => !prev)}
                            badge={overflowItems.reduce((sum, item) => sum + (item.badge || 0), 0)}
                        />
                    </div>
                </nav>
            </div>
        </div>
    )
}

export default Layout
