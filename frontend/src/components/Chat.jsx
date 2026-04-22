import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    User as AccountCircle,
    Sparkles,
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
    ShieldCheck
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
            elements.push(<p key={i} className="text-sm leading-relaxed mb-2 last:mb-0">{formatInline(line)}</p>)
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

const ChatMessage = ({ msg, onAction }) => {
    const isAi = msg.role === 'assistant' || msg.role === 'ai'
    const [actionData, setActionData] = useState(null)
    const [cleanText, setCleanText] = useState(msg.text)
    const [isProcessing, setIsProcessing] = useState(false)

    useEffect(() => {
        const actionMatch = msg.text.match(/<action>([\s\S]*?)<\/action>/)
        if (actionMatch) {
            try {
                const parsed = JSON.parse(actionMatch[1].trim())
                setActionData(parsed)
                setCleanText(msg.text.replace(/<action>[\s\S]*?<\/action>/, '').trim())
            } catch (e) {
                console.error("Action parse failed", e)
            }
        }
    }, [msg.text])

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
            className={`flex gap-6 ${isAi ? '' : 'flex-row-reverse'}`}
        >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${isAi ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary/10 text-secondary border border-secondary/20'
                }`}>
                {isAi ? <Sparkles size={20} /> : <AccountCircle size={20} />}
            </div>

            <div className={`flex flex-col gap-3 max-w-2xl ${isAi ? '' : 'items-end'}`}>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral">
                        {isAi ? 'Twin Assistant' : 'Executive User'}
                    </span>
                    {msg.status && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                            <span className="text-[9px] font-bold text-primary uppercase">{msg.status}</span>
                        </div>
                    )}
                </div>

                <div className={`p-5 rounded-[1.5rem] shadow-sm max-w-full ${isAi
                    ? 'bg-surface-container-low border border-neutral/5 rounded-tl-none text-on-surface-variant'
                    : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/20'
                    }`}>
                    {msg.responseType === "visual" ? (
                        <div className="space-y-4">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                            <ImageLoader src={msg.imageUrl} />
                        </div>
                    ) : (
                        <div className="text-sm leading-relaxed overflow-hidden break-words">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                        </div>
                    )}

                    {actionData && (
                        <div className="mt-6 p-5 rounded-2xl bg-black/20 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {actionData.intent === 'email' ? <Mail size={16} className="text-primary" /> : <Calendar size={16} className="text-secondary" />}
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Pending {actionData.intent} Authorization</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-white">{actionData.subject || actionData.title || 'Untitled Action'}</h4>
                                {actionData.intent === 'email' && <p className="text-xs text-white/80">To: <span className="font-mono text-tertiary">{actionData.to}</span></p>}
                                {actionData.intent === 'calendar' && <p className="text-xs text-white/80">Time: <span className="font-mono text-secondary">{actionData.start_datetime}</span></p>}
                                <p className="text-xs text-white/50 line-clamp-2 mt-2">{actionData.body || actionData.description}</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    disabled={isProcessing}
                                    onClick={() => handleActionClick('approve', actionData)}
                                    className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:brightness-110 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : 'Approve & Execute'}
                                </button>
                                <button
                                    disabled={isProcessing}
                                    onClick={() => handleActionClick('reject')}
                                    className="px-4 py-2 bg-white/5 text-white/70 text-xs font-bold rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 text-[10px] text-neutral font-medium px-2">
                    <span>{msg.time} • {msg.source || 'Intelligence'}</span>
                </div>
            </div>
        </motion.div>
    )
}

const Chat = () => {
    const { auth } = useStore()
    const user = auth.user || {}
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const endRef = useRef(null)
    const [sessionId, setSessionId] = useState('')

    const newSessionId = () => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`

    useEffect(() => {
        if (!user.uid) return
        try {
            const savedSession = localStorage.getItem(`session_id_${user.uid}`)
            if (savedSession) setSessionId(savedSession)
            else {
                const sid = newSessionId()
                setSessionId(sid)
                localStorage.setItem(`session_id_${user.uid}`, sid)
            }
            const saved = localStorage.getItem(`chat_history_${user.uid}`)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) setMessages(parsed)
            } else {
                setMessages([{
                    id: 'init', role: 'ai', sender: 'Twin Assistant',
                    text: `Hello ${user.name?.split(' ')[0] || 'there'}. I'm your AI Twin. How can I assist you?`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
                }])
            }
        } catch (e) { localStorage.removeItem(`chat_history_${user.uid}`) }
    }, [user.uid])

    useEffect(() => {
        if (user.uid && messages.length > 0) {
            localStorage.setItem(`chat_history_${user.uid}`, JSON.stringify(messages))
        }
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, user.uid])

    const handleNewChat = () => {
        if (window.confirm("Start a new session?")) {
            const sid = newSessionId()
            setSessionId(sid)
            localStorage.setItem(`session_id_${user.uid}`, sid)
            setMessages([{
                id: 'init', role: 'ai', sender: 'Twin Assistant',
                text: `Hello. I'm your AI Twin. Session reset.`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
            }])
            localStorage.removeItem(`chat_history_${user.uid}`)
        }
    }

    const handleSend = async (e) => {
        e.preventDefault()
        const token = useStore.getState().auth?.user?.accessToken;
        
        if (!input.trim() || loading || !user.uid) return

        const userMsg = {
            id: Date.now().toString(), role: 'user', sender: user.name || 'You',
            text: input.trim(), time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'Web'
        }

        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const chat_history = [...messages, userMsg]
                .slice(-5)
                .map(m => ({ role: m.role, text: m.text }))
            const response = await fetch(`${API_BASE}/ai/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    input: userMsg.text, user_id: user.uid,
                    user_name: user.name || 'User',
                    chat_history,
                    session_id: sessionId
                })
            })

            const data = await response.json()
            const aiMsg = {
                id: (Date.now() + 1).toString(), role: 'ai', sender: 'Twin Assistant',
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
            alert("Backend session expired. Please refresh or sign in again.");
            return;
        }

        try {
            const endpoint = actionData.intent === 'email' ? 'gmail/send' : 'calendar/create'
            const payload = { ...actionData, user_id: user.uid }

            const res = await fetch(`${API_BASE}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(payload)
            })
            const data = await res.json()
            const errorMsg =
                data?.detail?.message ||
                data?.detail?.error?.message ||
                data?.detail ||
                data?.error?.message ||
                data?.error

            if (!res.ok || errorMsg) {
                alert(`Action Failed: ${typeof errorMsg === 'string' ? errorMsg : 'Request failed'}`)
                return
            }
            if (res.ok) {
                setMessages(prev => [...prev, {
                    role: 'ai', sender: 'Twin Assistant', text: `✅ **Task Completed Successfully.**\n\n*Action: ${actionData.intent === 'email' ? 'Email sent to ' + actionData.to : 'Event scheduled '}*`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
                }])
            }
        } catch (err) { alert(`Execution failed: ${err.message}`) }
    }

    return (
        <div className="flex flex-col h-screen bg-surface-base relative overflow-hidden font-inter text-on-surface">
            <header className="h-20 flex items-center justify-between px-10 bg-surface-base/80 backdrop-blur-3xl sticky top-0 z-40 border-b border-neutral/5">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-bold text-white shadow-lg"><Sparkles size={20} /></div>
                    <div>
                        <h2 className="font-manrope font-extrabold text-lg tracking-tight">AI Twin Chat</h2>
                        <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span><span className="text-[10px] text-neutral font-bold uppercase tracking-widest">Active</span></div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handleNewChat} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold transition-all border border-neutral/5"><RotateCcw size={14} />New Session</button>
                    <div className="h-10 w-10 rounded-2xl bg-surface-container flex items-center justify-center transition-colors border border-neutral/5 cursor-pointer"><MoreVertical size={18} /></div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-12 py-10 space-y-12 pb-32 custom-scrollbar">
                {messages.map(msg => <ChatMessage key={msg.id} msg={msg} onAction={handleAction} />)}
                {loading && <div className="flex gap-6 animate-pulse"><div className="w-12 h-12 rounded-2xl bg-primary/10" /><div className="bg-surface-container-low px-6 py-4 rounded-3xl text-sm italic opacity-50 flex items-center gap-2"><Loader2 className="animate-spin" size={14} />Twin is thinking...</div></div>}
                <div ref={endRef} />
            </div>

            <div className="p-8 absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface-base via-surface-base to-transparent pt-20">
                <form onSubmit={handleSend} className="max-w-4xl mx-auto relative group">
                    <div className="bg-surface-container/80 backdrop-blur-3xl rounded-[2rem] flex items-center p-3 pl-8 shadow-2xl border border-neutral/10 focus-within:border-primary/30 transition-all">
                        <input value={input} onChange={e => setInput(e.target.value)} disabled={loading} placeholder="Instruct your Twin... (ex: Schedule a 30m sync for tomorrow)" className="bg-transparent flex-grow py-3 outline-none text-sm placeholder:text-neutral/50" />
                        <div className="flex items-center gap-2 pr-2">
                            <button type="button" className="p-2 text-neutral hover:text-primary transition-colors"><Paperclip size={18} /></button>
                            <button type="button" className="p-2 text-neutral hover:text-primary transition-colors"><MicIcon size={18} /></button>
                            <button type="submit" disabled={!input.trim() || loading} className="bg-primary text-white h-11 w-11 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"><Send size={18} /></button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default Chat