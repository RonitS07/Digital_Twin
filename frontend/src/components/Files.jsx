import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Image as ImageIcon, File, Download, Trash2, Search, Filter, HardDrive, Calendar } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

const FileCard = ({ file, onDelete }) => {
    const isImage = file.type?.startsWith('image/')
    const [downloading, setDownloading] = useState(false)

    const handleDownload = async () => {
        setDownloading(true)
        try {
            const token = useStore.getState().auth?.user?.accessToken
            const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            })
            if (!res.ok) throw new Error('Download failed')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Download error:', err)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative bg-surface-container/40 hover:bg-surface-container-high/60 border border-neutral/5 rounded-2xl p-4 transition-all duration-300"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${isImage ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                    {isImage ? <ImageIcon size={22} /> : <FileText size={22} />}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        title="Download"
                        className="p-2 text-neutral hover:text-primary transition-colors disabled:opacity-40"
                    >
                        <Download size={16} className={downloading ? 'animate-bounce' : ''} />
                    </button>
                    <button onClick={() => onDelete(file.id)} className="p-2 text-neutral hover:text-error transition-colors">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
            
            <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface truncate pr-4" title={file.name}>{file.name}</h3>
                <div className="flex items-center gap-2 text-[10px] text-neutral font-medium">
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                    <span className="w-1 h-1 rounded-full bg-neutral/20" />
                    <span>{new Date(file.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </motion.div>
    )
}

const Files = () => {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const data = await apiFetch('/ai/files')
                setFiles(data)
            } catch (err) {
                console.error("Failed to fetch files", err)
            } finally {
                setLoading(false)
            }
        }
        fetchFiles()
    }, [])

    const filteredFiles = files.filter(f => 
        f.name.toLowerCase().includes(search.toLowerCase())
    )

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to permanently delete this asset?")) return;
        
        try {
            await apiFetch(`/ai/files/${id}`, { method: 'DELETE' });
            setFiles(prev => prev.filter(f => f.id !== id));
        } catch (err) {
            console.error("Failed to delete file", err);
            alert("Failed to delete file. Please try again.");
        }
    }

    return (
        <div className="h-full flex flex-col p-4 lg:p-8 overflow-hidden bg-surface-base">
            <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-manrope font-extrabold text-on-surface flex items-center gap-3">
                            <HardDrive className="text-primary" />
                            Digital Assets
                        </h1>
                        <p className="text-sm text-neutral mt-1">Manage and access files shared with your Twin.</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search files..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-surface-container border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                        <button className="p-2.5 bg-surface-container rounded-xl text-neutral hover:text-on-surface transition-colors">
                            <Filter size={18} />
                        </button>
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm font-bold text-neutral">Syncing assets...</p>
                        </div>
                    </div>
                ) : filteredFiles.length > 0 ? (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <AnimatePresence>
                                {filteredFiles.map(file => (
                                    <FileCard key={file.id} file={file} onDelete={handleDelete} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-20 h-20 bg-surface-container rounded-3xl flex items-center justify-center mb-6 text-neutral/40">
                            <File size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-on-surface mb-2">No assets found</h3>
                        <p className="text-sm text-neutral max-w-sm">
                            Any documents or images you share with your Twin in the chat will appear here for easy access.
                        </p>
                    </div>
                )}

                {/* Stats Footer */}
                <div className="mt-8 pt-6 border-t border-neutral/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-neutral">
                    <div className="flex gap-6">
                        <div className="flex items-center gap-2">
                            <HardDrive size={14} className="text-primary" />
                            {files.length} Total Files
                        </div>
                        <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-secondary" />
                            {files.filter(f => f.type?.startsWith('image/')).length} Images
                        </div>
                    </div>
                    <div>
                        Storage: {(files.reduce((acc, f) => acc + (f.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Files
