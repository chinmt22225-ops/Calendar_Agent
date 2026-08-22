# 🌐 Hướng dẫn Triển khai Planora lên Google Cloud Platform (GCP)

Tài liệu này hướng dẫn bạn từng bước đưa dự án **Planora AI Calendar** lên Google Cloud Platform (GCP) hoàn chỉnh, có chứng chỉ SSL/HTTPS miễn phí và tên miền chính thức.

---

## 🏗️ Kiến trúc Hệ thống trên Google Cloud

| Thành phần | Dịch vụ Google Cloud | Vai trò |
|---|---|---|
| **Backend API** | **Google Cloud Run** | Chạy FastAPI (Python 3.11) containerized, tự động scale to zero tiết kiệm chi phí |
| **Frontend Web** | **Firebase Hosting** / **Cloud Run** | Phục vụ React SPA (Vite) qua mạng lưới CDN tốc độ cao |
| **Database & Auth** | **Supabase Cloud** | Lưu trữ dữ liệu PostgreSQL và quản lý đăng nhập người dùng |
| **AI Engine** | **Google Gemini API** | Phân tích ngôn ngữ tự nhiên và tự động lập lịch |

---

## 📋 Bước 1: Chuẩn bị Môi trường Google Cloud

1. Đăng ký tài khoản tại [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một Google Cloud Project mới (ví dụ: `planora-ai-calendar`).
3. Cài đặt **Google Cloud SDK (gcloud CLI)** trên máy tính:
   - Tải bộ cài tại: [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
4. Mở PowerShell / Terminal và đăng nhập:
   ```powershell
   gcloud auth login
   gcloud config set project [PROJECT_ID_CUA_BAN]
   ```
5. Bật các dịch vụ cần thiết trên Google Cloud:
   ```powershell
   gcloud services enable run.googleapis.com containerregistry.googleapis.com cloudbuild.googleapis.com
   ```

---

## 🚀 Bước 2: Triển khai Backend lên Google Cloud Run

1. Mở terminal tại thư mục `backend`:
   ```powershell
   cd backend
   ```
2. Chạy lệnh Deploy trực tiếp lên Cloud Run:
   ```powershell
   gcloud run deploy planora-backend `
     --source . `
     --region asia-southeast1 `
     --platform managed `
     --allow-unauthenticated `
     --set-env-vars "APP_ENV=production,GEMINI_API_KEY=YOUR_GEMINI_KEY,SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY,FRONTEND_URL=https://your-frontend-domain.web.app"
   ```
3. Sau khi chạy xong, terminal sẽ in ra đường dẫn URL của Backend (VD: `https://planora-backend-xxxxxx-as.a.run.app`).

---

## 🌐 Bước 3: Triển khai Frontend (Cách 1: Firebase Hosting - Khuyên Dùng)

Firebase Hosting thuộc hạ tầng Google Cloud, cực kỳ nhanh, miễn phí và hỗ trợ custom domain rất dễ dàng.

1. Cài đặt Firebase CLI:
   ```powershell
   npm install -g firebase-tools
   ```
2. Đăng nhập Firebase:
   ```powershell
   firebase login
   ```
3. Tạo file `frontend/.env.production`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_API_URL=https://planora-backend-xxxxxx-as.a.run.app/api
   ```
4. Build phiên bản production của Frontend:
   ```powershell
   cd frontend
   npm run build
   cd ..
   ```
5. Khởi tạo và Deploy lên Firebase:
   ```powershell
   firebase init hosting
   # Chọn dự án Google Cloud của bạn
   # Thư mục public: frontend/dist
   # Configure as a single-page app: Yes
   # Overwrite index.html: No
   
   firebase deploy --only hosting
   ```
6. Bạn sẽ nhận được URL chính thức: `https://[project-id].web.app` hoặc `https://[project-id].firebaseapp.com`.

---

## 🐳 Triển khai Frontend (Cách 2: Google Cloud Run Container)

Nếu muốn chạy toàn bộ trên Cloud Run bằng Docker Container:

1. Tạo file `frontend/.env.production` trỏ về backend URL.
2. Build và deploy frontend container:
   ```powershell
   cd frontend
   gcloud run deploy planora-frontend `
     --source . `
     --region asia-southeast1 `
     --platform managed `
     --allow-unauthenticated
   ```

---

## ⚙️ Bước 4: Cập nhật Cấu hình OAuth & Supabase

1. **Trên Supabase Dashboard** ([supabase.com](https://supabase.com)):
   - Vào **Authentication** ➔ **URL Configuration**.
   - Mục **Site URL**: Điền URL frontend của bạn (VD: `https://planora-ai.web.app`).
   - Mục **Redirect URLs**: Thêm cả `https://planora-ai.web.app/**` và `http://localhost:5173/**` để kiểm thử cục bộ.
2. **Cập nhật CORS cho Backend Cloud Run**:
   - Nếu đổi tên miền frontend, cập nhật lại biến `FRONTEND_URL` trên Cloud Run để backend cho phép gọi API.

---

## 💡 Gắn Tên Miền Riêng (Custom Domain)

* Trong **Firebase Hosting Dashboard** ➔ Nhấn **Add Custom Domain** (ví dụ: `planora.edu.vn` hoặc `mycalendar.com`).
* Trỏ các bản ghi DNS `A` / `TXT` theo hướng dẫn của Google.
* Google sẽ tự động cấp phát chứng chỉ SSL/HTTPS trong vòng 15-30 phút.
