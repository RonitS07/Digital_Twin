import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/apiClient'
import { API_BASE } from '../config'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Calendar,
    Mail,
    Plus,
    Clock,
    Paperclip,
    ImagePlus,
    Mic as MicIcon,
    MicOff,
    Copy,
    Check,
    Loader2,
    MessageSquare,
    MessageCircle,
    Trash2,
    Zap,
    File as FileIcon,
    FileText,
    Search,
    Download,
    Sparkles,
    ExternalLink,
    X
} from 'lucide-react'
import { useStore } from '../store/useStore'
import VisualizationRenderer from './VisualizationRenderer'
import FileDownloadCard from './FileDownloadCard'
import SlotProposalCard from './SlotProposalCard'
import ConflictCard from './ConflictCard'
import AetherVoiceMode from './AetherVoiceMode'

function UserAvatar({ user, className = '' }) {
    const [imgFailed, setImgFailed] = useState(false)
    const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase()
        || user?.email?.slice(0, 2).toUpperCase() || 'U'
    const showPhoto = user?.photoURL && !imgFailed

    return (
        <div className={`w-9 h-9 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden bg-primary/5 text-primary border border-primary/10 ${className}`}>
            {showPhoto ? (
                <img
                    src={user.photoURL}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <span className="text-[10px] lg:text-xs font-bold">{initials}</span>
            )}
        </div>
    )
}

const formatRelativeTime = (dateStr) => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr)
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

const getActionTitle = (action) => {
    if (!action) return 'Pending Action'
    const intent = action.intent || ''
    const map = {
        email_send: `Send email to ${action.to || '...'}`,
        email: `Send email to ${action.to || '...'}`,
        slack_send: `Post to ${action.channel_name || '#channel'}`,
        slack: `Post to ${action.channel_name || '#channel'}`,
        telegram_send: 'Send Telegram message',
        telegram: 'Send Telegram message',
        whatsapp_send: `WhatsApp → ${action.to || '...'}`,
        whatsapp: `WhatsApp → ${action.to || '...'}`,
        calendar_create: `Schedule: ${action.summary || action.title || 'Meeting'}`,
        calendar: `Schedule: ${action.summary || action.title || 'Meeting'}`,
        twin_message: 'Send twin message',
        schedule_with_twin: 'Schedule meeting with twin',
    }
    return map[intent] || action.subject || intent || 'Pending Action'
}

// Intent pills removed — classifier handles routing automatically

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

const resolveImageSrc = (src) => {
    if (!src) return src
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) return src
    return `${API_BASE}${src.startsWith('/') ? src : `/${src}`}`
}

