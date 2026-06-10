import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Calendar, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { useStore } from '../store/useStore';

const CARDS = [
  { key: 'emails', icon: Mail, label: 'Emails Monitored', accent: '#34495E', filter: 'Emails' },
  { key: 'meetings', icon: Calendar, label: 'Meetings Synced', accent: '#2D6A4F', filter: 'Meetings' },
  { key: 'tasks', icon: CheckCircle, label: 'Tasks Executed', accent: '#4A9B6F', filter: 'All Activity' },
  { key: 'efficiency', icon: Clock, label: 'Efficiency Index', accent: '#2D6A4F', filter: null },
];

const MetricCard = ({ icon: Icon, label, value, accent, delay, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
    onClick={onClick}
    className="wi-card flex-1 min-w-0 p-5 lg:p-6 cursor-pointer group hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all"
    whileHover={{ y: -4, transition: { duration: 0.3 } }}
  >
    {/* Icon orb */}
    <div className="relative w-11 h-11 mb-4 rounded-xl flex items-center justify-center bg-white"
      style={{ border: `1px solid ${accent}30` }}>
      <Icon size={20} style={{ color: accent }} />
    </div>

    <p className="font-mono-ji text-[10px] uppercase tracking-widest mb-2" style={{ color: accent }}>{label}</p>

    <div className="flex items-baseline gap-2">
      <h4 className="text-3xl lg:text-4xl font-dm font-semibold text-[#1A1814] tracking-tight leading-none">{value ?? '0'}</h4>
      <span className="font-mono-ji text-[10px] flex items-center gap-0.5" style={{ color: accent }}>
        <TrendingUp size={9} /> +12%
      </span>
    </div>
  </motion.div>
);

const MetricsRow = ({ stats }) => {
  const { setView, setActivityFilter } = useStore();
  return (
    <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-3 lg:gap-4 mb-8 lg:mb-12">
      {CARDS.map((c, i) => (
        <MetricCard
          key={c.key}
          icon={c.icon}
          label={c.label}
          value={stats[c.key] ?? '0'}
          accent={c.accent}
          delay={i * 0.08}
          onClick={c.filter ? () => { setActivityFilter(c.filter); setView('activity'); } : undefined}
        />
      ))}
    </div>
  );
};

export default MetricsRow;
