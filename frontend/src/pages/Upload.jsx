import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadCVs, uploadBulkPDF, getCandidates } from '../api/talash'
import useCandidateStore from '../store/candidateStore'

const STATUS_COLORS = {
  parsing: 'text-yellow-600',
  splitting: 'text-purple-500',
  split_complete: 'text-purple-600',
  extracted: 'text-blue-600',
  education_scored: 'text-indigo-500',
  complete: 'text-emerald-600',
  error: 'text-red-600',
}

export default function Upload() {
  const navigate = useNavigate()
  const { setCandidates, setLoading } = useCandidateStore()

  const [mode, setMode] = useState('single') // 'single' | 'bulk'
  const [files, setFiles] = useState([])
  const [jd, setJd] = useState('')
  const [events, setEvents] = useState([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef(null)
  const fileInputRef = useRef(null)

  const addFiles = (incoming) => {
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
    )
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...pdfs.filter((f) => !names.has(f.name))]
    })
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const removeFile = (name) =>
    setFiles((prev) => prev.filter((f) => f.name !== name))

  const handleUpload = () => {
    if (!files.length || uploading) return
    setEvents([])
    setDone(false)
    setUploading(true)
    setLoading(true)

    const onComplete = () => {
      setUploading(false)
      setLoading(false)
      setDone(true)
      getCandidates().then((res) => setCandidates(res.data)).catch(() => {})
    }

    if (mode === 'bulk') {
      // Bulk mode: single multi-CV PDF
      const cleanup = uploadBulkPDF(files[0], jd, (payload) => {
        setEvents((prev) => [...prev, payload])
        // bulk is done when we get an error or the last 'complete' (no easy count)
        if (payload.status === 'error') onComplete()
      })
      // Poll for completion via a sentinel — bulk stream ends naturally
      abortRef.current = cleanup
      // We detect end-of-stream by XHR readyState (hack: set a timer fallback)
    } else {
      // Single mode: multiple individual PDFs
      let completed = 0
      const total = files.length
      const cleanup = uploadCVs(files, jd, (payload) => {
        setEvents((prev) => [...prev, payload])
        if (payload.status === 'complete' || payload.status === 'error') {
          completed++
          if (completed >= total) onComplete()
        }
      })
      abortRef.current = cleanup
    }
  }

  const handleCancel = () => {
    if (abortRef.current) abortRef.current()
    setUploading(false)
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-[#1a3557] mb-2">Upload CVs</h1>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode('single'); setFiles([]) }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            mode === 'single'
              ? 'bg-[#1a3557] text-white border-[#1a3557]'
              : 'border-slate-300 text-slate-600 hover:border-blue-400'
          }`}
        >
          Individual CVs
        </button>
        <button
          onClick={() => { setMode('bulk'); setFiles([]) }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            mode === 'bulk'
              ? 'bg-[#1a3557] text-white border-[#1a3557]'
              : 'border-slate-300 text-slate-600 hover:border-blue-400'
          }`}
        >
          Bulk PDF (multi-CV)
        </button>
      </div>

      <p className="text-slate-500 mb-6 text-sm">
        {mode === 'single'
          ? 'Upload one or more individual CV PDFs.'
          : 'Upload a single PDF containing multiple CVs. TALASH will auto-detect and split them.'}
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 hover:border-blue-400 bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple={mode === 'single'}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="text-4xl mb-3">📄</div>
        <p className="text-slate-600 font-medium">
          Drag & drop PDF files here, or click to browse
        </p>
        <p className="text-slate-400 text-sm mt-1">Only PDF files accepted</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex justify-between items-center bg-white rounded-lg px-4 py-2 shadow-sm border border-slate-100"
            >
              <span className="text-sm text-slate-700 truncate">{f.name}</span>
              <button
                onClick={() => removeFile(f.name)}
                className="text-slate-400 hover:text-red-500 ml-4 text-lg leading-none"
                disabled={uploading}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Job description */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Job Description (optional)
        </label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={4}
          placeholder="Paste the job description here for skill-matching analysis..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={uploading}
        />
      </div>

      {/* Action buttons */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!files.length || uploading}
          className="px-6 py-2 bg-[#1a3557] text-white rounded-lg font-medium hover:bg-[#12273f] disabled:opacity-40 transition-colors"
        >
          {uploading ? 'Analyzing...' : `Analyze ${files.length} CV${files.length !== 1 ? 's' : ''}`}
        </button>
        {uploading && (
          <button
            onClick={handleCancel}
            className="px-6 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        )}
        {done && (
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
          >
            View Dashboard
          </button>
        )}
      </div>

      {/* SSE progress feed */}
      {events.length > 0 && (
        <div className="mt-8 bg-slate-900 text-slate-100 rounded-xl p-5 font-mono text-sm max-h-72 overflow-y-auto">
          <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">
            Processing Log
          </p>
          {events.map((ev, i) => (
            <div key={i} className="mb-1">
              <span className="text-slate-500">[{i + 1}] </span>
              <span className={STATUS_COLORS[ev.status] || 'text-slate-300'}>
                {ev.status.toUpperCase()}
              </span>
              {ev.file && (
                <span className="text-slate-400"> — {ev.file}</span>
              )}
              {ev.candidate && (
                <span className="text-white"> — {ev.candidate}</span>
              )}
              {ev.error && (
                <span className="text-red-400"> — {ev.error}</span>
              )}
            </div>
          ))}
          {uploading && (
            <div className="mt-2 text-blue-400 animate-pulse">Processing...</div>
          )}
        </div>
      )}
    </div>
  )
}
