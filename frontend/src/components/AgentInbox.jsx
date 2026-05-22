import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Inbox,
  Check,
  X,
  Clock,
  Calendar,
  Send,
  Search,
  Wifi,
  WifiOff,
  Zap,
  Shield,
  Globe,
  UserCheck,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  Lock,
} from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const map = {
    online: { color: 'bg-emerald-500', label: 'Online' },
    busy: { color: 'bg-amber-400', label: 'Busy' },
    do_not_disturb: { color: 'bg-red-500', label: 'DND' },
  }
  const { color, label } = map[status] || map.online
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral">{label}</span>
    </span>
  )
}

// ─── Msg type chip ─────────────────────────────────────────────────────────────

const MsgTypeChip = ({ type }) => {
  const map = {
    scheduling_proposal: { label: 'Meeting Proposal', color: 'bg-primary/20 text-primary' },
    scheduling_confirm: { label: 'Meeting Confirmed', color: 'bg-emerald-500/20 text-emerald-400' },
    scheduling_reject: { label: 'Declined', color: 'bg-red-500/20 text-red-400' },
    scheduling_request: { label: 'Scheduling Request', color: 'bg-indigo-500/20 text-indigo-400' },
    agent_chat: { label: 'Agent Chat', color: 'bg-purple-500/20 text-purple-400' },
    capability_query: { label: 'Capability Query', color: 'bg-sky-500/20 text-sky-400' },
    capability_response: { label: 'Capability Response', color: 'bg-sky-500/20 text-sky-400' },
  }
  const { label, color } = map[type] || { label: type, color: 'bg-neutral/20 text-neutral' }
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

// ─── Format ISO datetime ───────────────────────────────────────────────────────

const fmtDate = (iso) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

// ─── Single Inbox Message Card ────────────────────────────────────────────────

const InboxCard = ({ msg, onApprove, onReject, loading }) => {
  const slots = msg.payload?.proposed_slots || (msg.payload?.slot ? [msg.payload.slot] : [])
  const [selectedSlot, setSelectedSlot] = useState(0)
  const isActionable = ['scheduling_proposal', 'scheduling_confirm'].includes(msg.msg_type)
  const isRejected = msg.status === 'rejected' || msg.msg_type === 'scheduling_reject'
  const isApproved = msg.status === 'approved'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`bg-surface-container rounded-2xl border p-5 space-y-4 transition-all ${
        isRejected ? 'border-red-500/20 opacity-60' :
        isApproved ? 'border-emerald-500/20 opacity-70' :
        'border-neutral/10 hover:border-primary/20'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <MsgTypeChip type={msg.msg_type} />
            {isApproved && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                Approved
              </span>
            )}
            {isRejected && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                Rejected
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-on-surface truncate">
            From <span className="text-primary">{msg.sender?.email || `@${msg.sender?.handle || msg.sender_user_id}`}</span>
            {msg.sender?.display_name && (
              <span className="text-neutral font-normal text-xs ml-2 opacity-50">({msg.sender.display_name})</span>
            )}
          </p>
          {msg.payload?.topic && (
            <p className="text-xs text-neutral mt-0.5">Topic: <span className="text-on-surface">{msg.payload.topic}</span></p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-neutral shrink-0">
          <Clock size={11} />
          {fmtDate(msg.created_at)}
        </div>
      </div>

      {/* Proposed slots */}
      {slots.length > 0 && !isApproved && !isRejected && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase font-bold tracking-widest text-neutral">
            {slots.length > 1 ? 'Pick a time slot' : 'Proposed slot'}
          </p>
          <div className="grid gap-2">
            {slots.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedSlot(i)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  selectedSlot === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-neutral/10 text-on-surface-variant hover:border-primary/30'
                }`}
              >
                <Calendar size={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{fmtDate(s.start)}</p>
                  <p className="text-[10px] text-neutral">{s.duration_minutes || 30} min</p>
                </div>
                {selectedSlot === i && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed slot (scheduling_confirm) */}
      {msg.msg_type === 'scheduling_confirm' && msg.payload?.slot && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 mb-1">Confirming slot</p>
          <p className="text-sm font-bold text-on-surface flex items-center gap-2">
            <Calendar size={14} className="text-emerald-400" />
            {fmtDate(msg.payload.slot.start)}
          </p>
          <p className="text-xs text-neutral mt-0.5">{msg.payload?.event_title || 'Meeting'}</p>
        </div>
      )}

      {/* Privacy note */}
      <div className="flex items-center gap-1.5 text-[10px] text-neutral/60">
        <Lock size={10} />
        <span>Only your availability was shared — no calendar details exposed</span>
      </div>

      {/* HITL Actions */}
      {isActionable && !isApproved && !isRejected && (
        <div className="flex gap-2 pt-1">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            disabled={loading === msg.msg_id}
            onClick={() => onApprove(msg.msg_id, selectedSlot)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-surface-base font-bold text-sm ai-glow hover:brightness-110 transition-all disabled:opacity-50"
          >
            <Check size={15} />
            {loading === msg.msg_id ? 'Processing…' : 'Approve'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            disabled={loading === msg.msg_id}
            onClick={() => onReject(msg.msg_id)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all disabled:opacity-50"
          >
            <X size={15} />
            Decline
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

// ─── Agent Registry Card ──────────────────────────────────────────────────────

const AgentCard = ({ agent, onSchedule }) => {
  const [scheduling, setScheduling] = useState(false)
  const [topic, setTopic] = useState('')
  const [startDate, setStartDate] = useState('')
  const [notifyEmail, setNotifyEmail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { setView, setTwinChatActiveSessionId } = useStore()

  const handleStartChat = async () => {
    setSending(true)
    try {
      const data = await apiFetch('/twin-chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ partner_id: agent.user_id })
      })
      setTwinChatActiveSessionId(data.session.id)
      setView('twin-chat')
    } catch (err) {
      alert(`Chat failed: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const handleSchedule = async () => {
    if (!topic.trim()) return
    setSending(true)
    try {
      const res = await apiFetch('/agent/schedule', {
        method: 'POST',
        body: JSON.stringify({
          target_handle: agent.handle,
          duration_minutes: 30,
          lookahead_days: 7,
          topic: topic.trim(),
          start_date: startDate || undefined,
          notify_email: notifyEmail,
        }),
      })
      setSent(true)
      setShowForm(false)
      if (onSchedule) onSchedule(res)
    } catch (err) {
      alert(`Scheduling failed: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-container rounded-2xl border border-neutral/10 p-4 hover:border-primary/20 transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-black text-sm border border-primary/20 overflow-hidden">
          {agent.photoURL ? (
            <img src={agent.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            agent.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{agent.email || agent.display_name}</p>
          <p className="text-[11px] text-primary font-mono">{agent.email ? agent.display_name : `@${agent.handle}`}</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-3">
        {(agent.capabilities || []).map(cap => (
          <span key={cap} className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-base border border-neutral/10 text-neutral">
            {cap}
          </span>
        ))}
      </div>

      {/* Schedule form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
          >
            <div className="mb-2 mt-1 space-y-3">
              <div>
                <label className="text-[9px] uppercase font-bold text-neutral mb-1 block pl-1">Topic</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Meeting topic…"
                  className="w-full bg-surface-base border border-neutral/10 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] uppercase font-bold text-neutral mb-1 block pl-1">Suggested Start</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-surface-base border border-neutral/10 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5 pl-2">
                    <input
                        type="checkbox"
                        checked={notifyEmail}
                        onChange={e => setNotifyEmail(e.target.checked)}
                        className="rounded border-neutral/20 text-primary focus:ring-primary"
                        id={`notify-${agent.handle}`}
                    />
                    <label htmlFor={`notify-${agent.handle}`} className="text-[10px] font-bold text-neutral">Notify via Email</label>
                </div>
              </div>
              <button
                onClick={handleSchedule}
                disabled={sending || !topic.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-surface-base font-bold text-sm hover:brightness-110 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
              >
                {sending ? 'Sending proposal…' : 'Propose Meeting'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sent ? (
        <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5 mt-1">
          <Check size={12} /> Proposal sent — awaiting their approval
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={agent.status === 'do_not_disturb'}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-primary/20 text-primary text-xs font-bold hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Calendar size={13} />
            {showForm ? 'Cancel' : 'Schedule'}
          </button>
          <button
            onClick={handleStartChat}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-40"
          >
            <MessageSquare size={13} />
            {sending ? '...' : 'Messaging'}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ─── Main AgentInbox Component ────────────────────────────────────────────────

const AgentInbox = () => {
  const { auth, authInitialized, unreadTwinChats, setView, setTwinChatActiveSessionId } = useStore()
  const userId = auth?.user?.uid
  const accessToken = auth?.user?.accessToken

  const [tab, setTab] = useState('inbox')     // inbox | registry
  const [inbox, setInbox] = useState([])
  const [agents, setAgents] = useState([])
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [wsStatus, setWsStatus] = useState('disconnected') // connected | disconnected
  const [search, setSearch] = useState('')
  const [presenceStatus, setPresenceStatus] = useState('online')
  const [unreadCount, setUnreadCount] = useState(0)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  // ── Fetch inbox ────────────────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/inbox')
      setInbox(data.messages || [])
      const pending = (data.messages || []).filter(m =>
        ['pending', 'delivered'].includes(m.status) &&
        ['scheduling_proposal', 'scheduling_confirm'].includes(m.msg_type)
      ).length
      setUnreadCount(pending)
    } catch (err) {
      console.warn('Inbox fetch failed:', err)
    } finally {
      setLoadingInbox(false)
    }
  }, [])

  // ── Fetch registry ─────────────────────────────────────────────────────────
  const fetchRegistry = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/registry')
      setAgents(data.agents || [])
    } catch (err) {
      console.warn('Registry fetch failed:', err)
    } finally {
      setLoadingAgents(false)
    }
  }, [])

  // ── WebSocket inbox listener ───────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (!authInitialized || !userId || !accessToken) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const proto = API_BASE.startsWith('https') ? 'wss' : (window.location.protocol === 'https:' ? 'wss' : 'ws');
    const host = API_BASE ? API_BASE.replace(/^https?:\/\//, '') : window.location.host;
    const ws = new WebSocket(`${proto}://${host}/agent/ws/${userId}?token=${accessToken}`)
    wsRef.current = ws

    let retryDelay = 5000;

    ws.onopen = () => {
      setWsStatus('connected')
      retryDelay = 5000; // reset on success
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ping') return
        // New message arrived — refresh inbox
        fetchInbox()
      } catch {}
    }

    ws.onclose = (ev) => {
      setWsStatus('disconnected')
      // 4001/4003 = auth errors — do NOT retry
      if (ev.code === 4001 || ev.code === 4003) return;
      reconnectRef.current = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 1.5, 30000);
        connectWS();
      }, retryDelay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [authInitialized, userId, accessToken, fetchInbox])

  useEffect(() => {
    fetchInbox()
    fetchRegistry()
    connectWS()
    return () => {
      wsRef.current?.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [fetchInbox, fetchRegistry, connectWS])

  // ── HITL approve ──────────────────────────────────────────────────────────
  const handleApprove = async (msgId) => {
    setActionLoading(msgId)
    try {
      const res = await apiFetch(`/agent/inbox/${msgId}/approve`, { method: 'POST' })
      await fetchInbox()
      if (res.action === 'meeting_booked') {
        alert('✅ Meeting booked on both calendars!')
      }
    } catch (err) {
      alert(`Approval failed: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // ── HITL reject ───────────────────────────────────────────────────────────
  const handleReject = async (msgId) => {
    setActionLoading(msgId)
    try {
      await apiFetch(`/agent/inbox/${msgId}/reject`, { method: 'POST' })
      await fetchInbox()
    } catch (err) {
      alert(`Rejection failed: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Update own presence status ────────────────────────────────────────────
  const handleStatusChange = async (newStatus) => {
    setPresenceStatus(newStatus)
    try {
      await apiFetch('/agent/status', {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
    } catch (err) {
      console.warn('Status update failed:', err)
    }
  }

  // Filter agents by search
  const filteredAgents = agents.filter(a =>
    !search ||
    a.handle?.toLowerCase().includes(search.toLowerCase()) ||
    a.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  )

  // Filter inbox: pending first, then rest
  const pendingMsgs = inbox.filter(m => ['pending', 'delivered'].includes(m.status))
  // Filter out rejected messages completely so they vanish
  const historyMsgs = inbox.filter(m => !['pending', 'delivered', 'rejected'].includes(m.status))

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-surface-base p-6 pb-36 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-manrope font-extrabold text-on-surface tracking-tight flex items-center gap-2">
            <Users size={22} className="text-primary" />
            Agent Network
          </h1>
          <p className="text-xs text-neutral mt-0.5">Multi-agent inbox &amp; Twin discovery</p>
        </div>
        {/* WS status + presence */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral">
            {wsStatus === 'connected' ? (
              <Wifi size={13} className="text-emerald-400" />
            ) : (
              <WifiOff size={13} className="text-red-400" />
            )}
            <span className={wsStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'}>
              {wsStatus === 'connected' ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
          {/* Presence selector */}
          <select
            value={presenceStatus}
            onChange={e => handleStatusChange(e.target.value)}
            className="text-[10px] font-bold uppercase tracking-widest bg-surface-container border border-neutral/10 rounded-xl px-3 py-1.5 text-neutral outline-none cursor-pointer"
          >
            <option value="online">🟢 Online</option>
            <option value="busy">🟡 Busy</option>
            <option value="do_not_disturb">🔴 Do Not Disturb</option>
          </select>
        </div>
      </div>

      {/* Privacy callout */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-primary/10">
        <Shield size={16} className="text-primary shrink-0" />
        <p className="text-[11px] text-neutral leading-relaxed">
          <span className="text-on-surface font-bold">Privacy guaranteed:</span> Your emails, calendar details, and memory are never shared.
          Only availability windows and capability flags cross agent boundaries.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-2xl border border-neutral/10">
        {[
          { id: 'inbox', label: 'Inbox', icon: Inbox, count: unreadCount + (unreadTwinChats?.length || 0) },
          { id: 'registry', label: 'Discover Twins', icon: Globe },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              tab === t.id
                ? 'bg-primary text-surface-base ai-glow'
                : 'text-neutral hover:text-on-surface'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span className="bg-surface-base text-primary text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── INBOX TAB ── */}
      {tab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral">
              {pendingMsgs.length > 0 || unreadTwinChats.length > 0 ? `${pendingMsgs.length + unreadTwinChats.length} awaiting action` : 'No pending messages'}
            </h2>
            <button
              onClick={fetchInbox}
              className="flex items-center gap-1.5 text-[10px] text-neutral hover:text-primary transition-colors"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>

          {loadingInbox ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-surface-container rounded-2xl border border-neutral/10 p-5 animate-pulse h-48" />
              ))}
            </div>
          ) : (inbox.length === 0 && unreadTwinChats.length === 0) ? (
            <div className="text-center py-16 text-neutral">
              <Inbox size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">No messages yet</p>
              <p className="text-xs mt-1 opacity-70">Scheduling proposals and Twin chats will appear here</p>
            </div>
          ) : (
            <AnimatePresence>
              {/* Unread Twin Chats */}
              {unreadTwinChats.length > 0 && (
                <div className="space-y-3 mb-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <MessageSquare size={11} /> Unread Twin Chats
                  </p>
                  {unreadTwinChats.map((msg, i) => (
                    <motion.div
                      key={`tc-${msg.id}-${i}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-surface-container rounded-2xl border border-neutral/10 hover:border-primary/20 p-5 flex items-start gap-4 transition-all cursor-pointer"
                      onClick={() => {
                        setTwinChatActiveSessionId(msg.session_id);
                        setView('twin-chat');
                      }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0 border border-primary/20">
                        {msg.sender?.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-bold text-on-surface truncate">{msg.sender_name || msg.sender?.name || 'Contact'}</p>
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-widest">New Message</span>
                        </div>
                        <p className="text-sm text-on-surface-variant line-clamp-2">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Pending first */}
              {pendingMsgs.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <Zap size={11} /> Needs your approval
                  </p>
                  {pendingMsgs.map(msg => (
                    <InboxCard
                      key={msg.msg_id}
                      msg={msg}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      loading={actionLoading}
                    />
                  ))}
                </div>
              )}
              {/* History */}
              {historyMsgs.length > 0 && (
                <div className="space-y-3 mt-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral">History</p>
                  {historyMsgs.map(msg => (
                    <InboxCard
                      key={msg.msg_id}
                      msg={msg}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      loading={actionLoading}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* ── REGISTRY TAB ── */}
      {tab === 'registry' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by handle or name…"
              className="w-full bg-surface-container border border-neutral/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral">
              {filteredAgents.length} twin{filteredAgents.length !== 1 ? 's' : ''} discoverable
            </h2>
            <button
              onClick={fetchRegistry}
              className="flex items-center gap-1.5 text-[10px] text-neutral hover:text-primary transition-colors"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>

          {loadingAgents ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface-container rounded-2xl border border-neutral/10 p-4 animate-pulse h-36" />
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-16 text-neutral">
              <Globe size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">No other Twins online</p>
              <p className="text-xs mt-1 opacity-70">Invite someone to join AI Twin — they'll appear here</p>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {filteredAgents.map(agent => (
                  <AgentCard
                    key={agent.user_id}
                    agent={agent}
                    onSchedule={fetchInbox}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentInbox
