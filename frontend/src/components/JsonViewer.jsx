import { useState } from 'react'

function JsonValue({ value, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 2)

  if (value === null) return (
    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>
  )
  if (typeof value === 'boolean') return (
    <span style={{ color: 'var(--warning)' }}>{String(value)}</span>
  )
  if (typeof value === 'number') return (
    <span style={{ color: 'var(--sky)' }}>{value}</span>
  )
  if (typeof value === 'string') return (
    <span style={{ color: 'var(--teal)' }}>"{value}"</span>
  )

  if (Array.isArray(value)) {
    if (value.length === 0) return (
      <span style={{ color: 'var(--text-muted)' }}>[]</span>
    )
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} style={{
          color: 'var(--text-muted)', background: 'none', border: 'none',
          fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', marginRight: 4,
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>[{value.length}]</span>
        {!collapsed && (
          <div style={{
            marginLeft: 16,
            borderLeft: '1px solid var(--border-subtle)',
            paddingLeft: 12,
            marginTop: 2,
          }}>
            {value.map((item, i) => (
              <div key={i} style={{ lineHeight: '1.7' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em', marginRight: 6 }}>{i}:</span>
                <JsonValue value={item} depth={depth + 1} />
                {i < value.length - 1 && (
                  <span style={{ color: 'var(--border-strong)' }}>,</span>
                )}
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return (
      <span style={{ color: 'var(--text-muted)' }}>{'{}'}</span>
    )
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} style={{
          color: 'var(--text-muted)', background: 'none', border: 'none',
          fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', marginRight: 4,
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          {collapsed ? '▶' : '▼'}
        </button>
        {collapsed ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
            {`{ ${keys.length} keys }`}
          </span>
        ) : (
          <div style={{
            marginLeft: 16,
            borderLeft: '1px solid var(--border-subtle)',
            paddingLeft: 12,
            marginTop: 2,
          }}>
            {keys.map((k, i) => (
              <div key={k} style={{ lineHeight: '1.7' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{k}</span>
                <span style={{ color: 'var(--text-muted)' }}>: </span>
                <JsonValue value={value[k]} depth={depth + 1} />
                {i < keys.length - 1 && (
                  <span style={{ color: 'var(--border-strong)' }}>,</span>
                )}
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
  const [copied, setCopied]       = useState(false)
  const [search, setSearch]       = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const json = JSON.stringify(data, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const filtered =
    search && data && typeof data === 'object'
      ? Object.fromEntries(
          Object.entries(data).filter(([k, v]) =>
            k.toLowerCase().includes(search.toLowerCase()) ||
            JSON.stringify(v).toLowerCase().includes(search.toLowerCase())
          )
        )
      : data

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.14em', color: 'var(--text-muted)',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showSearch && (
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter keys..."
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 11,
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                outline: 'none',
                width: 140,
                fontFamily: 'var(--font-mono)',
              }}
            />
          )}
          <button
            onClick={() => { setShowSearch(s => !s); setSearch('') }}
            style={{
              fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '3px 7px', borderRadius: 5, transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            Search
          </button>
          <button
            onClick={handleCopy}
            style={{
              fontSize: 11, background: 'none', border: 'none', cursor: 'pointer',
              padding: '3px 7px', borderRadius: 5, transition: 'all 0.12s',
              color: copied ? 'var(--success)' : 'var(--text-muted)',
            }}
            onMouseEnter={e => { if (!copied) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={e => { if (!copied) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' } }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* JSON tree */}
      <div style={{
        padding: '16px', overflowY: 'auto', maxHeight: 560,
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--text-secondary)', lineHeight: 1.7,
        background: 'var(--bg-input)',
      }}>
        {filtered
          ? <JsonValue value={filtered} depth={0} />
          : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No data</span>
        }
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 16px', textAlign: 'right',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {new Blob([json]).size.toLocaleString()} bytes
        </span>
      </div>
    </div>
  )
}