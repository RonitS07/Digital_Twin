import React from 'react';
import { motion } from 'framer-motion';
import { 
    Mail, 
    Calendar, 
    CheckCircle, 
    BarChart3, 
    TrendingUp, 
    Clock 
} from 'lucide-react';
import { useStore } from '../store/useStore';

const MetricCard = ({ icon: Icon, label, value, color, delay, onClick }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        onClick={onClick}
        className={`flex-1 min-w-0 glass-panel p-4 lg:p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all group ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
    >
        <div className="flex items-center gap-4">
            <div className={`p-2.5 lg:p-3 rounded-xl bg-${color}/10 text-${color} group-hover:scale-110 transition-transform`}>
                <Icon size={20} />
            </div>
            <div>
                <p className="text-[9px] lg:text-xs text-neutral font-bold uppercase tracking-widest mb-1">{label}</p>
                <div className="flex items-end gap-1.5 lg:gap-2">
                    <h4 className="text-xl lg:text-2xl font-manrope font-black text-on-surface tracking-tighter">{value}</h4>
                    <span className="text-[10px] text-primary font-bold mb-1 flex items-center gap-0.5">
                        <TrendingUp size={10} /> +12%
                    </span>
                </div>
            </div>
        </div>
    </motion.div>
);

const MetricsRow = ({ stats }) => {
    const { setView, setActivityFilter } = useStore();
    
    return (
        <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-3 lg:gap-4 mb-6 lg:mb-10">
            <MetricCard 
                icon={Mail} 
                label="Emails Monitored" 
                value={stats.emails ?? '0'} 
                color="primary" 
                delay={0.1} 
                onClick={() => {
                    setActivityFilter('Emails');
                    setView('activity');
                }}
            />
            <MetricCard 
                icon={Calendar} 
                label="Meetings Synced" 
                value={stats.meetings ?? '0'} 
                color="tertiary" 
                delay={0.2} 
                onClick={() => {
                    setActivityFilter('Meetings');
                    setView('activity');
                }}
            />
            <MetricCard 
                icon={CheckCircle} 
                label="Tasks Executed" 
                value={stats.tasks ?? '0'} 
                color="secondary" 
                delay={0.3} 
                onClick={() => {
                    setActivityFilter('All Activity');
                    setView('activity');
                }}
            />
            <MetricCard 
                icon={Clock} 
                label="Efficiency Index" 
                value={stats.efficiency ?? '0%'} 
                color="primary" 
                delay={0.4} 
            />
        </div>
    );
};

export default MetricsRow;
