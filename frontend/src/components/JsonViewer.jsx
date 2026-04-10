import { useState } from 'react'

// Syntax colour map by value type
function valueColor(val) {
  if (val === null) return 'text-slate-400'
  if (typeof val === 'boolean') return 'text-orange-500'
  if (typeof val === 'number') return 'text-blue-500'
  if (typeof val === 'string') return 'text-emerald-600'
  return 'text-slate-700'
}

function JsonValue({ value, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 2)

  if (value === null) return <span className="text-slate-400 italic">null</span>
  if (typeof value === 'boolean') return <span className="text-orange-500">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-500">{value}</span>
  if (typeof value === 'string') return <span className="text-emerald-600">"{value}"</span>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">[]</span>
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-500 hover:text-slate-700 font-mono text-xs mr-1"
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="text-slate-500">[{value.length}]</span>
        {collapsed ? null : (
          <div className="ml-4 border-l border-slate-200 pl-3 mt-0.5">
            {value.map((item, i) => (
              <div key={i} className="leading-6">
                <span className="text-slate-400 text-xs mr-1">{i}:</span>
                <JsonValue value={item} depth={depth + 1} />
                {i < value.length - 1 && <span className="text-slate-300">,</span>}
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return <span className="text-slate-400">{'{}'}</span>
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-500 hover:text-slate-700 font-mono text-xs mr-1"
        >
          {collapsed ? '▶' : '▼'}
        </button>
        {collapsed ? (
          <span className="text-slate-400 text-xs">{`{ ${keys.length} keys }`}</span>
        ) : (
          <div className="ml-4 border-l border-slate-200 pl-3 mt-0.5">
            {keys.map((k, i) => (
              <div key={k} className="leading-6">
                <span className="text-[#1a3557] font-medium">{k}</span>
                <span className="text-slate-400">: </span>
                <JsonValue value={value[k]} depth={depth + 1} />
                {i < keys.length - 1 && <span className="text-slate-300">,</span>}
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

export default function JsonViewer({ data, title = 'Raw JSON' }) {
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const json = JSON.stringify(data, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Simple search: filter top-level keys that contain the search term
  const filtered =
    search && data && typeof data === 'object'
      ? Object.fromEntries(
          Object.entries(data).filter(
            ([k, v]) =>
              k.toLowerCase().includes(search.toLowerCase()) ||
              JSON.stringify(v).toLowerCase().includes(search.toLowerCase())
          )
        )
      : data

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700">
        <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {showSearch && (
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter keys..."
              className="bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded border border-slate-600 outline-none focus:border-blue-400 w-36"
            />
          )}
          <button
            onClick={() => { setShowSearch((s) => !s); setSearch('') }}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
            title="Search"
          >
            🔍
          </button>
          <button
            onClick={handleCopy}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          >
            {copied ? '✅ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* JSON tree */}
      <div className="p-4 overflow-auto max-h-[600px] font-mono text-sm text-slate-200">
        {filtered ? (
          <JsonValue value={filtered} depth={0} />
        ) : (
          <span className="text-slate-500 italic">No data</span>
        )}
      </div>

      {/* Footer: byte count */}
      <div className="px-4 py-1.5 bg-slate-800 border-t border-slate-700 text-right">
        <span className="text-slate-500 text-xs">
          {new Blob([json]).size.toLocaleString()} bytes
        </span>
      </div>
    </div>
  )
}
