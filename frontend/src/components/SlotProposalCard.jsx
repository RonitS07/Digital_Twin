import React from 'react'
import { Calendar } from 'lucide-react'

const formatSlotDate = (isoStr) => {
    try {
        return new Date(isoStr).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    } catch {
        return isoStr
    }
}

const SlotProposalCard = ({ slots = [], target, msgId, onConfirm }) => (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-primary" />
            <p className="text-sm font-bold text-white/80">
                {target
                    ? `Available times with ${target}`
                    : 'Available time slots'}
            </p>
        </div>
        <div className="space-y-2">
            {slots.map((slot, i) => (
                <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                >
                    <div>
                        <p className="text-sm text-white/80 font-medium">
                            {formatSlotDate(slot.start)}
                        </p>
                        <p className="text-xs text-white/40">
                            {slot.duration_minutes || 30} min
                        </p>
                    </div>
                    <button
                        onClick={() => onConfirm && onConfirm(i)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/80 transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            ))}
        </div>
        {slots.length === 0 && (
            <p className="text-sm text-white/40">
                No common availability found in 7 days.
            </p>
        )}
    </div>
)

export default SlotProposalCard
