import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import { apiFetch } from '../utils/apiClient'
import { motion } from 'framer-motion'
import {
    Mail,
    Search,
    Calendar,
    Zap,
    Download,
    CheckCircle,
    AlertCircle,
    Clock,
    ChevronRight,
    TrendingUp,
    Box,
    Terminal
} from 'lucide-react'
import { useStore } from '../store/useStore'

const getIconForIntent = (intent) => {
    switch (intent) {
        case 'email': return Mail;
        case 'calendar': return Calendar;
        case 'search': return Search;
        default: return Terminal;
    }
}

const TimelineItem = ({ log }) => {
    const Icon = getIconForIntent(log.intent);
    const color = log.approved ? 'primary' : 'tertiary';
    const status = log.approved ? 'Automated' : 'Needs Review';
    const time = new Date(log.timestamp).toLocaleTimeString([], {timeStyle: 'short'});

    const isHighlighted = useStore(state => state.highlightedActivityId === log.id);

    return (
    <div className={`relative ${isHighlighted ? 'z-10' : ''}`} id={`activity-${log.id}`}>
        <div className={`absolute -left-[33px] sm:-left-[51px] top-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-surface-base border-[3px] sm:border-4 ${color === 'primary' ? 'border-primary' : color === 'tertiary' ? 'border-tertiary' : 'border-neutral'} ${isHighlighted ? 'scale-150 animate-pulse border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : ''}`}></div>
        <div className={`glass-panel p-4 sm:p-6 lg:p-8 rounded-xl border transition-all duration-500 ${isHighlighted ? 'border-primary/50 bg-primary/5 shadow-2xl scale-[1.02] ai-glow' : 'border-neutral/10 group hover:bg-surface-container'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start justify-between sm:gap-4 mb-4 sm:mb-6">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${color === 'primary' ? 'bg-primary/10 text-primary' : color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' : 'bg-neutral/10 text-neutral'}`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <h3 className="font-manrope font-bold text-base sm:text-lg text-on-surface">{log.intent ? log.intent.toUpperCase() : 'TASK EXECUTION'}</h3>
                        <p className="text-sm text-on-surface-variant mt-1">{log.input}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className="text-[10px] font-bold text-neutral uppercase tracking-widest">{time}</span>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-tight uppercase border ${status === 'Sent for Review' ? 'bg-primary/10 text-primary border-primary/20' :
                            status === 'Needs Review' ? 'bg-tertiary/10 text-tertiary border-tertiary/20' :
                                'bg-neutral/10 text-neutral border-neutral/20'
                        }`}>
                        {status}
                    </span>
                </div>
            </div>
            <div className={`p-3 sm:p-5 rounded-lg bg-surface-bright/50 border-l-4 ${color === 'primary' ? 'border-primary/40' : color === 'tertiary' ? 'border-tertiary/40' : 'border-neutral/40'}`}>
                <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${color === 'primary' ? 'text-primary/60' : color === 'tertiary' ? 'text-tertiary/60' : 'text-neutral/60'}`}>Output Log</span>
                <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto no-scrollbar">{log.output}</p>
            </div>
        </div>
    </div>
    )
}

