import { CalendarDays, Check, Clock3, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export function LoginView() {
  const { configured, signInWithGoogle } = useAuth()
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  const handleLogin = async () => {
    setError('')
    setSigningIn(true)
    try { await signInWithGoogle() } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.')
      setSigningIn(false)
    }
  }

  return (
    <main className="login-page planora-login">
      <div className="login-shell-card">
      <section className="login-card">
        <button className="login-brand" type="button" aria-label="Planora"><span className="brand-mark"><CalendarDays size={20} /></span><strong>Planora</strong></button>
        <p className="eyebrow"><Sparkles size={14} /> AI CALENDAR CHO SINH VIÊN</p>
        <h1>Lịch học thông minh,<br /><em>nhẹ đầu hơn mỗi ngày.</em></h1>
        <p className="login-copy">Planora hiểu thời khóa biểu, deadline và thời gian rảnh để biến mục tiêu học tập thành một kế hoạch thực tế.</p>
        <div className="login-benefits">
          <span><Check size={15} /> Đọc thời khóa biểu trực tiếp từ ảnh</span>
          <span><Check size={15} /> Tự động tránh trùng lịch và deadline</span>
          <span><Check size={15} /> Điều chỉnh kế hoạch bằng một câu chat</span>
        </div>
        {configured ? (
          <button className="google-button" disabled={signingIn} onClick={handleLogin}>
            <span className="google-g">G</span> {signingIn ? 'Đang chuyển đến Google…' : 'Tiếp tục với Google'}
          </button>
        ) : (
          <div className="config-notice">
            <strong>Đang chờ cấu hình Supabase</strong>
            <span>Thêm URL và Publishable Key vào <code>frontend/.env</code> để bật đăng nhập Google.</span>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <small>Khi tiếp tục, bạn đồng ý cho ứng dụng quản lý dữ liệu lịch học trong tài khoản của bạn.</small>
      </section>
      <section className="login-visual" aria-label="Minh họa lịch học Planora">
        <span className="login-glow glow-one" /><span className="login-glow glow-two" />
        <article className="login-week-card">
          <header><span><strong>Tuần của bạn</strong><small>18 – 24 tháng 8</small></span><em>76% đã lên kế hoạch</em></header>
          <div className="login-week-head"><span>THỨ 2</span><span>THỨ 3</span><span>THỨ 4</span><span>THỨ 5</span><span>THỨ 6</span></div>
          <div className="login-week-grid">
            <i /><i /><i /><i /><i />
            <button className="login-demo-event event-one"><small>08:00</small><strong>Triết học</strong></button>
            <button className="login-demo-event event-two"><small>09:30</small><strong>Thực hành AI</strong></button>
            <button className="login-demo-event event-three"><small>13:00</small><strong><Sparkles size={11} /> Ôn Tâm lý</strong></button>
            <button className="login-demo-event event-four"><small>17:00</small><strong>CLB sinh viên</strong></button>
          </div>
        </article>
        <article className="login-ai-card"><span><Sparkles size={18} /></span><div><strong>Mình tìm thấy 2 giờ trống</strong><small><Clock3 size={12} /> 14:00 – 16:00 chiều thứ Năm</small></div><button>Thêm vào lịch</button></article>
        <article className="login-focus-card"><strong>12</strong><span>giờ tập trung<br />tuần này</span></article>
      </section>
      </div>
    </main>
  )
}
