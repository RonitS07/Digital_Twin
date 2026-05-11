import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, ArrowLeft, Send, Sparkles, Check, X, Bot,
  User as UserIcon, MessageCircle, Wand2, ChevronDown, Loader2,
  Users, Clock, Zap, RefreshCw, FileText
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { apiFetch } from '../utils/apiClient'
import { API_BASE } from '../config'

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
        if (alive) reconnectRef.current = setTimeout(connect, 3000)
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

// ─── Sidebar: Session List ───────────────────────────────────────
function SessionSidebar({ sessions, activeId, onSelect, onNew, loading }) {
  return (
    <div className="flex flex-col h-full bg-surface-container border-r border-neutral/10">
      <div className="p-4 border-b border-neutral/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-manrope font-extrabold text-sm tracking-tight text-on-surface flex items-center gap-2">
            <Users size={16} className="text-primary" /> Twin Chat
          </h2>
          <button onClick={onNew} className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {loading && <div className="text-center py-8 text-neutral text-xs">Loading...</div>}
        {!loading && sessions.length === 0 && (
          <div className="text-center py-12 px-4">
            <MessageCircle size={32} className="mx-auto text-neutral/40 mb-3" />
            <p className="text-xs text-neutral">No conversations yet</p>
            <button onClick={onNew} className="mt-3 text-[10px] uppercase tracking-widest font-bold text-primary">
              Start a Chat
            </button>
          </div>
        )}
        {sessions.map(s => (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className={`w-full text-left p-3 rounded-xl transition-all ${activeId === s.id
              ? 'bg-primary/15 border border-primary/20' : 'hover:bg-surface-container-high border border-transparent'}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {s.partner?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface truncate">{s.partner?.name || 'Unknown'}</p>
                <p className="text-[10px] text-neutral truncate">{s.title || s.partner?.email || ''}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── New Chat Modal ──────────────────────────────────────────────
function NewChatModal({ onClose, onCreated }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(null)
  const debounceRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const data = await apiFetch(`/twin-chat/users/search?q=${encodeURIComponent(q)}`)
      setResults(data.users || [])
    } catch { setResults([]) }
    setSearching(false)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, doSearch])

  const startChat = async (userId) => {
    setCreating(userId)
    try {
      const data = await apiFetch('/twin-chat/sessions', {
        method: 'POST', body: JSON.stringify({ partner_id: userId })
      })
      onCreated(data.session)
    } catch (e) { console.error(e) }
    setCreating(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-surface-container rounded-2xl w-full max-w-md border border-neutral/10 shadow-2xl">
        <div className="p-5 border-b border-neutral/10 flex items-center justify-between">
          <h3 className="font-manrope font-extrabold text-on-surface">New Twin Chat</h3>
          <button onClick={onClose} className="text-neutral hover:text-on-surface"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users by name or email..."
              className="w-full bg-surface-base rounded-xl py-2.5 pl-9 pr-4 text-sm text-on-surface border-none outline-none focus:ring-1 focus:ring-primary" autoFocus />
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
            {searching && <p className="text-xs text-neutral text-center py-4">Searching...</p>}
            {!searching && results.length === 0 && query.length >= 2 && (
              <p className="text-xs text-neutral text-center py-4">No users found</p>
            )}
            {results.map(u => (
              <button key={u.id} onClick={() => startChat(u.id)} disabled={creating === u.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-base transition-colors text-left disabled:opacity-50">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  {u.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{u.name}</p>
                  <p className="text-[10px] text-neutral truncate">{u.email}</p>
                </div>
                {creating === u.id ? <Loader2 size={16} className="animate-spin text-primary" /> : <Plus size={16} className="text-neutral" />}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── AI Suggestion Card ──────────────────────────────────────────
function SuggestionCard({ suggestion, enrichment, onApprove, onReject, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const suggestions = suggestion?.suggestions || []

  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="mx-4 mb-3 p-4 rounded-2xl bg-gradient-to-br from-primary/5 via-surface-container to-primary/5 border border-primary/15 shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles size={11} className="text-primary" />
        </div>
        <span className="text-[10px] uppercase tracking-widest font-bold text-primary">Twin Suggestions</span>
      </div>
      {enrichment && <p className="text-xs text-on-surface-variant mb-3 italic">💡 {enrichment}</p>}
      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="group flex items-start gap-2">
            <button onClick={() => { if (!editing) onApprove(s.content) }}
              className="flex-1 text-left p-2.5 rounded-xl bg-surface-base/80 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all">
              <p className="text-[10px] text-neutral font-semibold mb-0.5">{s.label}</p>
              <p className="text-xs text-on-surface leading-relaxed">{s.content}</p>
            </button>
            <div className="flex flex-col gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditing(true); setEditText(s.content) }}
                className="p-1 rounded-md hover:bg-surface-container-high text-neutral"><Wand2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
            className="w-full bg-surface-base rounded-xl p-3 text-xs text-on-surface border border-primary/20 outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={() => { onApprove(editText); setEditing(false) }}
              className="flex-1 py-2 bg-primary text-white text-[10px] uppercase tracking-widest font-bold rounded-lg">Send Edited</button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 text-neutral text-[10px] uppercase tracking-widest font-bold rounded-lg hover:bg-surface-container-high">Cancel</button>
          </div>
        </div>
      )}
      <button onClick={onReject} className="mt-2 text-[10px] text-neutral hover:text-red-400 transition-colors">Dismiss suggestions</button>
    </motion.div>
  )
}

// ─── Message Bubble ──────────────────────────────────────────────
function MessageBubble({ msg, isOwn }) {
  const isTwin = msg.sender_type === 'twin'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2 px-4`}>
      <div className={`max-w-[75%] relative group`}>
        {isTwin && (
          <div className="flex items-center gap-1 mb-1">
            <Bot size={10} className="text-primary" />
            <span className="text-[9px] text-primary font-bold uppercase tracking-wider">AI-Assisted</span>
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isOwn
          ? 'bg-primary text-white rounded-br-md'
          : 'bg-surface-container border border-neutral/10 text-on-surface rounded-bl-md'}`}>
          {msg.content}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[9px] text-neutral">
            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {msg.sender_type === 'twin' && msg.status === 'approved' && (
            <span className="text-[9px] text-primary/60">• Approved</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Chat View (right panel) ─────────────────────────────────────
function ChatPanel({ session, onBack, wsSend, wsEvent }) {
  const { auth } = useStore()
  const user = auth.user
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const [enhancing, setEnhancing] = useState(false)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const partnerName = session?.partner?.name || 'Partner'

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
        msgId: wsEvent.message.id 
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
    setLoading(true)
    apiFetch(`/twin-chat/sessions/${session.id}`)
      .then(data => { setMessages(data.messages || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session?.id])

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, partnerTyping])

  // Typing indicator
  const handleInputChange = (val) => {
    setInput(val)
    if (session?.id) wsSend({ event: 'typing', session_id: session.id })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      if (session?.id) wsSend({ event: 'stop_typing', session_id: session.id })
    }, 2000)
  }

  // Send message
  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    if (session?.id) wsSend({ event: 'stop_typing', session_id: session.id })
    try {
      const data = await apiFetch(`/twin-chat/sessions/${session.id}/messages`, {
        method: 'POST', body: JSON.stringify({ content: text })
      })
      setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message])
    } catch (e) { console.error(e) }
    setSending(false)
  }

  // Approve suggestion
  const handleApprove = async (content) => {
    if (!pendingSuggestion) return
    try {
      await apiFetch(`/twin-chat/sessions/${session.id}/approve/${pendingSuggestion.msgId}`, {
        method: 'POST', body: JSON.stringify({ content })
      })
    } catch (e) { console.error(e) }
    setPendingSuggestion(null)
  }

  // Reject suggestion
  const handleReject = async () => {
    if (!pendingSuggestion) return
    try {
      await apiFetch(`/twin-chat/sessions/${session.id}/messages/${pendingSuggestion.msgId}`, { method: 'DELETE' })
    } catch {}
    setPendingSuggestion(null)
  }

  // Enhance draft
  const handleEnhance = async () => {
    if (!input.trim() || enhancing) return
    setEnhancing(true)
    try {
      const data = await apiFetch(`/twin-chat/sessions/${session.id}/enhance`, {
        method: 'POST', body: JSON.stringify({ draft: input, conversation_history: [] })
      })
      if (data.enhanced) setInput(data.enhanced)
    } catch {}
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
    <div className="flex-1 flex flex-col h-full bg-surface-base">
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
        <div className="flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={10} /> Twin Active
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
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
              <p className="text-xs text-neutral">Your AI Twin will assist with suggestions and context</p>
            </div>
          </div>
        ) : (
          <>
            {messages.filter(m => m.status !== 'pending' && m.status !== 'rejected').map(msg => (
              <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user?.uid} />
            ))}
          </>
        )}
        {partnerTyping && (
          <div className="flex items-center gap-2 px-4 mb-2">
            <div className="bg-surface-container rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Card */}
      <AnimatePresence>
        {pendingSuggestion && (
          <SuggestionCard suggestion={pendingSuggestion} enrichment={pendingSuggestion.enrichment}
            onApprove={handleApprove} onReject={handleReject} />
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-3 border-t border-neutral/10 bg-surface-container/50 backdrop-blur-xl shrink-0">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <div className="flex-1 relative bg-surface-base rounded-xl border border-neutral/10 focus-within:border-primary/30 transition-colors">
            <textarea value={input} onChange={e => handleInputChange(e.target.value)} onKeyDown={handleKeyDown}
              rows={1} placeholder={`Message ${partnerName}...`}
              className="w-full bg-transparent rounded-xl py-3 px-4 pr-10 text-sm text-on-surface outline-none resize-none max-h-32"
              style={{ minHeight: '44px' }} />
            {input.trim() && (
              <button onClick={handleEnhance} disabled={enhancing}
                className="absolute right-2 bottom-2 p-1.5 rounded-lg text-neutral hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                title="Enhance with AI Twin">
                {enhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              </button>
            )}
          </div>
          <button onClick={handleSend} disabled={!input.trim() || sending}
            className="p-3 rounded-xl bg-primary text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main TwinChat Component ─────────────────────────────────────
export default function TwinChat() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [mobileShowChat, setMobileShowChat] = useState(false)

  const { twinChatActiveSessionId, setTwinChatActiveSessionId, auth } = useStore()
  const token = auth.user?.accessToken
  const [lastWsEvent, setLastWsEvent] = useState(null)
  const wsHandlersRef = useRef(null)

  // Handle global WS events
  wsHandlersRef.current = (data) => {
    setLastWsEvent(data)
    
    // Update session list in real-time (last message time, etc)
    if (data.event === 'new_message') {
      setSessions(prev => prev.map(s => {
        if (s.id === data.message.session_id) {
          return { ...s, last_message_at: data.message.created_at }
        }
        return s
      }).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)))
    }
  }

  const { send: wsSend } = useTwinChatWS(token, wsHandlersRef)

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch('/twin-chat/sessions')
      const fetchedSessions = data.sessions || []
      setSessions(fetchedSessions)
      
      if (twinChatActiveSessionId) {
        setActiveSessionId(twinChatActiveSessionId)
        setMobileShowChat(true)
        setTwinChatActiveSessionId(null)
      }
    } catch {}
    setLoadingSessions(false)
  }, [twinChatActiveSessionId])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  const handleSelectSession = (id) => {
    setActiveSessionId(id)
    setMobileShowChat(true)
  }

  const handleNewChatCreated = (session) => {
    setSessions(prev => [session, ...prev.filter(s => s.id !== session.id)])
    setActiveSessionId(session.id)
    setMobileShowChat(true)
    setShowNewChat(false)
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full lg:w-72 xl:w-80 shrink-0 ${mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
        <SessionSidebar sessions={sessions} activeId={activeSessionId} loading={loadingSessions}
          onSelect={handleSelectSession} onNew={() => setShowNewChat(true)} />
      </div>

      {/* Chat panel */}
      <div className={`flex-1 min-w-0 ${!mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
        <ChatPanel 
          session={activeSession}
          wsSend={wsSend}
          wsEvent={lastWsEvent}
          onBack={() => setMobileShowChat(false)} 
        />
      </div>

      {/* New chat modal */}
      <AnimatePresence>
        {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onCreated={handleNewChatCreated} />}
      </AnimatePresence>
    </div>
  )
}
