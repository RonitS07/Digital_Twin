import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, 
  Search, 
  Plus, 
  Trash2, 
  MessageSquare, 
  Users, 
  ArrowLeft, 
  Clock, 
  Check, 
  X, 
  Zap, 
  Mail, 
  Calendar, 
  Paperclip, 
  Mic as MicIcon, 
  MicOff, 
  Loader2, 
  Sparkles, 
  File as FileIcon, 
  ExternalLink,
  Wand2
} from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

const TWIN_INTENT_OPTIONS = [
  { key: 'general', label: 'General' },
  { key: 'email', label: 'Email' },
  { key: 'calendar', label: 'Schedule' },
  { key: 'visual', label: 'Image' },
  { key: 'file_generate', label: 'Create File' },
  { key: 'file_read', label: 'Analyze File' },
  { key: 'slack', label: 'Slack' },
  { key: 'telegram', label: 'Telegram' },
]

// ─── WebSocket Manager ───────────────────────────────────────────
function useTwinChatWS(token, handlers) {
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  useEffect(() => {
    if (!token) return
    let alive = true

    const connect = () => {
      const proto = API_BASE.startsWith('https') ? 'wss' : 'ws'
      const host = API_BASE.replace(/^https?:\/\//, '')
      const url = `${proto}://${host}/twin-chat/ws?token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          handlers.current?.(data)
        } catch {}
      }
      ws.onclose = () => {
        if (alive) reconnectRef.current = setTimeout(connect, 1200)
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { alive = false; wsRef.current?.close(); clearTimeout(reconnectRef.current) }
  }, [token])

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(payload))
  }, [])

  return { send }
}

// ─── Sub-Components ─────────────────────────────────────────────

// Lightweight zero-dep markdown renderer
const SimpleMarkdown = ({ children }) => {
  if (!children) return null

  const formatInline = (text) => {
    const parts = []
    let remaining = text
    let key = 0
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
      const lineId = `p-${i}-${line.slice(0, 5)}`
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
          setStatus('error')
        }}
      />
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-red-400/5 p-4 text-center">
          <Sparkles size={24} className="mb-2 opacity-50" />
          <p className="text-xs font-bold uppercase tracking-widest">Visual Rendering Failed</p>
          <p className="text-[10px] opacity-70 mt-1">The AI generated a visual, but your browser could not display it.</p>
        </div>
      )}
    </div>
  )
}

const MessageBubble = React.memo(({ msg, isOwn, onAction, user }) => {
  const [cleanText, setCleanText] = useState(msg.content || '')
  const [actionData, setActionData] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExecuted, setIsExecuted] = useState(false)
  
  const isAi = msg.sender_type === 'twin'
  const metadata = msg.metadata || {}
  const hasImage = metadata.response_type === 'visual' || metadata.image_url

  useEffect(() => {
    if (!msg.content) return
    const match = msg.content.match(/<action>([\s\S]*?)<\/action>/)
    if (match) {
      setCleanText(msg.content.replace(/<action>[\s\S]*?<\/action>/g, '').trim())
      try {
        setActionData(JSON.parse(match[1].trim()))
      } catch (e) {}
    } else {
      setCleanText(msg.content)
    }
  }, [msg.content])

  return (
    <motion.div initial={{ opacity: 0, y: 10, x: isOwn ? 10 : -10 }} animate={{ opacity: 1, y: 0, x: 0 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4 px-4`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn 
          ? 'bg-primary text-white rounded-br-md' 
          : 'bg-surface-container border border-neutral/10 text-on-surface rounded-bl-md'}`}>
          
          {hasImage && metadata.image_url ? (
            <div className="space-y-3">
              {cleanText && <SimpleMarkdown>{cleanText}</SimpleMarkdown>}
              <ImageLoader src={metadata.image_url} />
              
            </div>
          ) : (
            cleanText ? (
              <div className="break-words">
                <SimpleMarkdown>{cleanText}</SimpleMarkdown>
              </div>
            ) : null
          )}

          {metadata.files && metadata.files.length > 0 && (
            <div className="flex flex-col gap-2 mt-3">
              {metadata.files.map((f, i) => {
                const isImage = f.type?.startsWith('image/')
                const isVideo = f.type?.startsWith('video/')
                const isAudio = f.type?.startsWith('audio/')
                return (
                  <div key={i} className="w-full">
                    {isImage ? (
                      <div className="rounded-xl overflow-hidden border border-white/10">
                        <img src={f.data} alt={f.name} className="w-full h-auto max-h-[300px] object-cover" />
                      </div>
                    ) : isVideo ? (
                      <div className="rounded-xl overflow-hidden border border-white/10 bg-black/50">
                        <video src={f.data} controls className="w-full h-auto max-h-[300px]" />
                      </div>
                    ) : isAudio ? (
                      <div className="w-full">
                        <audio src={f.data} controls className="w-full" />
                      </div>
                    ) : (
                      <a href={f.data} download={f.name} className="flex items-center gap-2 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 border border-white/10 transition-colors">
                        <FileIcon size={16} className="text-primary" />
                        <span className="text-xs truncate flex-1 font-semibold">{f.name}</span>
                        <ExternalLink size={12} className="text-white/50" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {actionData && (
            <div className={`mt-4 p-4 rounded-xl border ${actionData.is_conflict ? 'bg-amber-900/20 border-amber-500/30' : 'bg-black/20 border-white/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                {actionData.intent === 'email' ? <Mail size={14} className="text-primary" /> : 
                 actionData.intent === 'slack' ? <Zap size={14} className="text-[#36C5F0]" /> :
                 actionData.intent === 'telegram' ? <MessageSquare size={14} className="text-secondary" /> : 
                 <Calendar size={14} className="text-secondary" />}
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                  {actionData.intent} Proposal
                </span>
              </div>
              <h4 className="text-xs font-bold text-white mb-1">{actionData.subject || actionData.title || 'Action'}</h4>
              <p className="text-[10px] text-white/50 line-clamp-2 italic mb-3">{actionData.body || actionData.description}</p>
              
              {isOwn ? (
                <div className="py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-2 border bg-black/10 text-white/50 border-white/10">
                  <Clock size={12} /> Waiting for partner to accept
                </div>
              ) : isExecuted ? (
                <div className="py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-2 border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  <Check size={12} /> Accepted & Executed
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    disabled={isProcessing}
                    onClick={async () => {
                      setIsProcessing(true)
                      await onAction('approve', actionData, msg.id)
                      setIsExecuted(true)
                      setIsProcessing(false)
                    }}
                    className="flex-1 py-1.5 text-white text-[10px] font-bold rounded-lg bg-primary hover:brightness-110 flex items-center justify-center gap-2 transition-all">
                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : 'Accept'}
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => setIsExecuted(true)}
                    className="py-1.5 px-3 text-white text-[10px] font-bold rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center gap-2 transition-all">
                    Decline
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[9px] text-neutral">
            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {msg.sender_type === 'twin' && msg.status === 'approved' && (
            <span className="text-[9px] text-primary/60">• Approved</span>
          )}
          {isAi && msg.status === 'sent' && (
             <span className="text-[9px] text-primary/60 flex items-center gap-1"><Sparkles size={8} /> AI Processed</span>
          )}
        </div>
      </div>
    </motion.div>
  )
})

function SuggestionsPanel({ data, onApprove, onDismiss, partnerName }) {
  if (!data) return null
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
      className="bg-primary/5 border border-primary/10 rounded-2xl p-4 mb-4 overflow-hidden relative"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Twin Suggestions</span>
        </div>
        <button onClick={onDismiss} className="text-neutral hover:text-red-400 transition-colors">
          <X size={14} />
        </button>
      </div>
      
      {data.respondingTo && (
        <div className="mb-4 p-3 bg-surface-base rounded-xl border border-neutral/10">
          <p className="text-[9px] text-neutral font-bold uppercase mb-1 flex items-center gap-1">
            <Clock size={10} /> {data.isEnhancement ? 'Your drafted message:' : `Just received from ${partnerName}:`}
          </p>
          <p className="text-xs text-on-surface-variant italic line-clamp-2">"{data.respondingTo}"</p>
        </div>
      )}

      {data.enrichment && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-primary/10 rounded-xl">
          <Zap size={14} className="text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {data.enrichment}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {data.suggestions?.map((s, i) => (
          <button key={i} onClick={() => onApprove(s.content)}
            className="w-full text-left p-3 rounded-xl bg-surface-base hover:bg-primary/10 border border-neutral/10 transition-all group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-primary font-bold uppercase tracking-wider">{s.label}</span>
              <Check size={12} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-on-surface leading-relaxed">{s.content}</p>
          </button>
        ))}
      </div>
      
      <button onClick={onDismiss} 
        className="mt-3 w-full py-1.5 text-[10px] text-neutral hover:text-on-surface uppercase tracking-widest font-bold transition-colors">
        Dismiss suggestions
      </button>
    </motion.div>
  )
}

