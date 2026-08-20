# AI Calendar Agent

Trợ lý AI dành cho sinh viên: trò chuyện bằng ngôn ngữ tự nhiên để tìm giờ trống, tạo hoặc điều chỉnh lịch học, đồng thời quản lý lịch trực quan theo phong cách Google Calendar.

## Tính năng hiện có

- Supabase Google OAuth và xác thực JWT ở FastAPI.
- Chat tối giản với lịch sử hội thoại, phản hồi streaming và thông báo hành động lịch ngay trong câu trả lời.
- Gemini function calling cho đọc lịch, tạo một/nhiều sự kiện, dời, xóa, tìm giờ trống và tự động phân bổ buổi ôn tập.
- Calendar tháng/tuần/ngày/lịch biểu, vạch giờ hiện tại, tạo nhanh, kéo thả và resize sự kiện.
- Lọc lịch theo môn học/danh mục và đồng bộ dữ liệu tức thời giữa Chat và Calendar.
- Kiểm tra xung đột thời gian ở cả REST API và công cụ AI.

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

> `supabase/schema.sql` sẽ được viết và triển khai sau khi Supabase project mới được cung cấp, theo quyết định của chủ dự án.

## Chạy local

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
DEFAULT_TIMEZONE=Asia/Bangkok
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
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

Tình trạng kiểm thử hiện tại:

- Backend: `3 passed`.
- Frontend: TypeScript check và production build thành công.

## API chính

- `GET /health`
- `GET|POST /api/events`
- `PATCH|DELETE /api/events/{id}`
- `GET|POST /api/tasks`
- `PATCH|DELETE /api/tasks/{id}`
- `GET|PATCH /api/profile`
- `POST /api/chat`
- `POST /api/chat/stream`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/{id}`

