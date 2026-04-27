import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Reusable confirmation dialog that replaces window.confirm().
 *
 * Props:
 *   open        — boolean, controls visibility
 *   title       — heading text
 *   message     — body text (can include the candidate name etc.)
 *   confirmLabel — label for the destructive button (default "Delete")
 *   onConfirm   — called when user clicks the confirm button
 *   onCancel    — called when user clicks Cancel or backdrop
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* Panel — stop propagation so clicking inside doesn't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          animation: 'slideUp 0.18s ease',
        }}
      >
        {/* Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div style={{
            flexShrink: 0,
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(238,116,128,0.12)',
            border: '1px solid rgba(238,116,128,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={17} style={{ color: 'var(--error)' }} />
          </div>
          <div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17, fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0, lineHeight: 1.3,
            }}>
              {title}
            </p>
            {message && (
              <p style={{
                fontSize: 13, color: 'var(--text-secondary)',
                margin: '6px 0 0', lineHeight: 1.55,
              }}>
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '18px 0' }} />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13, fontWeight: 500,
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              background: 'rgba(238,116,128,0.15)',
              color: 'var(--error)',
              border: '1px solid rgba(238,116,128,0.28)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(238,116,128,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(238,116,128,0.15)'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}