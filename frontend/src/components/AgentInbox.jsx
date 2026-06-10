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
import { playNotificationSound } from '../utils/audio'

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const map = {
    online: { color: 'bg-[#2D6A4F]', label: 'Online' },
    busy: { color: 'bg-[#B45309]', label: 'Busy' },
    do_not_disturb: { color: 'bg-[#C0392B]', label: 'DND' },
  }
  const { color, label } = map[status] || map.online
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />
      <span className="font-mono-ji text-[10px] text-[#7A7065] uppercase tracking-widest">{label}</span>
    </span>
  )
}

// ─── Msg type chip ─────────────────────────────────────────────────────────────

const MsgTypeChip = ({ type }) => {
  const map = {
    scheduling_proposal: { label: 'Meeting Proposal', color: 'bg-[#E8F5EE] text-[#2D6A4F] border-[#2D6A4F]/20' },
    scheduling_confirm: { label: 'Meeting Confirmed', color: 'bg-[#E6F4EC] text-[#2D6A4F] border-[#2D6A4F]/20' },
    scheduling_reject: { label: 'Declined', color: 'bg-[#FFF0EE] text-[#C0392B] border-[#C0392B]/20' },
    scheduling_request: { label: 'Scheduling Request', color: 'bg-[#F7F5F2] text-[#7A7065] border-[#E8E4DE]' },
    agent_chat: { label: 'Agent Chat', color: 'bg-[#F7F5F2] text-[#7A7065] border-[#E8E4DE]' },
    capability_query: { label: 'Capability Query', color: 'bg-[#F7F5F2] text-[#7A7065] border-[#E8E4DE]' },
    capability_response: { label: 'Capability Response', color: 'bg-[#F7F5F2] text-[#7A7065] border-[#E8E4DE]' },
  }
  const { label, color } = map[type] || { label: type, color: 'bg-[#F7F5F2] text-[#7A7065] border-[#E8E4DE]' }
  return (
    <span className={`font-mono-ji text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${color}`}>
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
      className={`wi-card p-5 space-y-4 transition-all ${isRejected ? 'opacity-60 grayscale' :
        isApproved ? 'border-[#2D6A4F]/30 bg-[#E6F4EC]/30' :
          'hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#2D6A4F]/30'
        }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <MsgTypeChip type={msg.msg_type} />
            {isApproved && (
              <span className="font-mono-ji text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20">
                Approved
              </span>
            )}
            {isRejected && (
              <span className="font-mono-ji text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FFF0EE] text-[#C0392B] border border-[#C0392B]/20">
                Rejected
              </span>
            )}
          </div>
          <p className="font-dm text-sm font-medium text-[#1A1814] truncate">
            From <span className="text-[#2D6A4F]">{msg.sender?.email || `@${msg.sender?.handle || msg.sender_user_id}`}</span>
            {msg.sender?.display_name && (
              <span className="text-[#7A7065] font-normal text-xs ml-2 opacity-80">({msg.sender.display_name})</span>
            )}
          </p>
          {msg.payload?.topic && (
            <p className="font-dm text-xs text-[#7A7065] mt-0.5">Topic: <span className="text-[#1A1814]">{msg.payload.topic}</span></p>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono-ji text-[10px] text-[#A09488] shrink-0">
          <Clock size={11} />
          {fmtDate(msg.created_at)}
        </div>
      </div>

      {/* Proposed slots */}
      {slots.length > 0 && !isApproved && !isRejected && (
        <div className="space-y-2">
          <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#7A7065]">
            {slots.length > 1 ? 'Pick a time slot' : 'Proposed slot'}
          </p>
          <div className="grid gap-2">
            {slots.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedSlot(i)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedSlot === i
                  ? 'border-[#2D6A4F] bg-[#E8F5EE] text-[#2D6A4F]'
                  : 'border-[#E8E4DE] text-[#7A7065] hover:border-[#2D6A4F]/30'
                  }`}
              >
                <Calendar size={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-dm text-xs font-medium">{fmtDate(s.start)}</p>
                  <p className="font-dm text-[10px] text-inherit">{s.duration_minutes || 30} min</p>
                </div>
                {selectedSlot === i && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed slot (scheduling_confirm) */}
      {msg.msg_type === 'scheduling_confirm' && msg.payload?.slot && (
        <div className="p-3 rounded-xl bg-[#E6F4EC]/50 border border-[#2D6A4F]/20">
          <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#2D6A4F] mb-1">Confirming slot</p>
          <p className="font-dm text-sm font-medium text-[#1A1814] flex items-center gap-2">
            <Calendar size={14} className="text-[#2D6A4F]" />
            {fmtDate(msg.payload.slot.start)}
          </p>
          <p className="font-dm text-xs text-[#7A7065] mt-0.5">{msg.payload?.event_title || 'Meeting'}</p>
        </div>
      )}

      {/* Privacy note */}
      <div className="flex items-center gap-1.5 font-dm text-[11px] text-[#A09488]">
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
            className="flex-1 btn-primary py-2.5 justify-center disabled:opacity-50 text-sm"
          >
            <Check size={15} />
            {loading === msg.msg_id ? 'Processing…' : 'Approve'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            disabled={loading === msg.msg_id}
            onClick={() => onReject(msg.msg_id)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-[#C0392B]/30 text-[#C0392B] font-dm font-medium text-sm hover:bg-[#FFF0EE] transition-all disabled:opacity-50"
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
      className="wi-card p-4 hover:border-[#2D6A4F]/30 transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-[#E8F5EE] flex items-center justify-center text-[#2D6A4F] font-dm font-medium text-sm border border-[#2D6A4F]/20 overflow-hidden">
          {agent.photoURL ? (
            <img src={agent.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            agent.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-dm text-sm font-medium text-[#1A1814] truncate">{agent.email || agent.display_name}</p>
          <p className="font-mono-ji text-[11px] text-[#A09488]">{agent.email ? agent.display_name : `@${agent.handle}`}</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(agent.capabilities || []).map(cap => (
          <span key={cap} className="font-mono-ji text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#F7F5F2] border border-[#E8E4DE] text-[#7A7065]">
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
                <label className="font-mono-ji text-[9px] uppercase tracking-widest text-[#7A7065] mb-1 block pl-1">Topic</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Meeting topic…"
                  className="wi-input py-1.5 px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-mono-ji text-[9px] uppercase tracking-widest text-[#7A7065] mb-1 block pl-1">Suggested Start</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="wi-input py-1.5 px-3 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5 pl-2 cursor-pointer" onClick={() => setNotifyEmail(!notifyEmail)}>
                  <button type="button" className={`wi-toggle ${notifyEmail ? 'wi-toggle-on' : 'wi-toggle-off'} shrink-0`} style={{ position: 'relative' }}>
                    <div className={`wi-toggle-thumb ${notifyEmail ? 'left-[21px]' : 'left-[3px]'}`} />
                  </button>
                  <label className="font-dm text-[11px] text-[#7A7065] cursor-pointer">Notify via Email</label>
                </div>
              </div>
              <button
                onClick={handleSchedule}
                disabled={sending || !topic.trim()}
                className="btn-primary w-full justify-center py-2 text-xs disabled:opacity-50"
              >
                {sending ? 'Sending proposal…' : 'Propose Meeting'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sent ? (
        <p className="font-dm text-[11px] text-[#2D6A4F] font-medium flex items-center gap-1.5 mt-1">
          <Check size={12} /> Proposal sent — awaiting their approval
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={agent.status === 'do_not_disturb'}
            className="flex-1 btn-secondary justify-center py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Calendar size={13} />
            {showForm ? 'Cancel' : 'Schedule'}
          </button>
          <button
            onClick={handleStartChat}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg bg-[#E8F5EE] text-[#2D6A4F] text-xs font-medium hover:bg-[#FFE3D8] transition-all disabled:opacity-40"
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
  const retryDelayRef = useRef(5000)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

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
    const ws = new WebSocket(`${proto}://${host}/agent/ws/${userId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus('connected')
      retryDelayRef.current = 5000 // reset on success
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      ws.send(JSON.stringify({ event: 'auth', token: accessToken }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ping') return
        playNotificationSound()
        fetchInbox()
      } catch (_) { /* ignore */ }
    }

    ws.onclose = (ev) => {
      setWsStatus('disconnected')
      if (ev.code === 4001 || ev.code === 4003) return;
      reconnectRef.current = setTimeout(() => {
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, 30000);
        connectWS();
      }, retryDelayRef.current)
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
  const handleApprove = async (msgId, slotIndex = 0) => {
    setActionLoading(msgId)
    try {
      const res = await apiFetch(`/agent/inbox/${msgId}/approve?slot_index=${slotIndex}`, { method: 'POST' })
      await fetchInbox()
      if (res.action === 'meeting_booked') {
        showToast('✅ Meeting booked on both calendars!')
      } else {
        showToast('Approved successfully')
      }
    } catch (err) {
      showToast(`Approval failed: ${err.message}`, 'error')
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
      showToast('Declined successfully')
    } catch (err) {
      showToast(`Rejection failed: ${err.message}`, 'error')
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
    <div className="h-full overflow-y-auto bg-[#F7F5F2] font-dm p-6 pb-36 space-y-6 relative text-[#1A1814]">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className={`fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl shadow-sm text-sm font-medium flex items-center gap-2 ${toast.type === 'error'
              ? 'bg-[#FFF0EE] text-[#C0392B] border border-[#C0392B]/20'
              : 'bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20'
              }`}
          >
            {toast.type === 'error' ? '✕' : '✓'} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-fraunces font-semibold text-3xl text-[#1A1814] flex items-center gap-2">
            <Users size={22} className="text-[#2D6A4F]" />
            Agent Network
          </h1>
          <p className="font-dm text-sm text-[#7A7065] mt-1">Multi-agent inbox &amp; Twin discovery</p>
        </div>
        {/* WS status + presence */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-dm text-[11px] text-[#A09488]">
            {wsStatus === 'connected' ? (
              <Wifi size={13} className="text-[#2D6A4F]" />
            ) : (
              <WifiOff size={13} className="text-[#C0392B]" />
            )}
            <span className={wsStatus === 'connected' ? 'text-[#2D6A4F]' : 'text-[#C0392B]'}>
              {wsStatus === 'connected' ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
          {/* Presence selector */}
          <select
            value={presenceStatus}
            onChange={e => handleStatusChange(e.target.value)}
            className="font-dm text-xs font-medium bg-white border border-[#E8E4DE] rounded-lg px-2 py-1.5 text-[#1A1814] outline-none cursor-pointer"
          >
            <option value="online">🟢 Online</option>
            <option value="busy">🟡 Busy</option>
            <option value="do_not_disturb">🔴 DND</option>
          </select>
        </div>
      </div>

      {/* Privacy callout */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#E8E4DE] shadow-sm">
        <Shield size={16} className="text-[#A09488] shrink-0" />
        <p className="font-dm text-[11px] text-[#7A7065] leading-relaxed">
          <span className="text-[#1A1814] font-medium">Privacy guaranteed:</span> Your emails, calendar details, and memory are never shared.
          Only availability windows and capability flags cross agent boundaries.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white rounded-xl border border-[#E8E4DE]">
        {[
          { id: 'inbox', label: 'Inbox', icon: Inbox, count: unreadCount + (unreadTwinChats?.length || 0) },
          { id: 'registry', label: 'Discover Twins', icon: Globe },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id
              ? 'bg-[#F7F5F2] text-[#1A1814] shadow-sm border border-[#E8E4DE]'
              : 'text-[#7A7065] hover:text-[#1A1814]'
              }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span className="bg-[#2D6A4F] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
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
            <h2 className="font-mono-ji text-[10px] uppercase tracking-widest text-[#7A7065]">
              {pendingMsgs.length > 0 || unreadTwinChats.length > 0 ? `${pendingMsgs.length + unreadTwinChats.length} awaiting action` : 'No pending messages'}
            </h2>
            <button
              onClick={fetchInbox}
              className="flex items-center gap-1.5 font-dm text-[11px] text-[#A09488] hover:text-[#2D6A4F] transition-colors"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>

          {loadingInbox ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="wi-skeleton rounded-xl h-48" />
              ))}
            </div>
          ) : (inbox.length === 0 && unreadTwinChats.length === 0) ? (
            <div className="text-center py-16 text-[#A09488]">
              <Inbox size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-dm font-medium text-sm text-[#1A1814]">No messages yet</p>
              <p className="font-dm text-xs mt-1 text-[#7A7065]">Scheduling proposals and Twin chats will appear here</p>
            </div>
          ) : (
            <AnimatePresence>
              {/* Unread Twin Chats */}
              {unreadTwinChats.length > 0 && (
                <div className="space-y-3 mb-6">
                  <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#2D6A4F] flex items-center gap-1.5">
                    <MessageSquare size={11} /> Unread Twin Chats
                  </p>
                  {unreadTwinChats.map((msg, i) => (
                    <motion.div
                      key={`tc-${msg.id}-${i}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="wi-card hover:border-[#2D6A4F]/30 hover:shadow-md p-5 flex items-start gap-4 transition-all cursor-pointer"
                      onClick={() => {
                        setTwinChatActiveSessionId(msg.session_id);
                        setView('twin-chat');
                      }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-[#E8F5EE] flex items-center justify-center font-dm font-medium text-lg text-[#2D6A4F] shrink-0 border border-[#2D6A4F]/20">
                        {msg.sender?.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-dm font-medium text-sm text-[#1A1814] truncate">{msg.sender_name || msg.sender?.name || 'Contact'}</p>
                          <span className="font-mono-ji text-[9px] text-[#2D6A4F] bg-[#E8F5EE] border border-[#2D6A4F]/20 px-2 py-0.5 rounded-full uppercase tracking-widest">New Message</span>
                        </div>
                        <p className="font-dm text-sm text-[#7A7065] line-clamp-2">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Pending first */}
              {pendingMsgs.length > 0 && (
                <div className="space-y-3">
                  <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#B45309] flex items-center gap-1.5">
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
                  <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#7A7065]">History</p>
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A09488]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by handle or name…"
              className="wi-input pl-9"
            />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-mono-ji text-[10px] uppercase tracking-widest text-[#7A7065]">
              {filteredAgents.length} twin{filteredAgents.length !== 1 ? 's' : ''} discoverable
            </h2>
            <button
              onClick={fetchRegistry}
              className="flex items-center gap-1.5 font-dm text-[11px] text-[#A09488] hover:text-[#2D6A4F] transition-colors"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>

          {loadingAgents ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="wi-skeleton rounded-xl h-36" />
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-16 text-[#A09488]">
              <Globe size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-dm font-medium text-sm text-[#1A1814]">No other Twins online</p>
              <p className="font-dm text-xs mt-1 text-[#7A7065]">Invite someone to join AI Twin — they'll appear here</p>
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
