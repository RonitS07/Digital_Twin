import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ExternalLink, Link as LinkIcon, Calendar, Package, Plane, Zap, Info, Clock } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useStore } from '../store/useStore';

const InsightIcon = ({ category }) => {
    const cat = category.toLowerCase();
    if (cat.includes('track') || cat.includes('package')) return <Package size={18} />;
    if (cat.includes('flight') || cat.includes('travel')) return <Plane size={18} />;
    if (cat.includes('zoom') || cat.includes('meet') || cat.includes('link')) return <LinkIcon size={18} />;
    if (cat.includes('date') || cat.includes('deadline')) return <Calendar size={18} />;
    return <Zap size={18} />;
};

const IntelligenceHub = () => {
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const { auth } = useStore();
    const accessToken = auth.user?.accessToken;

    useEffect(() => {
        // Don't fetch until user is authenticated
        if (!accessToken) return;

        const fetchInsights = async () => {
            try {
                const data = await apiFetch('/intelligence/insights');
                setInsights(data || []);
            } catch (err) {
                console.error("Failed to fetch insights", err);
            } finally {
                setLoading(false);
            }
        };
        fetchInsights();
        const interval = setInterval(fetchInsights, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, [accessToken]);

    if (loading && insights.length === 0) {
        return (
            <div className="glass-panel p-6 rounded-[2rem] border border-white/5 animate-pulse">
                <div className="h-6 w-32 bg-white/5 rounded-md mb-4" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 w-full bg-white/5 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel p-6 lg:p-8 rounded-[2.5rem] border border-white/5 bg-surface-container-low/40 relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700" />
            
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
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-neutral">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    LIVE
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                    {insights.length > 0 ? (
                        insights
                            .filter(ins => ins.value && ins.value !== 'null' && !ins.key.includes('19DF'))
                            .slice(0, 6)
                            .map((insight, idx) => (
                                <motion.div
                                    key={insight.key + idx}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="group/card bg-surface-container-high/50 hover:bg-surface-container-high border border-white/5 hover:border-primary/20 p-4 rounded-2xl transition-all cursor-default"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-2.5 rounded-xl bg-surface-base text-neutral group-hover/card:text-primary group-hover/card:bg-primary/10 transition-all">
                                            <InsightIcon category={insight.key} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest truncate">
                                                    {insight.key.replace(/_/g, ' ')}
                                                </span>
                                                {String(insight.value).startsWith('http') && (
                                                    <a href={insight.value} target="_blank" rel="noopener noreferrer" className="text-neutral hover:text-primary transition-colors">
                                                        <ExternalLink size={12} />
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-on-surface truncate pr-2">
                                                {insight.value}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2 opacity-50">
                                                <Clock size={10} className="text-neutral" />
                                                <span className="text-[9px] font-bold text-neutral uppercase tracking-tighter">
                                                    {new Date(insight.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                    ) : (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-center">
                            <div className="p-4 rounded-full bg-white/5 text-neutral/20 mb-4">
                                <Info size={32} />
                            </div>
                            <p className="text-sm font-medium text-neutral">No autonomous insights detected yet.</p>
                            <p className="text-[10px] font-bold text-neutral/40 uppercase tracking-widest mt-1">Intelligence is processing your connections</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default IntelligenceHub;