// Image loader with skeleton
const ImageLoader = ({ src }) => {
    const [status, setStatus] = useState('loading')
    const resolvedSrc = resolveImageSrc(src)
    useEffect(() => { setStatus('loading') }, [resolvedSrc])
    return (
        <div className="relative rounded-xl overflow-hidden w-full bg-surface-container-highest min-h-[200px]">
            {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}
            <img
                src={resolvedSrc}
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
    const actionMatchRef = msg.text ? msg.text.match(/<action>([\s\S]*?)<\/action>/) : null;
    let actionHashStr = null;
    if (actionMatchRef) {
        let hash = 0;
        const str = actionMatchRef[1].trim();
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        actionHashStr = `action_lock_${hash}`;
    }

    // Seed from localStorage so the lock survives page reloads and ID changes
    const actionStorageKey = actionHashStr || (msg.id ? `action_lock_${msg.id}` : null)

    const [isExecuted, setIsExecuted] = useState(() => {
        if (!actionStorageKey) return false
        return !!localStorage.getItem(actionStorageKey)
    })
    const [actionStatus, setActionStatus] = useState(() => {
        if (!actionStorageKey) return null
        return localStorage.getItem(`${actionStorageKey}_status`) || null
    })
    const [lightboxSrc, setLightboxSrc] = useState(null)
    const [copied, setCopied] = useState(false)


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
                    // Use a ref-captured version to avoid stale closure
                    const timer = setTimeout(() => handleActionClick('approve', parsed), 2500);
                    return () => clearTimeout(timer);
                }
            } catch (e) {
                console.error("Action parse failed", e)
            }
        }
    }, [msg.text, autoApprove, autoCompleted])

    const markExecuted = (status) => {
        setIsExecuted(true)
        setActionStatus(status)
        // Persist so the card stays locked after page reload
        if (actionStorageKey) {
            localStorage.setItem(actionStorageKey, '1')
            localStorage.setItem(`${actionStorageKey}_status`, status)
        }
    }

    const handleActionClick = async (type, data) => {
        if (isExecuted) return;

        if (type === 'reject') {
            markExecuted('rejected')
            return;
        }

        setIsProcessing(true)
        try {
            await onAction(type, data)
            markExecuted('approved')
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
                {isAi ? (
                    <div className="w-9 h-9 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden bg-primary/10 text-primary border border-primary/20">
                        <img src="/logo.png" alt="Aether" className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <UserAvatar user={user} />
                )}

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
                        ? 'bg-white/80 backdrop-blur-md border border-neutral/10 rounded-tl-none text-on-surface'
                        : 'bg-gradient-to-br from-[#6E5AFF] to-[#00B4E6] text-white rounded-tr-none shadow-[#6E5AFF]/20'
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
                        {/* file_summary card */}
                        {(msg.responseType === 'file_summary' || msg.response_type === 'file_summary') && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
                                <FileText size={20} className="text-primary flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-white/60 uppercase tracking-wider">File Summary</p>
                                    <p className="text-sm text-white/80">{msg.file_name || msg.fileName || 'Uploaded file'}</p>
                                </div>
                            </div>
                        )}

                        {(msg.responseType === "visual" || msg.response_type === "visual" || msg.source === "VISUAL") ? (
                            <div className="space-y-3 lg:space-y-4">
                                <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                                {(msg.imageUrl || msg.image_url) && (
                                    <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
                                        <ImageLoader src={msg.imageUrl || msg.image_url} />
                                        {(msg.imagePrompt || msg.image_prompt) && (
                                            <p className="text-xs text-white/40 mt-1 px-1">{msg.imagePrompt || msg.image_prompt}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm leading-relaxed break-words">
                                <SimpleMarkdown>{cleanText}</SimpleMarkdown>
                            </div>
                        )}

                        {/* scheduling_proposal card */}
                        {(msg.responseType === 'scheduling_proposal' || msg.response_type === 'scheduling_proposal') && msg.slots && (
                            <SlotProposalCard
                                slots={msg.slots}
                                target={msg.target_twin}
                                msgId={msg.msg_id}
                                onConfirm={(slotIndex) => onAction && onAction('confirm_slot', { msg_id: msg.msg_id, slot_index: slotIndex })}
                            />
                        )}

                        {/* conflict card */}
                        {(msg.responseType === 'conflict' || msg.response_type === 'conflict') && (
                            <ConflictCard
                                conflict={msg.conflict}
                                alternatives={msg.alternatives || []}
                                onSelect={(slot) => onAction && onAction('select_alternative', slot)}
                            />
                        )}

                        {/* Generated file card */}
                        {msg.generatedFile && msg.responseType !== 'visual' && msg.response_type !== 'visual' && (
                            <FileDownloadCard fileData={msg.generatedFile} />
                        )}

                        {/* Interactive visualization */}
                        {(msg.chartData || msg.chart_data || msg.vizConfig) && (
                            <div className="mt-4">
                                <VisualizationRenderer config={msg.chartData || msg.chart_data || msg.vizConfig} />
                            </div>
                        )}

                        {actionData && (
                            <div className={`mt-6 p-5 rounded-2xl border space-y-4 transition-all ${actionData.is_conflict
                                ? 'bg-amber-50/80 border-amber-500/30 ring-1 ring-amber-500/10'
                                : 'bg-white/60 border-neutral/10 shadow-sm'
                                }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {actionData.intent === 'email' || actionData.intent === 'email_send' ? <Mail size={16} className={`${actionData.is_conflict ? 'text-amber-500' : 'text-primary'}`} /> :
                                            actionData.intent === 'slack' || actionData.intent === 'slack_send' ? <Zap size={16} className="text-[#36C5F0]" /> :
                                                actionData.intent === 'telegram' || actionData.intent === 'telegram_send' ? <MessageSquare size={16} className="text-secondary" /> :
                                                    actionData.intent === 'whatsapp' || actionData.intent === 'whatsapp_send' ? <MessageSquare size={16} className="text-green-400" /> :
                                                        <Calendar size={16} className={`${actionData.is_conflict ? 'text-amber-500' : 'text-secondary'}`} />}
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${actionData.is_conflict ? 'text-amber-500' : 'text-on-surface-variant/70'}`}>
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
                                    <h4 className="text-sm font-bold text-on-surface">{getActionTitle(actionData)}</h4>
                                    {(actionData.intent === 'email' || actionData.intent === 'email_send') && <p className="text-xs text-on-surface-variant">To: <span className="font-mono text-[#00B4E6]">{actionData.to}</span></p>}
                                    {(actionData.intent === 'slack' || actionData.intent === 'slack_send') && <p className="text-xs text-on-surface-variant">Channel: <span className="font-mono text-[#00B4E6]">#{actionData.channel_name || actionData.channel_id}</span></p>}
                                    {(actionData.intent === 'telegram' || actionData.intent === 'telegram_send') && <p className="text-xs text-on-surface-variant">Action: <span className="font-mono text-[#00B4E6]">Push Notification</span></p>}
                                    {(actionData.intent === 'whatsapp' || actionData.intent === 'whatsapp_send') && (
                                        <>
                                            <p className="text-xs text-on-surface-variant">To: <span className="font-mono text-green-600">{actionData.to || '...'}</span></p>
                                            {actionData.message && <p className="text-xs text-on-surface-variant/80 italic mt-1">"{actionData.message}"</p>}
                                        </>
                                    )}
                                    {actionData.intent === 'calendar' && (
                                        <div className="flex items-center gap-2">
                                            <Clock size={12} className="text-neutral" />
                                            <p className="text-xs text-on-surface-variant font-mono">
                                                {new Date(actionData.start_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-xs text-neutral line-clamp-2 mt-2 italic">{actionData.body || actionData.description}</p>
                                </div>

                                <div className={`flex gap-2 pt-2 ${isExecuted ? 'pointer-events-none select-none' : ''}`}>
                                    {isExecuted ? (
                                        <div className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-between border ${actionStatus === 'approved'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                                            }`}>
                                            <span className="flex items-center gap-2">
                                                {actionStatus === 'approved' ? <><Check size={14} /> Action Executed</> : <><X size={14} /> Request Rejected</>}
                                            </span>
                                            <span className="text-[9px] uppercase tracking-widest opacity-50 font-black">Locked</span>
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
                                                className="px-4 py-2 bg-black/5 text-on-surface-variant text-xs font-bold rounded-xl hover:bg-black/10 transition-all disabled:opacity-50"
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
    const [loading, setLoading] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState([])
    const [plusOpen, setPlusOpen] = useState(false)
    const [pendingIntentHint, setPendingIntentHint] = useState('auto')
    const endRef = useRef(null)
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)
    const plusRef = useRef(null)
    const exportRef = useRef(null)
    const [exportMenuOpen, setExportMenuOpen] = useState(false)

    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem(`chat_sessions_${user.uid}`)
        return saved ? JSON.parse(saved) : []
    })
    const [sessionId, setSessionId] = useState(() => localStorage.getItem(`chat_active_session_${user.uid || 'anon'}`) || '')
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024)
    const [sessionSearch, setSessionSearch] = useState('')
    const [isListening, setIsListening] = useState(false)
    const activeSessionIdRef = useRef(sessionId)
    const [sessionToDelete, setSessionToDelete] = useState(null)
    const [showVoiceMode, setShowVoiceMode] = useState(false)
    const pendingVoiceActionRef = useRef(null)

    const [autoMode, setAutoMode] = useState(false)
    const [fetchingSessions, setFetchingSessions] = useState(false)
    const [fetchingMessages, setFetchingMessages] = useState(false)
    // Keep a ref to the current sessionId so fetchSessions can read it without being in its own deps
    const sessionIdRef = useRef(sessionId)
    useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

    const handleMicClick = () => {
        setShowVoiceMode(true);
    };

    const handleCloseVoiceMode = () => {
        pendingVoiceActionRef.current = null;
        setShowVoiceMode(false);
    };

    // Close menus on outside click
    useEffect(() => {
        const handler = (e) => {
            if (plusRef.current && !plusRef.current.contains(e.target)) {
                setPlusOpen(false)
            }
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setExportMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])



    // Ctrl+U / Cmd+U opens file picker
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                e.preventDefault()
                fileInputRef.current?.click()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    const setInputValue = (text) => {
        setInput(text)
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus()
                // move cursor to end
                textareaRef.current.selectionStart = text.length
                textareaRef.current.selectionEnd = text.length
            }
        }, 50)
    }

    const menuItems = [
        {
            icon: Paperclip,
            label: 'Add photos & files',
            hint: null,
            shortcut: 'Ctrl+U',
            action: () => fileInputRef.current?.click()
        },
        {
            icon: ImagePlus,
            label: 'Create image',
            hint: null,
            shortcut: null,
            action: () => { setInputValue('Generate an image of '); setPendingIntentHint('visual'); }
        },
        {
            icon: Calendar,
            label: 'Schedule meeting',
            hint: null,
            shortcut: null,
            action: () => { setInputValue('Schedule a meeting with '); setPendingIntentHint('calendar_create'); }
        },
        {
            icon: Mail,
            label: 'Draft email',
            hint: null,
            shortcut: null,
            action: () => { setInputValue('Draft an email to '); setPendingIntentHint('email_draft'); }
        },
        {
            icon: FileText,
            label: 'Analyze file',
            hint: null,
            shortcut: null,
            action: () => { fileInputRef.current?.click(); setPendingIntentHint('file_read'); }
        },
        {
            icon: MessageCircle,
            label: 'Post to Slack',
            hint: null,
            shortcut: null,
            action: () => { setInputValue('Post to #'); setPendingIntentHint('slack_send'); }
        },
        {
            icon: MessageSquare,
            label: 'Send Telegram',
            hint: null,
            shortcut: null,
            action: () => { setInputValue('Send via Telegram: '); setPendingIntentHint('telegram_send'); }
        },
    ]

    const newSessionId = () => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`

    const fetchSessions = useCallback(async () => {
        if (!user.uid) return;
        setFetchingSessions(true);
        try {
            const data = await apiFetch('/sessions');
            if (data.sessions) {
                setSessions(data.sessions.sort((a, b) => b.updatedAt - a.updatedAt));
                // Read sessionId via ref to avoid fetchSessions being recreated when sessionId changes
                if (!sessionIdRef.current && data.sessions.length > 0) {
                    setSessionId(data.sessions[0].id);
                } else if (!sessionIdRef.current) {
                    handleNewChat();
                }
            }
        } catch (err) {
            console.error("Failed to fetch sessions", err);
        } finally {
            setFetchingSessions(false);
        }
    }, [user.uid]);

    const loadMessages = useCallback(async (sid) => {
        if (!user.uid || !sid) return;
        setFetchingMessages(true);
        try {
            // /history now returns a flat array of {role, content, ...} pairs
            const data = await apiFetch(`/history?session_id=${sid}`);

            // Stale check: if the user switched chats while this request was pending, discard it!
            if (activeSessionIdRef.current !== sid) return;

            // Support both new flat array and legacy {history:[]} envelope
            const rawList = Array.isArray(data) ? data : (data.history || []);

            if (rawList.length > 0) {
                const mapped = rawList.map(h => ({
                    id: h.id,
                    role: h.role === 'assistant' ? 'ai' : (h.role || 'user'),
                    sender: h.role === 'assistant' ? 'Assistant' : (user.name || 'You'),
                    // New format uses h.content; legacy format used h.input / h.output
                    text: h.content ?? (h.role === 'user' ? h.input : h.output) ?? '',
                    time: h.timestamp
                        ? new Date(h.timestamp).toLocaleTimeString([], { timeStyle: 'short' })
                        : '',
                    responseType: h.response_type || h.metadata?.response_type || 'text',
                    imageUrl: h.image_url || h.metadata?.image_url || null,
                    vizConfig: h.metadata?.viz_config || null,
                    chartData: h.metadata?.chart_data || null,
                    generatedFile: h.metadata?.generated_file || null,
                    attachments: h.metadata?.attachments || [],
                    source: h.metadata?.source || h.intent?.toUpperCase() || (h.role === 'assistant' ? 'AI' : 'Web'),
                }));
                setMessages(mapped);
            } else {
                setMessages([{
                    id: 'init', role: 'ai', sender: 'Assistant',
                    text: `Hello ${user.name?.split(' ')[0] || 'there'}. How can I assist you?`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
                }]);
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            if (activeSessionIdRef.current === sid) {
                setFetchingMessages(false);
            }
        }
    }, [user.uid, user.name]);

    useEffect(() => {
        if (user.uid) {
            fetchSessions();
        }
    }, [user.uid]);

    useEffect(() => {
        activeSessionIdRef.current = sessionId;
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

    const handleNewChat = async () => {
        const sid = newSessionId()
        setSessionId(sid)
        const initMsg = [{
            id: 'init', role: 'ai', sender: 'Assistant',
            text: `Hello. Start a new session whenever you're ready.`,
            time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'System'
        }]
        setMessages(initMsg)
        setSessions(prev => [{ id: sid, title: 'New Chat', updatedAt: Date.now(), created_at: new Date().toISOString() }, ...prev])
        if (preferences.memoryRetention !== false) {
            localStorage.setItem(`chat_history_${user.uid}_${sid}`, JSON.stringify(initMsg))
        }
        if (window.innerWidth < 1024) setIsSidebarOpen(false);
        // Persist session creation to backend so it survives page refresh
        try {
            await apiFetch('/sessions/create', { method: 'POST', body: JSON.stringify({ session_id: sid }) })
        } catch (_) {
            // Non-blocking: session becomes permanent once the first message is sent
        }
    }

    const exportChat = (format) => {
        const activeSession = sessions.find(s => s.id === sessionId);
        const chatTitle = activeSession?.title || 'New Chat';

        if (format === 'md') {
            let md = `# ${chatTitle}\n`;
            md += `*Session Ref:* \`${sessionId}\`\n`;
            md += `*Generated on:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST\n\n`;
            md += `---\n\n`;

            messages.forEach(m => {
                const isAi = m.role === 'ai' || m.role === 'assistant';
                const sender = isAi ? '🤖 Assistant' : '👤 User';
                md += `### ${sender} (${m.time || ''})\n\n${m.text}\n\n`;
            });

            md += `---\n*Generated by Digital Twin Core · Secure Neural Export*`;

            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `digital-twin-export-${sessionId}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } else if (format === 'txt') {
            let txt = `=========================================\n`;
            txt += `DIGITAL TWIN CONVERSATION EXPORT\n`;
            txt += `=========================================\n`;
            txt += `Title: ${chatTitle}\n`;
            txt += `Session Ref: ${sessionId}\n`;
            txt += `Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST\n`;
            txt += `=========================================\n\n`;

            messages.forEach(m => {
                const isAi = m.role === 'ai' || m.role === 'assistant';
                const sender = isAi ? 'ASSISTANT' : 'USER';
                txt += `[${m.time || ''}] ${sender}:\n`;
                txt += `${m.text}\n\n`;
                txt += `-----------------------------------------\n\n`;
            });

            txt += `End of Export.\n`;

            const blob = new Blob([txt], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `digital-twin-export-${sessionId}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        } else if (format === 'html') {
            const totalMsgs = messages.length;
            const userMsgs = messages.filter(m => m.role === 'user').length;
            const aiMsgs = messages.filter(m => m.role === 'ai' || m.role === 'assistant').length;
            const wordCount = messages.reduce((acc, m) => acc + (m.text || '').split(/\s+/).filter(Boolean).length, 0);

            const messageHTML = messages.map((m, idx) => {
                const isAi = m.role === 'ai' || m.role === 'assistant';
                return `
                    <div class="message-row ${isAi ? 'ai-row' : 'user-row'}">
                        <div class="message-bubble" style="animation-delay: ${idx * 0.05}s">
                            <div class="msg-meta">
                                <span class="msg-sender">${isAi ? '🤖 Assistant' : '👤 Executive User'}</span>
                                <span class="msg-time">${m.time || ''}</span>
                            </div>
                            <div class="msg-content" data-raw-text="${encodeURIComponent(m.text || '')}"></div>
                        </div>
                    </div>
                `;
            }).join('');

            const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aether Intelligence Export - ${chatTitle}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,500&family=JetBrains+Mono:wght@400;500&display=swap');
        
        :root {
            /* Daylight Theme */
            --bg-base: #F7F5F2;
            --surface: #FFFFFF;
            --surface-border: #E8E4DE;
            --text-primary: #1A1814;
            --text-secondary: #7A7065;
            --text-meta: #A09488;
            --accent: #2D6A4F;
            --accent-light: #E8F5EE;
            
            --message-user-bg: #E8F5EE;
            --message-user-border: #FCDCD0;
            --message-ai-bg: #FFFFFF;
            --message-ai-border: #E8E4DE;
            
            --shadow: 0 4px 24px rgba(26, 24, 20, 0.04);
            --search-bg: #FFFFFF;
            --button-bg: #FFFFFF;
            --button-hover: #F0F0EE;
        }

        .dark-theme {
            /* Twilight Theme */
            --bg-base: #1A1814;
            --surface: #23211C;
            --surface-border: #322F2A;
            --text-primary: #F7F5F2;
            --text-secondary: #A09488;
            --text-meta: #7A7065;
            --accent: #3D8A62;
            --accent-light: #2A211D;
            
            --message-user-bg: #2A211D;
            --message-user-border: #3D2D26;
            --message-ai-bg: #23211C;
            --message-ai-border: #322F2A;
            
            --shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
            --search-bg: #23211C;
            --button-bg: #23211C;
            --button-hover: #322F2A;
        }

        * {
            box-sizing: border-box;
            transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: 'DM Sans', system-ui, sans-serif;
            margin: 0;
            padding: 60px 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .container {
            max-width: 800px;
            width: 100%;
            background: var(--surface);
            border: 1px solid var(--surface-border);
            border-radius: 20px;
            padding: 40px;
            box-shadow: var(--shadow);
            position: relative;
        }

        header {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            border-bottom: 1px solid var(--surface-border);
            padding-bottom: 30px;
            margin-bottom: 30px;
        }

        .brand-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        }

        .brand-logo {
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: var(--accent);
            box-shadow: 0 0 10px rgba(192, 96, 58, 0.2);
            position: relative;
        }

        .brand-logo::after {
            content: '';
            position: absolute;
            top: 6px;
            left: 6px;
            right: 6px;
            bottom: 6px;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 50%;
        }

        .brand-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.12em;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        h1 {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 2.2rem;
            font-weight: 400;
            margin: 0 0 8px 0;
            color: var(--text-primary);
            letter-spacing: -0.01em;
        }

        .doc-meta {
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            color: var(--text-meta);
            margin: 0;
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
        }

        .doc-meta span {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .doc-meta span:not(:last-child)::after {
            content: '•';
            margin-left: 16px;
            color: var(--surface-border);
        }

        .stats-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            width: 100%;
            margin-top: 30px;
            border-top: 1px solid var(--surface-border);
            padding-top: 24px;
        }

        .stat-card {
            display: flex;
            flex-direction: column;
        }

        .stat-val {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 1.6rem;
            font-weight: 300;
            color: var(--accent);
        }

        .stat-lbl {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 30px;
            flex-wrap: wrap;
            width: 100%;
        }

        .search-container {
            position: relative;
            flex: 1;
            min-width: 240px;
        }

        .search-input {
            width: 100%;
            background: var(--search-bg);
            border: 1px solid var(--surface-border);
            border-radius: 10px;
            padding: 10px 14px 10px 36px;
            color: var(--text-primary);
            font-family: 'DM Sans', sans-serif;
            font-size: 13px;
            outline: none;
        }

        .search-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(192, 96, 58, 0.08);
        }

        .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            width: 14px;
            height: 14px;
            color: var(--text-meta);
            pointer-events: none;
        }

        .btn-group {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            background: var(--button-bg);
            border: 1px solid var(--surface-border);
            border-radius: 8px;
            padding: 10px 14px;
            color: var(--text-primary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .action-btn:hover {
            background: var(--button-hover);
        }

        .chat-flow {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .message-row {
            display: flex;
            width: 100%;
        }

        .message-row.user-row {
            justify-content: flex-end;
        }

        .message-row.ai-row {
            justify-content: flex-start;
        }

        .message-bubble {
            max-width: 85%;
            border-radius: 12px;
            padding: 20px 24px;
            border: 1px solid var(--surface-border);
            background: var(--surface);
        }

        .user-row .message-bubble {
            background: var(--message-user-bg);
            border-color: var(--message-user-border);
            border-top-right-radius: 3px;
        }

        .ai-row .message-bubble {
            background: var(--message-ai-bg);
            border-color: var(--message-ai-border);
            border-left: 3px solid var(--accent);
            border-top-left-radius: 3px;
        }

        .msg-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .user-row .msg-meta {
            color: var(--text-secondary);
        }

        .ai-row .msg-meta {
            color: var(--accent);
        }

        .msg-time {
            color: var(--text-meta);
        }

        .msg-content {
            font-size: 14px;
            line-height: 1.6;
            word-break: break-word;
        }

        .msg-content p {
            margin: 0 0 12px 0;
        }

        .msg-content p:last-child {
            margin-bottom: 0;
        }

        .msg-content ul, .msg-content ol {
            margin: 0 0 12px 0;
            padding-left: 20px;
        }

        .msg-content li {
            margin-bottom: 4px;
        }

        .inline-code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            background: rgba(192, 96, 58, 0.06);
            color: var(--accent);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .code-block {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            background: var(--bg-base);
            border: 1px solid var(--surface-border);
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 12px 0;
        }

        .highlight {
            background: rgba(192, 96, 58, 0.15);
            border-bottom: 2px solid var(--accent);
            color: inherit;
        }

        footer {
            margin-top: 40px;
            text-align: center;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: var(--text-meta);
            border-top: 1px solid var(--surface-border);
            padding-top: 20px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        @media print {
            body {
                background: white !important;
                color: black !important;
                padding: 0;
            }
            .container {
                border: none !important;
                box-shadow: none !important;
                background: transparent !important;
                padding: 0;
            }
            .controls, .action-btn {
                display: none !important;
            }
            .message-bubble {
                max-width: 100% !important;
                page-break-inside: avoid;
            }
        }

        @media (max-width: 640px) {
            .container {
                padding: 24px 16px;
            }
            .stats-row {
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
            }
            .message-bubble {
                max-width: 95%;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="brand-badge">
                <div class="brand-logo"></div>
                <div class="brand-name">Aether OS • Digital Twin</div>
            </div>
            <h1>${chatTitle}</h1>
            <div class="doc-meta">
                <span id="ref-id">Ref // ${sessionId}</span>
                <span>Created // ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST</span>
            </div>
            
            <div class="stats-row">
                <div class="stat-card">
                    <span class="stat-val">${totalMsgs}</span>
                    <span class="stat-lbl">Total Messages</span>
                </div>
                <div class="stat-card">
                    <span class="stat-val">${userMsgs}</span>
                    <span class="stat-lbl">User Turns</span>
                </div>
                <div class="stat-card">
                    <span class="stat-val">${aiMsgs}</span>
                    <span class="stat-lbl">Agent Turns</span>
                </div>
                <div class="stat-card">
                    <span class="stat-val">${wordCount}</span>
                    <span class="stat-lbl">Word Count</span>
                </div>
            </div>
        </header>

        <div class="controls">
            <div class="search-container">
                <svg class="search-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" id="search-input" class="search-input" placeholder="Search transcript...">
            </div>
            
            <div class="btn-group">
                <button class="action-btn" id="theme-toggle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                    Dark Mode
                </button>
                <button class="action-btn" id="copy-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Text
                </button>
                <button class="action-btn" onclick="window.print()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print
                </button>
            </div>
        </div>

        <div class="chat-flow">
            ${messageHTML}
        </div>

        <footer>
            CONFIDENTIAL // EXECUTIVE LOG EXPORT // AETHER DIGITAL TWIN
        </footer>
    </div>

    <script>
        function parseMarkdown(text) {
            if (!text) return '';
            let html = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            html = html.replace(/\\x60\\x60\\x60([^\\x60]+)\\x60\\x60\\x60/g, (match, p1) => {
                return '<pre class="code-block"><code>' + p1.trim() + '</code></pre>';
            });

            html = html.replace(/\\x60([^\\x60\\n]+)\\x60/g, '<code class="inline-code">$1</code>');
            html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
            html = html.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
            html = html.replace(/^\\s*[-*+]\\s+(.+)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');

            const paragraphs = html.split(/\\n\\n+/);
            return paragraphs.map(p => {
                if (p.trim().startsWith('<pre') || p.trim().startsWith('<ul')) return p;
                return '<p>' + p.replace(/\\n/g, '<br>') + '</p>';
            }).join('');
        }

        document.querySelectorAll('.msg-content').forEach(el => {
            const raw = decodeURIComponent(el.getAttribute('data-raw-text'));
            el.innerHTML = parseMarkdown(raw);
            el.setAttribute('data-raw-html', el.innerHTML);
        });

        const toggleThemeBtn = document.getElementById('theme-toggle');
        toggleThemeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            toggleThemeBtn.innerHTML = isDark 
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> Light Mode'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Dark Mode';
        });

        const searchInput = document.getElementById('search-input');
        const messages = document.querySelectorAll('.message-row');
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            messages.forEach(row => {
                const bubble = row.querySelector('.message-bubble');
                const content = row.querySelector('.msg-content');
                const text = content.innerText.toLowerCase();
                
                if (!query) {
                    row.style.display = 'flex';
                    content.innerHTML = content.getAttribute('data-raw-html');
                    return;
                }
                
                if (text.includes(query)) {
                    row.style.display = 'flex';
                    const rawHTML = content.getAttribute('data-raw-html');
                    const regex = new RegExp(query.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&'), 'gi');
                    content.innerHTML = rawHTML.replace(regex, '<span class="highlight">$&</span>');
                } else {
                    row.style.display = 'none';
                }
            });
        });

        const copyBtn = document.getElementById('copy-btn');
        copyBtn.addEventListener('click', () => {
            let text = 'AETHER OS DIGITAL TWIN - INTEGRATION TRANSCRIPT\\\\n';
            text += 'Session Ref: ' + document.getElementById('ref-id').innerText + '\\\\n';
            text += '=========================================\\\\n\\\\n';
            
            messages.forEach(row => {
                const isUser = row.classList.contains('user-row');
                const sender = isUser ? 'EXECUTIVE USER' : 'AETHER ASSISTANT';
                const time = row.querySelector('.msg-time').innerText;
                const content = row.querySelector('.msg-content').innerText;
                text += '[' + time + '] ' + sender + ':\\\\n' + content + '\\\\n\\\\n';
            });
            
            navigator.clipboard.writeText(text).then(() => {
                const oldHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = oldHTML;
                }, 2000);
            });
        });
    </script>
</body>
</html>`;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `digital-twin-export-${sessionId}.html`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    const handleDeleteSession = (e, id) => {
        e.stopPropagation()
        setSessionToDelete(id)
    }

    const confirmDeleteSession = async () => {
        if (!sessionToDelete) return
        const id = sessionToDelete
        setSessionToDelete(null)

        // Optimistically update sessions list and gracefully shift active sessionId
        setSessions(prev => {
            const filtered = prev.filter(s => s.id !== id)
            if (sessionId === id) {
                if (filtered.length > 0) {
                    // Safe switch: change active tab to the next available chat session
                    setSessionId(filtered[0].id)
                } else {
                    // Safe fallback: open a brand new clean chat session
                    setTimeout(() => handleNewChat(), 0)
                }
            }
            return filtered
        })

        localStorage.removeItem(`chat_history_${user.uid}_${id}`)

        try {
            await apiFetch(`/sessions/${id}`, { method: 'DELETE' })
        } catch (err) {
            console.error("Failed to delete session from backend", err)
        } finally {
            // Always re-sync with server to ensure list is accurate
            try { await fetchSessions() } catch (_) {}
        }
    }

    const handleVoiceProcessText = async (text, pendingAction = null, voiceHistory = []) => {
        if (!user.uid) throw new Error("User not authenticated");

        const activePending = pendingAction ?? pendingVoiceActionRef.current;

        try {
            const data = await apiFetch('/ai/voice/process', {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    history: voiceHistory,
                    pending_action: activePending,
                })
            });

            if (data.pending_confirmation && data.pending_action) {
                pendingVoiceActionRef.current = data.pending_action;
            } else {
                pendingVoiceActionRef.current = null;
            }

            return {
                spoken: data.spoken_response,
                intent: data.intent,
                intentHint: data.intent_hint,
                pendingConfirmation: !!data.pending_confirmation,
                pendingAction: data.pending_action || null,
                contactOptions: data.contact_options || null,
            };
        } catch (err) {
            console.error('Voice process error:', err);
            pendingVoiceActionRef.current = null;
            const fallback = "Sorry, something went wrong. Please try again.";
            return { spoken: fallback, pendingConfirmation: false, pendingAction: null, contactOptions: null };
        }
    };

    const handleSend = async (e) => {
        if (e) e.preventDefault()

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
                    intent_hint: pendingIntentHint
                })
            })
            setPendingIntentHint('auto')
            const aiMsg = {
                id: data.msg_id || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: 'ai', sender: 'Assistant',
                text: data.output, time: new Date().toLocaleTimeString([], { timeStyle: 'short' }),
                source: data.intent?.toUpperCase() || 'AI', responseType: data.response_type, imageUrl: data.image_url,
                generatedFile: data.generated_file || null,
                chartData: data.chart_data || null,
                vizConfig: data.viz_config || null,
            }
            setMessages(prev => {
                const newMessages = [...prev, aiMsg];
                // Trigger Smart Title generation after the 1st and 2nd exchange (2 and 4 messages total)
                if (newMessages.length === 2 || newMessages.length === 4) {
                    apiFetch('/ai/generate-title', {
                        method: 'POST',
                        body: JSON.stringify({ session_id: sessionId, history: newMessages.map(m => ({ role: m.role, text: m.text })) })
                    }).then(res => {
                        if (res.title) {
                            setSessions(sPrev => sPrev.map(s => s.id === sessionId ? { ...s, title: res.title } : s));
                        }
                    }).catch(console.error);
                }
                return newMessages;
            });
        } catch (err) {
            setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'ai', sender: 'Error', text: 'Failed to reach Twin. Please check your connection and try again.', time: 'Now', source: 'Error' }])
        } finally { setLoading(false) }
    }

    const handleFileSelect = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        // Load for UI preview
        const fileDataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });

        const token = useStore.getState().auth?.user?.accessToken
        const formData = new FormData()
        formData.append('file', file)
        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            })
            if (!res.ok) throw new Error('Upload failed')
            const { file_path, file_name } = await res.json()

            // inject a user message and trigger AI process with file_path
            const msgText = `Summarise this file: ${file_name}`
            setInput(msgText)

            // auto-send
            const msgId = `user-${Date.now()}`
            const userMsg = {
                id: msgId, role: 'user', sender: user.name || 'You',
                text: msgText, time: new Date().toLocaleTimeString([], { timeStyle: 'short' }),
                source: 'Web', attachments: [{ name: file.name, type: file.type, data: fileDataUrl }]
            }
            setMessages(prev => [...prev, userMsg])
            setInput('')
            setLoading(true)

            const data = await apiFetch('/ai/process', {
                method: 'POST',
                body: JSON.stringify({
                    input: msgText, user_id: user.uid,
                    user_name: user.name || 'User',
                    chat_history: [],
                    session_id: sessionId,
                    file_path, file_name,
                    intent_hint: 'file_read'
                })
            })
            const aiMsg = {
                id: `ai-${Date.now()}`, role: 'ai', sender: 'Assistant',
                text: data.output,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }),
                source: data.intent?.toUpperCase() || 'AI',
                responseType: data.response_type,
                response_type: data.response_type,
                imageUrl: data.image_url,
                image_url: data.image_url,
                file_name: data.file_name || file_name,
                generatedFile: data.generated_file || null,
                chartData: data.chart_data || null,
                vizConfig: data.viz_config || null,
            }
            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            console.error('File upload error:', err)
        } finally {
            setLoading(false)
            e.target.value = null
        }
    }

    const handleAction = async (action, actionData) => {
        if (action === 'reject') {
            setMessages(prev => [...prev, {
                id: `reject-${Date.now()}`,
                role: 'ai', sender: 'Assistant',
                text: `### ❌ Task Cancelled\n\n*The proposed action has been rejected and will not be executed.*`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }])
            return
        }

        // 'save_draft' — save to Gmail Drafts without sending
        if (action === 'save_draft') {
            const token = useStore.getState().auth?.user?.accessToken;
            if (!token) return;
            try {
                await apiFetch('/gmail/draft', {
                    method: 'POST',
                    body: JSON.stringify({ to: actionData.to, subject: actionData.subject, body: actionData.body })
                });
                setMessages(prev => [...prev, {
                    id: `draft-ok-${Date.now()}`,
                    role: 'ai', sender: 'Assistant',
                    text: `✅ **Draft saved to Gmail Drafts.** Open Gmail to review and send whenever you're ready.`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'EMAIL'
                }]);
            } catch (err) {
                setMessages(prev => [...prev, {
                    id: `draft-err-${Date.now()}`,
                    role: 'ai', sender: 'Assistant',
                    text: `❌ **Failed to save draft:** ${err.message}`,
                    time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
                }]);
            }
            return;
        }
        const token = useStore.getState().auth?.user?.accessToken;
        if (!token) {
            setMessages(prev => [...prev, {
                id: `auth-err-${Date.now()}`,
                role: 'ai', sender: 'Assistant',
                text: '⚠️ **Session expired.** Please refresh the page and sign in again.',
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }]);
            return;
        }

        // Validate email fields before hitting the network
        const isEmail = actionData.intent === 'email' || actionData.intent === 'email_send';
        if (isEmail && !actionData.to?.trim()) {
            setMessages(prev => [...prev, {
                id: `val-err-${Date.now()}`,
                role: 'ai', sender: 'Assistant',
                text: `❌ **Missing recipient.** Please tell me who to send this email to.`,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: 'SYSTEM'
            }]);
            return;
        }

        try {
            const endpoint =
                isEmail ? '/gmail/send' :
                    actionData.intent === 'telegram' ? '/telegram/send' :
                        actionData.intent === 'slack' ? '/slack/send' :
                            (actionData.intent === 'whatsapp' || actionData.intent === 'whatsapp_send') ? '/whatsapp/send' :
                                '/calendar/create'

            const payload = { ...actionData, user_id: user.uid }

            const data = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            })

            // Build a rich success message using server response
            let successText = '### ✅ Execution Successful\n\n';
            if (isEmail) {
                const recipient = data.to || actionData.to;
                const subject = data.subject || actionData.subject;
                successText += `**Email sent** to \`${recipient}\``;
                if (subject) successText += `\n\n> **Subject:** ${subject}`;
                successText += `\n\n*The message has been delivered via Gmail.*`;
            } else if (actionData.intent === 'slack') {
                successText += `**Slack message posted** to #${actionData.channel_name || actionData.channel_id}\n\n*Check Slack to confirm delivery.*`;
            } else if (actionData.intent === 'telegram') {
                successText += `**Telegram notification sent.**\n\n*Check your Telegram app.*`;
            } else if (actionData.intent === 'whatsapp' || actionData.intent === 'whatsapp_send') {
                successText += `**WhatsApp message sent** to ${actionData.to}\n\n*Check WhatsApp to confirm.*`;
            } else {
                successText += `**Calendar event scheduled.**\n\n*Check your calendar for the new event.*`;
            }

            setMessages(prev => [...prev, {
                id: `ok-${Date.now()}`,
                role: 'ai', sender: 'Assistant',
                text: successText,
                time: new Date().toLocaleTimeString([], { timeStyle: 'short' }), source: isEmail ? 'EMAIL' : 'SYSTEM'
            }])
        } catch (err) {
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
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
                        className="bg-surface-base/60 backdrop-blur-xl border-r border-neutral/10 flex flex-col z-40 fixed lg:relative h-full w-[280px] shadow-[10px_0_30px_rgba(110,130,160,0.05)]"
                    >
                        {/* New chat button */}
                        <div className="p-4 border-b border-neutral/10 flex items-center gap-3">
                            <button onClick={handleNewChat} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#1F5437] text-white text-[15px] font-semibold transition-all shadow-sm">
                                <Plus size={16} strokeWidth={2.5} /> New Chat
                            </button>
                            <div className="relative" ref={exportRef}>
                                <button
                                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                                    title="Export conversation"
                                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-white border border-neutral/10 shadow-sm text-neutral hover:text-on-surface hover:border-primary/30 transition-all"
                                >
                                    <Download size={18} strokeWidth={2} />
                                </button>

                                <AnimatePresence>
                                    {exportMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 8 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-neutral/10 shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2 duration-100"
                                        >
                                            <div className="px-3.5 py-2 border-b border-neutral/5">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral/50">Export Options</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setExportMenuOpen(false);
                                                    exportChat('html');
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-neutral/5 flex items-center gap-2.5 transition-colors group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-[#2D6A4F]/10 flex items-center justify-center text-[#2D6A4F] group-hover:scale-105 transition-transform">
                                                    <FileText size={16} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-on-surface">Interactive HTML</p>
                                                    <p className="text-[9px] font-semibold text-neutral/50">Rich theme, stats, search</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setExportMenuOpen(false);
                                                    exportChat('md');
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-neutral/5 flex items-center gap-2.5 transition-colors group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-[#7A7065]/10 flex items-center justify-center text-[#7A7065] group-hover:scale-105 transition-transform">
                                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M4 8h16M4 16h16" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-on-surface">Markdown (.md)</p>
                                                    <p className="text-[9px] font-semibold text-neutral/50">For Obsidian & Notion</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setExportMenuOpen(false);
                                                    exportChat('txt');
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-neutral/5 flex items-center gap-2.5 transition-colors group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-[#A09488]/10 flex items-center justify-center text-[#A09488] group-hover:scale-105 transition-transform">
                                                    <FileIcon size={16} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-on-surface">Plain Text (.txt)</p>
                                                    <p className="text-[9px] font-semibold text-neutral/50">Simple readable format</p>
                                                </div>
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2 bg-white/60 rounded-xl px-3 py-2.5 border border-neutral/10 focus-within:border-[#6E5AFF]/30 focus-within:shadow-[0_0_15px_rgba(110,90,255,0.1)] transition-all">
                                <Search size={14} className="text-on-surface-variant/50 shrink-0" />
                                <input
                                    value={sessionSearch}
                                    onChange={e => setSessionSearch(e.target.value)}
                                    placeholder="Search chats..."
                                    className="bg-transparent text-xs font-semibold outline-none flex-1 text-on-surface placeholder:text-on-surface-variant/40"
                                />
                                {sessionSearch && <button onClick={() => setSessionSearch('')}><X size={14} className="text-neutral hover:text-on-surface transition-colors" /></button>}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar px-3 pb-4 space-y-1.5 mt-2">
                            {sessions
                                .filter(s => !sessionSearch || (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase()))
                                .map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => { setSessionId(s.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                        className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl cursor-pointer transition-all border ${sessionId === s.id ? 'bg-white border-[#6E5AFF]/20 shadow-sm' : 'border-transparent hover:bg-white/60 hover:border-neutral/10'}`}
                                    >
                                        <MessageSquare size={16} className={`flex-shrink-0 ${sessionId === s.id ? 'text-[#6E5AFF]' : 'text-on-surface-variant/40 group-hover:text-on-surface-variant'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold truncate transition-colors ${sessionId === s.id ? 'text-[#6E5AFF]' : 'text-on-surface-variant group-hover:text-on-surface'}`}>{s.title || 'New Chat'}</p>
                                            <p className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${sessionId === s.id ? 'text-[#6E5AFF]/60' : 'text-neutral/50'}`}>
                                                {formatRelativeTime(s.created_at || (s.updatedAt ? new Date(s.updatedAt).toISOString() : null))}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => handleDeleteSession(e, s.id)}
                                            className="opacity-40 group-hover:opacity-100 transition-all p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 flex-shrink-0 text-neutral/70"
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
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
                                    {
                                        icon: Mail, label: 'Summarize my inbox', prompts: [
                                            'Show me my most important unread emails',
                                            'Summarize my inbox for the last 2 days',
                                            'Are there any urgent emails from the team?',
                                            'Scan my inbox for pending action items'
                                        ]
                                    },
                                    {
                                        icon: Calendar, label: 'Check my schedule', prompts: [
                                            'What meetings do I have today?',
                                            'Do I have any conflicts in my schedule tomorrow?',
                                            'What does my agenda look like for this week?',
                                            'When is my next free slot today?'
                                        ]
                                    },
                                    {
                                        icon: Zap, label: 'Generate a report', prompts: [
                                            'Generate a PDF report on my assistant activity for this month',
                                            'Create an executive summary report of my emails',
                                            'Generate an XLSX sheet of my upcoming meetings',
                                            'Prepare a briefing document for tomorrow'
                                        ]
                                    },
                                    {
                                        icon: Sparkles, label: 'Visualize data', prompts: [
                                            'Create a bar chart showing monthly revenue trends for a SaaS company',
                                            'Visualize website traffic across different regions',
                                            'Draw a pie chart showing department budget allocations',
                                            'Create a line graph of daily active users over a month'
                                        ]
                                    },
                                ].map(({ icon: Icon, label, prompts }) => (
                                    <button
                                        key={label}
                                        onClick={() => { setInput(prompts[Math.floor(Math.random() * prompts.length)]); textareaRef.current?.focus(); }}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-neutral/10 hover:border-primary/20 text-left transition-all group"
                                    >
                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0"><Icon size={14} /></div>
                                        <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => <ChatMessage key={msg.id || `msg-${i}-${msg.role}`} msg={msg} onAction={handleAction} autoApprove={autoMode} user={user} />)}
                    {loading && <div key="loading-indicator" className="flex gap-3 lg:gap-5 animate-pulse"><div className="w-9 h-9 lg:w-11 lg:h-11 rounded-2xl bg-primary/10 shrink-0" /><div className="bg-surface-container-low px-4 py-3 rounded-3xl text-sm italic opacity-50 flex items-center gap-2"><Loader2 className="animate-spin" size={14} />Twin is thinking...</div></div>}
                    <div ref={endRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 lg:p-6 bg-surface-base border-t border-neutral/5">
                    <form onSubmit={handleSend} className="max-w-4xl mx-auto">
                        {/* Hidden file input for legacy inline attachment (reads to base64) */}
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
                        {/* Hidden file input for backend upload + AI summarise flow */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".pdf,.txt,.md,.csv,.json,.docx,.jpg,.jpeg,.png,.webp"
                            onChange={handleFileSelect}
                        />
                        <div className="bg-white rounded-full flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-neutral/10 focus-within:border-neutral/20 transition-all">
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
                            <div className="flex items-end gap-2 pl-3 lg:pl-4 pr-2 py-2">
                                {/* + menu anchor */}
                                <div className="relative flex-shrink-0 self-end pb-1" ref={plusRef}>
                                    <button
                                        type="button"
                                        onClick={() => setPlusOpen(prev => !prev)}
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral/5 hover:bg-neutral/10 border border-transparent transition-all duration-150 text-neutral/60 hover:text-neutral/90 text-lg font-light"
                                        title="Add"
                                    >
                                        <Plus size={18} />
                                    </button>

                                    {plusOpen && (
                                        <div
                                            className="absolute bottom-11 left-0 w-64 rounded-2xl border border-white/10 shadow-2xl shadow-black/60 py-2 z-50"
                                            style={{
                                                background: '#1C1C1E',
                                                animation: 'popIn 0.15s ease-out'
                                            }}
                                        >
                                            {/* File action */}
                                            <button
                                                type="button"
                                                onClick={() => { menuItems[0].action(); setPlusOpen(false) }}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors duration-100 text-left group"
                                            >
                                                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.08] group-hover:bg-white/[0.12] transition-colors flex-shrink-0">
                                                    <Paperclip size={16} className="text-white/70" />
                                                </span>
                                                <span className="flex-1">
                                                    <span className="block text-sm text-white/85 font-medium">Add photos &amp; files</span>
                                                </span>
                                                <span className="text-xs text-white/30 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">Ctrl+U</span>
                                            </button>

                                            {/* Divider */}
                                            <div className="mx-4 my-1 border-t border-white/[0.06]" />

                                            {/* AI action items */}
                                            {menuItems.slice(1).map((item, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => { item.action(); setPlusOpen(false) }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors duration-100 text-left group"
                                                >
                                                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.08] group-hover:bg-white/[0.12] transition-colors flex-shrink-0">
                                                        <item.icon size={16} className="text-white/70" />
                                                    </span>
                                                    <span className="flex-1">
                                                        <span className="block text-sm text-white/85 font-medium">{item.label}</span>
                                                        {item.hint && <span className="block text-xs text-white/35 mt-0.5">{item.hint}</span>}
                                                    </span>
                                                    {item.shortcut && (
                                                        <span className="text-xs text-white/30 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">{item.shortcut}</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
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
                                    placeholder="Instruct your Twin..."
                                    rows={1}
                                    className="bg-transparent flex-1 py-2 outline-none text-sm placeholder:text-neutral/40 resize-none leading-relaxed min-h-[40px] max-h-[160px] overflow-y-auto"
                                />
                                <div className="flex items-center gap-1 pb-1">
                                    <button
                                        type="button"
                                        title="Talk to Aether"
                                        onClick={handleMicClick}
                                        className="group relative flex items-center gap-1.5 h-9 sm:h-10 pl-2.5 pr-3 sm:px-3.5 rounded-full border border-[#E8E4DE] bg-white hover:border-primary/30 hover:bg-[#E8F5EE] shadow-sm transition-all active:scale-[0.97]"
                                    >
                                        <span className="relative flex h-5 w-5 items-center justify-center">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                                            <MicIcon size={15} className="relative text-primary" strokeWidth={2.2} />
                                        </span>
                                        <span className="hidden sm:inline text-[11px] font-semibold text-[#7A7065] group-hover:text-primary tracking-wide">
                                            Voice
                                        </span>
                                    </button>
                                    <button type="submit"
                                        disabled={(!input.trim() && attachedFiles.length === 0) || loading}
                                        className="bg-[#F2BDB3] text-white h-9 w-9 lg:h-10 lg:w-10 rounded-[14px] flex items-center justify-center shadow-sm hover:brightness-95 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all">
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <AetherVoiceMode
                isOpen={showVoiceMode}
                onClose={handleCloseVoiceMode}
                onProcessText={handleVoiceProcessText}
            />

            {/* Elegant confirmation modal for session deletion */}
            <AnimatePresence>
                {sessionToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSessionToDelete(null)}
                            className="absolute inset-0 bg-black/65 backdrop-blur-md"
                        />
                        {/* Card container */}
                        <motion.div
                            initial={{ scale: 0.95, y: 15, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 10, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="wi-card w-full max-w-sm p-6 relative z-10 text-center shadow-lg"
                        >
                            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-on-surface font-manrope mb-2">Delete Chat Session?</h3>
                            <p className="text-sm text-neutral mb-6">This will permanently delete this conversation and all associated AI memory. This action cannot be undone.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSessionToDelete(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-neutral text-sm font-semibold hover:bg-white/5 active:scale-95 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteSession}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95 transition-all shadow-lg shadow-red-500/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    )
}

export default Chat;