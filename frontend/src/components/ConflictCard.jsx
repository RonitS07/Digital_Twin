import React from 'react'
import { AlertTriangle } from 'lucide-react'

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

const ConflictCard = ({ conflict, alternatives = [], onSelect }) => (
    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <p className="text-sm font-bold text-amber-300">
                Scheduling Conflict
            </p>
        </div>
        <p className="text-sm text-white/60 mb-3">
            {conflict || 'You have a conflict at that time.'}{' '}
            Here are alternatives:
        </p>
        <div className="space-y-2">
            {alternatives.map((slot, i) => (
                <button
                    key={i}
                    onClick={() => onSelect && onSelect(slot)}
                    className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 transition-colors"
                >
                    <p className="text-sm text-white/80">
                        {formatSlotDate(slot.start)}
                    </p>
                    <p className="text-xs text-white/40">
                        {slot.duration_minutes || 30} min
                    </p>
                </button>
            ))}
        </div>
        {alternatives.length === 0 && (
            <p className="text-sm text-white/40">No alternatives available.</p>
        )}
    </div>
)

export default ConflictCard