const Activity = () => {
    const { auth, highlightedActivityId, setHighlightedActivityId, activityFilter, setActivityFilter } = useStore()
    const accessToken = auth?.user?.accessToken
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (highlightedActivityId && !loading) {
            const element = document.getElementById(`activity-${highlightedActivityId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // We keep the highlight for 3 seconds then clear it to allow re-triggering
                const timer = setTimeout(() => {
                    setHighlightedActivityId(null);
                }, 5000);
                return () => clearTimeout(timer);
            }
        }
    }, [highlightedActivityId, loading]);

    const handleExportCsv = () => {
        if (!history || history.length === 0) return;
        const headers = ['ID', 'Timestamp', 'Intent', 'Input', 'Output', 'Approved'];
        const csvRows = [];
        csvRows.push(headers.join(','));

        history.forEach(log => {
            const values = [
                log.id,
                log.timestamp,
                log.intent,
                `"${log.input.replace(/"/g, '""')}"`,
                `"${log.output.replace(/"/g, '""')}"`,
                log.approved
            ];
            csvRows.push(values.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `twin_activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getFilteredHistory = () => {
        if (activityFilter === 'All Activity') return history;
        if (activityFilter === 'Needs Review') return history.filter(log => !log.approved);
        if (activityFilter === 'Emails') return history.filter(log => log.intent === 'email');
        if (activityFilter === 'Meetings') return history.filter(log => log.intent === 'calendar');
        if (activityFilter === 'Research') return history.filter(log => log.intent === 'search');
        return history;
    };

    const filteredLogs = getFilteredHistory();

    useEffect(() => {
        if (!auth?.user?.uid) {
            setLoading(false);
            return;
        }
        setLoading(true);
        apiFetch(`/history`)
            .then(data => {
                if (data.history) setHistory(data.history);
            })
            .catch(err => console.error("Activity fetch failure:", err))
            .finally(() => setLoading(false));
    }, [auth?.user?.uid]);
    return (
        <div className="p-4 sm:p-6 lg:p-12 max-w-6xl mx-auto pb-36">
            <header className="flex flex-col gap-4 mb-6 sm:mb-12">
                <div className="flex flex-wrap gap-2">
                    {['All Activity', 'Emails', 'Meetings', 'Research'].map(f => (
                        <button 
                            key={f}
                            onClick={() => setActivityFilter(f)}
                            className={`px-5 py-2 rounded-full text-sm transition-all border ${activityFilter === f 
                                ? 'bg-primary text-surface-base font-semibold shadow-lg shadow-primary/20 border-primary' 
                                : 'bg-surface-container text-on-surface-variant font-medium hover:bg-neutral/20 border-neutral/5'}`}
                        >
                            {f}
                        </button>
                    ))}
                    <button 
                        onClick={() => setActivityFilter('Needs Review')}
                        className={`px-5 py-2 rounded-full text-sm transition-all border flex items-center gap-2 ${activityFilter === 'Needs Review'
                            ? 'bg-tertiary text-surface-base font-semibold shadow-lg shadow-tertiary/20 border-tertiary'
                            : 'bg-surface-container text-on-surface-variant font-medium hover:bg-neutral/20 border-neutral/5'}`}
                    >
                        Needs Review
                        <span className={`w-2 h-2 rounded-full ${activityFilter === 'Needs Review' ? 'bg-surface-base shadow-none' : 'bg-tertiary shadow-[0_0_8px_#ffb695]'}`}></span>
                    </button>
                </div>
                <button onClick={handleExportCsv} className="flex items-center gap-2 px-5 py-2 rounded-full border border-neutral/20 text-on-surface-variant text-sm font-bold tracking-tight hover:border-primary/40 hover:text-on-surface transition-all bg-surface-container/30 w-fit">
                    <Download size={14} />
                    Export CSV
                </button>
            </header>
            <div className="space-y-8 sm:space-y-16">
                <div>
                    <div className="flex items-center gap-4 mb-6 sm:mb-8">
                        <h2 className="font-manrope text-xl font-bold text-on-surface">Recent Log</h2>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-neutral/20 to-transparent"></div>
                    </div>

                    <div className="space-y-10">
                        {loading ? (
                            <div className="text-neutral animate-pulse text-sm ml-2 sm:ml-4">Syncing timeline...</div>
                        ) : filteredLogs.length > 0 ? (
                            Object.entries(filteredLogs.reduce((acc, log) => {
                                const dateStr = new Date(log.timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                                if (!acc[dateStr]) acc[dateStr] = [];
                                acc[dateStr].push(log);
                                return acc;
                            }, {})).map(([date, logs]) => (
                                <div key={date} className="relative">
                                    <h4 className="text-[10px] font-black text-neutral uppercase tracking-[0.2em] mb-6 sticky top-16 bg-surface-base/90 py-3 backdrop-blur-xl z-20 w-fit rounded-full px-4 border border-neutral/10">
                                        {date}
                                    </h4>
                                    <div className="relative ml-2 sm:ml-4 pl-6 sm:pl-10 border-l-2 border-neutral/10 space-y-6 sm:space-y-10">
                                        {logs.map(log => <TimelineItem key={log.id} log={log} />)}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-surface-container/30 rounded-3xl border border-dashed border-neutral/20 ml-2 sm:ml-4">
                                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-6">
                                    <Zap size={32} className="text-neutral opacity-20" />
                                </div>
                                <h3 className="font-manrope text-lg font-bold text-on-surface-variant/80">No recent activity</h3>
                                <p className="text-on-surface-variant text-sm mt-2 max-w-xs text-center opacity-60">Your AI Twin is standing by. Give it a task or check back later for automated updates.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Activity
