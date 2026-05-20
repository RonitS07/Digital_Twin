import React, { useState, useCallback } from 'react'
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    PieChart, Pie, Cell, ScatterChart, Scatter,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Maximize2, X } from 'lucide-react'

const COLORS = ['#6366f1','#a855f7','#10b981','#f59e0b','#3b82f6','#ef4444','#06b6d4','#ec4899']

const axisStyle = { fontSize: 11, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }

const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[#1a1926]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl">
            {label && <p className="text-[10px] font-bold text-white/50 mb-1 uppercase tracking-widest">{label}</p>}
            {payload.map((e,i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full" style={{background:e.color||e.payload?.fill||'#6366f1'}} />
                    <span className="text-white/60">{e.name}:</span>
                    <span className="font-bold text-white">{typeof e.value==='number'?e.value.toLocaleString():e.value}</span>
                </div>
            ))}
        </div>
    )
}

// ── STAT CARDS ──────────────────────────────────────────────────────────────
const StatCards = ({ data, title }) => (
    <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {data.map((d,i) => (
                <motion.div key={i} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*0.08}}
                    className="relative overflow-hidden rounded-2xl p-4 border border-white/8 bg-white/[0.03]"
                    style={{borderColor: (d.color||COLORS[i])+'30'}}>
                    <div className="absolute inset-0 opacity-10 rounded-2xl" style={{background:`radial-gradient(ellipse at top left, ${d.color||COLORS[i]}, transparent 70%)`}} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{d.label}</p>
                    <p className="text-2xl font-black text-white leading-none mb-2">{d.value}</p>
                    {d.delta && (
                        <div className={`flex items-center gap-1 text-xs font-bold ${d.trend==='up'?'text-emerald-400':d.trend==='down'?'text-red-400':'text-white/40'}`}>
                            {d.trend==='up'?<TrendingUp size={12}/>:d.trend==='down'?<TrendingDown size={12}/>:<Minus size={12}/>}
                            {d.delta}
                        </div>
                    )}
                </motion.div>
            ))}
        </div>
    </div>
)

// ── TIMELINE ────────────────────────────────────────────────────────────────
const Timeline = ({ data }) => (
    <div className="relative pl-6 space-y-0">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-purple-500/40 to-transparent" />
        {data.map((d,i) => (
            <motion.div key={i} initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} transition={{delay:i*0.07}}
                className="relative flex gap-4 pb-6 last:pb-0">
                <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-current flex-shrink-0 z-10"
                    style={{color:d.color||COLORS[i%COLORS.length],background:'#1a1926',borderColor:d.color||COLORS[i%COLORS.length]}} />
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{background:(d.color||COLORS[i%COLORS.length])+'20',color:d.color||COLORS[i%COLORS.length]}}>
                            {d.date}
                        </span>
                        <span className="text-sm font-bold text-white">{d.event}</span>
                    </div>
                    {d.detail && <p className="text-xs text-white/50 leading-relaxed">{d.detail}</p>}
                </div>
            </motion.div>
        ))}
    </div>
)

