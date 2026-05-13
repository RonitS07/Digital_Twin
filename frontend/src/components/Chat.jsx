import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Calendar,
    Mail,
    Plus,
    Clock,
    Paperclip,
    Mic as MicIcon,
    MicOff,
    Copy,
    Check,
    Loader2,
    MessageSquare,
    Trash2,
    Zap,
    File as FileIcon,
    Search,
    Download,
    Sparkles,
    ExternalLink,
    X
} from 'lucide-react'
import { useStore } from '../store/useStore'
import VisualizationRenderer from './VisualizationRenderer'
import FileDownloadCard from './FileDownloadCard'

const INTENT_OPTIONS = [
    { key: 'general', label: 'General' },
    { key: 'email', label: 'Email' },
    { key: 'calendar', label: 'Schedule' },
    { key: 'visual', label: 'Image' },
    { key: 'file_generate', label: 'Create File' },
    { key: 'file_read', label: 'Analyze File' },
    { key: 'slack', label: 'Slack' },
    { key: 'telegram', label: 'Telegram' },
]

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
            <img 
                src={src} 
                className={`w-full h-auto rounded-xl ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} 
                onLoad={() => setStatus('loaded')} 
                onError={(e) => {
                    console.error("Image load failed", src.slice(0, 50) + "...");
                    setStatus('error');
                }}
            />
            {status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-red-400/5 p-4 text-center">
                    <Sparkles size={24} className="mb-2 opacity-50" />
                    <p className="text-xs font-bold uppercase tracking-widest">Visual Rendering Failed</p>
                    <p className="text-[10px] opacity-70 mt-1">The AI generated a visual, but your browser could not display it. This often happens with very large data URLs or slow connections.</p>
                </div>
            )}
        </div>
    )
}

const ChatMessage = ({ msg, onAction, autoApprove, user }) => {
    const isAi = msg.role === 'assistant' || msg.role === 'ai'
    const [actionData, setActionData] = useState(null)
    const [cleanText, setCleanText] = useState(() => {
        if (!msg.text) return '';
        return msg.text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
    })
    const [isProcessing, setIsProcessing] = useState(false)
    const [autoCompleted, setAutoCompleted] = useState(false)
    const [isExecuted, setIsExecuted] = useState(false)
    const [actionStatus, setActionStatus] = useState(null) // 'approved' | 'rejected'
    const [lightboxSrc, setLightboxSrc] = useState(null)
    const [copied, setCopied] = useState(false)

    console.log("ChatMessage Render:", { 
        id: msg.id, 
        role: msg.role, 
        responseType: msg.responseType, 
        imageUrl: msg.imageUrl,
        text: msg.text 
    });

    useEffect(() => {
        if (!msg.text) return
        const actionMatch = msg.text.match(/<action>([\s\S]*?)<\/action>/)
        if (actionMatch) {
            setCleanText(msg.text.replace(/<action>[\s\S]*?<\/action>/g, '').trim())
            try {
                const parsed = JSON.parse(actionMatch[1].trim())
                setActionData(parsed)

                const AUTO_APPROVE_ALLOWLIST = new Set(['calendar', 'scheduling', 'telegram', 'slack'])
                const isSafe = AUTO_APPROVE_ALLOWLIST.has(parsed.intent)

                if (autoApprove && !autoCompleted && isSafe) {
                    setAutoCompleted(true)
                    setTimeout(() => handleActionClick('approve', parsed), 2500);
                }
            } catch (e) {
                console.error("Action parse failed", e)
            }
        }
    }, [msg.text, autoApprove, autoCompleted])

    const handleActionClick = async (type, data) => {
        if (isExecuted) return;
        
        if (type === 'reject') {
            setIsExecuted(true)
            setActionStatus('rejected')
            return;
        }

        setIsProcessing(true)
        try {
            await onAction(type, data)
            setIsExecuted(true)
            setActionStatus('approved')
        } catch (e) {
            console.error("Action execution failed", e)
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <>
        {lightboxSrc && (
            <div
                className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                onClick={() => setLightboxSrc(null)}
            >
                <img
                    src={lightboxSrc}
                    alt="Full size"
                    className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
                    onClick={e => e.stopPropagation()}
                />
                <button
                    className="absolute top-6 right-6 text-white/70 hover:text-white text-3xl font-bold"
                    onClick={() => setLightboxSrc(null)}
                >✕</button>
            </div>
        )}
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 lg:gap-6 ${isAi ? '' : 'flex-row-reverse'}`}
        >
            <div className={`w-9 h-9 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden ${isAi ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-primary/5 text-primary border border-primary/10'
                }`}>
                {isAi ? <img src="/logo.png" alt="AI" className="w-full h-full object-cover" /> : (
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
                        {isAi ? 'Assistant' : 'Executive User'}
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
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3 mt-1">
                            {msg.attachments.map((at, idx) => (
                                at.type?.startsWith('image/') ? (
                                    <div key={idx} className="w-32 h-32 lg:w-40 lg:h-40 rounded-2xl overflow-hidden border border-white/20 shadow-lg cursor-pointer relative group/img"
                                        onClick={() => setLightboxSrc(at.data)}
                                    >
                                        <img src={at.data} alt={at.name} className="w-full h-full object-cover transition-transform group-hover/img:scale-110" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-white bg-black/50 px-2 py-1 rounded-lg">🔍 View</span>
                                        </div>
                                    </div>
                                ) : at.type?.startsWith('video/') ? (
                                    <div key={idx} className="w-full max-w-sm rounded-2xl overflow-hidden border border-white/20 bg-black/50">
                                        <video src={at.data} controls className="w-full h-auto max-h-[300px]" />
                                    </div>
                                ) : at.type?.startsWith('audio/') ? (
                                    <div key={idx} className="w-full max-w-xs">
                                        <audio src={at.data} controls className="w-full" />
                                    </div>
                                ) : (
                                    <a key={idx} href={at.data} download={at.name} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-xl text-[10px] border border-white/5">
                                        <FileIcon size={16} className="text-white/70" />
                                        <span className="max-w-[120px] truncate font-medium">{at.name}</span>
                                        <ExternalLink size={12} className="text-white/50" />
                                    </a>
                                )
                            ))}
                        </div>
                    )}
                    { (msg.responseType === "visual" || msg.response_type === "visual" || msg.source === "VISUAL") ? (
                        <div className="space-y-3 lg:space-y-4">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                            <ImageLoader src={msg.imageUrl} />
                            
                        </div>
                    ) : (
                        <div className="text-sm leading-relaxed break-words">
                            <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                        </div>
                    )}

                    {/* Generated file card */}
                    {msg.generatedFile && msg.responseType !== 'visual' && msg.response_type !== 'visual' && (
                        <FileDownloadCard fileData={msg.generatedFile} />
                    )}

                    {/* Interactive visualization */}
                    {(msg.responseType === 'visualization' || msg.response_type === 'visualization') && msg.vizConfig && (
                        <VisualizationRenderer config={msg.vizConfig} />
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
                                    <p className="text-sm font-medium leading-relaxed">
                                        ⚠️ You have a conflict with <span className="text-white font-bold underline">"{actionData.conflict_with || 'another event'}"</span>. I've found a free slot and updated the suggestion below.
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
                                {isExecuted ? (
                                    <div className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border ${
                                        actionStatus === 'approved' 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                        {actionStatus === 'approved' ? <><Check size={14} /> Action Executed</> : <><X size={14} /> Request Rejected</>}
                                    </div>
                                ) : autoApprove ? (
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

                <div className="flex items-center gap-3 lg:gap-4 text-[10px] text-neutral font-medium px-2 pb-2">
                    <span>{msg.time} • {msg.source || 'Intelligence'}</span>
                    {isAi && (
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(cleanText);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                            className="flex items-center gap-1 hover:text-primary transition-colors"
                            title="Copy message"
                        >
                            {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
        </>
    )
}

const Chat = () => {
    const { auth, preferences, setView } = useStore()
    const user = auth.user || {}
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [selectedIntent, setSelectedIntent] = useState('general')
    const [loading, setLoading] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState([])
    const endRef = useRef(null)
    const textareaRef = useRef(null)

    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem(`chat_sessions_${user.uid}`)
        return saved ? JSON.parse(saved) : []
    })
    const [sessionId, setSessionId] = useState(() => localStorage.getItem(`chat_active_session_${user.uid || 'anon'}`) || '')
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024)
    const [sessionSearch, setSessionSearch] = useState('')
    const [isListening, setIsListening] = useState(false)
    const recognitionRef = useRef(null)

    const [autoMode, setAutoMode] = useState(false)
    const [fetchingSessions, setFetchingSessions] = useState(false)
    const [fetchingMessages, setFetchingMessages] = useState(false)

    const newSessionId = () => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`
    
    const fetchSessions = useCallback(async () => {
        if (!user.uid) return;
        setFetchingSessions(true);
        try {
            const data = await apiFetch('/sessions');
            if (data.sessions) {
                setSessions(data.sessions.sort((a, b) => b.updatedAt - a.updatedAt));
                if (!sessionId && data.sessions.length > 0) {
                    setSessionId(data.sessions[0].id);
                } else if (!sessionId) {
                    handleNewChat();
                }
            }
        } catch (err) {
            console.error("Failed to fetch sessions", err);
        } finally {
            setFetchingSessions(false);
        }
    }, [user.uid, sessionId]);

    const loadMessages = useCallback(async (sid) => {
        if (!user.uid || !sid) return;
        setFetchingMessages(true);
        try {
            const data = await apiFetch(`/history?session_id=${sid}`);
            if (data.history) {
                const mapped = data.history.map(h => {
                    let parsedMeta = {}
                    if (h.metadata) {
                        try { parsedMeta = JSON.parse(h.metadata) } catch(e){}
                    }
                    return {
                        id: h.id,
                        role: h.kind === 'prompt' ? 'user' : 'ai',
                        text: h.kind === 'prompt' ? h.input : h.output,
                        time: new Date(h.timestamp).toLocaleTimeString([], { timeStyle: 'short' }),
                        source: h.intent?.toUpperCase() || 'AI',
                        responseType: h.response_type,
                        imageUrl: h.image_url,
                        attachments: parsedMeta.files || []
                    }
                });
                
                if (mapped.length > 0) {
                    setMessages(mapped);
                } else {
                    setMessages([{
                        id: 'init', role: 'ai', sender: 'Assistant',
                        text: `Hello ${user.name?.split(' ')[0] || 'there'}. How can I assist you?`,
                        time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
                    }]);
                }
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setFetchingMessages(false);
        }
    }, [user.uid, user.name]);

    useEffect(() => {
        if (user.uid) {
            fetchSessions();
        }
    }, [user.uid]);

    useEffect(() => {
        if (sessionId) {
            loadMessages(sessionId);
        }
    }, [sessionId, loadMessages]);

    useEffect(() => {
        if (user.uid && sessionId) {
            localStorage.setItem(`chat_active_session_${user.uid}`, sessionId);
        }
    }, [user.uid, sessionId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleNewChat = () => {
        const sid = newSessionId()
        setSessionId(sid)
        const initMsg = [{
            id: 'init', role: 'ai', sender: 'Assistant',
            text: `Hello. Start a new session whenever you're ready.`,
            time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
        }]
        setMessages(initMsg)
        setSessions(prev => [{ id: sid, title: 'New Chat', updatedAt: Date.now() }, ...prev])
        if (preferences.memoryRetention !== false) {
            localStorage.setItem(`chat_history_${user.uid}_${sid}`, JSON.stringify(initMsg))
        }
        if (window.innerWidth < 1024) setIsSidebarOpen(false);
    }

    const handleDeleteSession = async (e, id) => {
        e.stopPropagation()
        setSessions(prev => prev.filter(s => s.id !== id))
        localStorage.removeItem(`chat_history_${user.uid}_${id}`)
        
        try {
            await apiFetch(`/sessions/${id}`, { method: 'DELETE' })
        } catch (err) {
            console.error("Failed to delete session from backend", err)
        }

        if (sessionId === id) {
            const rem = sessions.filter(s => s.id !== id)
            if (rem.length > 0) setSessionId(rem[0].id)
            else handleNewChat()
        }
    }

    const handleSend = async (e) => {
        if (e) e.preventDefault()
        
        console.log("Chat: Send requested", { input, loading, uid: user.uid });

        if ((!input.trim() && attachedFiles.length === 0) || loading) return
        
        if (!user.uid) {
            console.error("Chat: Cannot send, user UID missing from store.");
            return;
        }

        const msgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const currentFiles = [...attachedFiles]
        const userMsg = {
            id: msgId, role: 'user', sender: user.name || 'You',
            text: input.trim(), time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'Web',
            attachments: currentFiles.map(f => ({ name: f.name, type: f.type, data: f.data }))
        }

        setMessages(prev => [...prev, userMsg])
        setInput('')
        setAttachedFiles([])
        setLoading(true)

        // Update session timestamp
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) return { ...s, updatedAt: Date.now() }
            return s
        }).sort((a, b) => b.updatedAt - a.updatedAt))

        try {
            const memoryRetention = preferences.memoryRetention !== false;
            const chat_history = memoryRetention
                ? [...messages, userMsg].map(m => ({ 
                    role: m.role === 'ai' ? 'assistant' : m.role,
                    text: m.text,
                    image_url: m.imageUrl
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
                    calendar_sync: preferences.calendarSync !== false,
                    slack_sync: preferences.slackSync !== false,
                    files: currentFiles,
                    intent_hint: selectedIntent
                })
            })
            const aiMsg = {
                id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: 'ai', sender: 'Assistant',
                text: data.output, time: new Date().toLocaleTimeString([], { timeStyle: 'short' }),
                source: data.intent?.toUpperCase() || 'AI', responseType: data.response_type, imageUrl: data.image_url,
                generatedFile: data.generated_file || null,
                vizConfig: data.viz_config || null,
            }
            setMessages(prev => {
                const newMessages = [...prev, aiMsg];
                // Trigger Smart Title generation after the 1st and 2nd exchange (2 and 4 messages total)
                if (newMessages.length === 2 || newMessages.length === 4) {
                    apiFetch('/ai/generate-title', {
                        method: 'POST',
                        body: JSON.stringify({ history: newMessages.map(m => ({ role: m.role, text: m.text })) })
                    }).then(res => {
                        if (res.title) {
                            setSessions(sPrev => sPrev.map(s => s.id === sessionId ? { ...s, title: res.title } : s));
                        }
                    }).catch(console.error);
                }
                return newMessages;
            });
        } catch (err) {
            setMessages(prev => [...prev, { id: 'err', role: 'ai', sender: 'Error', text: 'Failed to reach Twin.', time: 'Now', source: 'Error' }])
        } finally { setLoading(false) }
    }

    const handleAction = async (action, actionData) => {
        if (action === 'reject') {
            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Assistant', 
                text: `### ❌ Task Cancelled\n\n*The proposed action (${actionData.intent}) has been rejected and will not be executed.*`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }])
            return
        }
        const token = useStore.getState().auth?.user?.accessToken;

        if (!token) {
            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Assistant',
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
                role: 'ai', sender: 'Assistant', 
                text: `### ✅ Execution Successful\n\n**Action:** ${
                    actionData.intent === 'email' ? 'Email sent to ' + actionData.to : 
                    actionData.intent === 'slack' ? 'Slack message posted to #' + (actionData.channel_name || actionData.channel_id) :
                    actionData.intent === 'telegram' ? 'Notification pushed to your Telegram' : 
                    'Calendar event scheduled'
                }\n\n*Your Twin has completed this task. You can check the history for details.*`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }])
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'ai', sender: 'Assistant',
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

            {/* Sidebar */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ x: -280, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -280, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="bg-surface-container-low border-r border-neutral/5 flex flex-col z-40 fixed lg:relative h-full w-[280px]"
                    >
                        {/* New chat button */}
                        <div className="p-3 border-b border-white/5 flex items-center gap-2">
                            <button onClick={handleNewChat} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:brightness-110 text-white text-sm font-bold transition-all shadow-lg shadow-primary/20">
                                <Plus size={15} /> New Chat
                            </button>
                            <button
                                onClick={() => {
                                    const text = messages.map(m => `${m.role === 'ai' ? 'Assistant' : 'You'} (${m.time}):\n${m.text}`).join('\n\n---\n\n');
                                    const blob = new Blob([text], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a'); a.href = url;
                                    a.download = `chat-${sessionId}.txt`; a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                title="Export conversation"
                                className="p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-neutral hover:text-on-surface transition-all border border-neutral/10"
                            >
                                <Download size={15} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-3 pt-2 pb-1">
                            <div className="flex items-center gap-2 bg-surface-base rounded-xl px-3 py-2 border border-neutral/10">
                                <Search size={13} className="text-neutral/50 shrink-0" />
                                <input
                                    value={sessionSearch}
                                    onChange={e => setSessionSearch(e.target.value)}
                                    placeholder="Search chats..."
                                    className="bg-transparent text-xs outline-none flex-1 text-on-surface placeholder:text-neutral/40"
                                />
                                {sessionSearch && <button onClick={() => setSessionSearch('')}><X size={12} className="text-neutral/50 hover:text-neutral" /></button>}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar p-2 space-y-1">
                            {sessions
                                .filter(s => !sessionSearch || (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase()))
                                .map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => { setSessionId(s.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                        className={`group flex items-center justify-between w-full p-3 rounded-xl cursor-pointer transition-all ${sessionId === s.id ? 'bg-primary/20 text-white' : 'hover:bg-white/5 text-neutral'}`}
                                    >
                                        <div className="flex flex-col truncate w-full pr-2">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare size={14} className={sessionId === s.id ? 'text-primary' : 'text-neutral/70'} />
                                                <span className="text-sm font-medium truncate">{s.title || 'New Chat'}</span>
                                            </div>
                                            {s.updatedAt && <span className="text-[10px] text-neutral/40 ml-5 mt-0.5">{new Date(s.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
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
                <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 bg-surface-base/80 backdrop-blur-3xl sticky top-0 z-40 border-b border-neutral/5 shrink-0">
                    <div className="flex items-center gap-2 lg:gap-3">
                        <button onClick={() => setView('home')} className="lg:hidden p-2 hover:bg-white/5 rounded-xl text-neutral transition-colors mr-[-4px]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                        </button>
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-xl text-neutral transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                        </button>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden shadow-lg ai-glow">
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h2 className="font-manrope font-extrabold text-base tracking-tight">Assistant</h2>
                            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /><span className="text-[10px] text-neutral font-bold uppercase tracking-widest">{sessions.find(s => s.id === sessionId)?.title || 'New Conversation'}</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {autoMode && <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-widest"><Zap size={10} fill="currentColor" /> Auto</span>}
                    </div>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 lg:px-10 py-6 lg:py-8 space-y-6 lg:space-y-10 custom-scrollbar">
                    {/* Suggested prompts when chat is empty */}
                    {messages.length <= 1 && !loading && (
                        <div className="space-y-4">
                            <p className="text-center text-xs text-neutral/50 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5"><Sparkles size={12} /> Try asking</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                                {[
                                    { icon: Mail, label: 'Summarize my inbox', prompt: 'Show me my most important unread emails' },
                                    { icon: Calendar, label: 'Check my schedule', prompt: "What meetings do I have today?" },
                                    { icon: Zap, label: 'Generate a report', prompt: 'Generate a PDF report on my assistant activity for this month' },
                                    { icon: Sparkles, label: 'Visualize data', prompt: 'Create a bar chart showing monthly revenue trends for a SaaS company' },
                                ].map(({ icon: Icon, label, prompt }) => (
                                    <button
                                        key={label}
                                        onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-neutral/10 hover:border-primary/20 text-left transition-all group"
                                    >
                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0"><Icon size={14} /></div>
                                        <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => <ChatMessage key={msg.id || i} msg={msg} onAction={handleAction} autoApprove={autoMode} user={user} />)}
                    {loading && <div key="loading-indicator" className="flex gap-3 lg:gap-5 animate-pulse"><div className="w-9 h-9 lg:w-11 lg:h-11 rounded-2xl bg-primary/10 shrink-0" /><div className="bg-surface-container-low px-4 py-3 rounded-3xl text-sm italic opacity-50 flex items-center gap-2"><Loader2 className="animate-spin" size={14} />Twin is thinking...</div></div>}
                    <div ref={endRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 lg:p-6 bg-surface-base border-t border-neutral/5">
                    <form onSubmit={handleSend} className="max-w-4xl mx-auto">
                        <input type="file" id="file-upload" multiple className="hidden"
                            onChange={async (e) => {
                                const files = Array.from(e.target.files);
                                const fileData = await Promise.all(files.map(file => new Promise(resolve => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve({ name: file.name, type: file.type, data: reader.result });
                                    reader.readAsDataURL(file);
                                })));
                                setAttachedFiles(prev => [...prev, ...fileData]);
                                e.target.value = null;
                            }}
                        />
                        <div className="bg-surface-container/80 backdrop-blur-3xl rounded-2xl lg:rounded-[1.75rem] flex flex-col shadow-2xl border border-neutral/10 focus-within:border-primary/30 transition-all">
                            {attachedFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2 p-3 px-4 pb-0">
                                    {attachedFiles.map((f, i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 rounded-lg border border-primary/20">
                                            <FileIcon size={11} />
                                            <span className="truncate max-w-[100px]">{f.name}</span>
                                            <button type="button" onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-400 ml-0.5">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
                                {INTENT_OPTIONS.map(option => (
                                    <button key={option.key}
                                        type="button"
                                        onClick={() => setSelectedIntent(option.key)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${selectedIntent === option.key ? 'bg-primary text-white' : 'bg-surface-container text-on-surface hover:bg-primary/10'}`}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-end gap-2 pl-4 lg:pl-5 pr-2 py-2">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={e => {
                                        setInput(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() || attachedFiles.length > 0) handleSend();
                                        }
                                    }}
                                    disabled={loading}
                                    placeholder="Instruct your Twin... (Enter to send, Shift+Enter for new line)"
                                    rows={1}
                                    className="bg-transparent flex-1 py-2 outline-none text-sm placeholder:text-neutral/40 resize-none leading-relaxed min-h-[40px] max-h-[160px] overflow-y-auto"
                                />
                                <div className="flex items-center gap-1 pb-1">
                                    <button type="button" onClick={() => document.getElementById('file-upload').click()}
                                        title="Attach file" className="p-2 text-neutral/60 hover:text-primary transition-colors rounded-lg hover:bg-primary/5">
                                        <Paperclip size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        title={isListening ? 'Stop voice input' : 'Voice input'}
                                        onClick={() => {
                                            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
                                            if (!SR) { alert('Speech recognition not supported in this browser.'); return; }
                                            if (isListening) {
                                                recognitionRef.current?.stop();
                                                setIsListening(false);
                                                return;
                                            }
                                            const r = new SR();
                                            r.continuous = false;
                                            r.interimResults = false;
                                            r.lang = 'en-US';
                                            r.onresult = (ev) => { setInput(prev => (prev + ' ' + ev.results[0][0].transcript).trim()); };
                                            r.onend = () => setIsListening(false);
                                            r.onerror = () => setIsListening(false);
                                            recognitionRef.current = r;
                                            r.start();
                                            setIsListening(true);
                                        }}
                                        className={`p-2 rounded-lg transition-all ${isListening ? 'text-red-500 bg-red-500/10 animate-pulse' : 'text-neutral/60 hover:text-primary hover:bg-primary/5'}`}
                                    >
                                        {isListening ? <MicOff size={17} /> : <MicIcon size={17} />}
                                    </button>
                                    <button type="submit"
                                        disabled={(!input.trim() && attachedFiles.length === 0) || loading}
                                        className="bg-primary text-white h-9 w-9 lg:h-10 lg:w-10 rounded-xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all">
                                        <Send size={15} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Chat;