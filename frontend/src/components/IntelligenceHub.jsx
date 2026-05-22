import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ExternalLink, Link as LinkIcon, Calendar, Package, Plane, Zap, Info, Clock, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useStore } from '../store/useStore';

const InsightIcon = ({ category }) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('track') || cat.includes('package')) return <Package size={18} />;
    if (cat.includes('flight') || cat.includes('travel')) return <Plane size={18} />;
    if (cat.includes('zoom') || cat.includes('meet') || cat.includes('link')) return <LinkIcon size={18} />;
    if (cat.includes('date') || cat.includes('deadline')) return <Calendar size={18} />;
    return <Zap size={18} />;
};

const POLL_MS = 90_000; // 90 seconds — insights change slowly

const IntelligenceHub = () => {
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const { auth, authInitialized } = useStore();
    const accessToken = auth.user?.accessToken;
    const pollRef = useRef(null);
    const mountedRef = useRef(true);

    const fetchInsights = useCallback(async (silent = false) => {
        if (!auth?.user?.uid) return;
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);

        try {
            const data = await apiFetch('/intelligence/insights');
            if (!mountedRef.current) return;

            // Filter out garbage entries
            const clean = (Array.isArray(data) ? data : []).filter(
                ins => ins.value && ins.value !== 'null' && ins.key && !ins.key.includes('19DF')
            );
            setInsights(clean);
            setLastUpdated(new Date());
        } catch (err) {
            if (!mountedRef.current) return;
            // HTML response = endpoint not yet deployed, silently empty
            if (
                err.message?.includes('<!DOCTYPE') ||
                err.message?.includes('not valid JSON') ||
                err.message?.includes('Endpoint returned HTML')
            ) {
                setInsights([]);
            } else {
                setError('Could not load insights.');
                console.error('[IntelligenceHub] fetch error:', err);
            }
        } finally {
            if (!mountedRef.current) return;
            setLoading(false);
            setRefreshing(false);
        }
    }, [auth?.user?.uid]);

    // Initial fetch + polling
    useEffect(() => {
        mountedRef.current = true;
        if (!authInitialized || !accessToken) return;

        fetchInsights();
        pollRef.current = setInterval(() => fetchInsights(true), POLL_MS);

        return () => {
            mountedRef.current = false;
            clearInterval(pollRef.current);
        };
    }, [authInitialized, accessToken, fetchInsights]);

    // ── Skeleton ───────────────────────────────────────────────────────────────
    if (loading && insights.length === 0) {
        return (
            <div className="glass-panel p-6 rounded-[2rem] border border-white/5 animate-pulse">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-white/5" />
                    <div>
                        <div className="h-4 w-32 bg-white/5 rounded mb-1.5" />
                        <div className="h-2.5 w-24 bg-white/5 rounded" />
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-20 w-full bg-white/5 rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel p-6 lg:p-8 rounded-[2.5rem] border border-white/5 bg-surface-container-low/40 relative overflow-hidden group">
            {/* Ambient glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700" />

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-manrope font-black text-on-surface tracking-tight">Intelligence Hub</h3>
                        <p className="text-[10px] font-bold text-neutral uppercase tracking-[0.2em]">Autonomous Extractions</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-[9px] text-neutral/50 hidden sm:block">
                            {lastUpdated.toLocaleTimeString([], { timeStyle: 'short' })}
                        </span>
                    )}
                    <button
                        onClick={() => fetchInsights(true)}
                        disabled={refreshing}
                        title="Refresh insights"
                        className="p-1.5 rounded-lg hover:bg-white/5 text-neutral hover:text-primary transition-all disabled:opacity-40"
                    >
                        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-neutral">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        LIVE
                    </div>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
                    <Info size={14} /> {error}
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                    {insights.length > 0 ? (
                        insights.slice(0, 6).map((insight, idx) => (
                            <motion.div
                                key={insight.key + idx}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.04, duration: 0.3 }}
                                className="group/card bg-surface-container-high/50 hover:bg-surface-container-high border border-white/5 hover:border-primary/20 p-4 rounded-2xl transition-all cursor-default"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 rounded-xl bg-surface-base text-neutral group-hover/card:text-primary group-hover/card:bg-primary/10 transition-all shrink-0">
                                        <InsightIcon category={insight.key} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest truncate">
                                                {insight.key.replace(/_/g, ' ')}
                                            </span>
                                            {String(insight.value).startsWith('http') && (
                                                <a
                                                    href={insight.value}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-neutral hover:text-primary transition-colors shrink-0"
                                                >
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-on-surface truncate pr-2">
                                            {insight.value}
                                        </p>
                                        {insight.updated_at && (
                                            <div className="flex items-center gap-1.5 mt-2 opacity-50">
                                                <Clock size={10} className="text-neutral" />
                                                <span className="text-[9px] font-bold text-neutral uppercase tracking-tighter">
                                                    {new Date(insight.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="col-span-full py-12 flex flex-col items-center justify-center text-center"
                        >
                            <div className="p-4 rounded-full bg-white/5 text-neutral/20 mb-4">
                                <Info size={32} />
                            </div>
                            <p className="text-sm font-medium text-neutral">No autonomous insights detected yet.</p>
                            <p className="text-[10px] font-bold text-neutral/40 uppercase tracking-widest mt-1">
                                Intelligence is processing your connections
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default IntelligenceHub;