// ─── Chat View (right panel) ─────────────────────────────────────
function ChatPanel({ session, onBack, wsSend, wsEvent, onDeleteSession }) {
  const { auth, preferences } = useStore()
  const user = auth.user
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const [enhancing, setEnhancing] = useState(false)
  
  // New features state
  const [attachedFiles, setAttachedFiles] = useState([])
  const [selectedIntent, setSelectedIntent] = useState('general')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const fileInputRef = useRef(null)

  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const partnerName = session?.partner?.name || 'Contact'

  // Handle WS events passed from parent
  useEffect(() => {
    if (!wsEvent || !session) return
    
    // Only process events for this session
    if (wsEvent.message?.session_id && wsEvent.message.session_id !== session.id) return
    if (wsEvent.session_id && wsEvent.session_id !== session.id) return

    if (wsEvent.event === 'new_message') {
      setMessages(prev => {
        if (prev.some(m => m.id === wsEvent.message.id)) return prev
        return [...prev, wsEvent.message]
      })
    } else if (wsEvent.event === 'twin_suggestion') {
      setPendingSuggestion({ 
        suggestions: wsEvent.message.suggestions, 
        enrichment: wsEvent.enrichment, 
        msgId: wsEvent.message.id,
        respondingTo: wsEvent.responding_to,
        isEnhancement: wsEvent.is_enhancement === true
      })
    } else if (wsEvent.event === 'partner_typing') {
      setPartnerTyping(true)
    } else if (wsEvent.event === 'partner_stop_typing') {
      setPartnerTyping(false)
    }
  }, [wsEvent, session?.id])

  // Load messages
  useEffect(() => {
    if (!session?.id) return
    useStore.getState().removeUnreadTwinChat(session.id)
    setLoading(true)
    setPendingSuggestion(null) // Clear suggestions when switching sessions
    apiFetch(`/twin-chat/sessions/${session.id}`)
      .then(data => { 
        const msgs = data.messages || [];
        setMessages(msgs);
        
        // Recover any pending suggestion on reload
        const pending = msgs.find(m => m.status === 'pending' && m.sender_id === user?.uid);
        if (pending) {
          setPendingSuggestion({
            suggestions: pending.suggestions || [],
            msgId: pending.id,
            respondingTo: null,
            isEnhancement: true
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false))
  }, [session?.id])

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, partnerTyping])

  const handleInputChange = (val) => {
    setInput(val)
    if (session?.id) wsSend({ event: 'typing', session_id: session.id })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      if (session?.id) wsSend({ event: 'stop_typing', session_id: session.id })
    }, 2000)
  }

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && attachedFiles.length === 0) || sending) return
    
    setSending(true)
    setInput('')
    const currentFiles = [...attachedFiles]
    setAttachedFiles([])
    setPendingSuggestion(null) 
    if (session?.id) wsSend({ event: 'stop_typing', session_id: session.id })

    const optimisticId = `local-${Date.now()}`
    const optimisticMessage = {
      id: optimisticId,
      session_id: session?.id,
      sender_id: user?.uid,
      sender_type: 'human',
      status: 'sent',
      content: text,
      metadata: currentFiles.length > 0 ? { files: currentFiles } : {},
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMessage])
    
    try {
      const data = await apiFetch(`/twin-chat/sessions/${session.id}/messages`, {
        method: 'POST', body: JSON.stringify({ 
          content: text,
          files: currentFiles,
          intent_hint: selectedIntent
        })
      })
      if (data.message) {
        setMessages(prev => {
          const withoutOptimistic = prev.filter(m => m.id !== optimisticId)
          let next = [...withoutOptimistic, data.message]
          if (data.ai_response && data.ai_response.status !== 'pending') {
            next = [...next, data.ai_response]
          }
          return next
        })
        
        // If the AI response is pending, show it in the suggestion panel
        if (data.ai_response && data.ai_response.status === 'pending') {
          setPendingSuggestion({
            suggestions: data.ai_response.suggestions || [],
            msgId: data.ai_response.id,
            respondingTo: text,
            isEnhancement: true
          })
        }
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      console.error(e)
    }
    setSending(false)
  }

  const handleActionClick = async (action, actionData, msgId) => {
    // Execute action directly
    try {
      const endpoint = 
          actionData.intent === 'email' ? '/gmail/send' : 
          actionData.intent === 'telegram' ? '/telegram/send' : 
          actionData.intent === 'slack' ? '/slack/send' : 
          '/calendar/create'
      
      const payload = { ...actionData, user_id: user.uid }
      await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload)
      })
      
      // We could add a system message to indicate success
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        sender_type: 'system',
        content: `✅ Action executed successfully.`,
        created_at: new Date().toISOString()
      }])
    } catch (err) {
      console.error("Action failed", err)
    }
  }

  const handleApprove = async (content) => {
    if (!pendingSuggestion) return
    try {
      await apiFetch(`/twin-chat/sessions/${session.id}/approve/${pendingSuggestion.msgId}`, {
        method: 'POST', body: JSON.stringify({ content })
      })
      setPendingSuggestion(null)
    } catch (e) { console.error(e) }
  }

  const handleEnhance = async () => {
    const text = input.trim()
    if ((!text && attachedFiles.length === 0) || enhancing) return
    setEnhancing(true)
    
    const currentFiles = [...attachedFiles]
    setAttachedFiles([])
    setInput('')

    try {
      const data = await apiFetch(`/twin-chat/sessions/${session.id}/ai-process`, {
        method: 'POST', body: JSON.stringify({ 
          content: text,
          files: currentFiles,
          gmail_sync: preferences?.gmailSync !== false,
          calendar_sync: preferences?.calendarSync !== false,
          slack_sync: preferences?.slackSync !== false,
          intent_hint: selectedIntent
        })
      })
      // The AI response comes back as a suggestion, so we display it in the pending panel
      if (data.suggestion) {
        setPendingSuggestion({
          suggestions: data.suggestion.suggestions_json ? JSON.parse(data.suggestion.suggestions_json) : [],
          msgId: data.suggestion.id,
          respondingTo: text,
          isEnhancement: true
        })
      }
    } catch (e) { console.error(e) }
    setEnhancing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (!session) return (
    <div className="flex-1 flex items-center justify-center bg-surface-base">
      <div className="text-center">
        <Users size={48} className="mx-auto text-neutral/20 mb-4" />
        <p className="text-neutral text-sm">Select a conversation or start a new one</p>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-base overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-neutral/10 bg-surface-base/90 backdrop-blur-xl shrink-0">
        <button onClick={onBack} className="lg:hidden p-1 text-neutral hover:text-on-surface"><ArrowLeft size={20} /></button>
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
          {partnerName[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface">{partnerName}</p>
          <p className="text-[10px] text-neutral">
            {partnerTyping ? <span className="text-primary animate-pulse">typing...</span> : 'Twin-assisted chat'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={10} /> Active
          </span>
          <button 
            onClick={() => {
              if (window.confirm('Are you sure you want to permanently delete this Twin Chat conversation?')) {
                onDeleteSession(session.id)
              }
            }}
            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors ml-1"
            title="Delete Chat"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="flex-1 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Zap size={28} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-on-surface mb-1">Start the conversation</p>
                <p className="text-xs text-neutral">Your assistant will help with suggestions and actions</p>
              </div>
            </div>
          ) : (
            messages.filter(m => m.status !== 'pending' && m.status !== 'rejected').map(msg => (
              <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user?.uid} onAction={handleActionClick} user={user} />
            ))
          )}
          {partnerTyping && (
            <div className="flex items-center gap-2 px-4 mb-2">
              <div className="bg-surface-container rounded-2xl rounded-bl-md px-4 py-2 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Suggestion Panel */}
        <div className="px-4 shrink-0">
          <AnimatePresence>
            {pendingSuggestion && (
              <SuggestionsPanel 
                data={pendingSuggestion} 
                partnerName={partnerName}
                onApprove={handleApprove} 
                onDismiss={async () => {
                   if (pendingSuggestion.isEnhancement && pendingSuggestion.respondingTo) {
                     setInput(pendingSuggestion.respondingTo);
                   }
                   const msgId = pendingSuggestion.msgId;
                   setPendingSuggestion(null);
                   try {
                     await apiFetch(`/twin-chat/sessions/${session.id}/messages/${msgId}`, { method: 'DELETE' });
                   } catch (e) { console.error(e) }
                }} 
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-neutral/10 bg-surface-base">
        <input type="file" id="twin-file-upload" multiple className="hidden"
          ref={fileInputRef}
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
        <div className="max-w-4xl mx-auto bg-surface-container/50 backdrop-blur-3xl rounded-2xl flex flex-col shadow-lg border border-neutral/10 focus-within:border-primary/30 transition-all">
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
            {TWIN_INTENT_OPTIONS.map(option => (
              <button key={option.key}
                type="button"
                onClick={() => setSelectedIntent(option.key)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${selectedIntent === option.key ? 'bg-primary text-white' : 'bg-surface-container text-on-surface hover:bg-primary/10'}`}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 pl-4 pr-2 py-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending}
                placeholder={`Message ${partnerName}... (Enter to send)`}
                rows={1}
                className="w-full bg-transparent py-2 pr-10 outline-none text-sm placeholder:text-neutral/40 resize-none min-h-[40px] max-h-[160px] overflow-y-auto"
              />
              {input.trim() && (
                <button onClick={handleEnhance} disabled={enhancing}
                  className="absolute right-0 bottom-2 p-1.5 rounded-lg text-neutral hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  title="Enhance with assistant">
                  {enhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-1 pb-1">
              <button type="button" onClick={() => fileInputRef.current?.click()}
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
              <button onClick={handleSend} disabled={(!input.trim() && attachedFiles.length === 0) || sending}
                className="bg-primary text-white h-9 w-9 rounded-xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all ml-1">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionSidebar({ sessions, activeId, loading, onSelect, onNew }) {
  const [search, setSearch] = useState('')
  const filtered = sessions.filter(s => s.partner?.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col h-full bg-surface-container/30 border-r border-neutral/10">
      <div className="p-4 border-b border-neutral/10 flex items-center justify-between">
        <h2 className="text-xl font-manrope font-extrabold text-on-surface">Twin Chat</h2>
        <button onClick={onNew} className="p-2 rounded-xl bg-primary text-white hover:brightness-110 transition-all">
          <Plus size={18} />
        </button>
      </div>

      <div className="p-4">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral group-focus-within:text-primary transition-colors" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface-base border border-neutral/10 rounded-xl py-2 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all"
            placeholder="Search conversations..." />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
        {loading ? (
          [1,2,3].map(i => (
            <div key={i} className="h-16 bg-surface-container animate-pulse rounded-xl mx-2" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 px-4">
            <MessageSquare size={32} className="mx-auto text-neutral/20 mb-2" />
            <p className="text-xs text-neutral">No conversations found</p>
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id} onClick={() => onSelect(s.id)}
              className={`p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 ${activeId === s.id ? 'bg-primary/20 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                {s.partner?.name?.[0]?.toUpperCase() || 'C'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-on-surface truncate">{s.partner?.name || 'Contact'}</p>
                  <span className="text-[10px] text-neutral">{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs text-neutral truncate">{s.lastMessage || 'No messages yet'}</p>
              </div>
              {s.unreadCount > 0 && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TwinChat() {
  const { auth } = useStore()
  const user = auth.user
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wsEvent, setWsEvent] = useState(null)
  
  const handlers = useRef(null)
  handlers.current = (data) => setWsEvent(data)
  const { send: wsSend } = useTwinChatWS(auth.user?.accessToken, handlers)

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch('/twin-chat/sessions')
      setSessions(data.sessions || [])
      setLoading(false)
    } catch (e) { setLoading(false) }
  }, [])

  useEffect(() => { if (user) fetchSessions() }, [user, fetchSessions])

  useEffect(() => {
    if (wsEvent?.event === 'new_message' || wsEvent?.event === 'new_session') {
      fetchSessions()
    }
  }, [wsEvent, fetchSessions])

  const handleNewSession = async () => {
    const email = prompt("Enter the email of the person you want to chat with:")
    if (!email) return
    try {
      const data = await apiFetch('/twin-chat/sessions', { method: 'POST', body: JSON.stringify({ partner_email: email }) })
      await fetchSessions()
      setActiveId(data.session.id)
    } catch (e) { alert("Failed to create session. Make sure the user exists.") }
  }

  const handleDeleteSession = async (id) => {
    try {
      await apiFetch(`/twin-chat/sessions/${id}`, { method: 'DELETE' })
      if (activeId === id) setActiveId(null)
      fetchSessions()
    } catch (e) { console.error(e) }
  }

  const activeSession = sessions.find(s => s.id === activeId)

  return (
    <div className="flex h-screen bg-surface-base text-on-surface font-inter overflow-hidden">
      <div className={`fixed inset-0 z-40 lg:relative lg:z-0 lg:flex ${activeId ? 'hidden' : 'flex'} w-full lg:w-80 shrink-0`}>
        <SessionSidebar sessions={sessions} activeId={activeId} loading={loading} onSelect={setActiveId} onNew={handleNewSession} />
      </div>
      <div className={`flex-1 flex flex-col min-w-0 ${!activeId ? 'hidden lg:flex' : 'flex'}`}>
        <ChatPanel 
          session={activeSession} 
          onBack={() => setActiveId(null)} 
          wsSend={wsSend} 
          wsEvent={wsEvent}
          onDeleteSession={handleDeleteSession}
        />
      </div>
    </div>
  )
}

export default TwinChat
