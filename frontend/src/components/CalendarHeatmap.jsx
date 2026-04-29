import React from 'react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';

const CalendarHeatmap = ({ data, loading }) => {
    // Days of the week for display order (Dynamic based on today)
    const getDynamicDays = () => {
        const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayIdx = new Date().getDay();
        return Array.from({ length: 7 }).map((_, i) => daysMap[(todayIdx + i) % 7]);
    };
    const days = getDynamicDays();

    const stats = data || days.map(day => ({ day, tasks: 0, intensity: 0 }));

    const getColor = (intensity) => {
        switch (intensity) {
            case 0: return 'from-white/5 to-white/10 border-white/5';
            case 1: return 'from-primary/20 to-primary/40 border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]';
            case 2: return 'from-primary/40 to-primary/60 border-primary/30 shadow-[0_0_25px_rgba(var(--primary-rgb),0.3)]';
            case 3: return 'from-primary/60 to-primary/80 border-primary/40 shadow-[0_0_35px_rgba(var(--primary-rgb),0.4)]';
            case 4: return 'from-primary to-primary-bright border-primary/60 shadow-[0_0_50px_rgba(var(--primary-rgb),0.6)] ai-glow';
            default: return 'from-white/5 to-white/10';
        }
    };

    return (
        <div className="glass-panel p-4 lg:p-8 rounded-[1.5rem] lg:rounded-[2rem] border border-primary/10 mb-6 lg:mb-10 bg-surface-container-low/30">
            <div className="flex items-center justify-between mb-5 lg:mb-10">
                <div>
                    <h3 className="font-manrope text-base lg:text-xl font-black tracking-tight text-on-surface">Weekly Focus Heatmap</h3>
                    <p className="text-[10px] text-neutral font-bold uppercase tracking-widest mt-1">Cognitive Load Distribution</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    <span className="text-[10px] text-primary font-black uppercase tracking-widest">Live Syncing</span>
                </div>
            </div>

            <div className="flex justify-between items-end gap-2 lg:gap-4 h-36 lg:h-64 px-0 lg:px-4">
                {stats.map((item, idx) => (
                    <div 
                        key={item.day} 
                        onClick={() => useStore.getState().setView('activity')}
                        className="flex-1 h-full flex flex-col items-center justify-end gap-4 group relative cursor-pointer"
                    >
                        {/* Tooltip */}
                        <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:-translate-y-2 bg-surface-container-highest px-3 py-2 rounded-xl text-xs font-bold text-on-surface whitespace-nowrap z-20 border border-white/10 shadow-2xl pointer-events-none">
                            <div className="flex flex-col items-center">
                                <span className="text-primary mb-0.5">{item.tasks} Tasks</span>
                                <span className="text-[10px] opacity-60 uppercase">{item.day} Intensity</span>
                            </div>
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-container-highest rotate-45 border-r border-b border-white/10"></div>
                        </div>

                        <div className="w-6 lg:w-10 mx-auto relative flex flex-col justify-end h-full">
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${45 + (item.intensity * 20)}%` }}
                                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                                className={`w-full mx-auto rounded-xl lg:rounded-2xl bg-gradient-to-t ${getColor(item.intensity)} border-t transition-all duration-700`}
                                style={{ height: `${45 + (item.intensity * 20)}%` }}
                            />
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20 blur-sm rounded-full" />
                        </div>

                        <span className="text-[9px] lg:text-[11px] font-black text-neutral uppercase tracking-widest group-hover:text-primary transition-colors">{item.day}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CalendarHeatmap;
