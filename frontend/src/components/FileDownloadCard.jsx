import React from 'react'
import { motion } from 'framer-motion'
import { Download, FileText, FileSpreadsheet, Presentation, FileCode, File } from 'lucide-react'
import { API_BASE } from '../config'
import { useStore } from '../store/useStore'

const EXT_ICON = {
    pdf: { Icon: FileText, color: '#ef4444', label: 'PDF' },
    docx: { Icon: FileText, color: '#3b82f6', label: 'Word' },
    xlsx: { Icon: FileSpreadsheet, color: '#10b981', label: 'Excel' },
    csv: { Icon: FileSpreadsheet, color: '#10b981', label: 'CSV' },
    pptx: { Icon: Presentation, color: '#f59e0b', label: 'PowerPoint' },
    py: { Icon: FileCode, color: '#a855f7', label: 'Python' },
    js: { Icon: FileCode, color: '#f59e0b', label: 'JavaScript' },
    ts: { Icon: FileCode, color: '#3b82f6', label: 'TypeScript' },
    md: { Icon: FileText, color: '#6366f1', label: 'Markdown' },
    json: { Icon: FileCode, color: '#06b6d4', label: 'JSON' },
    yaml: { Icon: FileCode, color: '#06b6d4', label: 'YAML' },
    html: { Icon: FileCode, color: '#f97316', label: 'HTML' },
    sql: { Icon: FileCode, color: '#84cc16', label: 'SQL' },
    sh: { Icon: FileCode, color: '#ec4899', label: 'Shell' },
    txt: { Icon: FileText, color: '#9ca3af', label: 'Text' },
}

function formatSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const FileDownloadCard = ({ fileData }) => {
    const { auth } = useStore()
    const token = auth?.user?.accessToken

    if (!fileData) return null

    const { file_id, filename, file_type, mime_type, size, download_url, title } = fileData

    const ext = filename?.split('.').pop()?.toLowerCase() || 'txt'
    const { Icon = File, color = '#9ca3af', label = ext.toUpperCase() } = EXT_ICON[ext] || {}

    const handleDownload = async () => {
        try {
            const url = `${API_BASE}${download_url}`
            const res = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            if (!res.ok) throw new Error('Download failed')
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(blobUrl)
        } catch (err) {
            console.error('Download error:', err)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
        >
            {/* Header bar */}
            <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    File Generated
                </span>
            </div>

            <div className="p-4 flex items-center gap-4">
                {/* File type icon */}
                <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                >
                    <Icon size={22} style={{ color }} />
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{title || filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: `${color}20`, color }}
                        >
                            {label}
                        </span>
                        {size && (
                            <span className="text-[10px] text-white/30 font-medium">
                                {formatSize(size)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Download button */}
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-white transition-all hover:brightness-110 active:scale-95 flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${color}99, ${color}55)`, border: `1px solid ${color}40` }}
                >
                    <Download size={14} />
                    Download
                </button>
            </div>
        </motion.div>
    )
}

export default FileDownloadCard
