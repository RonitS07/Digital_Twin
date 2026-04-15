import React from 'react'
import { motion } from 'framer-motion'
import {
    Sparkles,
    CheckCircle,
    Clock,
    ShieldAlert,
    Paperclip,
    Send,
    Mic as MicIcon,
    Search,
    Zap,
    ChevronRight,
    ShieldCheck,
    History,
    User as AccountCircle
} from 'lucide-react'

const ChatMessage = ({ sender, role, text, time, source, status, actions = [] }) => (
    <div className={`flex gap-6 max-w-4xl ${role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-lg ${role === 'ai'
            ? 'bg-gradient-to-tr from-primary to-secondary shadow-primary/20'
            : 'bg-surface-container-highest border border-outline-variant/30'
            }`}>
            {role === 'ai' ? <Sparkles size={20} className="text-white" fill="currentColor" /> : <AccountCircle size={20} />}
        </div>
        <div className={`space-y-3 ${role === 'user' ? 'text-right' : ''}`}>
            <div className={`flex items-center gap-3 ${role === 'user' ? 'justify-end' : ''}`}>
                <span className={`font-manrope font-bold text-sm ${role === 'user' ? 'text-primary' : 'text-on-surface'}`}>{sender}</span>
                {status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border flex items-center gap-1 ${status === 'High Confidence' ? 'bg-secondary/10 text-secondary border-secondary/20' : 'bg-tertiary/10 text-tertiary border-tertiary/20'
                        }`}>
                        {status === 'High Confidence' ? <ShieldCheck size={12} /> : <Clock size={12} />}
                        {status}
                    </span>
                )}
            </div>
            <div className={`p-6 rounded-lg leading-relaxed shadow-sm ${role === 'user'
                ? 'bg-primary/10 border border-primary/20 text-on-surface'
                : 'bg-surface-container-highest/80 text-on-surface-variant'
                }`}>
                {text}
            </div>
            {actions.length > 0 && (
                <div className="flex gap-3">
                    {actions.map((action, i) => (
                        <button key={i} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${i === 0 ? 'bg-primary text-white hover:brightness-110' : 'border border-outline-variant/50 text-on-surface hover:bg-surface-container-highest'
                            }`}>
                            {action}
                        </button>
                    ))}
                </div>
            )}
            <p className="text-[10px] text-neutral font-medium tracking-wide">
                {time} • {source}
            </p>
        </div>
    </div>
)

const Chat = () => {
    return (
        <div className="flex flex-col h-full bg-surface relative">
            {/* Warning Banner */}
            <div className="flex items-center justify-between bg-red-500/10 text-red-400 px-6 py-2 border-b border-red-500/10">
                <div className="flex items-center gap-3">
                    <ShieldAlert size={14} />
                    <span className="text-xs font-semibold tracking-tight">Gmail disconnected: Automated email scheduling is currently paused.</span>
                </div>
                <button className="text-xs underline font-bold underline-offset-4">Reconnect Hub</button>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto px-12 py-10 space-y-12 no-scrollbar">
                <ChatMessage
                    sender="Twin Assistant"
                    role="ai"
                    status="High Confidence"
                    text="I've analyzed the Q3 Logistics report. Based on current trends, we should reallocate 12% of the budget from 'Domestic Last-Mile' to 'Regional Freight Consolidation' to offset the rising fuel costs."
                    time="10:42 AM"
                    source="ERP-2023-Q3"
                />

                <ChatMessage
                    sender="Operations Head"
                    role="user"
                    text="Understood. Please draft a proposal for the board and flag any potential delays this shift might cause in current West Coast operations."
                    time="10:44 AM"
                    source="Delivered"
                />

                <ChatMessage
                    sender="Twin Assistant"
                    role="ai"
                    status="Needs Confirmation"
                    text="I am preparing the draft. However, the West Coast 'Phoenix Project' has a contract clause regarding minimum freight volume. Shifting the budget might trigger a penalty fee of approximately $14,500. Should I proceed with the draft including this penalty forecast, or should I search for a budget source that avoids this specific clause?"
                    time="10:45 AM"
                    source="Neural Analytics"
                    actions={["Proceed with Forecast", "Search Alternatives"]}
                />
            </div>

            {/* Input Console */}
            <div className="p-8 bg-surface">
                <div className="max-w-4xl mx-auto relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-full blur opacity-50 group-focus-within:opacity-100 transition duration-1000"></div>
                    <div className="relative bg-surface-container rounded-full flex items-center p-2 pl-6 shadow-2xl">
                        <input
                            className="bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-neutral/50 flex-grow py-3 outline-none"
                            placeholder="Instruct your Twin..."
                            type="text"
                        />
                        <div className="flex items-center gap-2 pr-2 text-neutral">
                            <button className="p-2 hover:text-primary transition-colors"><Paperclip size={20} /></button>
                            <button className="p-2 hover:text-primary transition-colors"><MicIcon size={20} /></button>
                            <button className="bg-gradient-to-r from-primary to-secondary text-white h-10 w-10 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar Overlay Concept (integrated as a secondary pane if viewport allows) */}
            <aside className="hidden xl:flex absolute right-0 top-0 h-full w-80 glass-panel border-l border-neutral/10 flex-col p-6 space-y-8 overflow-y-auto z-20 translate-x-full">
                {/* We can transition this in/out */}
            </aside>
        </div>
    )
}

export default Chat
