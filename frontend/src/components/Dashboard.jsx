import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Zap, ExternalLink, Clock, MapPin, Users, ArrowRight, X, BrainCircuit, Mail } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useStore } from '../store/useStore';
import MetricsRow from './MetricsRow';
import CalendarHeatmap from './CalendarHeatmap';
import IntelligenceHub from './IntelligenceHub';
import AetherBackground from './AetherBackground';
import CoreSynchronization from './CoreSynchronization';

const MeetingDetailModal = ({ event, onClose }) => {
  if (!event) return null;
  const attendeesList = Array.isArray(event.attendees) ? event.attendees : (event.attendees ? String(event.attendees).split(',') : []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="wi-card w-full max-w-lg p-0 overflow-hidden relative" onClick={e => e.stopPropagation()}>
        <div className="p-8">
          <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-[#E8E4DE] transition-colors text-[#7A7065] hover:text-[#1A1814]"><X size={20} /></button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3.5 rounded-xl bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20"><Calendar size={24} /></div>
            <div>
              <span className="font-mono-ji text-[10px] uppercase tracking-widest text-[#2D6A4F]">Meeting Intelligence</span>
              <h2 className="font-fraunces font-semibold text-[#1A1814] text-2xl tracking-tight leading-tight">{event.title}</h2>
            </div>
          </div>
          <div className="space-y-6">
            <div className="flex gap-4 group">
              <div className="p-2.5 rounded-xl bg-[#F7F5F2] border border-[#E8E4DE] text-[#7A7065] group-hover:text-[#2D6A4F] group-hover:border-[#2D6A4F]/30 transition-colors h-fit"><Clock size={18} /></div>
              <div>
                <p className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest mb-1">Time & Duration</p>
                <p className="font-dm font-medium text-[#1A1814]">{new Date(event.start).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <p className="font-dm text-[#7A7065] text-sm mt-0.5">{new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {event.end && ` - ${new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</p>
              </div>
            </div>
            <div className="flex gap-4 group">
              <div className="p-2.5 rounded-xl bg-[#F7F5F2] border border-[#E8E4DE] text-[#7A7065] group-hover:text-[#2D6A4F] group-hover:border-[#2D6A4F]/30 transition-colors h-fit"><MapPin size={18} /></div>
              <div>
                <p className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest mb-1">Location</p>
                <p className="font-dm font-medium text-[#1A1814] truncate max-w-[300px]">{event.location || 'Digital Conference'}</p>
              </div>
            </div>
            {attendeesList.length > 0 && (
              <div className="flex gap-4 group">
                <div className="p-2.5 rounded-xl bg-[#F7F5F2] border border-[#E8E4DE] text-[#7A7065] group-hover:text-[#2D6A4F] group-hover:border-[#2D6A4F]/30 transition-colors h-fit"><Users size={18} /></div>
                <div>
                  <p className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest mb-2">Participants</p>
                  <div className="flex flex-wrap gap-2">
                    {attendeesList.slice(0, 3).map((a, i) => (<span key={i} className="px-3 py-1 rounded-lg bg-[#F7F5F2] text-xs text-[#7A7065] border border-[#E8E4DE] font-medium">{String(a).trim()}</span>))}
                    {attendeesList.length > 3 && <span className="px-3 py-1 rounded-lg bg-[#F7F5F2] text-xs text-[#A09488] border border-[#E8E4DE] font-medium">+{attendeesList.length - 3}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-10">
            {(() => {
              const joinLink = event.meet_link || (event.description?.match(/https?:\/\/[^\s]+/)?.[0]);
              if (joinLink) {
                return (
                  <a href={joinLink} target="_blank" rel="noreferrer" className="w-full py-4 rounded-xl bg-[#2D6A4F] text-white font-medium flex items-center justify-center gap-2 border border-[#2D6A4F] hover:bg-[#1f4b37] transition-all shadow-sm">
                    <Zap size={18} /> Launch Secure Meeting
                  </a>
                );
              }
              return (
                <button className="w-full py-4 rounded-xl bg-[#F7F5F2] text-[#A09488] font-medium flex items-center justify-center gap-2 border border-[#E8E4DE] cursor-not-allowed" disabled>
                  <Zap size={18} /> No Meeting Link
                </button>
              );
            })()}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ActivityDetailModal = ({ log, onClose }) => {
  if (!log) return null;
  const isCalendar = log.intent === 'calendar';
  const color = isCalendar ? '#00C882' : '#6E5AFF';
  const Icon = isCalendar ? Calendar : BrainCircuit;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="wi-card w-full max-w-xl p-0 overflow-hidden relative shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="p-8">
          <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-[#E8E4DE] transition-colors text-[#7A7065] hover:text-[#1A1814]"><X size={20} /></button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 rounded-xl bg-white border border-[#E8E4DE]" style={{ color: color }}>
              <Icon size={28} />
            </div>
            <div>
              <span className="font-mono-ji text-[10px] uppercase tracking-widest text-[#A09488]">Activity Protocol</span>
              <h2 className="font-fraunces font-semibold text-[#1A1814] text-2xl tracking-tight leading-tight uppercase">{log.intent || 'System Task'}</h2>
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <label className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest block mb-2">Input Sequence</label>
              <div className="p-5 rounded-xl bg-[#F7F5F2] border border-[#E8E4DE]">
                <p className="font-dm text-[#1A1814] text-sm font-medium leading-relaxed italic">"{log.input}"</p>
              </div>
            </div>
            <div>
              <label className="font-mono-ji text-[10px] text-[#A09488] uppercase tracking-widest block mb-2">Execution Intelligence Output</label>
              <div className="p-6 rounded-xl bg-white border border-[#E8E4DE] border-l-4 max-h-64 overflow-y-auto no-scrollbar shadow-sm" style={{ borderLeftColor: log.approved ? color : '#C0392B' }}>
                {(() => {
                  try {
                    let jsonStr = log.output;
                    const actionMatch = log.output?.match(/<action>([\s\S]*?)<\/action>/i);
                    if (actionMatch) jsonStr = actionMatch[1];
                    else {
                      const mdMatch = log.output?.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                      if (mdMatch) jsonStr = mdMatch[1];
                    }
                    const parsed = JSON.parse(jsonStr.trim());
                    return <pre className="font-mono-ji text-[#7A7065] text-xs leading-relaxed whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
                  } catch (e) {
                    return <p className="font-mono-ji text-[#7A7065] text-xs leading-relaxed whitespace-pre-wrap">{log.output}</p>;
                  }
                })()}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="font-mono-ji text-[9px] text-[#A09488] uppercase tracking-widest mb-1">Execution Time</p>
                <p className="font-dm text-xs text-[#7A7065] font-medium">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <div>
                <p className="font-mono-ji text-[9px] text-[#A09488] uppercase tracking-widest mb-1 text-right">Status</p>
                <span className="px-3 py-1 rounded-lg font-mono-ji text-[10px] uppercase tracking-widest" style={{ background: log.approved ? `${color}1A` : '#FFF0EE', color: log.approved ? color : '#C0392B' }}>
                  {log.approved ? 'Verified' : 'Manual Audit'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const Dashboard = () => {
  const { auth, authInitialized, preferences, setView } = useStore();
  const user = auth.user || {};
  const [greeting, setGreeting] = useState('Good Morning');
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [emails, setEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [toast, setToast] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const fetchBriefing = async (forceRefresh = false) => {
    setLoadingBriefing(true);
    try {
      const data = await apiFetch(`/ai/process`, {
        method: 'POST',
        body: JSON.stringify({
          input: `Summarize my day: list my upcoming calendar events and any important unread emails. Be concise and professional. If there is nothing to report, say "All clear for today." Do NOT ask for more information.`,
          user_id: user.uid,
          user_name: user.name || 'User',
          gmail_sync: preferences.gmailSync !== false,
          calendar_sync: preferences.calendarSync !== false
        })
      });
      const output = data.output || '';
      const isConfused = ['provide', "don't see", "please share", "need more", "could you", "meeting details"].some(p => output.toLowerCase().includes(p));
      if (output && !isConfused) setBriefing(output.replace(/<action>[\s\S]*?<\/action>/gi, '').trim());
    } catch (err) { console.error(err); } finally { setLoadingBriefing(false); }
  };

  const pollData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      if (preferences.gmailSync) {
        const d = await apiFetch(`/gmail/inbox?max_results=5`);
        if (d.emails) setEmails(d.emails);
        setLoadingEmails(false);
      }
      if (preferences.calendarSync) {
        const d = await apiFetch(`/calendar/events?max_results=20`);
        if (d.events) setEvents(d.events);
        setLoadingEvents(false);
      }
      const h = await apiFetch(`/activity/recent?limit=5`);
      if (h.activity) setHistory(h.activity.slice(0, 5));
      setLoadingHistory(false);

      const a = await apiFetch(`/analytics?gmail_sync=${preferences.gmailSync !== false}&calendar_sync=${preferences.calendarSync !== false}`);
      setAnalytics(a);
      setLoadingAnalytics(false);
    } catch (e) { console.error("Poll error:", e); }
  }, [user, preferences]);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good Morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    if (!authInitialized || !user.uid) return;
    pollData();
    if (preferences.notifications && !briefing && !loadingBriefing) fetchBriefing();
    const interval = setInterval(pollData, 60000);
    return () => clearInterval(interval);
  }, [authInitialized, user.uid, pollData]);

  const sendToTelegram = async () => {
    setSendingTelegram(true);
    try {
      await apiFetch(`/test-telegram`);
      showToast("✅ Digital Twin report transmitted to Telegram.");
    } catch (err) { showToast("❌ Failed to send Telegram report."); }
    finally { setSendingTelegram(false); }
  };

  return (
    <div className="relative min-h-screen bg-[#F7F5F2] font-dm pb-32 overflow-x-hidden text-[#1A1814]">

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 24, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[110] bg-[#6E5AFF]/10 backdrop-blur-xl border border-[#6E5AFF]/30 text-on-surface px-6 py-3 rounded-2xl shadow-[0_10px_40px_rgba(110,90,255,0.15)] flex items-center gap-3">
            <Zap size={16} className="text-[#6E5AFF]" fill="currentColor" />
            <span className="font-bold text-sm">{toast}</span>
          </motion.div>
        )}
        {selectedEvent && <MeetingDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
        {selectedActivity && <ActivityDetailModal log={selectedActivity} onClose={() => setSelectedActivity(null)} />}
        {briefing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setBriefing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="wi-card w-full max-w-2xl p-0 overflow-hidden shadow-xl relative" onClick={e => e.stopPropagation()}>
              <div className="p-10 max-h-[80vh] overflow-y-auto no-scrollbar relative">
                <button onClick={() => setBriefing(null)} className="absolute top-8 right-8 text-[#A09488] hover:text-[#1A1814] transition-colors"><X size={20} /></button>
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-xl bg-[#E6F4EC] flex items-center justify-center border border-[#2D6A4F]/20">
                    <BrainCircuit size={24} className="text-[#2D6A4F]" />
                  </div>
                  <div>
                    <h3 className="font-fraunces font-semibold text-2xl tracking-tight text-[#1A1814]">Intelligence Briefing</h3>
                    <p className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest mt-1">Daily Synthesis</p>
                  </div>
                </div>
                <div className="prose max-w-none text-[#1A1814] font-dm leading-relaxed text-lg mb-10">
                  {briefing.split('\n').map((line, i) => <p key={i} className="mb-4">{line}</p>)}
                </div>
                <div className="flex justify-between items-center pt-6 border-t border-[#E8E4DE]">
                  <button onClick={sendToTelegram} disabled={sendingTelegram}
                    className="btn-secondary">
                    {sendingTelegram ? 'Transmitting...' : 'Send to Telegram'}
                  </button>
                  <button onClick={() => setBriefing(null)} className="btn-primary">Acknowledged</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`relative z-10 transition-all duration-700 ease-[0.23,1,0.32,1] ${(selectedEvent || selectedActivity || briefing) ? 'blur-xl scale-[0.98] opacity-40 pointer-events-none' : 'blur-0 scale-100 opacity-100'}`}>
        <div className="p-6 lg:p-12 max-w-[1600px] mx-auto">

          <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="wi-label">{user.role || 'Executive'}</span>
                {user.company && <span className="wi-label">&middot; {user.company}</span>}
              </div>
              <h1 className="font-fraunces font-semibold text-4xl lg:text-5xl text-[#1A1814] mb-2 leading-tight">{greeting}, {user.name ? user.name.split(' ')[0] : 'there'}.</h1>
              <p className="font-dm text-sm text-[#7A7065]">Priority: <span className="text-[#2D6A4F] font-medium">{analytics?.priority || 'Optimal Alignment'}</span>.</p>
            </motion.div>
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <button onClick={() => fetchBriefing(true)} disabled={loadingBriefing}
                  className="btn-secondary flex items-center gap-2 text-sm">
                  <div className={`w-4 h-4 rounded-full border-2 border-t-[#2D6A4F] border-r-transparent border-b-transparent border-l-transparent ${loadingBriefing ? 'animate-spin' : 'border-[#2D6A4F]'}`} />
                  {loadingBriefing ? 'Synthesizing...' : 'Daily Briefing'}
                </button>
              </motion.div>
            </div>
          </header>

          <div className="mb-12">
            <CalendarHeatmap data={analytics?.heatmap} loading={loadingAnalytics} />
          </div>

          <MetricsRow stats={{ emails: analytics?.emails_total, meetings: analytics?.meetings_total, tasks: analytics?.tasks_total, efficiency: analytics?.efficiency }} />

          <div className="mb-12">
            <IntelligenceHub />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
            {/* Upcoming Events */}
            <div className="xl:col-span-6 flex flex-col gap-5">
              <div>
                <h3 className="wi-section-heading flex items-center gap-2">
                  <Calendar size={16} className="text-[#2D6A4F]" />
                  Upcoming Events
                </h3>
              </div>
              <div className="space-y-3">
                {loadingEvents ? (
                  [1, 2, 3].map(i => <div key={i} className="wi-skeleton h-20 rounded-xl" />)
                ) : events.length === 0 ? (
                  <div className="wi-card flex flex-col items-center justify-center py-10 text-center">
                    <Calendar size={28} className="text-[#A09488] mb-3" />
                    <p className="font-dm text-sm text-[#7A7065]">No scheduled events.</p>
                  </div>
                ) : events.slice(0, 2).map((ev, i) => (
                  <motion.div key={ev.id || i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    onClick={() => setSelectedEvent(ev)}
                    className="wi-card wi-card-accent cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all group">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="wi-label">{i === 0 ? 'Upcoming' : 'Scheduled'}</span>
                        <h4 className="font-dm font-medium text-sm text-[#1A1814] mt-1 group-hover:text-[#2D6A4F] transition-colors line-clamp-1">{ev.title}</h4>
                        <p className="font-dm text-xs text-[#7A7065] mt-0.5 truncate">{ev.location || 'No location'}</p>
                      </div>
                      <span className="font-mono-ji text-[11px] text-[#A09488] shrink-0 ml-4">{new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Activity Stream */}
            <div className="xl:col-span-6 flex flex-col gap-5">
              <h3 className="wi-section-heading flex items-center gap-2">
                <Zap size={16} className="text-[#2D6A4F]" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                {loadingHistory ? (
                  [1, 2, 3].map(i => <div key={i} className="wi-skeleton h-20 rounded-xl" />)
                ) : history.length > 0 ? history.slice(0, 2).map((item, i) => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    onClick={() => setSelectedActivity(item)}
                    className="wi-card cursor-pointer group hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${item.intent === 'calendar' ? 'bg-[#2D6A4F]' : 'bg-[#2D6A4F]'}`} />
                        <div>
                          <span className="wi-label">{item.intent} &middot; {item.approved ? 'Verified' : 'Auto'}</span>
                          <p className="font-dm font-medium text-sm text-[#1A1814] mt-1 line-clamp-1 group-hover:text-[#2D6A4F] transition-colors">{item.input}</p>
                        </div>
                      </div>
                      <span className="font-mono-ji text-[11px] text-[#A09488] shrink-0 ml-4">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </motion.div>
                )) : (
                  <div className="wi-card flex flex-col items-center justify-center py-10 text-center">
                    <BrainCircuit size={28} className="text-[#A09488] mb-3" />
                    <p className="font-dm text-sm text-[#7A7065]">No activity recorded yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Emails Section */}
            <div className="xl:col-span-12 flex flex-col gap-6 mt-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-fraunces text-xl font-semibold text-[#1A1814] tracking-tight flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20"><Mail size={18} /></div>
                  Priority Inbox
                </h3>
                <button onClick={() => setView('activity')} className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest hover:text-[#1A1814] transition-colors">View All</button>
              </div>
              <div className="wi-card p-6 lg:p-8 shadow-sm">
                {loadingEmails ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse space-y-3">
                        <div className="h-3 bg-[#E8E4DE] w-1/3 rounded" />
                        <div className="h-4 bg-[#E8E4DE] w-2/3 rounded" />
                        <div className="h-10 bg-[#F7F5F2] w-full rounded" />
                      </div>
                    ))}
                  </div>
                ) : emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[#A09488] border-dashed border-[#E8E4DE]">
                    <Mail size={32} className="mb-4 opacity-50" />
                    <p className="font-dm font-medium text-sm">No recent emails found in your inbox.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    {emails.slice(0, 3).map((email, idx) => (
                      <div key={idx} className="space-y-2 p-5 rounded-xl bg-[#F7F5F2] border border-[#E8E4DE] hover:bg-white hover:border-[#2D6A4F]/30 hover:shadow-md transition-all group">
                        <h4 className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest truncate" title={email.from}>{email.from.split('<')[0] || email.from}</h4>
                        <h5 className="font-fraunces font-semibold text-[#1A1814] text-sm truncate">{email.subject || '(No Subject)'}</h5>
                        <p className="font-dm text-[#7A7065] text-xs leading-relaxed line-clamp-2">{email.snippet}</p>
                        <a href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`} target="_blank" rel="noreferrer" className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest hover:text-[#1A1814] transition-colors mt-2 inline-flex items-center gap-1">
                          Read in Gmail <ExternalLink size={10} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
