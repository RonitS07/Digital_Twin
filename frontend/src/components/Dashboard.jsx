import React from 'react'
import { motion } from 'framer-motion'
import {
    Sparkles,
    Calendar,
    Zap,
    ExternalLink
} from 'lucide-react'

const Dashboard = () => {
    return (
        <div className="p-10 max-w-7xl mx-auto">
            {/* Welcome */}
            <section className="mb-12 flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded uppercase tracking-wider">Product Manager</span>
                        <span className="text-neutral text-[10px] font-bold uppercase tracking-widest">• Engineering Workspace</span>
                    </div>
                    <h2 className="text-4xl font-manrope font-extrabold tracking-tighter text-on-surface mb-2">Good morning, Alex.</h2>
                    <p className="text-on-surface-variant max-w-md">Your AI Twin has synthesized 14 overnight updates. Priority focus: <span className="text-tertiary font-semibold underline underline-offset-4 decoration-tertiary/30">Roadmap Alignment</span>.</p>
                </div>
                <button className="bg-surface-container hover:bg-surface-container-highest text-on-surface px-5 py-2.5 rounded-xl font-medium transition-all text-sm flex items-center gap-2 border border-neutral/5">
                    <Sparkles size={16} className="text-primary" />
                    Daily Briefing
                </button>
            </section>

            {/* Bento Grid */}
            <div className="grid grid-cols-12 gap-6">
                {/* Upcoming Meetings */}
                <div className="col-span-12 lg:col-span-7 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                            <Calendar size={20} className="text-primary" />
                            Upcoming Meetings
                        </h3>
                        <span className="text-xs text-neutral uppercase tracking-widest">3 scheduled today</span>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border-l-4 border-primary ai-glow">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">High Priority</span>
                                    <span className="text-xs text-neutral">10:00 AM - 11:00 AM</span>
                                </div>
                                <h4 className="text-lg font-bold text-on-surface tracking-tight">Q4 Strategy Roadmap Sync</h4>
                                <p className="text-sm text-on-surface-variant">Stakeholders: Design, Product, Engineering</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex-1 bg-primary text-surface-base font-bold py-2.5 rounded-xl text-sm hover:brightness-110 shadow-lg shadow-primary/20 transition-all">Join</button>
                            <button className="flex-1 bg-surface-container-highest text-on-surface font-medium py-2.5 rounded-xl text-sm hover:bg-neutral/20 transition-all border border-neutral/5">Prepare</button>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border-l-4 border-tertiary/40">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded uppercase font-inter">Standard</span>
                                    <span className="text-xs text-neutral">02:30 PM - 03:00 PM</span>
                                </div>
                                <h4 className="text-lg font-bold text-on-surface tracking-tight">Backend Architecture Review</h4>
                                <p className="text-sm text-on-surface-variant">Technical leadership and platform team</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pending Actions */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-manrope text-xl font-bold tracking-tight flex items-center gap-2">
                            <Zap size={20} className="text-tertiary" />
                            Pending Actions
                        </h3>
                        <span className="text-xs text-neutral uppercase tracking-widest">2 items</span>
                    </div>

                    <div className="bg-surface-container p-5 rounded-2xl border border-neutral/5 space-y-4">
                        <div className="flex gap-4 items-start">
                            <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
                                <Zap size={18} className="text-tertiary" fill="currentColor" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-on-surface">Budget Reallocation: Phase 2</h4>
                                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Request for $12k increase in cloud credits for the ML training cluster.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <button className="bg-primary/10 text-primary font-bold py-2 rounded-lg text-xs hover:bg-primary/20 transition-all">Approve</button>
                            <button className="bg-neutral/10 text-on-surface font-medium py-2 rounded-lg text-xs hover:bg-neutral/20 transition-all">Review</button>
                            <button className="bg-red-500/10 text-red-500 font-medium py-2 rounded-lg text-xs hover:bg-red-500/20 transition-all">Reject</button>
                        </div>
                    </div>
                </div>

                {/* AI Twin Insights */}
                <div className="col-span-12">
                    <div className="glass-panel p-8 rounded-3xl border border-primary/10 relative overflow-hidden">
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px]"></div>
                        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-tertiary/5 rounded-full blur-[100px]"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-8">
                                <Sparkles size={20} className="text-primary" />
                                <h3 className="font-manrope text-xl font-bold tracking-tight">AI Twin Intelligence</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                {[
                                    { title: "Sentiment Shift", desc: "Slack engagement decreased by 22% over 3 days. Potential burnout risk in Infrastructure pod.", link: "Investigate Team Health" },
                                    { title: "Product Opportunity", desc: "3 competitors released 'Automatic Labeling' today. Recommended elevating roadmap item to P1.", link: "Update Roadmap Draft" },
                                    { title: "Efficiency Gain", desc: "I've drafted responses to 14 low-priority emails and 5 Jira tickets. Ready for sign-off.", link: "Review AI Drafts" }
                                ].map((insight, idx) => (
                                    <div key={idx} className="space-y-3">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral font-inter">{insight.title}</h4>
                                        <p className="text-on-surface-variant text-sm leading-relaxed">{insight.desc}</p>
                                        <a href="#" className="text-xs text-secondary hover:underline underline-offset-4 flex items-center gap-1 font-medium transition-all">
                                            {insight.link} <ExternalLink size={12} />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Dashboard
