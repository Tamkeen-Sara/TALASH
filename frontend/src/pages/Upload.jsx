import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudUpload, FileText, X, Package, ArrowRight, Loader2 } from 'lucide-react'
import { uploadCVs, uploadBulkPDF, getCandidates } from '../api/talash'
import useCandidateStore from '../store/candidateStore'
import usePageTitle from '../hooks/usePageTitle'

const STATUS_META = {
  parsing:         { color: 'var(--warning)',  label: 'Parsing' },
  splitting:       { color: 'var(--violet)',   label: 'Splitting' },
  split_complete:  { color: 'var(--violet)',   label: 'Split complete' },
  extracted:       { color: 'var(--sky)',      label: 'Extracted' },
  education_scored:{ color: 'var(--success)',  label: 'Education scored' },
  complete:        { color: 'var(--success)',  label: 'Complete' },
  error:           { color: 'var(--error)',    label: 'Error' },
}

export default function Upload() {
  usePageTitle('Upload CVs')
  const navigate = useNavigate()
  const { setCandidates, setLoading } = useCandidateStore()
  const [mode, setMode]           = useState('single')
  const [files, setFiles]         = useState([])
  const [jd, setJd]               = useState('')
  const [events, setEvents]       = useState([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone]           = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const abortRef     = useRef(null)
  const fileInputRef = useRef(null)
  const logRef       = useRef(null)

  const addFiles = (incoming) => {
    const pdfs = Array.from(incoming).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (mode === 'bulk') { setFiles(pdfs.slice(0, 1)); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...pdfs.filter(f => !names.has(f.name))]
    })
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files)
  }, [mode])

  const onComplete = () => {
    setUploading(false); setLoading(false); setDone(true)
    getCandidates().then(r => setCandidates(r.data)).catch(() => {})
  }

  const scrollLog = () => setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50)

  const handleUpload = () => {
    if (!files.length || uploading) return
    setEvents([]); setDone(false); setUploading(true); setLoading(true)
    if (mode === 'bulk') {
      let expected = null
      let finished = 0
      abortRef.current = uploadBulkPDF(files[0], jd, payload => {
        setEvents(prev => { scrollLog(); return [...prev, payload] })
        if (payload.status === 'split_complete') {
          expected = payload.count
          if (expected === 0) onComplete()
        }
        if (payload.status === 'complete' || payload.status === 'error') {
          finished++
          if (expected !== null && finished >= expected) onComplete()
        }
        if (payload.status === 'error' && expected === null) onComplete()
      })
    } else {
      let completed = 0
      const total = files.length
      abortRef.current = uploadCVs(files, jd, payload => {
        setEvents(prev => { scrollLog(); return [...prev, payload] })
        if (payload.status === 'complete' || payload.status === 'error') {
          if (++completed >= total) onComplete()
        }
      })
    }
  }

  return (
    <div style={{ maxWidth: 640, padding: '40px 40px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
          Upload CVs
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
          AI-powered extraction and scoring in seconds.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{
        display: 'flex', gap: 6, padding: 6, borderRadius: 14, marginBottom: 24,
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      }}>
        {[
          { id: 'single', Icon: FileText, label: 'Individual CVs', desc: 'Multiple separate PDFs' },
          { id: 'bulk',   Icon: Package,  label: 'Bulk PDF',        desc: 'One file, many CVs' },
        ].map(({ id, Icon, label, desc }) => (
          <button key={id} onClick={() => { setMode(id); setFiles([]) }} style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
            border: mode === id ? '1px solid var(--accent-ring)' : '1px solid transparent',
            background: mode === id ? 'var(--accent-dim)' : 'transparent',
            transition: 'all 0.15s',
          }}>
            <Icon size={15} style={{ color: mode === id ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: mode === id ? 'var(--accent)' : 'var(--text-muted)' }}>
                {label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
          marginBottom: 16, transition: 'all 0.15s',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-input)',
          border: dragOver ? '2px dashed var(--accent)' : '2px dashed var(--border-default)',
        }}>
        <input ref={fileInputRef} type="file" accept=".pdf"
          multiple={mode === 'single'} style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)} />

        <div style={{
          width: 48, height: 48, borderRadius: 14, margin: '0 auto 16px',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          <CloudUpload size={22} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-muted)' }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
          {dragOver ? 'Drop to upload'
            : mode === 'bulk' ? 'Drop your compiled CV PDF here'
            : 'Drag & drop PDF files, or click to browse'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF files only</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {files.map(f => (
            <div key={f.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 12,
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'var(--accent-dim)', border: '1px solid var(--accent-ring)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <button onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                disabled={uploading} style={{
                  marginLeft: 12, width: 26, height: 26, borderRadius: 7, border: 'none',
                  background: 'transparent', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,113,133,0.1)'; e.currentTarget.style.color = '#fb7185' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Job description */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Job Description{' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea value={jd} onChange={e => setJd(e.target.value)} rows={3}
          placeholder="Paste the job description for skill-alignment analysis…"
          className="input-dark" style={{ resize: 'none' }} disabled={uploading} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleUpload} disabled={!files.length || uploading}
          className="btn-primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {uploading
            ? <><Loader2 size={15} className="animate-spin" />Analyzing…</>
            : <>Analyze {files.length} CV{files.length !== 1 ? 's' : ''} <ArrowRight size={14} /></>
          }
        </button>
        {uploading && (
          <button className="btn-ghost" style={{ padding: '11px 20px' }}
            onClick={() => { abortRef.current?.(); setUploading(false); setLoading(false) }}>
            Cancel
          </button>
        )}
        {done && (
          <button onClick={() => navigate('/dashboard')} style={{
            padding: '11px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, color: '#fff',
            border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
            boxShadow: '0 4px 14px rgba(34,197,94,0.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            View Results <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Processing log */}
      {events.length > 0 && (
        <div style={{ marginTop: 28, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          <div style={{
            padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              Processing Log
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{events.length} events</span>
          </div>
          <div ref={logRef} style={{
            maxHeight: 260, overflowY: 'auto', padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 6,
            fontFamily: 'monospace', fontSize: 12,
            background: 'var(--bg-input)',
          }}>
            {events.map((ev, i) => {
              const meta = STATUS_META[ev.status] || { color: 'var(--text-secondary)', label: ev.status }
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ width: 20, textAlign: 'right', flexShrink: 0, color: 'var(--text-muted)' }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', width: 96, flexShrink: 0, color: meta.color }}>
                    {meta.label}
                  </span>
                  {ev.candidate && <span style={{ color: 'var(--text-secondary)' }}>: {ev.candidate}</span>}
                  {ev.file && !ev.candidate && <span style={{ color: 'var(--text-muted)' }}>: {ev.file}</span>}
                  {ev.count !== undefined && <span style={{ color: 'var(--text-muted)' }}>: {ev.count} CVs detected</span>}
                  {ev.score !== undefined && <span style={{ color: meta.color }}>· score {ev.score}</span>}
                  {ev.error && <span style={{ color: 'var(--error)' }}>: {ev.error}</span>}
                </div>
              )
            })}
            {uploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', paddingTop: 4 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', borderWidth: 1.5, borderStyle: 'solid',
                  borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)',
                  animation: 'spin 0.75s linear infinite',
                }} />
                Processing…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}