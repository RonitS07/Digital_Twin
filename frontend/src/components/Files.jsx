import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Image as ImageIcon, File, Download, Trash2, Search, Filter, HardDrive, Calendar, X, FileCode } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useStore } from '../store/useStore'
import { API_BASE } from '../config'

const FileThumbnail = ({ file }) => {
    const isImage = file.type?.startsWith('image/')
    const [imgUrl, setImgUrl] = useState(null)

    useEffect(() => {
        if (!isImage) return
        let active = true
        const load = async () => {
            try {
                const token = useStore.getState().auth?.user?.accessToken
                const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, {
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                })
                if (res.ok && active) {
                    const blob = await res.blob()
                    setImgUrl(URL.createObjectURL(blob))
                }
            } catch (e) {
                console.error(e)
            }
        }
        load()
        return () => {
            active = false
            if (imgUrl) URL.revokeObjectURL(imgUrl)
        }
    }, [file.id, isImage])

    if (isImage && imgUrl) {
        return <img src={imgUrl} alt={file.name} className="w-full h-32 object-cover rounded-lg mb-2" />
    }

    return (
        <div className="w-full h-32 bg-[#F7F5F2] border border-[#E8E4DE] rounded-lg mb-2 flex items-center justify-center text-[#A09488]">
            {isImage ? <ImageIcon size={28} /> : <FileText size={28} />}
        </div>
    )
}

