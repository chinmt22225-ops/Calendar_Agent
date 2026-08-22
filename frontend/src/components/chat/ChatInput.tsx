import { ArrowUp, ImagePlus, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import type { ChatImageAttachment } from '../../types/chat'
import { ModelSelector } from './ModelSelector'

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const maxImages = 3
const maxImageBytes = 4 * 1024 * 1024

function readImage(file: File): Promise<ChatImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Không thể đọc ảnh ${file.name}.`))
    reader.onload = () => {
      const source = String(reader.result || '')
      const data = source.split(',', 2)[1]
      if (!data) { reject(new Error(`Dữ liệu ảnh ${file.name} không hợp lệ.`)); return }
      resolve({ id: crypto.randomUUID(), name: file.name || 'Ảnh từ clipboard', mime_type: file.type as ChatImageAttachment['mime_type'], data, preview: URL.createObjectURL(file) })
    }
    reader.readAsDataURL(file)
  })
}

export function ChatInput({ initialValue = '', disabled, streaming, selectedModel = 'auto', onSelectModel, onSend, onStop }: {
  initialValue?: string
  disabled: boolean
  streaming: boolean
  selectedModel?: string
  onSelectModel?: (modelId: string) => void
  onSend: (value: string, images: ChatImageAttachment[]) => void
  onStop: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [images, setImages] = useState<ChatImageAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<ChatImageAttachment[]>([])

  useEffect(() => { setValue(initialValue); textarea.current?.focus() }, [initialValue])
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)), [])
  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 160)}px`
  }, [value])

  const addFiles = async (files: File[]) => {
    if (disabled || files.length === 0) return
    setAttachmentError('')
    const remaining = maxImages - images.length
    if (remaining <= 0) { setAttachmentError(`Mỗi tin nhắn chỉ được gửi tối đa ${maxImages} ảnh.`); return }
    const accepted: File[] = []
    for (const file of files.slice(0, remaining)) {
      if (!allowedTypes.has(file.type)) { setAttachmentError('Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF.'); continue }
      if (file.size > maxImageBytes) { setAttachmentError(`Ảnh ${file.name} vượt quá 4 MB.`); continue }
      accepted.push(file)
    }
    if (files.length > remaining) setAttachmentError(`Mỗi tin nhắn chỉ được gửi tối đa ${maxImages} ảnh.`)
    setProcessing(true)
    try {
      const loaded = await Promise.all(accepted.map(readImage))
      setImages((current) => [...current, ...loaded].slice(0, maxImages))
    }
    catch (error) { setAttachmentError(error instanceof Error ? error.message : 'Không thể đọc ảnh.') }
    finally { setProcessing(false) }
  }
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (pastedImages.length) { event.preventDefault(); void addFiles(pastedImages) }
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files || []))
  }
  const submit = () => {
    const clean = value.trim()
    if ((!clean && images.length === 0) || disabled || processing) return
    onSend(clean, images)
    setValue(''); setImages([]); setAttachmentError('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  return (
    <div className="input-wrap">
      <div className={`chat-input-block ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={onDrop} aria-busy={processing}>
        {dragging && <div className="chat-dropzone"><ImagePlus size={22} /><strong>Thả ảnh vào đây</strong></div>}
        {images.length > 0 && (
          <div className="image-preview-header">
            <span className="image-count">{images.length}/3 ảnh</span>
            {images.length >= 2 && (
              <button
                type="button"
                className="clear-all-images-btn"
                onClick={() => {
                  images.forEach((img) => URL.revokeObjectURL(img.preview))
                  setImages([])
                }}
              >
                <X size={11} /> Xóa tất cả ảnh
              </button>
            )}
          </div>
        )}
        {images.length > 0 && <div className="image-preview-list">{images.map((image) => <figure key={image.id}><img src={image.preview} alt={image.name} /><button onClick={() => { URL.revokeObjectURL(image.preview); setImages((items) => items.filter((item) => item.id !== image.id)) }} title="Bỏ ảnh"><X size={13} /></button></figure>)}</div>}
        <div className="chat-input">
          <input ref={fileInput} className="file-input-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onFileChange} disabled={disabled} aria-hidden="true" tabIndex={-1} />
          <button className="attach-button" onClick={() => fileInput.current?.click()} title="Chọn ảnh từ máy" aria-label="Chọn ảnh từ máy" disabled={disabled}><ImagePlus size={19} /></button>
          <textarea ref={textarea} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
            placeholder="Nhắn hoặc dán ảnh cho trợ lý..." rows={1} disabled={disabled} />
          {streaming ? <button className="send-button stop" onClick={onStop} title="Dừng phản hồi" aria-label="Dừng phản hồi"><Square size={15} fill="currentColor" /></button> : <button className="send-button" onClick={submit} disabled={(!value.trim() && images.length === 0) || disabled || processing} title="Gửi" aria-label="Gửi tin nhắn"><ArrowUp size={19} /></button>}
        </div>
        {processing && <span className="image-processing">Đang xử lý ảnh…</span>}
      </div>
      {attachmentError && <span className="attachment-error">{attachmentError}</span>}
      <div className="flex items-center justify-between mt-1 px-0.5 text-xs text-slate-400 gap-2">
        <small className="text-slate-400 truncate">Dán ảnh bằng Ctrl+V hoặc chọn từ máy · tối đa 3 ảnh.</small>
        {onSelectModel && (
          <div className="shrink-0">
            <ModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />
          </div>
        )}
      </div>
    </div>
  )
}
