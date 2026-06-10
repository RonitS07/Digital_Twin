import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, ChevronDown, Database, HardDrive, RefreshCcw, Shield, Users, Bot } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'

const Section = ({ title, children, right }) => (
    <div className="bg-white rounded-xl border border-[#E8E4DE] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8E4DE] flex items-center justify-between gap-3">
            <h3 className="font-fraunces font-semibold text-[#1A1814]">{title}</h3>
            {right}
        </div>
        <div className="p-4 sm:p-5">{children}</div>
    </div>
)

const StatCard = ({ icon: Icon, label, value }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-surface-container border border-neutral/10 p-4"
    >
        <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-neutral font-bold">{label}</span>
            <Icon size={16} className="text-primary" />
        </div>
        <p className="text-2xl font-manrope font-extrabold text-on-surface">{value ?? '-'}</p>
    </motion.div>
)

const Dot = ({ ok }) => (
    <span className={`inline-flex w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
)

const LoadingSpinner = () => (
    <div className="flex items-center gap-2 text-sm text-neutral">
        <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading...
    </div>
)

const MCPMonitor = ({ mcpStatus }) => {
    const [expanded, setExpanded] = useState(null)

    if (!mcpStatus) return <LoadingSpinner />

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-neutral/60">
                    {mcpStatus.total_servers ?? mcpStatus.servers?.length ?? 0} servers
                    {' · '}
                    {mcpStatus.total_tools ?? 0} tools registered
                </p>
            </div>
            {(mcpStatus.servers || []).map(server => (
                <div
                    key={server.name}
                    className="rounded-xl border border-neutral/15 bg-surface-container overflow-hidden"
                >
                    <button
                        onClick={() => setExpanded(expanded === server.name ? null : server.name)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral/5"
                    >
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${server.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-bold text-on-surface flex-1">{server.name}</span>
                        <span className="text-xs text-neutral">{server.tool_count} tools</span>
                        <ChevronDown
                            size={14}
                            className={`text-neutral transition-transform ${expanded === server.name ? 'rotate-180' : ''}`}
                        />
                    </button>
                    {expanded === server.name && (
                        <div className="px-4 pb-4 flex flex-wrap gap-2">
                            {(server.tools || []).map(tool => (
                                <span
                                    key={tool}
                                    className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary/80 border border-primary/20"
                                >
                                    {tool}
                                </span>
                            ))}
                            {server.error && (
                                <p className="text-xs text-red-400 w-full mt-1">Error: {server.error}</p>
                            )}
                            {(!server.tools || server.tools.length === 0) && !server.error && (
                                <p className="text-xs text-neutral/50">No tool details available.</p>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

const AdminDashboard = () => {
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [userSearch, setUserSearch] = useState('')
    const [logs, setLogs] = useState([])
    const [logFilters, setLogFilters] = useState({ user_id: '', action_type: '', date_from: '', date_to: '' })
    const [memoryStats, setMemoryStats] = useState([])
    const [agents, setAgents] = useState([])
    const [health, setHealth] = useState(null)
    const [mcpStatus, setMcpStatus] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const loadStats = async () => setStats(await apiFetch('/admin/stats'))
    const loadUsers = async (search = '') => {
        const data = await apiFetch(`/admin/users?page=1&limit=50&search=${encodeURIComponent(search)}`)
        setUsers(data.items || [])
    }
    const loadLogs = async () => {
        const params = new URLSearchParams({ page: '1', limit: '50' })
        Object.entries(logFilters).forEach(([key, value]) => {
            if (value) params.append(key, value)
        })
        const data = await apiFetch(`/admin/logs?${params.toString()}`)
        setLogs(data.items || [])
    }
    const loadMemory = async () => {
        const data = await apiFetch('/admin/memory/stats')
        setMemoryStats(data.items || [])
    }
    const loadAgents = async () => {
        const data = await apiFetch('/admin/agents')
        setAgents(data.items || [])
    }
    const loadHealth = async () => setHealth(await apiFetch('/admin/system/health'))
    const loadMcpStatus = async () => setMcpStatus(await apiFetch('/admin/mcp/status'))

    const loadAll = async () => {
        setLoading(true)
        setError('')
        try {
            await Promise.all([loadStats(), loadUsers(userSearch), loadLogs(), loadMemory(), loadAgents(), loadHealth(), loadMcpStatus()])
        } catch (e) {
            setError(e.message || 'Failed to load admin data')
        } finally {
            setLoading(false)
        }
    }

    const searchRef = React.useRef(userSearch)
    useEffect(() => {
        searchRef.current = userSearch
    }, [userSearch])

    const loadAllSilent = async () => {
        try {
            await Promise.all([
                loadStats().catch(err => console.warn('Stats sync failed:', err)),
                loadUsers(searchRef.current).catch(err => console.warn('Users sync failed:', err)),
                loadLogs().catch(err => console.warn('Logs sync failed:', err)),
                loadMemory().catch(err => console.warn('Memory sync failed:', err)),
                loadAgents().catch(err => console.warn('Agents sync failed:', err)),
                loadHealth().catch(err => console.warn('Health sync failed:', err)),
                loadMcpStatus().catch(err => console.warn('MCP sync failed:', err))
            ])
        } catch (e) {
            // Ignore background sync errors to prevent UI disruption
        }
    }

    useEffect(() => {
        loadAll()
    }, [])

    useEffect(() => {
        const id = setInterval(() => {
            loadAllSilent()
        }, 4000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        const id = setTimeout(() => {
            loadUsers(userSearch).catch(() => {})
        }, 250)
        return () => clearTimeout(id)
    }, [userSearch])

    const filteredLogs = useMemo(() => logs, [logs])

    const handleElevate = async (userId) => {
        await apiFetch(`/admin/users/${userId}/elevate`, { method: 'POST' })
        await loadUsers(userSearch)
        await loadLogs()
    }

    const handleRevoke = async (userId) => {
        await apiFetch(`/admin/users/${userId}/revoke`, { method: 'POST' })
        await loadUsers(userSearch)
        await loadLogs()
    }

    const handleDeleteUser = async (userId) => {
        if (!window.confirm('Soft delete this user and revoke their integrations? They will remain in the database but be inactive.')) return
        await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' })
        await loadUsers(userSearch)
        await loadLogs()
    }

    const handleRestoreUser = async (userId) => {
        if (!window.confirm('Restore this user?')) return
        await apiFetch(`/admin/users/${userId}/restore`, { method: 'POST' })
        await loadUsers(userSearch)
        await loadLogs()
    }

    const handlePermanentDelete = async (userId, email) => {
        const confirm = window.prompt(`CRITICAL ACTION: This will PERMANENTLY DELETE user ${email} and ALL their associated data (memory, chats, tasks). This cannot be undone. Type "PERMANENT DELETE" to confirm:`)
        if (confirm !== 'PERMANENT DELETE') return
        
        setLoading(true)
        try {
            await apiFetch(`/admin/users/${userId}/permanent`, { method: 'DELETE' })
            await loadAll()
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleResetMemory = async (userId) => {
        if (!window.confirm('Reset all memory for this user?')) return
        await apiFetch(`/admin/memory/${userId}/reset`, { method: 'POST' })
        await Promise.all([loadMemory(), loadLogs(), loadStats()])
    }

    const healthItems = [
        { key: 'backend', label: 'Backend', value: health?.backend, ok: health?.backend === 'ok' },
        { key: 'database', label: 'Database', value: health?.database?.status, ok: health?.database?.status === 'ok' },
        { key: 'chromadb', label: 'ChromaDB', value: health?.chromadb?.status, ok: health?.chromadb?.status === 'ok' },
        { key: 'groq', label: 'Groq API', value: health?.groq?.status, ok: health?.groq?.status === 'ok' },
        { key: 'telegram', label: 'Telegram Bot', value: health?.telegram?.status, ok: health?.telegram?.status === 'ok' },
    ]

    return (
        <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto space-y-6 pb-36">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Platform Control</p>
                    <h2 className="text-3xl font-manrope font-extrabold text-on-surface">Admin Dashboard</h2>
                </div>
                <button
                    onClick={loadAll}
                    className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20"
                >
                    <RefreshCcw size={14} /> Refresh
                </button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Users" value={stats?.total_users} />
                <StatCard icon={Activity} label="AI Tasks Today" value={stats?.tasks_today} />
                <StatCard icon={HardDrive} label="Memory Docs" value={stats?.total_memory_docs} />
                <StatCard icon={Bot} label="Active Agents" value={stats?.active_agents} />
            </div>

            <Section
                title="User Management"
                right={
                    <input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by email"
                        className="bg-surface-container-high border border-neutral/20 rounded-lg px-3 py-1.5 text-sm"
                    />
                }
            >
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="text-left text-neutral">
                            <tr>
                                <th className="py-2 pr-3">Avatar</th>
                                <th className="py-2 pr-3">Email</th>
                                <th className="py-2 pr-3">Role</th>
                                <th className="py-2 pr-3">Connections</th>
                                <th className="py-2 pr-3">Joined</th>
                                <th className="py-2 pr-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id} className="border-t border-neutral/10">
                                    <td className="py-3 pr-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                                            {(u.name || u.email || 'U').slice(0, 1).toUpperCase()}
                                        </div>
                                    </td>
                                    <td className="py-3 pr-3">
                                        <div className="font-medium text-on-surface">{u.email}</div>
                                        <div className="text-xs text-neutral">{u.telegram_chat_id_masked || 'No Telegram'}</div>
                                    </td>
                                    <td className="py-3 pr-3">
                                        <div className="flex gap-2">
                                            {!u.is_active ? (
                                                <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-500 border border-red-500/20 font-bold">INACTIVE</span>
                                            ) : u.is_admin ? (
                                                <span className="text-[10px] px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 font-bold">ADMIN</span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-1 rounded-full bg-neutral/15 text-neutral border border-neutral/20 font-bold">USER</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 pr-3">
                                        <div className="flex items-center gap-2">
                                            <Dot ok={u.gmail_connected} />
                                            <Dot ok={u.calendar_connected} />
                                            <Dot ok={u.telegram_connected} />
                                        </div>
                                    </td>
                                    <td className="py-3 pr-3">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
                                    <td className="py-3 pr-3">
                                        <div className="flex flex-wrap gap-2">
                                            {u.is_active && !u.is_admin && (
                                                <button onClick={() => handleElevate(u.id)} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400">Elevate</button>
                                            )}
                                            {u.is_active && u.is_admin && (
                                                <button onClick={() => handleRevoke(u.id)} className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400">Revoke</button>
                                            )}
                                            {u.is_active ? (
                                                <button onClick={() => handleDeleteUser(u.id)} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400">Suspend</button>
                                            ) : (
                                                <button onClick={() => handleRestoreUser(u.id)} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400">Restore</button>
                                            )}
                                            <button onClick={() => handlePermanentDelete(u.id, u.email)} className="text-xs px-2 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700">Wipe</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="Activity Log">
                <div className="flex flex-wrap gap-2 mb-3">
                    <input className="bg-surface-container-high border border-neutral/20 rounded-lg px-3 py-1.5 text-sm" placeholder="User ID" value={logFilters.user_id} onChange={(e) => setLogFilters((p) => ({ ...p, user_id: e.target.value }))} />
                    <input className="bg-surface-container-high border border-neutral/20 rounded-lg px-3 py-1.5 text-sm" placeholder="Action type" value={logFilters.action_type} onChange={(e) => setLogFilters((p) => ({ ...p, action_type: e.target.value }))} />
                    <input type="date" className="bg-surface-container-high border border-neutral/20 rounded-lg px-3 py-1.5 text-sm" value={logFilters.date_from} onChange={(e) => setLogFilters((p) => ({ ...p, date_from: e.target.value }))} />
                    <input type="date" className="bg-surface-container-high border border-neutral/20 rounded-lg px-3 py-1.5 text-sm" value={logFilters.date_to} onChange={(e) => setLogFilters((p) => ({ ...p, date_to: e.target.value }))} />
                    <button onClick={loadLogs} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary">Apply</button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-neutral/10 bg-surface-container p-3">
                            <div className="text-xs text-neutral">{new Date(log.created_at).toLocaleString()} • {log.user_id}</div>
                            <div className="text-sm font-semibold">{log.intent}</div>
                            <div className="text-xs text-on-surface-variant truncate">{log.input}</div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Memory Inspector">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="text-left text-neutral">
                            <tr>
                                <th className="py-2 pr-3">User</th>
                                <th className="py-2 pr-3">ChromaDB Docs</th>
                                <th className="py-2 pr-3">Structured</th>
                                <th className="py-2 pr-3">Archive</th>
                                <th className="py-2 pr-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {memoryStats.map((row) => (
                                <tr key={row.user_id} className="border-t border-neutral/10">
                                    <td className="py-2 pr-3">{row.email}</td>
                                    <td className="py-2 pr-3">{row.chromadb_docs}</td>
                                    <td className="py-2 pr-3">{row.structured_memory}</td>
                                    <td className="py-2 pr-3">{row.archive_memory}</td>
                                    <td className="py-2 pr-3">
                                        <button onClick={() => handleResetMemory(row.user_id)} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400">Reset Memory</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="System Health">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    {healthItems.map((item) => (
                        <div key={item.key} className="rounded-xl border border-neutral/10 bg-surface-container p-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-bold uppercase tracking-wider text-neutral">{item.label}</div>
                                <Dot ok={item.ok} />
                            </div>
                            <div className="text-sm font-semibold mt-2">{item.value || 'unknown'}</div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="MCP Server Monitor">
                <MCPMonitor mcpStatus={mcpStatus} />
            </Section>

            <Section title="Agent Network Overview">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="text-left text-neutral">
                            <tr>
                                <th className="py-2 pr-3">User</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2 pr-3">Capabilities</th>
                                <th className="py-2 pr-3">Last Seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agents.map((agent) => (
                                <tr key={agent.user_id} className="border-t border-neutral/10">
                                    <td className="py-2 pr-3">{agent.display_name || agent.handle || agent.user_id}</td>
                                    <td className="py-2 pr-3">
                                        <span className="inline-flex items-center gap-1">
                                            <Dot ok={agent.status === 'online'} /> {agent.status}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-3 text-xs">{(agent.capabilities || []).join(', ')}</td>
                                    <td className="py-2 pr-3">{agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            {loading && (
                <div className="fixed bottom-5 right-5 z-40 px-4 py-2 rounded-xl bg-surface-container border border-neutral/20 text-xs text-neutral">
                    Syncing admin data...
                </div>
            )}
        </div>
    )
}

export default AdminDashboard
