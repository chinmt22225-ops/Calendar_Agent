import { MessageSquareText, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Conversation } from '../../types/chat'

export function ChatSidebar({ open, conversations, activeId, onToggle, onNew, onSelect, onRename, onDelete }: {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  onToggle: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (conversation: Conversation) => void
  onDelete: (conversation: Conversation) => void
}) {
  return (
    <aside className={`chat-sidebar ${open ? 'open' : 'closed'}`}>
      <div className="sidebar-top">
        <button className="sidebar-toggle" onClick={onToggle} title={open ? 'Thu gọn' : 'Mở rộng'}>
          {open ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </button>
        {open && <span>Lịch sử</span>}
      </div>
      <button className="new-chat" onClick={onNew}><Plus size={17} />{open && <span>Đoạn chat mới</span>}</button>
      {open && <div className="conversation-list">
        <p>Gần đây</p>
        {conversations.length === 0 && <span className="empty-history">Chưa có đoạn chat nào</span>}
        {conversations.map((conversation) => (
          <div key={conversation.id} className={`conversation-item ${activeId === conversation.id ? 'active' : ''}`}>
            <button className="conversation-open" onClick={() => onSelect(conversation.id)}><MessageSquareText size={15} /><span>{conversation.title}</span></button>
            <span className="conversation-actions"><button title="Đổi tên" onClick={() => onRename(conversation)}><Pencil size={13} /></button><button title="Xóa" onClick={() => onDelete(conversation)}><Trash2 size={13} /></button></span>
          </div>
        ))}
      </div>}
    </aside>
  )
}
