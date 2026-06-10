import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ExternalLink, Link as LinkIcon, Calendar, Package, Plane, Zap, Info, Clock, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { useStore } from '../store/useStore';

const InsightIcon = ({ category }) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('track') || cat.includes('package')) return <Package size={16} />;
  if (cat.includes('flight') || cat.includes('travel')) return <Plane size={16} />;
  if (cat.includes('zoom') || cat.includes('meet') || cat.includes('link')) return <LinkIcon size={16} />;
  if (cat.includes('date') || cat.includes('deadline')) return <Calendar size={16} />;
  return <Zap size={16} />;
};

const ACCENT_COLORS = ['#2D6A4F', '#4A9B6F', '#1F5437', '#2D6A4F'];
const POLL_MS = 90_000;

const IntelligenceHub = () => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { auth, authInitialized } = useStore();
  const uid = auth?.user?.uid;
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchInsights = useCallback(async (silent = false) => {
    if (!uid) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const data = await apiFetch('/intelligence/insights');
      if (!mountedRef.current) return;
      const clean = (Array.isArray(data) ? data : []).filter(
        ins => ins.value && ins.value !== 'null' && ins.key && !ins.key.includes('19DF')
      );
      setInsights(clean);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      if (err.message?.includes('<!DOCTYPE') || err.message?.includes('not valid JSON') || err.message?.includes('Endpoint returned HTML')) {
        setInsights([]);
      } else { setError('Could not load insights.'); }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [uid]);

  useEffect(() => {
    mountedRef.current = true;
    if (!authInitialized || !auth.user?.accessToken) return;
    fetchInsights();
    pollRef.current = setInterval(() => fetchInsights(true), POLL_MS);
    return () => { mountedRef.current = false; clearInterval(pollRef.current); };
  }, [authInitialized, auth.user?.accessToken, fetchInsights]);

  if (loading && insights.length === 0) {
    return (
      <div className="wi-card p-6 lg:p-8 animate-pulse mb-8 border border-[#E8E4DE] shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-black/5" />
          <div><div className="h-4 w-32 bg-black/5 rounded mb-2" /><div className="h-2 w-24 bg-black/5 rounded" /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="wi-skeleton rounded-xl h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="wi-card overflow-hidden mb-8 p-6 lg:p-8"
    >
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E8F5EE] border border-[#2D6A4F]/20">
              <Sparkles size={18} className="text-[#2D6A4F]" />
            </div>
            <div>
              <h3 className="font-fraunces font-semibold text-[#1A1814] text-lg tracking-tight">Intelligence Hub</h3>
              <p className="font-mono-ji text-[10px] uppercase tracking-widest text-[#2D6A4F]">Autonomous Extractions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="font-dm text-[11px] hidden sm:block text-[#7A7065]">
                {lastUpdated.toLocaleTimeString([], { timeStyle: 'short' })}
              </span>
            )}
            <button onClick={() => fetchInsights(true)} disabled={refreshing}
              className="p-1.5 rounded-lg transition-all disabled:opacity-40 bg-[#F7F5F2] hover:bg-[#E8E4DE] border border-[#E8E4DE]">
              <RefreshCw size={12} className={`text-[#7A7065] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full font-mono-ji text-[9px] uppercase tracking-widest bg-[#E6F4EC] border border-[#2D6A4F]/20 text-[#2D6A4F]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />LIVE
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 bg-[#FFF0EE] border border-[#C0392B]/20 text-[#C0392B]">
            <Info size={14} /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {insights.length > 0 ? insights.slice(0, 6).map((insight, idx) => {
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              return (
                <motion.div key={insight.key + idx} layout
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="group/card flex items-start gap-4 p-4 rounded-xl transition-all cursor-default bg-[#F7F5F2] border border-[#E8E4DE] hover:shadow-sm hover:border-[#2D6A4F]/30"
                >
                  <div className="p-2.5 rounded-xl shrink-0 transition-all bg-white"
                    style={{ border: `1px solid ${accent}30`, color: accent }}>
                    <InsightIcon category={insight.key} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono-ji text-[10px] uppercase tracking-widest truncate" style={{ color: accent }}>
                        {insight.key.replace(/_/g, ' ')}
                      </span>
                      {String(insight.value).startsWith('http') && (
                        <a href={insight.value} target="_blank" rel="noopener noreferrer" style={{ color: accent }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <p className="font-dm text-sm font-medium text-[#1A1814] truncate">{insight.value}</p>
                    {insight.updated_at && (
                      <div className="flex items-center gap-1 mt-1.5 opacity-60">
                        <Clock size={9} className="text-[#A09488]" />
                        <span className="font-mono-ji text-[9px] uppercase tracking-tight text-[#A09488]">
                          {new Date(insight.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            }) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="col-span-full py-12 flex flex-col items-center justify-center text-center">
                <div className="p-4 rounded-full mb-4 bg-[#F7F5F2]">
                  <Info size={28} className="text-[#A09488]" />
                </div>
                <p className="font-dm text-sm font-medium text-[#7A7065]">No autonomous insights detected yet.</p>
                <p className="font-mono-ji text-[10px] uppercase tracking-widest mt-1 text-[#A09488]">
                  Intelligence is processing your connections
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default IntelligenceHub;
