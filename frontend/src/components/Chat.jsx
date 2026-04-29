import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    User as AccountCircle,
    BrainCircuit,
    Calendar,
    Mail,
    Plus,
    Clock,
    RotateCcw,
    MoreVertical,
    Paperclip,
    Mic as MicIcon,
    Copy,
    Share2,
    CheckCircle2,
    XCircle,
    Loader2,
    ShieldCheck,
    MessageSquare,
    Trash2,
    Zap
} from 'lucide-react'
import { useStore } from '../store/useStore'

// Lightweight zero-dep markdown renderer
const SimpleMarkdown = ({ children }) => {
    if (!children) return null

    // Inline formatting helper
    const formatInline = (text) => {
        const parts = []
        let remaining = text
        let key = 0
        // Match **bold**, *italic*, `code`
        const inlineRx = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
        let lastIndex = 0
        let match
        while ((match = inlineRx.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index))
            }
            if (match[2]) {
                parts.push(<strong key={key++} className="font-bold">{match[2]}</strong>)
            } else if (match[3]) {
                parts.push(<em key={key++} className="italic">{match[3]}</em>)
            } else if (match[4]) {
                parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-black/15 text-xs font-mono">{match[4]}</code>)
            }
            lastIndex = match.index + match[0].length
        }
        if (lastIndex < text.length) parts.push(text.slice(lastIndex))
        return parts.length > 0 ? parts : text
    }

    const lines = children.split('\n')
    const elements = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```')) {
            const codeLines = []
            i++
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            elements.push(
                <pre key={i} className="bg-black/20 rounded-lg p-4 overflow-x-auto my-3 text-xs font-mono border border-white/5 text-on-surface">
                    <code>{codeLines.join('\n')}</code>
                </pre>
            )
        } else if (line.startsWith('# ')) {
            elements.push(<h3 key={i} className="text-lg font-bold mt-4 mb-2 text-primary">{formatInline(line.slice(2))}</h3>)
        } else if (line.startsWith('## ')) {
            elements.push(<h4 key={i} className="text-base font-bold mt-3 mb-1 text-on-surface">{formatInline(line.slice(3))}</h4>)
        } else if (line.startsWith('### ')) {
            elements.push(<h5 key={i} className="text-sm font-bold mt-2 mb-1 text-on-surface">{formatInline(line.slice(4))}</h5>)
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(<li key={i} className="ml-4 list-disc text-sm mb-1">{formatInline(line.slice(2))}</li>)
        } else if (/^\d+\.\s/.test(line)) {
            elements.push(<li key={i} className="ml-4 list-decimal text-sm mb-1">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>)
        } else if (line.trim() === '---' || line.trim() === '***') {
            elements.push(<hr key={i} className="border-white/10 my-4" />)
        } else if (line.trim() !== '') {
            const lineId = `p-${i}-${line.slice(0, 5)}`;
            elements.push(<p key={lineId} className="text-sm leading-relaxed mb-2 last:mb-0">{formatInline(line)}</p>)
        }
        i++
    }
    return <>{elements}</>
}

// Image loader with skeleton
const ImageLoader = ({ src }) => {
    const [status, setStatus] = useState('loading')
    return (
        <div className="relative rounded-xl overflow-hidden w-full bg-surface-container-highest min-h-[200px]">
            {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}
            <img src={src} className={`w-full h-auto rounded-xl ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setStatus('loaded')} />
        </div>
    )
}

