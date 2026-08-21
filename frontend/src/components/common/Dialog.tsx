import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

type DialogProps = {
  open: boolean
  title: string
  description?: string
  destructive?: boolean
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  children?: ReactNode
  onConfirm?: () => void | Promise<void>
  onClose: () => void
}

export function Dialog({
  open,
  title,
  description,
  destructive = false,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  busy = false,
  children,
  onConfirm,
  onClose,
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, open])

  if (!open) return null
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header>
          <span className={destructive ? 'dialog-icon destructive' : 'dialog-icon'}><AlertTriangle size={20} /></span>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="dialog-close" aria-label="Đóng" title="Đóng" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        {children && <div className="dialog-content">{children}</div>}
        <footer>
          <button ref={cancelRef} className="secondary-button" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          {onConfirm && <button className={destructive ? 'danger-button' : 'primary-button'} disabled={busy} onClick={() => void onConfirm()}>{busy ? 'Đang xử lý…' : confirmLabel}</button>}
        </footer>
      </section>
    </div>
  )
}