const FileCard = ({ file, onDelete, onSelect }) => {
    const isImage = file.type?.startsWith('image/')
    const isDoc = file.type?.includes('pdf') || file.type?.includes('doc') || file.type?.includes('text')
    const [downloading, setDownloading] = useState(false)

    const getBandClass = () => {
        if (isImage) return 'bg-[#B45309]'
        if (isDoc) return 'bg-[#2D6A4F]'
        if (file.type?.includes('csv') || file.type?.includes('json')) return 'bg-[#6E5AFF]'
        return 'bg-[#7A7065]'
    }

    const handleDownload = async (e) => {
        e.stopPropagation()
        setDownloading(true)
        try {
            const token = useStore.getState().auth?.user?.accessToken
            const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
            if (!res.ok) throw new Error('Download failed')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = file.name
            document.body.appendChild(a); a.click()
            document.body.removeChild(a); URL.revokeObjectURL(url)
        } catch (err) { console.error('Download error:', err) }
        finally { setDownloading(false) }
    }

    const handleDeleteClick = (e) => {
        e.stopPropagation()
        onDelete(file.id)
    }

    return (
        <motion.div layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            onClick={() => onSelect(file)}
            className="group wi-card p-0 overflow-hidden cursor-pointer hover:shadow-md hover:border-[#2D6A4F]/30 transition-all duration-300">
            {/* Color band */}
            <div className={`h-1.5 ${getBandClass()}`} />
            <div className="p-4">
                <FileThumbnail file={file} />
                <div className="flex items-start justify-between mt-2">
                    <div className="min-w-0 flex-1 pr-2">
                        <h3 className="font-dm font-semibold text-sm text-[#1A1814] truncate" title={file.name}>{file.name}</h3>
                        <p className="font-mono-ji text-[10px] text-[#A09488] mt-0.5">{(file.size / 1024).toFixed(1)} KB &middot; {new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={handleDownload} disabled={downloading} title="Download" className="p-1.5 text-[#A09488] hover:text-[#2D6A4F] transition-colors">
                            <Download size={14} className={downloading ? 'animate-bounce' : ''} />
                        </button>
                        <button onClick={handleDeleteClick} className="p-1.5 text-[#A09488] hover:text-[#C0392B] transition-colors">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

const FilePreviewModal = ({ file, onClose, onDelete }) => {
    const isImage = file.type?.startsWith('image/')
    const [imgUrl, setImgUrl] = useState(null)
    const [content, setContent] = useState('')
    const [loadingContent, setLoadingContent] = useState(false)
    const [downloading, setDownloading] = useState(false)

    useEffect(() => {
        let active = true
        const load = async () => {
            if (isImage) {
                try {
                    const token = useStore.getState().auth?.user?.accessToken
                    const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, {
                        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                    })
                    if (res.ok && active) {
                        const blob = await res.blob()
                        setImgUrl(URL.createObjectURL(blob))
                    }
                } catch (e) {
                    console.error(e)
                }
            } else {
                setLoadingContent(true)
                try {
                    const token = useStore.getState().auth?.user?.accessToken
                    const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, {
                        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                    })
                    if (res.ok && active) {
                        const text = await res.text()
                        setContent(text)
                    }
                } catch (e) {
                    setContent('Could not read file preview.')
                } finally {
                    setLoadingContent(false)
                }
            }
        }
        load()
        return () => {
            active = false
            if (imgUrl) URL.revokeObjectURL(imgUrl)
        }
    }, [file, isImage])

    const handleDownload = async () => {
        setDownloading(true)
        try {
            const token = useStore.getState().auth?.user?.accessToken
            const res = await fetch(`${API_BASE}/ai/files/${file.id}/download`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
            if (!res.ok) throw new Error('Download failed')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = file.name
            document.body.appendChild(a); a.click()
            document.body.removeChild(a); URL.revokeObjectURL(url)
        } catch (err) { console.error('Download error:', err) }
        finally { setDownloading(false) }
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md" onClick={onClose}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="wi-card w-full max-w-4xl p-0 overflow-hidden shadow-2xl relative flex flex-col md:flex-row h-[80vh] bg-white" onClick={e => e.stopPropagation()}>

                {/* Left Preview Pane */}
                <div className="flex-1 bg-[#F7F5F2] border-r border-[#E8E4DE] flex items-center justify-center p-6 min-h-0 relative">
                    <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full bg-white shadow-sm border border-[#E8E4DE] text-[#7A7065] hover:text-[#1A1814] z-10 md:hidden"><X size={16} /></button>
                    {isImage ? (
                        imgUrl ? (
                            <img src={imgUrl} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
                        ) : (
                            <div className="animate-pulse flex flex-col items-center gap-2"><ImageIcon size={48} className="text-[#A09488]" /><p className="text-xs text-neutral">Loading image...</p></div>
                        )
                    ) : (
                        <div className="w-full h-full flex flex-col min-h-0">
                            <div className="bg-white border border-[#E8E4DE] rounded-xl flex-1 p-5 overflow-auto font-mono text-xs leading-relaxed text-[#4A433A] whitespace-pre-wrap select-text custom-scrollbar">
                                {loadingContent ? 'Loading file preview...' : content}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Metadata Pane */}
                <div className="w-full md:w-80 p-8 flex flex-col justify-between shrink-0 bg-white">
                    <div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <span className="font-mono-ji text-[9px] uppercase tracking-widest text-[#2D6A4F]">Asset Details</span>
                                <h3 className="font-fraunces font-semibold text-[#1A1814] text-xl mt-1 break-all pr-4">{file.name}</h3>
                            </div>
                            <button onClick={onClose} className="hidden md:block p-1.5 rounded-full hover:bg-[#F7F5F2] text-[#7A7065] hover:text-[#1A1814] transition-colors"><X size={18} /></button>
                        </div>

                        <div className="space-y-4 font-dm text-sm text-[#7A7065]">
                            <div className="flex justify-between border-b border-[#F7F5F2] pb-2">
                                <span className="font-medium text-[#1A1814]">Size</span>
                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                            </div>
                            <div className="flex justify-between border-b border-[#F7F5F2] pb-2">
                                <span className="font-medium text-[#1A1814]">Type</span>
                                <span className="truncate max-w-[150px]" title={file.type}>{file.type || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between border-b border-[#F7F5F2] pb-2">
                                <span className="font-medium text-[#1A1814]">Created</span>
                                <span>{new Date(file.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-2">
                        <button onClick={handleDownload} disabled={downloading} className="w-full py-3 rounded-xl bg-[#2D6A4F] text-white font-medium flex items-center justify-center gap-2 border border-[#2D6A4F] hover:bg-[#1f4b37] transition-all">
                            <Download size={16} /> Download Asset
                        </button>
                        <button onClick={() => { onDelete(file.id); onClose(); }} className="w-full py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 font-medium flex items-center justify-center gap-2 hover:bg-red-500/15 transition-all">
                            <Trash2 size={16} /> Delete Asset
                        </button>
                    </div>
                </div>

            </motion.div>
        </motion.div>
    )
}

const Files = () => {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedTab, setSelectedTab] = useState('all') // 'all', 'docs', 'images', 'data'
    const [selectedFile, setSelectedFile] = useState(null)

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

    useEffect(() => {
        fetchFiles()
    }, [])

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to permanently delete this asset?")) return;
        try {
            await apiFetch(`/ai/files/${id}`, { method: 'DELETE' });
            setFiles(prev => prev.filter(f => f.id !== id));
        } catch (err) {
            console.error("Failed to delete file", err);
        }
    }

    const filteredFiles = files.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase())
        if (!matchesSearch) return false

        if (selectedTab === 'images') return f.type?.startsWith('image/')
        if (selectedTab === 'docs') return f.type?.includes('pdf') || f.type?.includes('doc') || f.type?.includes('text')
        if (selectedTab === 'data') return f.type?.includes('csv') || f.type?.includes('json') || f.type?.includes('sheet')
        return true
    })

    return (
        <div className="h-full flex flex-col p-6 lg:p-10 overflow-hidden bg-[#F7F5F2] pb-24">
            <div className="max-w-6xl mx-auto w-full flex flex-col h-full">

                {/* Header */}
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <p className="wi-label mb-2">Storage</p>
                        <h1 className="font-fraunces font-semibold text-3xl lg:text-4xl text-[#1A1814] mb-1">Digital Assets</h1>
                        <p className="font-dm text-sm text-[#7A7065]">Files and visualizations generated by your Twin appear here.</p>
                    </div>
                </div>

                {/* Search & Tabs Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    {/* Tabs */}
                    <div className="flex gap-1 bg-[#E8E4DE]/50 p-1 rounded-xl self-start">
                        {['all', 'docs', 'images', 'data'].map(tab => (
                            <button key={tab} onClick={() => setSelectedTab(tab)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${selectedTab === tab ? 'bg-white text-[#1A1814] shadow-sm' : 'text-[#7A7065] hover:text-[#1A1814]'}`}>
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A09488]" size={14} />
                        <input type="text" placeholder="Search digital assets..." value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-white border border-[#E8E4DE] rounded-xl pl-10 pr-4 py-2 text-sm text-[#1A1814] focus:outline-none focus:border-[#2D6A4F] transition-all"
                        />
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex-grow flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-3 border-[#2D6A4F]/20 border-t-[#2D6A4F] rounded-full animate-spin" />
                            <p className="text-xs font-semibold text-[#7A7065]">Syncing assets...</p>
                        </div>
                    </div>
                ) : filteredFiles.length > 0 ? (
                    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                            <AnimatePresence>
                                {filteredFiles.map(file => (
                                    <FileCard key={file.id} file={file} onDelete={handleDelete} onSelect={setSelectedFile} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-white border border-[#E8E4DE] rounded-2xl">
                        <div className="w-16 h-16 bg-[#F7F5F2] border border-[#E8E4DE] rounded-2xl flex items-center justify-center mb-5 text-[#A09488]">
                            <File size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-[#1A1814] mb-1">No assets found</h3>
                        <p className="text-sm text-[#7A7065] max-w-sm">
                            Any files or graphical assets generated in chat will appear here. Try uploading or creating one!
                        </p>
                    </div>
                )}

                {/* Stats Footer */}
                <div className="mt-6 pt-4 border-t border-[#E8E4DE] flex items-center justify-between">
                    <span className="font-dm text-xs text-[#7A7065]">{files.length} file{files.length !== 1 ? 's' : ''} &middot; {(files.reduce((acc, f) => acc + (f.size || 0), 0) / 1024 / 1024).toFixed(2)} MB</span>
                    <span className="font-dm text-xs text-[#7A7065]">{files.filter(f => f.type?.startsWith('image/')).length} images</span>
                </div>
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {selectedFile && (
                    <FilePreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} onDelete={handleDelete} />
                )}
            </AnimatePresence>
        </div>
    )
}

export default Files