const ChatMessage = ({ msg, onAction, autoApprove, user }) => {
    const isAi = msg.role === 'assistant' || msg.role === 'ai'
    const [actionData, setActionData] = useState(null)
    const [cleanText, setCleanText] = useState(msg.text || '')
    const [isProcessing, setIsProcessing] = useState(false)
    const [autoCompleted, setAutoCompleted] = useState(false)

    useEffect(() => {
        if (!msg.text) return
        const actionMatch = msg.text.match(/<action>([\s\S]*?)<\/action>/)
        if (actionMatch) {
            try {
                const parsed = JSON.parse(actionMatch[1].trim())
                setActionData(parsed)
                setCleanText(msg.text.replace(/<action>[\s\S]*?<\/action>/, '').trim())

                // Safety guardrail: autonomous mode only auto-executes safe intents.
                // Email is ALWAYS manual to prevent accidental sends.
                const AUTO_APPROVE_ALLOWLIST = new Set(['calendar', 'scheduling', 'telegram', 'slack'])
                const isSafe = AUTO_APPROVE_ALLOWLIST.has(parsed.intent)

                if (autoApprove && !autoCompleted && isSafe) {
                    setAutoCompleted(true)
                    // Short delay lets the message render before executing
                    setTimeout(() => handleActionClick('approve', parsed), 2500);
                }
            } catch (e) {
                console.error("Action parse failed", e)
            }
        }
    }, [msg.text, autoApprove, autoCompleted])

    const handleActionClick = async (type, data) => {
        setIsProcessing(true)
        try {
            await onAction(type, data)
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 lg:gap-6 ${isAi ? '' : 'flex-row-reverse'}`}
        >
            <div className={`w-9 h-9 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden ${isAi ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-primary/5 text-primary border border-primary/10'
                }`}>
                {isAi ? <BrainCircuit size={16} className="text-primary" /> : (
                    user?.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-[10px] font-bold">
                            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || user?.email?.slice(0, 2).toUpperCase() || 'U'}
                        </span>
                    )
                )}
            </div>

            <div className={`flex flex-col gap-1.5 lg:gap-2 max-w-[85%] lg:max-w-2xl ${isAi ? '' : 'items-end'}`}>
                <div className={`flex items-center gap-2 lg:gap-3 ${isAi ? '' : 'flex-row-reverse'}`}>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral/70">
                        {isAi ? 'Twin Assistant' : 'Executive User'}
                    </span>
                    {msg.status && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                            <span className="text-[9px] font-black text-primary uppercase">{msg.status}</span>
                        </div>
                    )}
                </div>

                <div className={`p-4 lg:p-5 rounded-[1.5rem] shadow-sm max-w-full ${isAi
                    ? 'bg-surface-container-low border border-neutral/5 rounded-tl-none text-on-surface-variant'
                    : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/20'
                    }`}>
                    {msg.responseType === "visual" ? (
                        <div className="space-y-3 lg:space-y-4">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                            <ImageLoader src={msg.imageUrl} />
                        </div>
                    ) : (
                        <div className="text-sm leading-relaxed overflow-hidden break-words">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                        </div>
                    )}

                    {actionData && (
                        <div className={`mt-6 p-5 rounded-2xl border space-y-4 transition-all ${actionData.is_conflict
                            ? 'bg-amber-900/20 border-amber-500/30 ring-1 ring-amber-500/10'
                            : 'bg-black/20 border-white/5'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {actionData.intent === 'email' ? <Mail size={16} className={`${actionData.is_conflict ? 'text-amber-500' : 'text-primary'}`} /> : 
                                     actionData.intent === 'slack' ? <Zap size={16} className="text-[#36C5F0]" /> :
                                     actionData.intent === 'telegram' ? <MessageSquare size={16} className="text-secondary" /> : 
                                     <Calendar size={16} className={`${actionData.is_conflict ? 'text-amber-500' : 'text-secondary'}`} />}
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${actionData.is_conflict ? 'text-amber-500' : 'text-white/60'}`}>
                                        {actionData.is_conflict ? 'Conflict Detected / Suggestion' : `Pending ${actionData.intent} Authorization`}
                                    </span>
                                </div>
                                {actionData.is_conflict && (
                                    <div className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40">
                                        <span className="text-[9px] font-black text-amber-500 uppercase">Warning</span>
                                    </div>
                                )}
                            </div>

                            {actionData.is_conflict && (
                                <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                                    <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                                        ⚠️ You have a conflict with <span className="text-white font-bold underline">"{actionData.conflict_with}"</span>.
                                        I've found a free slot and updated the suggestion below.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-white">{actionData.subject || actionData.title || 'Untitled Action'}</h4>
                                {actionData.intent === 'email' && <p className="text-xs text-white/80">To: <span className="font-mono text-tertiary">{actionData.to}</span></p>}
                                {actionData.intent === 'slack' && <p className="text-xs text-white/80">Channel: <span className="font-mono text-tertiary">#{actionData.channel_name || actionData.channel_id}</span></p>}
                                {actionData.intent === 'telegram' && <p className="text-xs text-white/80">Action: <span className="font-mono text-tertiary">Push Notification</span></p>}
                                {actionData.intent === 'calendar' && (
                                    <div className="flex items-center gap-2">
                                        <Clock size={12} className="text-white/40" />
                                        <p className="text-xs text-white/80 font-mono">
                                            {new Date(actionData.start_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </p>
                                    </div>
                                )}
                                <p className="text-xs text-white/50 line-clamp-2 mt-2 italic">{actionData.body || actionData.description}</p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                {autoApprove ? (
                                    <div className="flex-1 py-2 text-primary text-xs font-bold rounded-xl bg-primary/10 flex items-center justify-center gap-2">
                                        <Zap size={14} fill="currentColor" className="animate-pulse" /> Executing Autonomously...
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            disabled={isProcessing}
                                            onClick={() => handleActionClick('approve', actionData)}
                                            className={`flex-1 py-2 text-white text-xs font-bold rounded-xl hover:brightness-110 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all ${actionData.is_conflict ? 'bg-amber-600 shadow-amber-900/20' : 'bg-primary shadow-primary/20'
                                                }`}
                                        >
                                            {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : (actionData.is_conflict ? 'Accept Suggestion & Book' : 'Approve & Execute')}
                                        </button>
                                        <button
                                            disabled={isProcessing}
                                            onClick={() => handleActionClick('reject')}
                                            className="px-4 py-2 bg-white/5 text-white/70 text-xs font-bold rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 lg:gap-4 text-[10px] text-neutral font-medium px-2">
                    <span>{msg.time} • {msg.source || 'Intelligence'}</span>
                </div>
            </div>
        </motion.div>
    )
}

const Chat = () => {
    const { auth, preferences } = useStore()
    const user = auth.user || {}
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const endRef = useRef(null)

    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem(`chat_sessions_${user.uid}`)
        return saved ? JSON.parse(saved) : []
    })
    const [sessionId, setSessionId] = useState('')
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024)

    // Fallback variable for standalone autonomous mode retrieval
    const [autoMode, setAutoMode] = useState(false)

    const newSessionId = () => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`

    useEffect(() => {
        if (!user.uid) return

        const memoryRetention = preferences.memoryRetention !== false;
        const autoM = localStorage.getItem(`autonomous_mode_${user.uid}`) === 'true';
        setAutoMode(autoM);

        if (!sessionId) {
            // Find active or create new
            if (sessions.length > 0) {
                setSessionId(sessions[0].id)
            } else {
                handleNewChat()
            }
            return
        }

        // Load specific session messages
        const saved = memoryRetention ? localStorage.getItem(`chat_history_${user.uid}_${sessionId}`) : null;
        if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed) && parsed.length > 0) {
                setMessages(parsed)
            } else {
                setMessages([{
                    id: 'init', role: 'ai', sender: 'Twin Assistant',
                    text: `Hello ${user.name?.split(' ')[0] || 'there'}. I'm your AI Twin${autoM ? ' (Autonomous Mode ✅)' : ''}. How can I assist you?`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
                }])
            }
        } else {
            setMessages([{
                id: 'init', role: 'ai', sender: 'Twin Assistant',
                text: `Hello ${user.name?.split(' ')[0] || 'there'}. I'm your AI Twin${autoM ? ' (Autonomous Mode ✅)' : ''}. How can I assist you?`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
            }])
        }
    }, [user.uid, preferences.memoryRetention, sessionId])

    useEffect(() => {
        if (user.uid && messages.length > 0 && preferences.memoryRetention !== false && sessionId) {
            localStorage.setItem(`chat_history_${user.uid}_${sessionId}`, JSON.stringify(messages))
        }
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, user.uid, preferences.memoryRetention, sessionId])

    useEffect(() => {
        if (user.uid) {
            localStorage.setItem(`chat_sessions_${user.uid}`, JSON.stringify(sessions))
        }
    }, [sessions, user.uid])

    const handleNewChat = () => {
        const sid = newSessionId()
        setSessionId(sid)
        const initMsg = [{
            id: 'init', role: 'ai', sender: 'Twin Assistant',
            text: `Hello. I'm your AI Twin. Start New Session.`,
            time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
        }]
        setMessages(initMsg)
        setSessions(prev => [{ id: sid, title: 'New Chat', updatedAt: Date.now() }, ...prev])
        if (preferences.memoryRetention !== false) {
            localStorage.setItem(`chat_history_${user.uid}_${sid}`, JSON.stringify(initMsg))
        }
        if (window.innerWidth < 1024) setIsSidebarOpen(false);
    }

    const handleDeleteSession = (e, id) => {
        e.stopPropagation()
        setSessions(prev => prev.filter(s => s.id !== id))
        localStorage.removeItem(`chat_history_${user.uid}_${id}`)
        if (sessionId === id) {
            const rem = sessions.filter(s => s.id !== id)
            if (rem.length > 0) setSessionId(rem[0].id)
            else handleNewChat()
        }
    }

    const handleSend = async (e) => {
        if (e) e.preventDefault()
        
        console.log("Chat: Send requested", { input, loading, uid: user.uid });

        if (!input.trim() || loading) return
        
        if (!user.uid) {
            console.error("Chat: Cannot send, user UID missing from store.");
            return;
        }

        const msgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const userMsg = {
            id: msgId, role: 'user', sender: user.name || 'You',
            text: input.trim(), time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'Web'
        }

        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        // Try to update session title if it's "New Chat"
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId && s.title === 'New Chat') {
                return { ...s, title: input.trim().slice(0, 30) + (input.length > 30 ? '...' : ''), updatedAt: Date.now() }
            }
            if (s.id === sessionId) return { ...s, updatedAt: Date.now() }
            return s
        }).sort((a, b) => b.updatedAt - a.updatedAt))

        try {
            const memoryRetention = preferences.memoryRetention !== false;
            const chat_history = memoryRetention
                ? [...messages, userMsg].slice(-5).map(m => ({ 
                    role: m.role === 'ai' ? 'assistant' : m.role,
                    text: m.text 
                  }))
                : [{ role: 'user', text: userMsg.text }];

            const data = await apiFetch(`/ai/process`, {
                method: 'POST',
                body: JSON.stringify({
                    input: userMsg.text, user_id: user.uid,
                    user_name: user.name || 'User',
                    chat_history,
                    session_id: sessionId,
                    gmail_sync: preferences.gmailSync !== false,
                    calendar_sync: preferences.calendarSync !== false
                })
            })
            const aiMsg = {
                id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: 'ai', sender: 'Twin Assistant',
                text: data.output, time: new Date().toLocaleTimeString([], { timeStyle: 'short' }),
                source: data.intent?.toUpperCase() || 'AI', responseType: data.response_type, imageUrl: data.image_url
            }
            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            setMessages(prev => [...prev, { id: 'err', role: 'ai', sender: 'Error', text: 'Failed to reach Twin.', time: 'Now', source: 'Error' }])
        } finally { setLoading(false) }
    }

    const handleAction = async (action, actionData) => {
        if (action === 'reject') return
        const token = useStore.getState().auth?.user?.accessToken;

        if (!token) {
            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Twin Assistant',
                text: '⚠️ **Session expired.** Please refresh the page and sign in again.',
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }]);
            return;
        }

        try {
            const endpoint = 
                actionData.intent === 'email' ? '/gmail/send' : 
                actionData.intent === 'telegram' ? '/telegram/send' : 
                actionData.intent === 'slack' ? '/slack/send' : 
                '/calendar/create'
            
            const payload = { ...actionData, user_id: user.uid }

            const data = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            })

            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Twin Assistant', 
                text: `✅ **Task Completed Successfully.**\n\n*Action: ${
                    actionData.intent === 'email' ? 'Email sent to ' + actionData.to : 
                    actionData.intent === 'slack' ? 'Slack message posted to #' + (actionData.channel_name || actionData.channel_id) :
                    actionData.intent === 'telegram' ? 'Telegram message pushed to connected device' : 
                    'Event scheduled'
                }*`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }])
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Twin Assistant',
                text: `❌ **Execution Failed:** ${err.message}`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }])
        }
    }

    return (
        <div className="flex h-full bg-surface-base relative overflow-hidden font-inter text-on-surface">

            {/* Sidebar Backdrop (Mobile only) */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar (Thread History) - hidden on mobile unless toggled */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ x: -280, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -280, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="bg-surface-container-low border-r border-neutral/5 flex flex-col z-40 fixed lg:relative h-full w-[280px]"
                    >
                        <div className="p-4 border-b border-white/5">
                            <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary hover:brightness-110 text-white text-sm font-bold transition-all shadow-lg shadow-primary/20">
                                <Plus size={16} /> New Chat
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar p-2 space-y-1">
                            {sessions.map(s => (
                                <div
                                    key={s.id}
                                    onClick={() => {
                                        setSessionId(s.id);
                                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                    }}
                                    className={`group flex items-center justify-between w-full p-3 rounded-xl cursor-pointer transition-all ${sessionId === s.id ? 'bg-primary/20 text-white' : 'hover:bg-white/5 text-neutral'}`}
                                >
                                    <div className="flex flex-col truncate w-full pr-2">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare size={14} className={sessionId === s.id ? 'text-primary' : 'text-neutral/70'} />
                                            <span className="text-sm font-medium truncate">{s.title || 'New Chat'}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteSession(e, s.id)}
                                        className="text-neutral/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative h-full overflow-hidden min-w-0">
                <header className="h-16 flex items-center justify-between px-4 lg:px-10 bg-surface-base/80 backdrop-blur-3xl sticky top-0 z-40 border-b border-neutral/5 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-xl text-neutral transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </button>
                        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-bold text-white shadow-lg"><BrainCircuit size={20} /></div>
                        <div>
                            <h2 className="font-manrope font-extrabold text-lg tracking-tight">AI Twin Chat</h2>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span><span className="text-[10px] text-neutral font-bold uppercase tracking-widest">Active • {sessions.find(s => s.id === sessionId)?.title || 'Discussion'}</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-2xl bg-surface-container flex items-center justify-center transition-colors border border-neutral/5 cursor-pointer"><MoreVertical size={18} /></div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-4 lg:px-12 py-6 lg:py-10 space-y-6 lg:space-y-12 pb-32 custom-scrollbar">
                    {messages.map((msg, i) => <ChatMessage key={msg.id || i} msg={msg} onAction={handleAction} autoApprove={autoMode} user={user} />)}
                    {loading && <div key="loading-indicator" className="flex gap-3 lg:gap-6 animate-pulse"><div className="w-9 h-9 lg:w-12 lg:h-12 rounded-2xl bg-primary/10" /><div className="bg-surface-container-low px-4 lg:px-6 py-3 lg:py-4 rounded-3xl text-sm italic opacity-50 flex items-center gap-2"><Loader2 className="animate-spin" size={14} />Twin is thinking...</div></div>}
                    <div ref={endRef} />
                </div>

                <div className="p-4 lg:p-8 absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface-base via-surface-base to-transparent pt-12 lg:pt-20">
                    <form onSubmit={handleSend} className="max-w-4xl mx-auto relative group">
                        <div className="bg-surface-container/80 backdrop-blur-3xl rounded-[1.5rem] lg:rounded-[2rem] flex items-center p-2 lg:p-3 pl-4 lg:pl-8 shadow-2xl border border-neutral/10 focus-within:border-primary/30 transition-all">
                            <input value={input} onChange={e => setInput(e.target.value)} disabled={loading} placeholder="Instruct your Twin..." className="bg-transparent flex-grow py-2 lg:py-3 outline-none text-sm placeholder:text-neutral/50" />
                            <div className="flex items-center gap-1 lg:gap-2 pr-1 lg:pr-2">
                                <button type="button" title="Attach file (coming soon)" disabled className="hidden sm:block p-2 text-neutral/30 cursor-not-allowed" aria-label="Attach file">
                                    <Paperclip size={18} />
                                </button>
                                <button type="button" title="Voice input (coming soon)" disabled className="hidden sm:block p-2 text-neutral/30 cursor-not-allowed" aria-label="Voice input">
                                    <MicIcon size={18} />
                                </button>
                                <button type="submit" disabled={!input.trim() || loading} className="bg-primary text-white h-10 w-10 lg:h-11 lg:w-11 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"><Send size={16} /></button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Chat;