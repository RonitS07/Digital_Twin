import React, { useState, useCallback } from 'react'
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    PieChart, Pie, Cell, ScatterChart, Scatter,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    Treemap,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Info, Download, Maximize2, X, AlertTriangle } from 'lucide-react'

const CHART_COLORS = [
    '#6366f1', '#a855f7', '#10b981', '#f59e0b', '#3b82f6',
    '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
]

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[#1a1926]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl">
            {label && <p className="text-xs font-bold text-white/60 mb-2 uppercase tracking-widest">{label}</p>}
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                    <span className="text-white/70">{entry.name}:</span>
                    <span className="font-bold text-white">
                        {typeof entry.value === 'number'
                            ? entry.value.toLocaleString()
                            : entry.value}
                    </span>
                </div>
            ))}
        </div>
    )
}

const CustomPieTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
        <div className="bg-[#1a1926]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl">
            <p className="text-sm font-bold text-white">{d.name}</p>
            <p className="text-xs text-white/60">{d.value?.toLocaleString()} ({d.payload?.percent ? (d.payload.percent * 100).toFixed(1) + '%' : ''})</p>
        </div>
    )
}

const RADIAN = Math.PI / 180
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    )
}

const InsightBadge = ({ text, index }) => {
    const icons = [TrendingUp, TrendingDown, Minus, Info]
    const Icon = icons[index % icons.length]
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-start gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5"
        >
            <Icon size={14} className="text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-white/70 leading-relaxed">{text}</p>
        </motion.div>
    )
}

const VisualizationRenderer = ({ config }) => {
    const [fullscreen, setFullscreen] = useState(false)
    const [activeBar, setActiveBar] = useState(null)
    const [drillData, setDrillData] = useState(null)

    if (!config) return null

    const {
        chart_type = 'bar',
        title,
        description,
        disclaimer,
        x_key,
        y_keys = [],
        data = [],
        insights = [],
    } = config

    const handleBarClick = useCallback((barData) => {
        if (barData && config.drill_down) {
            setActiveBar(barData)
            setDrillData(config.drill_down[barData[x_key]] || null)
        }
    }, [config, x_key])

    const chartHeight = fullscreen ? 450 : 280

    const axisStyle = React.useMemo(() => ({ fontSize: 11, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }), [])
    const commonProps = React.useMemo(() => ({
        data,
        margin: { top: 5, right: 10, left: -10, bottom: 5 },
    }), [data])

    const renderChart = () => {

        switch (chart_type) {
            case 'line':
                return (
                    <LineChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                        {y_keys.map((yk, i) => (
                            <Line key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                                stroke={yk.color || CHART_COLORS[i]} strokeWidth={2.5}
                                dot={{ fill: yk.color || CHART_COLORS[i], r: 4 }}
                                activeDot={{ r: 6, strokeWidth: 2 }} />
                        ))}
                    </LineChart>
                )
            case 'area':
                return (
                    <AreaChart {...commonProps}>
                        <defs>
                            {y_keys.map((yk, i) => (
                                <linearGradient key={yk.key} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={yk.color || CHART_COLORS[i]} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={yk.color || CHART_COLORS[i]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                        {y_keys.map((yk, i) => (
                            <Area key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                                stroke={yk.color || CHART_COLORS[i]} fill={`url(#grad_${i})`} strokeWidth={2} />
                        ))}
                    </AreaChart>
                )
            case 'pie': {
                const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0)
                return (
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius="35%" outerRadius="65%"
                            dataKey="value" nameKey="name"
                            labelLine={false} label={renderCustomizedLabel}
                            onClick={handleBarClick}>
                            {data.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}
                                    stroke="transparent" strokeWidth={2} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomPieTip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                    </PieChart>
                )
            }
            case 'radar':
                return (
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey={x_key} tick={axisStyle} />
                        <PolarRadiusAxis tick={axisStyle} />
                        {y_keys.map((yk, i) => (
                            <Radar key={yk.key} name={yk.label} dataKey={yk.key}
                                stroke={yk.color || CHART_COLORS[i]}
                                fill={yk.color || CHART_COLORS[i]} fillOpacity={0.2} />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                        <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                )
            case 'scatter':
                return (
                    <ScatterChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey={x_key} type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis dataKey={y_keys[0]?.key} type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Scatter data={data} fill={y_keys[0]?.color || CHART_COLORS[0]} />
                    </ScatterChart>
                )
            default: // bar
                return (
                    <BarChart {...commonProps} onClick={handleBarClick}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                        {y_keys.map((yk, i) => (
                            <Bar key={yk.key} dataKey={yk.key} name={yk.label}
                                fill={yk.color || CHART_COLORS[i]} radius={[6, 6, 0, 0]}
                                maxBarSize={52} />
                        ))}
                    </BarChart>
                )
        }
    }

    return (
        <>
            <div className="mt-4 p-4 rounded-2xl bg-black/30 border border-white/8 space-y-3">
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                                {chart_type} · AI Visualization
                            </p>
                            <h3 className="text-base font-bold text-white leading-snug">{title}</h3>
                            {/* Show disclaimer as subtitle if present, else fall back to description */}
                            {(disclaimer || description) && (
                                <p className="text-xs text-white/50 mt-1">
                                    {disclaimer || description}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => setFullscreen(true)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
                        >
                            <Maximize2 size={14} className="text-white/50" />
                        </button>
                    </div>

                    <div style={{ height: chartHeight }} className="w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {renderChart()}
                        </ResponsiveContainer>
                    </div>

                    {/* Drill-down */}
                    <AnimatePresence>
                        {drillData && activeBar && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="p-3 rounded-xl bg-primary/10 border border-primary/20"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-primary">Drill-down: {activeBar[x_key]}</p>
                                    <button onClick={() => { setDrillData(null); setActiveBar(null) }}
                                        className="text-white/40 hover:text-white/70">
                                        <X size={12} />
                                    </button>
                                </div>
                                <div style={{ height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={drillData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Mandatory AI data disclaimer — always shown */}
                    <div className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                        <p className="text-xs text-amber-300/70">
                            Data is AI-generated and illustrative. Verify with official sources before use.
                        </p>
                    </div>

                    {/* Insights */}
                    {insights.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">AI Insights</p>
                            <div className="grid grid-cols-1 gap-1.5">
                                {insights.map((ins, i) => <InsightBadge key={i} text={ins} index={i} />)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Fullscreen Modal */}
            <AnimatePresence>
                {fullscreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
                        onClick={() => setFullscreen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="w-full max-w-4xl bg-[#1a1926] rounded-3xl p-8 border border-white/10 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                                        {chart_type} · Full View
                                    </p>
                                    <h3 className="text-xl font-bold text-white">{title}</h3>
                                </div>
                                <button onClick={() => setFullscreen(false)}
                                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                                    <X size={16} className="text-white/70" />
                                </button>
                            </div>
                            <div style={{ height: 420 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {renderChart()}
                                </ResponsiveContainer>
                            </div>
                            {/* Disclaimer in fullscreen */}
                            <div className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                                <p className="text-xs text-amber-300/70">
                                    Data is AI-generated and illustrative. Verify with official sources before use.
                                </p>
                            </div>
                            {insights.length > 0 && (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    {insights.map((ins, i) => <InsightBadge key={i} text={ins} index={i} />)}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}

export default React.memo(VisualizationRenderer)
