import { LoaderCircle, MessageSquareText, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Conversation } from '../../types/chat'

export function ChatSidebar({ open, conversations, activeId, loading, error, onToggle, onNew, onSelect, onRename, onDelete, onRetry }: {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  loading: boolean
  error: string
  onToggle: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (conversation: Conversation) => void
  onDelete: (conversation: Conversation) => void
  onRetry: () => void
}) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((item) => item.title.toLowerCase().includes(query))
  }, [conversations, search])

  return (
    <aside className={`chat-sidebar ${open ? 'open' : 'closed'}`}>
      <div className="sidebar-top">
        <button className="sidebar-toggle" onClick={onToggle} title={open ? 'Thu gọn' : 'Mở rộng'}>
          {open ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </button>
        {open && <span>Lịch sử</span>}
      </div>
      <button className="new-chat" onClick={onNew}><Plus size={17} />{open && <span>Đoạn chat mới</span>}</button>
      {open && (
        <div className="conversation-list">
          {conversations.length > 3 && (
            <div className="conversation-search">
              <Search size={13} />
              <input
                type="text"
                placeholder="Tìm đoạn chat..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <p>Gần đây</p>
          {loading && <span className="history-loading"><LoaderCircle className="spin" size={15} /> Đang tải lịch sử…</span>}
          {!loading && error && <span className="history-error">{error}<button onClick={onRetry}><RotateCcw size={12} /> Thử lại</button></span>}
          {!loading && !error && conversations.length === 0 && <span className="empty-history">Chưa có cuộc trò chuyện</span>}
          {!loading && !error && conversations.length > 0 && filtered.length === 0 && <span className="empty-history">Không tìm thấy</span>}
          {filtered.map((conversation) => (
            <div key={conversation.id} className={`conversation-item ${activeId === conversation.id ? 'active' : ''}`}>
              <button className="conversation-open" onClick={() => onSelect(conversation.id)}><MessageSquareText size={15} /><span>{conversation.title}</span></button>
              <span className="conversation-actions"><button aria-label={`Mở menu ${conversation.title}`} aria-expanded={menuId === conversation.id} title="Tùy chọn" onClick={() => setMenuId((current) => current === conversation.id ? null : conversation.id)}><MoreHorizontal size={14} /></button>{menuId === conversation.id && <span className="conversation-menu"><button onClick={() => { setMenuId(null); onRename(conversation) }}><Pencil size={13} /> Đổi tên</button><button className="danger" onClick={() => { setMenuId(null); onDelete(conversation) }}><Trash2 size={13} /> Xóa</button></span>}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
