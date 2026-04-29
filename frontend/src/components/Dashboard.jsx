import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import { motion } from 'framer-motion'
import {
    Sparkles,
    Calendar,
    Zap,
    ExternalLink,
    CheckCircle2
} from 'lucide-react'
import { useStore } from '../store/useStore'

const Dashboard = () => {
    const { auth, tasks, removeTask, preferences } = useStore()
    const user = auth.user || {};
    const accessToken = user.accessToken
    const [greeting, setGreeting] = useState('Good morning');
    const [events, setEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [emails, setEmails] = useState([]);
    const [loadingEmails, setLoadingEmails] = useState(false);

    const [prevIds, setPrevIds] = useState({ gmail: [], calendar: [] })
    const [toast, setToast] = useState(null)

    useEffect(() => {
        const hour = new Date().getHours()
        if (hour < 12) setGreeting('Good morning')
        else if (hour < 18) setGreeting('Good afternoon')
        else setGreeting('Good evening')

        if (!user.uid) return;

        const showToast = (msg) => {
            setToast(msg)
            setTimeout(() => setToast(null), 5000)
        }

        const pollGmail = () => {
            fetch(`${API_BASE}/gmail/inbox?max_results=5`, {
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
            })
                .then(res => res.json())
                .then(data => {
                    if (data.emails) {
                        const newIds = data.emails.map(e => e.id)
                        if (prevIds.gmail.length > 0 && newIds[0] !== prevIds.gmail[0]) {
                            showToast("📩 New Email Received")
                        }
                        setEmails(data.emails)
                        setPrevIds(p => ({ ...p, gmail: newIds }))
                    }
                    setLoadingEmails(false)
                }).catch(() => {})
        }

        const pollCalendar = () => {
            fetch(`${API_BASE}/calendar/events?max_results=20`, {
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
            })
                .then(res => res.json())
                .then(data => {
                    if (data.events) {
                        const newIds = data.events.map(e => e.id)
                        if (prevIds.calendar.length > 0 && newIds.length > prevIds.calendar.length) {
                            showToast("📅 New Event Scheduled")
                        }
                        setEvents(data.events)
                        setPrevIds(p => ({ ...p, calendar: newIds }))
                    }
                    setLoadingEvents(false)
                }).catch(() => {})
        }

        const pollHistory = () => {
            const token = useStore.getState().auth?.user?.accessToken;
            if (!token) return;
            fetch(`${API_BASE}/history`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })
                .then(res => res.json())
                .then(data => {
                    if (data.history) setHistory(data.history.slice(0, 5))
                    setLoadingHistory(false)
                }).catch(() => {})
        }

        // Initial fetch
        if (preferences.gmailSync) pollGmail();
        if (preferences.calendarSync) pollCalendar();
        pollHistory();

        // 🟢 Polling Intervals
        const gmailInt = preferences.gmailSync ? setInterval(pollGmail, 15000) : null;
        const calInt = preferences.calendarSync ? setInterval(pollCalendar, 30000) : null;
        const histInt = setInterval(pollHistory, 30000);

        return () => {
            if (gmailInt) clearInterval(gmailInt);
            if (calInt) clearInterval(calInt);
            clearInterval(histInt);
        };
    }, [user.uid, prevIds.gmail.length, prevIds.calendar.length, preferences, accessToken])

    return (
        <div className="p-10 max-w-7xl mx-auto relative text-on-surface">
            {toast && (
                <motion.div 
                    initial={{ y: -50, opacity: 0 }} 
                    animate={{ y: 20, opacity: 1 }} 
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/20"
                >
                    <Zap size={18} fill="currentColor" />
                    <span className="font-bold text-sm">{toast}</span>
                </motion.div>
            )}
            
            {/* Welcome */}
            <section className="mb-12 flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded uppercase tracking-wider">{user.role || 'Executive'}</span>
                        <span className="text-neutral text-[10px] font-bold uppercase tracking-widest">• {user.company ? `${user.company} Workspace` : 'Personal Workspace'}</span>
                    </div>
                    <h2 className="text-4xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2">{greeting}, {user.name ? user.name.split(' ')[0] : 'there'}.</h2>
                    <p className="text-on-surface-variant max-w-md">Your AI Twin has synthesized 14 overnight updates. Priority focus: <span className="text-tertiary font-semibold underline underline-offset-4 decoration-tertiary/30">Roadmap Alignment</span>.</p>
                </div>
                <button onClick={() => alert("Retrieving Executive Briefing (Phase 3 Integration)")} className="bg-surface-container hover:bg-surface-container-highest text-on-surface px-5 py-2.5 rounded-xl font-medium transition-all text-sm flex items-center gap-2 border border-neutral/5">
                    <Sparkles size={16} className="text-primary" />
                    Daily Briefing
                </button>
            </section>

            {/* Bento Grid */}
            <div className="grid grid-cols-12 gap-6">
                {/* Upcoming Meetings */}
                <div className="col-span-12 lg:col-span-7 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                            <Calendar size={20} className="text-primary" />
                            Upcoming Meetings
                        </h3>
                        <span className="text-xs text-neutral uppercase tracking-widest">{events.length} scheduled</span>
                    </div>

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
                        events.map((ev, i) => (
                            <div key={ev.id || i} className={`glass-panel p-6 rounded-2xl border-l-4 ${i === 0 ? 'border-primary ai-glow' : 'border-tertiary/40'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${i === 0 ? 'text-primary bg-primary/10' : 'text-tertiary bg-tertiary/10'}`}>{i === 0 ? 'Next Up' : 'Upcoming'}</span>
                                            <span className="text-xs text-neutral">
                                                {new Date(ev.start || ev.start?.dateTime || ev.start?.date).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}
                                            </span>
                                        </div>
                                        <h4 className="text-lg font-bold text-on-surface tracking-tight">{ev.title || ev.summary || 'Untitled Event'}</h4>
                                        <p className="text-sm text-on-surface-variant truncate max-w-sm">{ev.attendees?.length > 0 ? ev.attendees.join(', ') : 'No attendees listed'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {ev.meet_link && <a href={ev.meet_link} target="_blank" rel="noreferrer" className="text-center bg-primary text-white font-bold py-2 px-4 rounded-xl text-sm hover:brightness-110 shadow-lg shadow-primary/20 transition-all">Join Meet</a>}
                                    {ev.calendar_link && <a href={ev.calendar_link} target="_blank" rel="noreferrer" className="text-center border border-primary/30 text-primary font-bold py-2 px-4 rounded-xl text-sm hover:bg-primary/10 transition-all">View Event</a>}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Recent Activity */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                            <Zap size={20} className="text-tertiary" />
                            Recent Activity
                        </h3>
                        <span className="text-xs text-neutral uppercase tracking-widest">{history.length} events</span>
                    </div>

                    <div className="space-y-4">
                        {loadingHistory ? (
                            <div className="h-full flex items-center justify-center text-neutral text-xs animate-pulse">Synchronizing Activity...</div>
                        ) : history.length > 0 ? (
                            history.map((item) => (
                                <div key={item.id} className="group p-4 rounded-2xl bg-surface-container-low/50 hover:bg-surface-container-high transition-all border border-neutral/5 hover:border-secondary/20">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-[10px] font-black uppercase tracking-tighter ${item.intent === 'calendar' ? 'text-secondary' : 'text-primary'}`}>
                                            {item.intent} • {item.approved ? 'Approved' : 'Auto'}
                                        </span>
                                        <span className="text-[10px] text-neutral font-medium">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-sm font-semibold text-on-surface line-clamp-1 group-hover:text-secondary transition-colors">{item.input}</p>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                                <Zap size={32} className="mb-2" />
                                <p className="text-xs font-semibold">No activity recorded yet.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Real Gmail Integration */}
                <div className="col-span-12">
                    <div className="glass-panel p-8 rounded-3xl border border-primary/10 relative overflow-hidden">
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px]"></div>
                        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-tertiary/5 rounded-full blur-[100px]"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-8">
                                <Sparkles size={20} className="text-primary" />
                                <h3 className="font-manrope text-xl font-bold tracking-tight">Recent Inbox Highlights</h3>
                            </div>
                            
                            {loadingEmails ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="animate-pulse space-y-3">
                                            <div className="h-3 bg-neutral/20 w-1/3 rounded"></div>
                                            <div className="h-4 bg-neutral/20 w-2/3 rounded"></div>
                                            <div className="h-10 bg-neutral/20 w-full rounded"></div>
                                        </div>
                                    ))}
                                </div>
                            ) : emails.length === 0 ? (
                                <p className="text-on-surface-variant">No recent emails found in your inbox.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                    {emails.slice(0, 3).map((email, idx) => (
                                        <div key={idx} className="space-y-3">
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral font-inter truncate" title={email.from}>{email.from.split('<')[0] || email.from}</h4>
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
    )
}

export default Dashboard
