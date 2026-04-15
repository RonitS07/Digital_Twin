import React from 'react'
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
    Box
} from 'lucide-react'

const TimelineItem = ({ title, subtitle, time, status, icon: Icon, color, reason }) => (
    <div className="relative">
        {/* Circle on line */}
        <div className={`absolute -left-[51px] top-0 w-5 h-5 rounded-full bg-surface-base border-4 ${color === 'primary' ? 'border-primary' : color === 'tertiary' ? 'border-tertiary' : 'border-neutral'}`}></div>

        <div className="glass-panel p-8 rounded-xl border border-neutral/10 ai-glow group hover:bg-surface-container transition-colors">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${color === 'primary' ? 'bg-primary/10 text-primary' : color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' : 'bg-neutral/10 text-neutral'}`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <h3 className="font-manrope font-bold text-lg text-white">{title}</h3>
                        <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>
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
                <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${color === 'primary' ? 'text-primary/60' : color === 'tertiary' ? 'text-tertiary/60' : 'text-neutral/60'}`}>Why this was done</span>
                <p className="text-on-surface text-sm leading-relaxed">{reason}</p>
            </div>
        </div>
    </div>
)

const Activity = () => {
    return (
        <div className="p-12 max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
                <div className="flex flex-wrap gap-2">
                    <button className="px-5 py-2 rounded-full bg-primary text-surface-base text-sm font-semibold shadow-lg shadow-primary/20 transition-all">All Activity</button>
                    {['Emails', 'Meetings', 'Research'].map(filter => (
                        <button key={filter} className="px-5 py-2 rounded-full bg-surface-container text-on-surface-variant text-sm font-medium hover:bg-neutral/20 transition-all border border-neutral/5">
                            {filter}
                        </button>
                    ))}
                    <button className="px-5 py-2 rounded-full bg-surface-container text-on-surface-variant text-sm font-medium hover:bg-neutral/20 transition-all border border-neutral/5 flex items-center gap-2">
                        Needs Review
                        <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#ffb695]"></span>
                    </button>
                </div>
                <button className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-neutral/20 text-on-surface-variant text-sm font-bold tracking-tight hover:border-primary/40 hover:text-white transition-all bg-surface-container/30">
                    <Download size={14} />
                    Export Logs
                </button>
            </header>

            <div className="space-y-16">
                <div>
                    <div className="flex items-center gap-4 mb-8">
                        <h2 className="font-manrope text-xl font-bold text-white">Yesterday, October 24</h2>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-neutral/20 to-transparent"></div>
                    </div>

                    <div className="relative ml-4 pl-10 border-l-2 border-neutral/10 space-y-10">
                        <TimelineItem
                            title="Drafted Follow-up for Project Zenith"
                            subtitle="Recipient: Global Logistics Team (8 recipients)"
                            time="14:22 PM"
                            status="Sent for Review"
                            icon={Mail}
                            color="primary"
                            reason="Based on the meeting transcript from 10:00 AM, the stakeholder required an immediate summary of deliverables. I synthesized the key points and formatted them into a standard progress update."
                        />

                        <TimelineItem
                            title="Market Intelligence Research: Q4 Semiconductors"
                            subtitle="Sources: Bloomberg, Reuters, internal data lake"
                            time="11:05 AM"
                            status="Needs Review"
                            icon={Search}
                            color="tertiary"
                            reason="Detected unusual volatility in core sector stocks yesterday. Proactively generated a comparison report to prepare you for the Monday briefing."
                        />

                        <TimelineItem
                            title="Calendar Rescheduling: Design Review"
                            subtitle="Moved from Oct 26 to Oct 28"
                            time="09:15 AM"
                            status="Automated"
                            icon={Calendar}
                            color="neutral"
                            reason="A conflict was detected with your travel schedule. I used the 'Reschedule Priority' rule to move the internal review to the first available slot."
                        />
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-4 mb-8">
                        <h2 className="font-manrope text-xl font-bold text-white">Today, October 25</h2>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-neutral/20 to-transparent"></div>
                    </div>
                    <div className="flex flex-col items-center justify-center py-20 bg-surface-container/30 rounded-3xl border border-dashed border-neutral/20">
                        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-6">
                            <Zap size={32} className="text-neutral opacity-20" />
                        </div>
                        <h3 className="font-manrope text-lg font-bold text-on-surface-variant/80">No new activity today</h3>
                        <p className="text-on-surface-variant text-sm mt-2 max-w-xs text-center opacity-60">Your AI Twin is standing by. Give it a task or check back later for automated updates.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Activity
