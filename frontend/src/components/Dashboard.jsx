import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Calendar,
    Zap,
    ExternalLink,
    CheckCircle2,
    Clock,
    MapPin,
    Users,
    ArrowRight,
    X,
    Mail,
    Send,
    User as AccountCircle,
    BrainCircuit
} from 'lucide-react'
import { useStore } from '../store/useStore'
import MetricsRow from './MetricsRow'
import CalendarHeatmap from './CalendarHeatmap'
import IntelligenceHub from './IntelligenceHub'

const MeetingDetailModal = ({ event, onClose }) => {
    if (!event) return null;

    const attendeesList = Array.isArray(event.attendees)
        ? event.attendees
        : (event.attendees ? String(event.attendees).split(',') : []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-surface-container-high border border-white/10 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl ai-glow"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative p-8">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 rounded-2xl bg-primary/20 text-primary">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Meeting Intelligence</span>
                            <h2 className="text-2xl font-manrope font-extrabold tracking-tight text-on-surface">{event.title}</h2>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4 group">
                            <div className="p-2.5 rounded-xl bg-surface-container text-neutral group-hover:text-primary transition-colors">
                                <Clock size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-neutral uppercase tracking-widest">Time & Duration</p>
                                <p className="text-on-surface font-medium">
                                    {new Date(event.start).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                                </p>
                                <p className="text-on-surface-variant text-sm">
                                    {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {event.end && ` - ${new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 group">
                            <div className="p-2.5 rounded-xl bg-surface-container text-neutral group-hover:text-primary transition-colors">
                                <MapPin size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-neutral uppercase tracking-widest">Location</p>
                                <p className="text-on-surface font-medium truncate max-w-[300px]">
                                    {event.location || 'Digital Conference'}
                                </p>
                            </div>
                        </div>

                        {attendeesList.length > 0 && (
                            <div className="flex items-center gap-4 group">
                                <div className="p-2.5 rounded-xl bg-surface-container text-neutral group-hover:text-primary transition-colors">
                                    <Users size={18} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-neutral uppercase tracking-widest">Participants</p>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {attendeesList.slice(0, 3).map((a, i) => (
                                            <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-on-surface-variant font-medium border border-white/5">{String(a).trim()}</span>
                                        ))}
                                        {attendeesList.length > 3 && <span className="text-[10px] text-neutral">+{attendeesList.length - 3} more</span>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-10 flex flex-col gap-3">
                        {(() => {
                            const joinLink = event.meet_link || (event.description?.match(/https?:\/\/[^\s]+/)?.[0]);
                            if (joinLink) {
                                return (
                                    <a
                                        href={joinLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full py-4 rounded-2xl bg-primary text-surface-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        <Zap size={18} fill="currentColor" />
                                        Launch Secure Meeting
                                    </a>
                                )
                            }
                            return (
                                <button
                                    className="w-full py-4 rounded-2xl bg-surface-container-highest text-on-surface-variant font-bold flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
                                    disabled
                                >
                                    <Zap size={18} />
                                    No Meeting Link Available
                                </button>
                            )
                        })()}
                        <button
                            onClick={onClose}
                            className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-on-surface font-bold transition-all"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const ActivityDetailModal = ({ log, onClose }) => {
    if (!log) return null;

    const Icon = log.intent === 'email' ? Zap : log.intent === 'calendar' ? Calendar : BrainCircuit;
    const color = log.approved ? 'primary' : 'tertiary';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-surface-container-high border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl ai-glow"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative p-6 sm:p-10">
                    <button
                        onClick={onClose}
                        className="absolute top-8 right-8 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-4 mb-8">
                        <div className={`p-4 rounded-2xl bg-${color}/20 text-${color}`}>
                            <Icon size={28} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral opacity-50">Activity Protocol</span>
                            <h2 className="text-2xl font-manrope font-extrabold tracking-tight text-on-surface uppercase">{log.intent || 'System Task'}</h2>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral uppercase tracking-widest block pl-1">Input Sequence</label>
                            <div className="p-5 rounded-2xl bg-surface-base border border-white/5">
                                <p className="text-on-surface text-sm font-medium leading-relaxed italic">"{log.input}"</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral uppercase tracking-widest block pl-1">Execution Intelligence Output</label>
                            <div className={`p-6 rounded-2xl bg-surface-container border-l-4 ${log.approved ? 'border-primary' : 'border-tertiary'} max-h-64 overflow-y-auto custom-scrollbar`}>
                                {(() => {
                                    try {
                                        let jsonStr = log.output;
                                        const actionMatch = log.output?.match(/<action>([\s\S]*?)<\/action>/i);
                                        if (actionMatch) {
                                            jsonStr = actionMatch[1];
                                        } else {
                                            const mdMatch = log.output?.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                                            if (mdMatch) {
                                                jsonStr = mdMatch[1];
                                            }
                                        }
                                        const parsed = JSON.parse(jsonStr.trim());
                                        return (
                                            <pre className="text-on-surface-variant text-xs leading-relaxed whitespace-pre-wrap font-mono">
                                                {JSON.stringify(parsed, null, 2)}
                                            </pre>
                                        );
                                    } catch (e) {
                                        return <p className="text-on-surface-variant text-xs leading-relaxed whitespace-pre-wrap">{log.output}</p>;
                                    }
                                })()}
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4">
                            <div className="flex items-center gap-6">
                                <div>
                                    <p className="text-[9px] font-bold text-neutral uppercase tracking-widest mb-1">Execution Time</p>
                                    <p className="text-[11px] text-on-surface font-semibold">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-neutral uppercase tracking-widest mb-1">Operational Status</p>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${log.approved ? 'bg-primary/20 text-primary' : 'bg-tertiary/20 text-tertiary font-bold'}`}>
                                        {log.approved ? 'Verified' : 'Manual Audit'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const Dashboard = () => {
    const { auth, tasks, removeTask, preferences, setView } = useStore();
    const user = auth.user || {};
    const accessToken = user.accessToken;

    const [greeting, setGreeting] = useState('Good morning');
    const [events, setEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [emails, setEmails] = useState([]);
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [prevIds, setPrevIds] = useState({ gmail: [], calendar: [] });
    const [toast, setToast] = useState(null);
    const [briefing, setBriefing] = useState(null);
    const [loadingBriefing, setLoadingBriefing] = useState(false);
    const [sendingTelegram, setSendingTelegram] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const briefingCacheRef = React.useRef({ data: null, ts: 0 });
    const BRIEFING_CACHE_MS = 20 * 60 * 1000; // 20 minutes

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 5000);
    };

    const fetchBriefing = async (forceRefresh = false) => {
        const cache = briefingCacheRef.current;
        const now = Date.now();
        // Return cached briefing if still fresh (unless force-refreshed)
        if (!forceRefresh && cache.data && (now - cache.ts) < BRIEFING_CACHE_MS) {
            setBriefing(cache.data);
            return;
        }
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
            // Suppress confused/empty responses - don't show a popup that asks for more info
            const isConfused = ['provide', "don't see", "please share", "need more", "could you", "meeting details"].some(
                phrase => output.toLowerCase().includes(phrase)
            );
            if (output && !isConfused) {
                // 🔴 SANITIZE: Remove any raw <action> blocks that leaked into the text
                const sanitized = output.replace(/<action>[\s\S]*?<\/action>/gi, '').trim();
                briefingCacheRef.current = { data: sanitized, ts: Date.now() };
                setBriefing(sanitized);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingBriefing(false);
        }
    };

    const pollGmail = async () => {
        if (!user?.uid) return;
        try {
            const data = await apiFetch(`/gmail/inbox?max_results=5`);
            if (data.emails) {
                const newIds = data.emails.map(e => e.id);
                if (prevIds.gmail.length > 0 && newIds[0] !== prevIds.gmail[0]) {
                    showToast("📩 New Email Received");
                }
                setEmails(data.emails);
                setPrevIds(p => ({ ...p, gmail: newIds }));
            }
            setLoadingEmails(false);
        } catch (err) { console.error(err); }
    };

    const pollCalendar = async () => {
        if (!user?.uid) return;
        try {
            const data = await apiFetch(`/calendar/events?max_results=20`);
            if (data.events) {
                const newIds = data.events.map(e => e.id);
                if (prevIds.calendar.length > 0 && newIds.length > prevIds.calendar.length) {
                    showToast("📅 New Event Scheduled");
                }
                setEvents(data.events);
                setPrevIds(p => ({ ...p, calendar: newIds }));
            }
            setLoadingEvents(false);
        } catch (err) { console.error(err); }
    };

    const pollHistory = async () => {
        if (!user?.uid) return;
        try {
            const data = await apiFetch(`/history`);
            if (data.history) setHistory(data.history.slice(0, 5));
            setLoadingHistory(false);
        } catch (err) { console.error(err); }
    };

    const pollAnalytics = async () => {
        if (!user?.uid) return;
        try {
            const data = await apiFetch(`/analytics?gmail_sync=${preferences.gmailSync !== false}&calendar_sync=${preferences.calendarSync !== false}`);
            setAnalytics(data);
            setLoadingAnalytics(false);
        } catch (err) { 
            if (err.message?.includes('<!DOCTYPE') || err.message?.includes('not valid JSON')) {
                console.warn('Analytics endpoint returned HTML — backend may not be running');
            } else {
                console.error("Analytics poll error:", err); 
            }
        }
    };

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 18) setGreeting('Good afternoon');
        else setGreeting('Good evening');

        // 🟢 Guard: Don't start polling until user is fully authenticated with a valid token
        if (!user.uid || !auth.isLoggedIn || !accessToken) {
            console.log("Dashboard: Waiting for auth before polling...");
            return;
        }

        // Initial fetch
        if (preferences.gmailSync) pollGmail();
        if (preferences.calendarSync) pollCalendar();
        pollHistory();
        pollAnalytics();

        if (preferences.notifications && !briefing && !loadingBriefing) {
            fetchBriefing();
        }

        const gmailInt = preferences.gmailSync ? setInterval(pollGmail, 60000) : null;
        const calInt = preferences.calendarSync ? setInterval(pollCalendar, 120000) : null;
        const histInt = setInterval(pollHistory, 60000);
        const analyticsInt = setInterval(pollAnalytics, 60000);

        return () => {
            if (gmailInt) clearInterval(gmailInt);
            if (calInt) clearInterval(calInt);
            clearInterval(histInt);
            clearInterval(analyticsInt);
        };
    }, [user.uid, accessToken, preferences]);

    const sendToTelegram = async () => {
        setSendingTelegram(true);
        try {
            await apiFetch(`/test-telegram`);
            showToast("✅ Digital Twin report transmitted to Telegram.");
        } catch (err) {
            showToast("❌ Failed to send Telegram report.");
            console.error(err);
        } finally {
            setSendingTelegram(false);
        }
    };

    const isAnyModalOpen = selectedEvent || selectedActivity || briefing;

    return (
        <div className="relative min-h-screen bg-surface-base font-inter pb-36 overflow-x-hidden">
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 20, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] bg-primary text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/20"
                    >
                        <Zap size={18} fill="currentColor" />
                        <span className="font-bold text-sm">{toast}</span>
                    </motion.div>
                )}

                {selectedEvent && (
                    <MeetingDetailModal
                        event={selectedEvent}
                        onClose={() => setSelectedEvent(null)}
                    />
                )}
                {selectedActivity && (
                    <ActivityDetailModal
                        log={selectedActivity}
                        onClose={() => setSelectedActivity(null)}
                    />
                )}

                {briefing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-md"
                        onClick={() => setBriefing(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-surface-container-high border border-primary/20 rounded-t-3xl sm:rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl ai-glow"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-10 h-1 bg-neutral/30 rounded-full mx-auto mt-3 sm:hidden" />
                            <div className="relative p-6 sm:p-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
                                <button onClick={() => setBriefing(null)} className="absolute top-8 right-8 text-neutral hover:text-on-surface">✕</button>
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 rounded-lg overflow-hidden">
                                             <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />
                                         </div>
                                         <h3 className="font-manrope text-2xl font-extrabold tracking-tight italic text-primary">Intelligence Briefing</h3>
                                     </div>
                                    <button
                                        onClick={sendToTelegram}
                                        disabled={sendingTelegram}
                                        className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        {sendingTelegram ? 'Transmitting...' : 'Send to Telegram'}
                                    </button>
                                </div>
                                <div className="prose prose-invert max-w-none text-on-surface-variant leading-relaxed text-lg">
                                    {briefing.split('\n').map((line, i) => (
                                        <p key={i} className="mb-4">{line}</p>
                                    ))}
                                </div>
                                <div className="mt-10 pt-6 border-t border-white/5 flex justify-end">
                                    <button onClick={() => setBriefing(null)} className="px-8 py-3 rounded-xl bg-primary text-surface-base font-bold text-sm">Acknowledged</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`transition-all duration-700 ease-in-out ${isAnyModalOpen ? 'blur-[30px] scale-[0.98] opacity-30 pointer-events-none' : 'blur-0 scale-100 opacity-100'}`}>
                <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto relative text-on-surface">
                    <section className="mb-6 lg:mb-12">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-black rounded uppercase tracking-widest">{user.role || 'Executive'}</span>
                                    <div className="w-1 h-1 rounded-full bg-neutral/30" />
                                    <span className="text-neutral text-[10px] font-bold uppercase tracking-widest hidden sm:inline">{user.company ? `${user.company} Workspace` : 'Personal Workspace'}</span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl lg:text-5xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2 leading-none italic">{greeting}, {user.name ? user.name.split(' ')[0] : 'there'}.</h2>
                                <p className="text-on-surface-variant text-sm lg:text-lg">Priority: <span className="text-tertiary font-bold">{analytics?.priority || 'Roadmap Alignment'}</span>.</p>
                            </div>
                            <button
                                onClick={fetchBriefing}
                                disabled={loadingBriefing}
                                className="w-full sm:w-auto bg-surface-container hover:bg-surface-container-highest text-on-surface px-5 py-3 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border border-white/5 shadow-xl ai-glow"
                            >
                                <div className={`w-8 h-8 overflow-hidden ${loadingBriefing ? 'animate-spin' : ''}`}>
                                    <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />
                                </div>
                                {loadingBriefing ? 'Synthesizing...' : 'Intelligence Brief'}
                            </button>
                        </div>
                    </section>

                    <CalendarHeatmap data={analytics?.heatmap} loading={loadingAnalytics} />
                    <MetricsRow stats={{
                        emails: analytics?.emails_total || 0,
                        meetings: analytics?.meetings_total || 0,
                        tasks: analytics?.tasks_total || 0,
                        efficiency: analytics?.efficiency || '0%'
                    }} />

                    {/* Intelligence Hub Section */}
                    <section className="mb-12">
                        <IntelligenceHub />
                    </section>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-stretch">
                        <div className="col-span-1 lg:col-span-6 flex flex-col gap-4 lg:gap-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                                    <Calendar size={20} className="text-primary" />
                                    Upcoming Meetings
                                </h3>
                                <button onClick={() => setView('activity')} className="text-[10px] text-primary font-bold uppercase tracking-widest hover:underline transition-all">View All</button>
                            </div>

                            <div className="space-y-6">
                                {loadingEvents ? (
                                    <div className="glass-panel p-6 rounded-2xl border-l-4 border-neutral ai-glow animate-pulse">
                                        <div className="h-4 bg-neutral/20 w-1/3 rounded mb-4"></div>
                                        <div className="h-6 bg-neutral/20 w-2/3 rounded mb-2"></div>
                                        <div className="h-4 bg-neutral/20 w-1/2 rounded"></div>
                                    </div>
                                ) : events.length === 0 ? (
                                    <div className="glass-panel p-6 rounded-2xl border border-neutral/10 text-center opacity-70">
                                        <Calendar size={32} className="mx-auto text-neutral mb-3" />
                                        <p className="text-on-surface font-medium">No meetings scheduled for today.</p>
                                    </div>
                                ) : (
                                    events.slice(0, 4).map((ev, i) => (
                                        <div
                                            key={ev.id || i}
                                            onClick={() => setSelectedEvent(ev)}
                                            className={`group p-5 lg:p-8 rounded-2xl bg-surface-container-low/50 hover:bg-surface-container-high transition-all border border-neutral/5 hover:border-primary/20 flex flex-col justify-center min-h-[100px] lg:min-h-[140px] cursor-pointer active:scale-[0.99] ${i === 0 ? 'ai-glow border-primary/20' : ''}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-tertiary/60'}`} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">{i === 0 ? 'Next Up' : 'Upcoming'}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-neutral uppercase tracking-widest">{new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <h4 className="font-manrope text-sm lg:text-base font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-1">{ev.title}</h4>
                                            <div className="flex items-center justify-between mt-1.5">
                                                <p className="text-[11px] text-on-surface-variant opacity-60 tracking-tight truncate">{ev.location || 'Digital Conference'}</p>
                                                <ArrowRight size={10} className="text-primary/40 group-hover:text-primary transition-all group-hover:translate-x-1 shrink-0" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="col-span-1 lg:col-span-6 flex flex-col gap-4 lg:gap-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                                    <Zap size={20} className="text-tertiary" />
                                    Recent Activity
                                </h3>
                                <button onClick={() => setView('activity')} className="text-[10px] text-tertiary font-bold uppercase tracking-widest hover:underline transition-all">View History</button>
                            </div>

                            <div className="space-y-6 flex-1">
                                {loadingHistory ? (
                                    <div className="h-48 flex items-center justify-center text-neutral text-xs animate-pulse">Synchronizing Activity...</div>
                                ) : history.length > 0 ? (
                                    history.slice(0, 4).map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedActivity(item)}
                                            className="group p-5 lg:p-8 rounded-2xl bg-surface-container-low/50 hover:bg-surface-container-high transition-all border border-neutral/5 hover:border-tertiary/20 flex flex-col justify-center min-h-[100px] lg:min-h-[140px] cursor-pointer active:scale-[0.99]"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${item.intent === 'calendar' ? 'bg-tertiary' : 'bg-primary'}`} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
                                                        {item.intent} • {item.approved ? 'Approved' : 'Auto'}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-neutral uppercase tracking-widest">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <p className="font-manrope text-sm lg:text-base font-bold text-on-surface group-hover:text-tertiary transition-colors line-clamp-1">{item.input}</p>
                                            <div className="flex items-center justify-between mt-1.5">
                                                <p className="text-[11px] text-on-surface-variant opacity-40 uppercase tracking-widest font-black hidden sm:block">Execution Logged</p>
                                                <ArrowRight size={10} className="text-primary/40 group-hover:text-primary transition-all group-hover:translate-x-1" />
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-center p-6 opacity-30">
                                        <Zap size={32} className="mb-2" />
                                        <p className="text-xs font-semibold">No activity recorded yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="col-span-1 lg:col-span-12">
                            <div className="glass-panel p-5 lg:p-8 rounded-3xl border border-primary/10 relative overflow-hidden">
                                <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px]" />
                                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-tertiary/5 rounded-full blur-[100px]" />
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-5 lg:mb-8">
                                        <div className="w-8 h-8 overflow-hidden">
                                            <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />
                                        </div>
                                        <h3 className="font-manrope text-base lg:text-xl font-bold tracking-tight">Recent Inbox Highlights</h3>
                                    </div>

                                    {loadingEmails ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-12">
                                            {[1, 2, 3].map(i => (
                                                <div key={i} className="animate-pulse space-y-3">
                                                    <div className="h-3 bg-neutral/20 w-1/3 rounded" />
                                                    <div className="h-4 bg-neutral/20 w-2/3 rounded" />
                                                    <div className="h-10 bg-neutral/20 w-full rounded" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : emails.length === 0 ? (
                                        <p className="text-on-surface-variant text-sm">No recent emails found in your inbox.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-12">
                                            {emails.slice(0, 3).map((email, idx) => (
                                                <div key={idx} className="space-y-2">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral truncate" title={email.from}>{email.from.split('<')[0] || email.from}</h4>
                                                    <h5 className="font-semibold text-on-surface text-sm truncate">{email.subject || '(No Subject)'}</h5>
                                                    <p className="text-on-surface-variant text-sm leading-relaxed line-clamp-2">{email.snippet}</p>
                                                    <a href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`} target="_blank" rel="noreferrer" className="text-xs text-secondary hover:underline underline-offset-4 flex items-center gap-1 font-medium transition-all">
                                                        Open in Gmail <ExternalLink size={12} />
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
        </div>
    );
};

export default Dashboard;
