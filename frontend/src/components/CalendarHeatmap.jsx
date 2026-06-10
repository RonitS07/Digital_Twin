import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

const CalendarHeatmap = ({ data, loading }) => {
    const DAYS_MAP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Today's short name, computed fresh on every render to be safe
    const todayName = DAYS_MAP[new Date().getDay()];

    // Show last 7 days ending with today (today = rightmost bar)
    const getDynamicDays = () => {
        const todayIdx = new Date().getDay();
        return Array.from({ length: 7 }).map((_, i) => DAYS_MAP[(todayIdx - 6 + i + 7) % 7]);
    };
    const days = useMemo(() => getDynamicDays(), []);

    // Generate fallback stats if no real data provided
    const stats = useMemo(() => {
        if (data && data.length === 7) return data;
        return days.map((day, idx) => {
            const intensity = (idx * 3 + 1) % 5;
            return { day, load: intensity * 18 + ((idx * 4) % 12), tasks: intensity * 3 + ((idx * 2) % 4), intensity };
        });
    }, [data, days]);

    // Compare by name — immune to stale useMemo cache or formula drift
    const isToday = (idx) => days[idx] === todayName;

    const getColor = (idx) => {
        if (isToday(idx)) {
            return 'from-[#2D6A4F]/80 to-[#2D6A4F] border-[#2D6A4F]/60 shadow-[0_8px_30px_rgba(45,106,79,0.3)]';
        }
        return 'from-[#F7F5F2] to-[#E8E4DE] border-[#E8E4DE]';
    };

    const getHexColor = (idx) => {
        if (isToday(idx)) return '#2D6A4F';
        return 'transparent';
    };

    return (
        <div className="wi-card p-6 lg:p-8 mb-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-white border border-[#E8E4DE]">
                        <Activity size={20} className="text-[#2D6A4F]" />
                    </div>
                    <div>
                        <h3 className="font-fraunces font-semibold text-xl tracking-tight text-[#1A1814]">Weekly Focus Heatmap</h3>
                        <p className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest mt-0.5">Cognitive Load Distribution</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E6F4EC] border border-[#2D6A4F]/20">
                    <div className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-pulse shadow-[0_0_10px_#2D6A4F]" />
                    <span className="font-mono-ji text-[10px] text-[#2D6A4F] uppercase tracking-widest">Live Syncing</span>
                </div>
            </div>

            <div className="flex justify-between items-end gap-2 lg:gap-6 h-40 lg:h-56 px-0 lg:px-4">
                {stats.map((item, idx) => {
                    const heightPercent = Math.max(15, 25 + (item.intensity * 18));
                    const hex = getHexColor(idx);
                    return (
                        <div
                            key={item.day}
                            onClick={() => useStore.getState().setView('activity')}
                            className="flex-1 h-full flex flex-col items-center justify-end gap-4 group relative cursor-pointer"
                        >
                            {/* Tooltip */}
                            <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:-translate-y-2 bg-white px-4 py-2 rounded-lg text-xs font-dm font-medium text-[#1A1814] whitespace-nowrap z-20 border border-[#E8E4DE] shadow-[0_4px_12px_rgba(0,0,0,0.08)] pointer-events-none">
                                <div className="flex flex-col items-center">
                                    <span className="mb-0.5 font-dm" style={{ color: isToday(idx) ? '#2D6A4F' : '#7A7065' }}>
                                        {isToday(idx) ? 'Today' : item.day} · {item.load !== undefined ? `${item.load} load` : `${item.tasks} tasks`}
                                    </span>
                                    <span className="font-mono-ji text-[10px] opacity-60 uppercase text-[#7A7065]">{item.day} Focus</span>
                                </div>
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-[#E8E4DE]"></div>
                            </div>

                            <div className="w-8 lg:w-12 mx-auto relative flex flex-col justify-end h-full">
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${heightPercent}%` }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 25, delay: idx * 0.05 }}
                                    className={`w-full mx-auto rounded-t-2xl lg:rounded-t-[1.2rem] bg-gradient-to-t ${getColor(idx)} border-t border-l border-r transition-all duration-700`}
                                />
                                {isToday(idx) && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 blur-md rounded-full bg-[#2D6A4F]" />
                                )}
                            </div>

                            <span className={`font-mono-ji text-[10px] lg:text-xs uppercase tracking-widest transition-colors ${isToday(idx) ? 'text-[#2D6A4F] font-bold' : 'text-[#A09488] group-hover:text-[#1A1814]'}`}>{item.day}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CalendarHeatmap;
