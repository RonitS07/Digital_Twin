import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/apiClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Mail,
    Search,
    Calendar,
    Zap,
    Download,
    Clock,
    RefreshCw,
    Terminal,
    MessageSquare,
    Wifi,
    WifiOff,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

const INTENT_ICON = {
    email: Mail,
    calendar: Calendar,
    search: Search,
    slack: Zap,
    telegram: MessageSquare,
    whatsapp: MessageSquare,
};

const getIcon = (intent) => INTENT_ICON[intent] || Terminal;

const INTENT_COLOR = {
    email: 'primary',
    calendar: 'tertiary',
    slack: 'secondary',
    telegram: 'secondary',
    whatsapp: 'secondary',
};
const getColor = (intent) => INTENT_COLOR[intent] || 'primary';

// ─── Single Timeline Card ─────────────────────────────────────────────────────

const TimelineItem = ({ log, isNew }) => {
    const Icon = getIcon(log.intent);
    const color = getColor(log.intent);
    const status = log.approved ? 'Automated' : 'Needs Review';
    const time = log.timestamp
        ? new Date(log.timestamp).toLocaleTimeString([], { timeStyle: 'short' })
        : '—';

    const isHighlighted = useStore(state => state.highlightedActivityId === log.id);

    return (
        <div
            className={`relative ${isHighlighted ? 'z-10' : ''}`}
            id={`activity-${log.id}`}
        >
            <div
                className={`absolute -left-[33px] sm:-left-[51px] top-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-surface-base border-[3px] sm:border-4
                    ${color === 'primary' ? 'border-primary' : color === 'tertiary' ? 'border-tertiary' : 'border-secondary'}
                    ${isHighlighted ? 'scale-150 animate-pulse border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : ''}
                    ${isNew ? 'animate-ping-once ring-2 ring-primary/30' : ''}`}
            />
            <motion.div
                initial={isNew ? { opacity: 0, y: -10 } : false}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-panel p-4 sm:p-6 rounded-xl border transition-all duration-500
                    ${isHighlighted
                        ? 'border-primary/50 bg-primary/5 shadow-2xl scale-[1.02] ai-glow'
                        : 'border-neutral/10 group hover:bg-surface-container'}`}
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start justify-between sm:gap-4 mb-4">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl
                            ${color === 'primary' ? 'bg-primary/10 text-primary' :
                              color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' :
                                                     'bg-secondary/10 text-secondary'}`}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <h3 className="font-manrope font-bold text-base text-on-surface">
                                {log.intent ? log.intent.toUpperCase() : 'TASK EXECUTION'}
                            </h3>
                            <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{log.input}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[10px] font-bold text-neutral uppercase tracking-widest">{time}</span>
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-tight uppercase border
                            ${status === 'Automated'
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-tertiary/10 text-tertiary border-tertiary/20'}`}>
                            {status}
                        </span>
                    </div>
                </div>
                {log.output && (
                    <div className={`p-3 sm:p-4 rounded-lg bg-surface-bright/50 border-l-4
                        ${color === 'primary' ? 'border-primary/40' : color === 'tertiary' ? 'border-tertiary/40' : 'border-secondary/40'}`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest block mb-1.5
                            ${color === 'primary' ? 'text-primary/60' : color === 'tertiary' ? 'text-tertiary/60' : 'text-secondary/60'}`}>
                            Output
                        </span>
                        <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto no-scrollbar line-clamp-4">
                            {log.output.replace(/<action>[\s\S]*?<\/action>/gi, '').trim()}
                        </p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

// ─── Main Activity Component ──────────────────────────────────────────────────

const FILTERS = ['All Activity', 'Emails', 'Meetings', 'Research', 'Needs Review'];
const POLL_MS = 30_000; // 30 seconds

const Activity = () => {
    const { auth, authInitialized, highlightedActivityId, setHighlightedActivityId, activityFilter, setActivityFilter } = useStore();
    const accessToken = auth?.user?.accessToken;

    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [newIds, setNewIds] = useState(new Set());
    const [wsStatus, setWsStatus] = useState('disconnected');

    const knownIdsRef = useRef(new Set());
    const wsRef = useRef(null);
    const pollRef = useRef(null);

    // ── Fetch activity ──────────────────────────────────────────────────────────
    const fetchActivity = useCallback(async (silent = false) => {
        if (!auth?.user?.uid) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/activity/recent?limit=100');
            const items = data.activity || [];

            // Detect genuinely new items for the "new" animation
            const incoming = new Set(items.map(i => i.id));
            const appeared = items.filter(i => !knownIdsRef.current.has(i.id) && knownIdsRef.current.size > 0);
            if (appeared.length > 0) {
                setNewIds(new Set(appeared.map(i => i.id)));
                setTimeout(() => setNewIds(new Set()), 3000);
            }
            knownIdsRef.current = incoming;

            setActivity(items);
            setLastUpdated(new Date());
        } catch (err) {
            setError('Failed to load activity. Retrying soon…');
            console.error('Activity fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [auth?.user?.uid]);

    // ── WebSocket — listens for new task events pushed by backend ──────────────
    useEffect(() => {
        if (!authInitialized || !accessToken || !auth?.user?.uid) return;
        let alive = true;
        let retryDelay = 3000;

        const connect = () => {
            if (!alive) return;
            const proto = API_BASE.startsWith('https') ? 'wss' : 'ws';
            const host = API_BASE.replace(/^https?:\/\//, '');
            // C5 FIX: No token in URL — send it as the first JSON frame in onopen.
            const ws = new WebSocket(`${proto}://${host}/twin-chat/ws`);
            wsRef.current = ws;

            ws.onopen = () => {
                // C5 FIX: First-frame authentication.
                ws.send(JSON.stringify({ event: 'auth', token: accessToken }));
                setWsStatus('connected');
                retryDelay = 3000;
            };
            ws.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data);
                    // Any new task / AI reply → refresh activity silently
                    if (d.event === 'new_message' || d.event === 'task_complete') {
                        fetchActivity(true);
                    }
                } catch {}
            };
            ws.onclose = (ev) => {
                setWsStatus('disconnected');
                // 4001 = bad auth, 4003 = token expired — don't reconnect
                if (ev.code === 4001 || ev.code === 4003) return;
                if (alive) setTimeout(connect, retryDelay = Math.min(retryDelay * 1.5, 15000));
            };
            ws.onerror = () => ws.close();
        };
        connect();
        return () => { alive = false; wsRef.current?.close(); };
    }, [authInitialized, accessToken, auth?.user?.uid, fetchActivity]);

    // ── Polling fallback (30s) ─────────────────────────────────────────────────
    useEffect(() => {
        if (!authInitialized || !auth?.user?.uid) return;
        fetchActivity();
        pollRef.current = setInterval(() => fetchActivity(true), POLL_MS);
        return () => clearInterval(pollRef.current);
    }, [authInitialized, auth?.user?.uid, fetchActivity]);

    // ── Scroll to highlighted item ─────────────────────────────────────────────
    useEffect(() => {
        if (highlightedActivityId && !loading) {
            const el = document.getElementById(`activity-${highlightedActivityId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const t = setTimeout(() => setHighlightedActivityId(null), 5000);
                return () => clearTimeout(t);
            }
        }
    }, [highlightedActivityId, loading, setHighlightedActivityId]);

    // ── CSV export ─────────────────────────────────────────────────────────────
    const handleExportCsv = () => {
        if (!activity.length) return;
        const rows = [
            ['ID', 'Timestamp', 'Intent', 'Input', 'Output', 'Approved'],
            ...activity.map(l => [
                l.id, l.timestamp, l.intent,
                `"${(l.input || '').replace(/"/g, '""')}"`,
                `"${(l.output || '').replace(/"/g, '""')}"`,
                l.approved,
            ]),
        ];
        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
            href: url,
            download: `twin_activity_${new Date().toISOString().split('T')[0]}.csv`,
        });
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Filtering ──────────────────────────────────────────────────────────────
    const filtered = activity.filter(log => {
        switch (activityFilter) {
            case 'Emails':       return log.intent === 'email';
            case 'Meetings':     return log.intent === 'calendar';
            case 'Research':     return log.intent === 'search';
            case 'Needs Review': return !log.approved;
            default:             return true;
        }
    });

    // Group by date
    const grouped = filtered.reduce((acc, log) => {
        const date = log.timestamp
            ? new Date(log.timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
            : 'Unknown date';
        (acc[date] = acc[date] || []).push(log);
        return acc;
    }, {});

    return (
        <div className="p-4 sm:p-6 lg:p-12 max-w-6xl mx-auto pb-36">
            {/* Header */}
            <header className="flex flex-col gap-4 mb-6 sm:mb-10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(f => (
                            <button
                                key={f}
                                onClick={() => setActivityFilter(f)}
                                className={`px-4 py-1.5 rounded-full text-sm transition-all border
                                    ${activityFilter === f
                                        ? f === 'Needs Review'
                                            ? 'bg-tertiary text-surface-base font-semibold border-tertiary shadow-lg shadow-tertiary/20'
                                            : 'bg-primary text-surface-base font-semibold shadow-lg shadow-primary/20 border-primary'
                                        : 'bg-surface-container text-on-surface-variant font-medium hover:bg-neutral/20 border-neutral/5'}`}
                            >
                                {f}
                                {f === 'Needs Review' && activityFilter !== 'Needs Review' && (
                                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-tertiary inline-block shadow-[0_0_8px_#ffb695]" />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Live status indicator */}
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                            {wsStatus === 'connected'
                                ? <><Wifi size={12} className="text-primary" /><span className="text-primary">Live</span></>
                                : <><WifiOff size={12} className="text-neutral/50" /><span className="text-neutral/50">Polling</span></>
                            }
                        </div>

                        {lastUpdated && (
                            <span className="text-[10px] text-neutral/50">
                                Updated {lastUpdated.toLocaleTimeString([], { timeStyle: 'short' })}
                            </span>
                        )}

                        <button
                            onClick={() => fetchActivity()}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-[10px] text-neutral hover:text-primary transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>

                        <button
                            onClick={handleExportCsv}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-neutral/20 text-on-surface-variant text-xs font-bold hover:border-primary/40 hover:text-on-surface transition-all bg-surface-container/30"
                        >
                            <Download size={12} /> Export CSV
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="text-xs text-red-400 font-medium px-1">{error}</p>
                )}
            </header>

            {/* Timeline */}
            <div className="space-y-10">
                {loading && activity.length === 0 ? (
                    <div className="space-y-6">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="animate-pulse h-32 rounded-xl bg-surface-container border border-neutral/10" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-surface-container/30 rounded-3xl border border-dashed border-neutral/20">
                        <Zap size={32} className="text-neutral opacity-20 mb-3" />
                        <h3 className="font-manrope text-lg font-bold text-on-surface-variant/80">No activity</h3>
                        <p className="text-on-surface-variant text-sm mt-2 opacity-60 text-center max-w-xs">
                            {activityFilter === 'All Activity'
                                ? 'Your AI Twin is standing by. Give it a task to get started.'
                                : `No "${activityFilter}" entries found.`}
                        </p>
                    </div>
                ) : (
                    Object.entries(grouped).map(([date, logs]) => (
                        <div key={date} className="relative">
                            <h4 className="text-[10px] font-black text-neutral uppercase tracking-[0.2em] mb-6 sticky top-16 bg-surface-base/90 py-3 backdrop-blur-xl z-20 w-fit rounded-full px-4 border border-neutral/10">
                                {date}
                            </h4>
                            <div className="relative ml-2 sm:ml-4 pl-6 sm:pl-10 border-l-2 border-neutral/10 space-y-6">
                                <AnimatePresence>
                                    {logs.map(log => (
                                        <TimelineItem
                                            key={log.id}
                                            log={log}
                                            isNew={newIds.has(log.id)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Activity;
