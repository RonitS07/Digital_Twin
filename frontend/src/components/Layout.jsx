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
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

const WhatsAppModal = ({ onClose }) => {
    const { whatsappReady, setIntegration } = useStore();
    const [qr, setQr] = useState(null);
    const [ready, setReady] = useState(whatsappReady === true);
    const [loading, setLoading] = useState(whatsappReady === null);

    useEffect(() => {
        if (whatsappReady === true) { setReady(true); setQr(null); setLoading(false); setIntegration('whatsapp', true); }
        else if (whatsappReady === false) setReady(false);
    }, [whatsappReady, setIntegration]);

    useEffect(() => {
        if (whatsappReady === true) return;
        let stopped = false;
        const checkStatus = async () => {
            try {
                const data = await apiFetch('/mcp/whatsapp/qr');
                if (stopped) return;
                setLoading(false);
                if (data.ready) { setReady(true); setQr(null); useStore.getState().setWhatsappReady(true); useStore.getState().setIntegration('whatsapp', true); }
                else { setReady(false); setQr(data.qr || null); }
            } catch (err) { if (!stopped) { console.error("WA Bridge unreachable", err); setLoading(false); } }
        };
        checkStatus();
        const intervalId = setInterval(checkStatus, 5000);
        return () => { stopped = true; clearInterval(intervalId); };
    }, [whatsappReady]);

    return (
        <div className="fixed inset-0 bg-[#1A1814]/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DE] shadow-[0_8px_32px_rgba(0,0,0,0.12)] relative"
            >
                <button onClick={onClose} className="absolute right-5 top-5 text-[#A09488] hover:text-[#1A1814] transition-colors p-1"><X size={18} /></button>
                <h2 className="font-fraunces font-semibold text-xl text-[#1A1814] mb-1">WhatsApp Connection</h2>
                <p className="font-dm text-sm text-[#7A7065] mb-6">Link your WhatsApp to allow your Twin to send notifications and read messages.</p>

                <div className="flex flex-col items-center justify-center py-8 bg-[#F7F5F2] rounded-xl border border-[#E8E4DE]">
                    {loading ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" />
                            <p className="font-dm text-xs text-[#7A7065]">Connecting to Bridge...</p>
                        </div>
                    ) : ready ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 bg-[#E6F4EC] rounded-full flex items-center justify-center">
                                <Zap size={28} className="text-[#2D6A4F]" fill="currentColor" />
                            </div>
                            <p className="font-dm font-semibold text-[#2D6A4F]">WhatsApp Connected</p>
                        </div>
                    ) : qr ? (
                        <div className="flex flex-col items-center gap-5">
                            <div className="p-3 bg-white rounded-xl border border-[#E8E4DE] shadow-sm">
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`} alt="WhatsApp QR Code" className="w-[200px] h-[200px]" />
                            </div>
                            <div className="text-center">
                                <p className="font-dm font-semibold text-sm text-[#1A1814]">Scan this QR Code</p>
                                <p className="font-dm text-xs text-[#7A7065] mt-1">WhatsApp → Linked Devices → Link a Device</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <p className="font-dm font-semibold text-sm text-[#C0392B]">Bridge Offline</p>
                            <p className="font-dm text-xs text-[#7A7065] text-center px-6">Make sure the WhatsApp Bridge is running in your terminal.</p>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="w-full mt-5 py-2.5 bg-[#2D6A4F] text-white font-dm font-medium rounded-lg hover:brightness-105 transition-all text-sm">Done</button>
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
                await apiFetch(`/ai/process`, { method: 'POST', body: JSON.stringify({ input: `Task: ${title}\nDescription: ${desc}\nPriority: ${priority}`, user_id: storeAuth.user?.uid || 'default_user' }) });
            } catch (err) { console.error("AI delegation failed", err); }
            finally { setIsDelegating(false); }
        }
        addTask({ title, description: desc, priority, autoDelegate: auto });
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-[#1A1814]/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DE] shadow-[0_8px_32px_rgba(0,0,0,0.12)] relative"
            >
                <div className="w-8 h-1 bg-[#E8E4DE] rounded-full mx-auto mb-5 sm:hidden" />
                <button onClick={onClose} className="absolute right-5 top-5 text-[#A09488] hover:text-[#1A1814] transition-colors p-1"><X size={18} /></button>
                <h2 className="font-fraunces font-semibold text-xl text-[#1A1814] mb-5">Create New Task</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="wi-label block mb-1.5">Task Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} required className="wi-input" type="text" placeholder="e.g. Prepare Q4 OKRs" />
                    </div>
                    <div>
                        <label className="wi-label block mb-1.5">Description</label>
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows="2" className="wi-input resize-none" placeholder="Provide context for the assistant..." />
                    </div>
                    <div>
                        <label className="wi-label block mb-1.5">Priority</label>
                        <select value={priority} onChange={e => setPriority(e.target.value)} className="wi-input">
                            <option>Low</option><option>Medium</option><option>High</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl border border-[#E8E4DE] bg-[#F7F5F2] cursor-pointer" onClick={() => setAuto(!auto)}>
                        <div>
                            <p className="font-dm font-medium text-sm text-[#1A1814]">Auto-delegate to AI</p>
                            <p className="font-dm text-xs text-[#7A7065]">Twin will attempt to complete without prompting</p>
                        </div>
                        <button type="button" className={`wi-toggle ${auto ? 'wi-toggle-on' : 'wi-toggle-off'}`} style={{ position: 'relative' }}>
                            <div className={`wi-toggle-thumb ${auto ? 'left-[21px]' : 'left-[3px]'}`} />
                        </button>
                    </div>
                    <button type="submit" disabled={isDelegating} className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50">
                        {isDelegating ? 'Delegating to assistant...' : 'Save Task'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}

// Desktop sidebar item
const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
    <div
        onClick={onClick}
        className={`nav-item relative flex items-center gap-3 px-4 h-10 transition-all duration-150 cursor-pointer select-none ${active
            ? 'text-white nav-item-active'
            : 'text-[#C8C2B8] hover:text-white'
            }`}
    >
        <Icon size={16} strokeWidth={active ? 2 : 1.75} />
        <span className="font-dm text-xs font-medium">{label}</span>
        {badge > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] bg-[#2D6A4F] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1">
                {badge}
            </span>
        )}
    </div>
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
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    const wsRef = useRef(null);
    const notifRef = useRef(null);
    const profileMenuRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
                setProfileDropdownOpen(false);
            }
        };
        if (profileDropdownOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [profileDropdownOpen]);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error("Sign out error", e);
        }
    };
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
            <aside className="wi-sidebar hidden lg:flex fixed left-0 top-0 h-screen flex-col z-40">
                {/* Logo */}
                <div className="flex items-center gap-3 px-6 pt-6 pb-8">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white/10">
                        <img src="/logo.png" alt="Aether" className="w-6 h-6 object-contain" />
                    </div>
                    <span className="font-dm font-bold text-sm text-white tracking-wide">AETHER</span>
                </div>

                <nav className="flex-1 px-3 space-y-0.5">
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

                <div className="px-4 pb-6 space-y-2">
                    <button
                        onClick={() => setTaskModalOpen(true)}
                        className="w-full bg-[#2D6A4F] text-white rounded-lg py-2.5 font-dm font-medium text-xs flex items-center justify-center gap-2 hover:brightness-105 transition-all"
                    >
                        <Plus size={14} />
                        New Task
                    </button>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <button onClick={() => setWAOpen(true)} className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                            <MessageSquare size={14} className="text-[#C8C2B8]" />
                            <span className="text-[10px] font-dm text-[#C8C2B8] leading-none">WhatsApp</span>
                        </button>
                        <button onClick={() => setHelpOpen(true)} className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                            <HelpCircle size={14} className="text-[#C8C2B8]" />
                            <span className="text-[10px] font-dm text-[#C8C2B8] leading-none">Support</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="lg:ml-[200px] flex-1 flex flex-col min-w-0 h-full relative">

                {/* ── HEADER ── */}
                <header className={`h-14 flex items-center justify-between px-6 lg:px-8 bg-[#F7F5F2] sticky top-0 z-50 shrink-0 border-b border-[#E8E4DE] ${isChatView ? 'hidden lg:flex' : ''}`}>
                    {/* Mobile: logo + view title */}
                    <div className="flex items-center gap-3 lg:hidden">
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-[#1A1814]/5">
                            <img src="/logo.png" alt="Aether" className="w-5 h-5 object-contain" />
                        </div>
                        <h1 className="font-dm font-semibold text-sm text-[#1A1814]">{viewLabel}</h1>
                    </div>

                    {/* Desktop: page context */}
                    <div className="hidden lg:flex items-center gap-2">
                        {currentView === 'home' ? (
                            <span className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" />
                                <span className="font-dm text-xs font-medium text-[#7A7065] uppercase tracking-widest">All systems nominal</span>
                            </span>
                        ) : (
                            <span className="font-dm text-sm font-medium text-[#7A7065]">{viewLabel}</span>
                        )}
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-3">
                        {/* System status pill */}
                        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E6F4EC] border border-[#2D6A4F]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" />
                            <span className="font-dm text-[11px] font-medium text-[#2D6A4F]">Optimal</span>
                        </div>

                        {/* Notifications */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                                className={`relative p-2 rounded-lg transition-colors ${isNotificationsOpen ? 'bg-[#E8E4DE]' : 'hover:bg-[#E8E4DE]'}`}
                            >
                                <Bell size={18} className="text-[#7A7065]" />
                                {unreadTwinChats.length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2D6A4F] rounded-full" />
                                )}
                            </button>

                            <AnimatePresence>
                                {isNotificationsOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E8E4DE] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden z-[100]"
                                    >
                                        <div className="px-4 py-3 border-b border-[#E8E4DE] flex justify-between items-center">
                                            <h3 className="font-dm font-semibold text-sm text-[#1A1814]">Notifications</h3>
                                            {unreadTwinChats.length > 0 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); useStore.setState({ unreadTwinChats: [] }); }}
                                                    className="wi-label hover:text-[#1A1814] transition-colors"
                                                >
                                                    Clear all
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                            {unreadTwinChats.length === 0 ? (
                                                <div className="py-10 flex flex-col items-center text-center">
                                                    <Bell size={20} className="text-[#A09488] mb-3" />
                                                    <span className="font-dm text-sm text-[#7A7065]">No new notifications</span>
                                                </div>
                                            ) : (
                                                unreadTwinChats.map((msg, i) => (
                                                    <button
                                                        key={`${msg.id}-${i}`}
                                                        onClick={() => { setNotificationsOpen(false); useStore.getState().setTwinChatActiveSessionId(msg.session_id); setView('twin-chat'); }}
                                                        className="w-full text-left px-4 py-3 hover:bg-[#F7F5F2] transition-colors flex items-start gap-3 border-b border-[#E8E4DE] last:border-b-0"
                                                    >
                                                        <div className="w-8 h-8 rounded-full bg-[#E8F5EE] flex items-center justify-center shrink-0 font-dm font-semibold text-xs text-[#2D6A4F]">
                                                            {(msg.sender_name || '?')[0]}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-dm font-medium text-sm text-[#1A1814] truncate">{msg.sender_name || 'Contact'}</p>
                                                            <p className="font-dm text-xs text-[#7A7065] line-clamp-2 mt-0.5">{msg.content}</p>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Avatar container */}
                        <div className="relative animate-none" ref={profileMenuRef}>
                            <button
                                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                                className="h-8 w-8 rounded-lg overflow-hidden bg-[#E8F5EE] flex items-center justify-center cursor-pointer border border-[#E8E4DE]"
                            >
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                                ) : null}
                                <span className="font-dm text-[11px] font-semibold text-[#2D6A4F]" style={{ display: user.photoURL ? 'none' : 'flex' }}>
                                    {user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                                </span>
                            </button>
                            <AnimatePresence>
                                {profileDropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#E8E4DE] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden z-[100] p-4 text-left"
                                    >
                                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#E8E4DE]">
                                            <div className="h-10 w-10 rounded-full bg-[#E8F5EE] flex items-center justify-center border border-[#E8E4DE] shrink-0 overflow-hidden">
                                                {user.photoURL ? (
                                                    <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="font-dm text-xs font-semibold text-[#2D6A4F]">
                                                        {user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-dm font-semibold text-sm text-[#1A1814] truncate">{user.name || 'User'}</h4>
                                                <p className="font-dm text-xs text-[#7A7065] truncate">{user.email}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs py-1.5 px-2">
                                                <span className="text-[#7A7065]">Role</span>
                                                <span className="font-medium text-[#1A1814]">{user.role || 'Executive'}</span>
                                            </div>
                                            {user.company && (
                                                <div className="flex justify-between text-xs py-1.5 px-2">
                                                    <span className="text-[#7A7065]">Company</span>
                                                    <span className="font-medium text-[#1A1814]">{user.company}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-[#E8E4DE] flex flex-col gap-1.5">
                                            <button
                                                onClick={() => { setProfileDropdownOpen(false); setView('settings'); }}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-[#1A1814] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <Settings size={14} /> Profile & Settings
                                            </button>
                                            <button
                                                onClick={() => { setProfileDropdownOpen(false); handleSignOut(); }}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50/50 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                Sign Out
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
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
