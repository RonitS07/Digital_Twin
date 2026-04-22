import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'
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

    return (
    <div className="relative">
        <div className={`absolute -left-[51px] top-0 w-5 h-5 rounded-full bg-surface-base border-4 ${color === 'primary' ? 'border-primary' : color === 'tertiary' ? 'border-tertiary' : 'border-neutral'}`}></div>
        <div className="glass-panel p-8 rounded-xl border border-neutral/10 ai-glow group hover:bg-surface-container transition-colors">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${color === 'primary' ? 'bg-primary/10 text-primary' : color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' : 'bg-neutral/10 text-neutral'}`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <h3 className="font-manrope font-bold text-lg text-on-surface">{log.intent ? log.intent.toUpperCase() : 'TASK EXECUTION'}</h3>
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
            <div className={`p-5 rounded-lg bg-surface-bright/50 border-l-4 ${color === 'primary' ? 'border-primary/40' : color === 'tertiary' ? 'border-tertiary/40' : 'border-neutral/40'}`}>
                <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${color === 'primary' ? 'text-primary/60' : color === 'tertiary' ? 'text-tertiary/60' : 'text-neutral/60'}`}>Output Log</span>
                <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto no-scrollbar">{log.output}</p>
            </div>
        </div>
    </div>
    )
}

const Activity = () => {
    const { auth } = useStore()
    const accessToken = auth?.user?.accessToken
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All Activity');

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
        if (activeFilter === 'All Activity') return history;
        if (activeFilter === 'Needs Review') return history.filter(log => !log.approved);
        if (activeFilter === 'Emails') return history.filter(log => log.intent === 'email');
        if (activeFilter === 'Meetings') return history.filter(log => log.intent === 'calendar');
        if (activeFilter === 'Research') return history.filter(log => log.intent === 'search');
        return history;
    };

    const filteredLogs = getFilteredHistory();

    useEffect(() => {
        if (!accessToken) return;
        setLoading(true);
        fetch(`${API_BASE}/history`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (data.history) setHistory(data.history);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessToken]);
    return (
        <div className="p-12 max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
                <div className="flex flex-wrap gap-2">
                    {['All Activity', 'Emails', 'Meetings', 'Research'].map(f => (
                        <button 
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`px-5 py-2 rounded-full text-sm transition-all border ${activeFilter === f 
                                ? 'bg-primary text-surface-base font-semibold shadow-lg shadow-primary/20 border-primary' 
                                : 'bg-surface-container text-on-surface-variant font-medium hover:bg-neutral/20 border-neutral/5'}`}
                        >
                            {f}
                        </button>
                    ))}
                    <button 
                        onClick={() => setActiveFilter('Needs Review')}
                        className={`px-5 py-2 rounded-full text-sm transition-all border flex items-center gap-2 ${activeFilter === 'Needs Review'
                            ? 'bg-tertiary text-surface-base font-semibold shadow-lg shadow-tertiary/20 border-tertiary'
                            : 'bg-surface-container text-on-surface-variant font-medium hover:bg-neutral/20 border-neutral/5'}`}
                    >
                        Needs Review
                        <span className={`w-2 h-2 rounded-full ${activeFilter === 'Needs Review' ? 'bg-surface-base shadow-none' : 'bg-tertiary shadow-[0_0_8px_#ffb695]'}`}></span>
                    </button>
                </div>
                <button onClick={handleExportCsv} className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-neutral/20 text-on-surface-variant text-sm font-bold tracking-tight hover:border-primary/40 hover:text-on-surface transition-all bg-surface-container/30">
                    <Download size={14} />
                    Export CSV
                </button>
            </header>
            <div className="space-y-16">
                <div>
                    <div className="flex items-center gap-4 mb-8">
                        <h2 className="font-manrope text-xl font-bold text-on-surface">Recent Log</h2>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-neutral/20 to-transparent"></div>
                    </div>

                    <div className="relative ml-4 pl-10 border-l-2 border-neutral/10 space-y-10">
                        {loading ? (
                            <div className="text-neutral animate-pulse text-sm">Syncing timeline...</div>
                        ) : filteredLogs.length > 0 ? (
                            filteredLogs.map(log => <TimelineItem key={log.id} log={log} />)
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-surface-container/30 rounded-3xl border border-dashed border-neutral/20">
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