// ── MAP (SVG India outline + bubble overlay) ────────────────────────────────
const MapViz = ({ data, title }) => {
    const [hovered, setHovered] = useState(null)
    const max = Math.max(...data.map(d=>Number(d.value)||0))

    // Simple SVG world-style bubble map — regions as positioned bubbles
    return (
        <div className="relative w-full" style={{minHeight:260}}>
            <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-3 p-4">
                {data.map((d,i) => {
                    const size = Math.max(36, Math.round(80 * (Number(d.value)||0) / (max||1)))
                    const color = d.color || COLORS[i % COLORS.length]
                    return (
                        <motion.div key={i}
                            initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:i*0.06,type:'spring',stiffness:200}}
                            onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
                            className="relative flex items-center justify-center cursor-pointer select-none"
                            style={{width:size, height:size}}>
                            <div className="absolute inset-0 rounded-full animate-pulse opacity-20" style={{background:color}} />
                            <div className="relative rounded-full flex flex-col items-center justify-center text-center border-2"
                                style={{width:size,height:size,background:color+'22',borderColor:color+'60'}}>
                                <span className="font-black text-white leading-none" style={{fontSize:Math.max(8,size/6)}}>{d.label||d.region}</span>
                            </div>
                            <AnimatePresence>
                                {hovered===i && (
                                    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                                        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1926] border border-white/10 rounded-xl p-2 shadow-2xl whitespace-nowrap z-20 pointer-events-none">
                                        <p className="text-xs font-bold text-white">{d.region}</p>
                                        <p className="text-xs text-white/50">{Number(d.value).toLocaleString()}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

// ── HEATMAP ─────────────────────────────────────────────────────────────────
const Heatmap = ({ data }) => {
    const rows = [...new Set(data.map(d=>d.row))]
    const cols = [...new Set(data.map(d=>d.col))]
    const max = Math.max(...data.map(d=>Number(d.value)||0))
    const get = (r,c) => data.find(d=>d.row===r&&d.col===c)?.value || 0
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
                <thead>
                    <tr>
                        <th className="text-white/30 font-bold pr-2 text-left pb-1" />
                        {cols.map(c=><th key={c} className="text-white/30 font-bold px-1 pb-1 text-center">{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r=>(
                        <tr key={r}>
                            <td className="text-white/40 font-bold pr-2 py-0.5 whitespace-nowrap">{r}</td>
                            {cols.map(c=>{
                                const v = Number(get(r,c))
                                const pct = max ? v/max : 0
                                return (
                                    <td key={c} className="px-1 py-0.5">
                                        <div title={`${r} ${c}: ${v}`}
                                            className="w-6 h-6 rounded-md mx-auto transition-all hover:scale-125 cursor-default"
                                            style={{background:`rgba(99,102,241,${0.07 + pct*0.9})`}} />
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── FUNNEL ──────────────────────────────────────────────────────────────────
const Funnel = ({ data }) => {
    const max = Math.max(...data.map(d=>Number(d.value)||0))
    return (
        <div className="space-y-2">
            {data.map((d,i) => {
                const pct = max ? (Number(d.value)||0)/max : 0
                const color = d.color || COLORS[i % COLORS.length]
                return (
                    <motion.div key={i} initial={{opacity:0,scaleX:0}} animate={{opacity:1,scaleX:1}} transition={{delay:i*0.07,duration:0.4}} className="origin-left">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-xs font-bold text-white w-24 flex-shrink-0">{d.stage}</span>
                            <span className="text-xs font-black text-white/60">{Number(d.value).toLocaleString()}</span>
                            {i>0 && <span className="text-[10px] text-red-400 ml-auto">↓ {((1-pct)*100).toFixed(0)}% drop</span>}
                        </div>
                        <div className="relative h-8 rounded-xl overflow-hidden bg-white/5" style={{width:`${Math.max(20,pct*100)}%`}}>
                            <div className="absolute inset-0 rounded-xl" style={{background:`linear-gradient(90deg, ${color}, ${color}99)`}} />
                            <div className="absolute inset-0 flex items-center px-3">
                                <span className="text-[10px] font-black text-white">{(pct*100).toFixed(0)}%</span>
                            </div>
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

// ── PROGRESS RINGS ──────────────────────────────────────────────────────────
const ProgressRings = ({ data }) => (
    <div className="flex flex-wrap gap-6 justify-center py-2">
        {data.map((d,i) => {
            const pct = Math.min(100, (Number(d.value)||0) / (Number(d.max)||100) * 100)
            const color = d.color || COLORS[i % COLORS.length]
            const r = 44, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
                <motion.div key={i} initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} transition={{delay:i*0.1}}
                    className="flex flex-col items-center gap-2">
                    <div className="relative w-28 h-28">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                            <motion.circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
                                strokeLinecap="round" strokeDasharray={circ}
                                initial={{strokeDashoffset:circ}} animate={{strokeDashoffset:circ-dash}}
                                transition={{duration:1.2,ease:'easeOut',delay:i*0.1}} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black text-white">{pct.toFixed(0)}%</span>
                        </div>
                    </div>
                    <p className="text-xs font-bold text-white/60 text-center max-w-[100px]">{d.label}</p>
                    <p className="text-[10px] text-white/30">{Number(d.value).toLocaleString()} / {Number(d.max).toLocaleString()}</p>
                </motion.div>
            )
        })}
    </div>
)

// ── PIE LABEL ───────────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    return <text x={cx+r*Math.cos(-midAngle*RADIAN)} y={cy+r*Math.sin(-midAngle*RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent*100).toFixed(0)}%`}
    </text>
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
const VisualizationRenderer = ({ config }) => {
    const [fullscreen, setFullscreen] = useState(false)
    const [activeBar, setActiveBar] = useState(null)
    const [drillData, setDrillData] = useState(null)
    if (!config) return null

    const { chart_type='bar', title, description, disclaimer, x_key, y_keys=[], data=[], insights=[] } = config
    const chartH = fullscreen ? 420 : 280
    const cp = { data, margin:{top:5,right:10,left:-10,bottom:5} }

    const renderRechart = (h) => {
        switch(chart_type) {
            case 'line': return (
                <LineChart {...cp}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip/>} />
                    <Legend wrapperStyle={{fontSize:11,color:'rgba(255,255,255,0.5)'}} />
                    {y_keys.map((yk,i)=><Line key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                        stroke={yk.color||COLORS[i]} strokeWidth={2.5} dot={{fill:yk.color||COLORS[i],r:4}} activeDot={{r:6}} />)}
                </LineChart>
            )
            case 'area': return (
                <AreaChart {...cp}>
                    <defs>{y_keys.map((yk,i)=>(
                        <linearGradient key={yk.key} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={yk.color||COLORS[i]} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={yk.color||COLORS[i]} stopOpacity={0}/>
                        </linearGradient>
                    ))}</defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip/>} />
                    <Legend wrapperStyle={{fontSize:11,color:'rgba(255,255,255,0.5)'}} />
                    {y_keys.map((yk,i)=><Area key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                        stroke={yk.color||COLORS[i]} fill={`url(#ag${i})`} strokeWidth={2} />)}
                </AreaChart>
            )
            case 'pie': return (
                <PieChart>
                    <Pie data={data} cx="50%" cy="50%" innerRadius="35%" outerRadius="65%"
                        dataKey="value" nameKey="name" labelLine={false} label={<PieLabel/>}>
                        {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} stroke="transparent"/>)}
                    </Pie>
                    <Tooltip content={<Tip/>} />
                    <Legend wrapperStyle={{fontSize:11,color:'rgba(255,255,255,0.5)'}} />
                </PieChart>
            )
            case 'radar': return (
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey={x_key} tick={axisStyle} />
                    <PolarRadiusAxis tick={axisStyle} />
                    {y_keys.map((yk,i)=><Radar key={yk.key} name={yk.label} dataKey={yk.key}
                        stroke={yk.color||COLORS[i]} fill={yk.color||COLORS[i]} fillOpacity={0.2} />)}
                    <Legend wrapperStyle={{fontSize:11,color:'rgba(255,255,255,0.5)'}} />
                    <Tooltip content={<Tip/>} />
                </RadarChart>
            )
            case 'scatter': return (
                <ScatterChart {...cp}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey={x_key} type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis dataKey={y_keys[0]?.key} type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip/>} />
                    <Scatter data={data} fill={y_keys[0]?.color||COLORS[0]} />
                </ScatterChart>
            )
            default: return (
                <BarChart {...cp} onClick={(b)=>{ if(b&&config.drill_down){setActiveBar(b.activePayload?.[0]?.payload);setDrillData(config.drill_down[b.activePayload?.[0]?.payload?.[x_key]]||null)} }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey={x_key} tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip/>} cursor={{fill:'rgba(255,255,255,0.04)'}} />
                    <Legend wrapperStyle={{fontSize:11,color:'rgba(255,255,255,0.5)'}} />
                    {y_keys.map((yk,i)=><Bar key={yk.key} dataKey={yk.key} name={yk.label}
                        fill={yk.color||COLORS[i]} radius={[6,6,0,0]} maxBarSize={52} />)}
                </BarChart>
            )
        }
    }

    const isSpecial = ['map','stat_cards','timeline','heatmap','funnel','progress'].includes(chart_type)

    const renderSpecial = () => {
        switch(chart_type) {
            case 'stat_cards': return <StatCards data={data} title={title} />
            case 'timeline':   return <Timeline data={data} />
            case 'map':        return <MapViz data={data} title={title} />
            case 'heatmap':    return <Heatmap data={data} />
            case 'funnel':     return <Funnel data={data} />
            case 'progress':   return <ProgressRings data={data} />
            default: return null
        }
    }

    const typeLabel = {
        bar:'Bar Chart', line:'Line Chart', area:'Area Chart', pie:'Pie Chart',
        scatter:'Scatter', radar:'Radar', map:'Map', stat_cards:'Stats Overview',
        timeline:'Timeline', heatmap:'Heatmap', funnel:'Funnel', progress:'Progress'
    }[chart_type] || chart_type

    const Card = ({ inFullscreen }) => (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                        {typeLabel} · AI Visualization
                    </p>
                    <h3 className="text-base font-bold text-white leading-snug">{title}</h3>
                    {(disclaimer || description) && (
                        <p className="text-xs text-white/50 mt-1">{disclaimer || description}</p>
                    )}
                </div>
                {!inFullscreen && (
                    <button onClick={()=>setFullscreen(true)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0">
                        <Maximize2 size={14} className="text-white/50" />
                    </button>
                )}
            </div>

            {isSpecial ? (
                <div className={inFullscreen ? 'min-h-[300px]' : 'min-h-[200px]'}>
                    {renderSpecial()}
                </div>
            ) : (
                <div style={{height: inFullscreen ? chartH : 280}} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {renderRechart(inFullscreen ? chartH : 280)}
                    </ResponsiveContainer>
                </div>
            )}

            {/* Drill-down */}
            <AnimatePresence>
                {drillData && activeBar && (
                    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
                        className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-primary">Drill-down: {activeBar[x_key]}</p>
                            <button onClick={()=>{setDrillData(null);setActiveBar(null)}} className="text-white/40 hover:text-white/70">
                                <X size={12}/>
                            </button>
                        </div>
                        <div style={{height:160}}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={drillData} margin={{top:5,right:5,left:-20,bottom:5}}>
                                    <XAxis dataKey="name" tick={{fontSize:10,fill:'rgba(255,255,255,0.4)'}} axisLine={false} tickLine={false}/>
                                    <YAxis tick={{fontSize:10,fill:'rgba(255,255,255,0.4)'}} axisLine={false} tickLine={false}/>
                                    <Tooltip content={<Tip/>}/>
                                    <Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]}/>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {disclaimer && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle size={12} className="text-amber-400 flex-shrink-0"/>
                    <p className="text-xs text-amber-300/70">{disclaimer}</p>
                </div>
            )}

            {insights.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">AI Insights</p>
                    <div className="grid grid-cols-1 gap-1.5">
                        {insights.map((ins,i)=>(
                            <motion.div key={i} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.1}}
                                className="flex items-start gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-primary mt-0.5 flex-shrink-0 text-xs">→</span>
                                <p className="text-xs text-white/70 leading-relaxed">{ins}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )

    return (
        <>
            <div className="mt-4 p-4 rounded-2xl bg-black/30 border border-white/8">
                <Card inFullscreen={false}/>
            </div>

            <AnimatePresence>
                {fullscreen && (
                    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                        className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
                        onClick={()=>setFullscreen(false)}>
                        <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}}
                            className="w-full max-w-4xl bg-[#1a1926] rounded-3xl p-8 border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]"
                            onClick={e=>e.stopPropagation()}>
                            <div className="flex justify-end mb-4">
                                <button onClick={()=>setFullscreen(false)}
                                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                                    <X size={16} className="text-white/70"/>
                                </button>
                            </div>
                            <Card inFullscreen={true}/>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}

export default React.memo(VisualizationRenderer)
