# AI Calendar Agent

Trợ lý AI dành cho sinh viên: trò chuyện bằng ngôn ngữ tự nhiên để tìm giờ trống, tạo hoặc điều chỉnh lịch học, đồng thời quản lý lịch trực quan theo phong cách Google Calendar.

## Tài liệu đầy đủ / Full Documentation

Xem [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) để đọc tài liệu song ngữ từ tổng quan sản phẩm đến kiến trúc, database, API, AI tools, cài đặt, kiểm thử, bảo mật và roadmap.

See [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) for the complete bilingual guide covering product scope, architecture, database, APIs, AI tools, setup, testing, security, and roadmap.

## Tính năng hiện có

- Supabase Google OAuth và xác thực JWT ở FastAPI.
- Chat tối giản với Gemini streaming thật, dán/chọn tối đa 3 ảnh có preview, lịch sử đúng role, đổi tên/xóa hội thoại và tiêu đề do Gemini tạo.
- Gemini function calling cho đọc lịch, tạo một/nhiều sự kiện, dời, xóa, tìm giờ trống và tự động phân bổ buổi ôn tập.
- Calendar tháng/tuần/ngày/lịch biểu, mini-calendar, sự kiện cả ngày, recurrence ngày/tuần/tháng, kéo thả và resize.
- Lọc lịch theo môn học/danh mục và đồng bộ dữ liệu tức thời giữa Chat và Calendar.
- Kiểm tra xung đột thời gian ở cả REST API và công cụ AI.
- Tasks trong sidebar, Thùng rác khôi phục/xóa vĩnh viễn, trạng thái hoàn thành và badge sự kiện 24 giờ tới.
- Settings hồ sơ, lịch AI tôn trọng giờ học, URL `/chat`/`/calendar`, giao diện Sáng/Tối được lưu.
- Rate limit dùng chung qua PostgreSQL, 10 yêu cầu AI/phút/người dùng, và toast lỗi thân thiện.
- Lưu hội thoại nguyên tử bằng database RPC, giới hạn recurrence/tool input và báo rõ kế hoạch học còn thiếu.

## Cấu trúc

```text
Calendar_Agent/
├── backend/                  # FastAPI, Supabase, Gemini agent, scheduler
│   ├── agent/
│   ├── db/
│   ├── models/
│   ├── routes/
│   └── tests/
├── frontend/                 # React, Vite, Tailwind CSS, FullCalendar
│   └── src/
│       ├── api/
│       ├── components/
│       ├── context/
│       ├── lib/
│       └── types/
└── README.md
```

Database schema, indexes, triggers và RLS nằm trong `supabase/schema.sql`. Migration tương ứng nằm trong `supabase/migrations` và được quản lý bằng Supabase CLI.

## Chạy local

### Chạy frontend và backend cùng lúc

Từ thư mục gốc của dự án:

```powershell
cd D:\Calendar_Agent
npm install
npm run dev
```

Lệnh này mở đồng thời API tại `http://localhost:8000` và giao diện tại `http://localhost:5173`. Nhấn `Ctrl+C` để dừng cả hai.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
```

Điền vào `backend/.env`:

```dotenv
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-3.6-flash
DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY` hoặc `GEMINI_API_KEY` vào frontend hay commit lên Git.

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Điền vào `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:8000/api
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Mở `http://localhost:5173`.

## Thiết lập Google OAuth trong Supabase

1. Tạo OAuth Client loại **Web application** trong Google Auth Platform.
2. Thêm `http://localhost:5173` vào Authorized JavaScript origins.
3. Thêm callback URL do trang Google provider của Supabase cung cấp vào Authorized redirect URIs.
4. Bật Google provider trong Supabase Authentication và điền Client ID/Client Secret.
5. Trong Supabase URL Configuration, đặt Site URL là `http://localhost:5173` và thêm cùng URL vào Redirect URLs.

## Kiểm thử

```powershell
npm test
npm run build
```

Tình trạng kiểm thử hiện tại:

- Backend: unit, API, schema-contract và concurrency regression tests.
- Frontend: Vitest cho timezone/DST/theme, TypeScript check và production build.
- GitHub Actions tự chạy hai suite, production build và bundle budget trên mọi push/PR.

## Triển khai database

Tạo `supabase/.env` từ `supabase/.env.example`, sau đó:

```powershell
$values = Get-Content supabase/.env | ConvertFrom-StringData
$env:SUPABASE_ACCESS_TOKEN = $values.SUPABASE_ACCESS_TOKEN
$env:SUPABASE_DB_PASSWORD = $values.SUPABASE_DB_PASSWORD
npx --yes supabase@latest link --project-ref <project-ref>
npx --yes supabase@latest db push --dry-run
npx --yes supabase@latest db push
```

Không commit `supabase/.env`; file này chứa quyền quản trị project và mật khẩu database.

## API chính

- `GET /health`
- `GET /ready`
- `GET|POST /api/events`
- `PATCH|DELETE /api/events/{id}`
- `GET /api/events/trash`
- `POST /api/events/{id}/restore`
- `DELETE /api/events/{id}/permanent`
- `GET|POST /api/tasks`
- `PATCH|DELETE /api/tasks/{id}`
- `GET|PATCH /api/profile`
- `POST /api/chat`
- `POST /api/chat/stream`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/{id}`
- `PATCH|DELETE /api/chat/conversations/{id}`
