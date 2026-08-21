import { Clock3, LogOut, Monitor, Moon, Settings, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import type { ProfileUpdate } from '../types/profile'

const timezones = [
  ['Asia/Ho_Chi_Minh', 'Việt Nam (GMT+7)'],
  ['Asia/Bangkok', 'Bangkok (GMT+7)'],
  ['Asia/Singapore', 'Singapore (GMT+8)'],
  ['Asia/Tokyo', 'Tokyo (GMT+9)'],
  ['Europe/London', 'London'],
  ['America/New_York', 'New York'],
]

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, saveProfile } = useProfile()
  const { signOut } = useAuth()
  const { preference, setPreference } = useTheme()
  const notify = useToast()
  const [draft, setDraft] = useState<ProfileUpdate>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (profile) setDraft({
      display_name: profile.display_name || '', timezone: profile.timezone,
      day_start: profile.day_start.slice(0, 5), day_end: profile.day_end.slice(0, 5),
      pomodoro_minutes: profile.pomodoro_minutes,
    })
  }, [profile])

  const save = async () => {
    setError('')
    if ((draft.display_name?.trim().length || 0) > 100) {
      setError('Tên hiển thị không được vượt quá 100 ký tự.')
      return
    }
    if (draft.day_start && draft.day_end && draft.day_end <= draft.day_start) {
      setError('Giờ kết thúc ngày học phải sau giờ bắt đầu.')
      return
    }
    if (draft.pomodoro_minutes && (draft.pomodoro_minutes < 15 || draft.pomodoro_minutes > 120)) {
      setError('Thời lượng Pomodoro phải từ 15 đến 120 phút.')
      return
    }
    setSaving(true)
    try { await saveProfile({ ...draft, display_name: draft.display_name?.trim() || null }); notify('Đã lưu cài đặt.', 'success') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu cài đặt.') }
    finally { setSaving(false) }
  }

  const themes: { value: ThemePreference; label: string; description: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'Theo hệ thống', description: 'Tự đổi theo thiết bị', icon: Monitor },
    { value: 'light', label: 'Sáng', description: 'Nền sáng dịu mắt', icon: Sun },
    { value: 'dark', label: 'Tối', description: 'Giảm chói ban đêm', icon: Moon },
  ]

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal">
        <header><div><span className="modal-icon"><Settings size={20} /></span><div><h2>Cài đặt</h2><p>Cá nhân hóa Planora theo nhịp học của bạn</p></div></div><button aria-label="Đóng cài đặt" title="Đóng" onClick={onClose}><X size={19} /></button></header>
        <div className="modal-body">
          <section className="settings-section">
            <div className="settings-section-heading"><h3>Giao diện</h3><p>Lựa chọn được lưu trên thiết bị này.</p></div>
            <div className="theme-options" role="radiogroup" aria-label="Chọn giao diện">
              {themes.map(({ value, label, description, icon: Icon }) => <button key={value} role="radio" aria-checked={preference === value} className={preference === value ? 'active' : ''} onClick={() => setPreference(value)}><Icon size={18} /><span><strong>{label}</strong><small>{description}</small></span></button>)}
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-heading"><h3>Hồ sơ học tập</h3><p>Planora dùng thông tin này khi tìm giờ trống và lập kế hoạch.</p></div>
          <label className="field"><span>Tên hiển thị</span><input maxLength={100} value={draft.display_name || ''} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="Tên của bạn" /></label>
          <label className="field"><span>Múi giờ</span><select value={draft.timezone || 'Asia/Ho_Chi_Minh'} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>{timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="field-row">
            <label className="field"><span><Clock3 size={14} /> Bắt đầu ngày học</span><input type="time" value={draft.day_start || ''} onChange={(e) => setDraft({ ...draft, day_start: e.target.value })} /></label>
            <label className="field"><span><Clock3 size={14} /> Kết thúc ngày học</span><input type="time" value={draft.day_end || ''} onChange={(e) => setDraft({ ...draft, day_end: e.target.value })} /></label>
          </div>
          <label className="field"><span>Thời lượng Pomodoro: {draft.pomodoro_minutes || 50} phút</span><input type="range" min="15" max="120" step="5" value={draft.pomodoro_minutes || 50} onChange={(e) => setDraft({ ...draft, pomodoro_minutes: Number(e.target.value) })} /></label>
          </section>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="settings-logout" onClick={() => void signOut()}><LogOut size={16} /> Đăng xuất khỏi tài khoản</button>
        </div>
        <footer><span /><div><button className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu cài đặt'}</button></div></footer>
      </section>
    </div>
  )
}
