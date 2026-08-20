import { CalendarDays, Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export function LoginView() {
  const { configured, signInWithGoogle } = useAuth()
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setError('')
    try { await signInWithGoogle() } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.')
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark large"><CalendarDays size={27} /></div>
        <p className="eyebrow"><Sparkles size={14} /> LỊCH HỌC THÔNG MINH</p>
        <h1>Lên kế hoạch nhẹ nhàng.<br />Học tập có chủ đích.</h1>
        <p className="login-copy">Một trợ lý AI hiểu lịch của bạn, tìm khoảng trống và biến mục tiêu thành những buổi học thực tế.</p>
        <div className="login-benefits">
          <span><Check size={15} /> Tự động tránh trùng lịch</span>
          <span><Check size={15} /> Kế hoạch linh hoạt theo thời gian rảnh</span>
        </div>
        {configured ? (
          <button className="google-button" onClick={handleLogin}>
            <span className="google-g">G</span> Tiếp tục với Google
          </button>
        ) : (
          <div className="config-notice">
            <strong>Đang chờ cấu hình Supabase</strong>
            <span>Thêm URL và Publishable Key vào <code>frontend/.env</code> để bật đăng nhập Google.</span>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <small>Khi tiếp tục, bạn đồng ý cho ứng dụng quản lý dữ liệu lịch học trong tài khoản của bạn.</small>
      </section>
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
    </main>
  )
}

