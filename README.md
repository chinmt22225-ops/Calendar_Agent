# AI Calendar Agent

Trợ lý AI dành cho sinh viên: trò chuyện bằng ngôn ngữ tự nhiên để tìm giờ trống, tạo hoặc điều chỉnh lịch học, đồng thời quản lý lịch trực quan theo phong cách Google Calendar.

## Tài liệu đầy đủ / Full Documentation

Xem [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) để đọc tài liệu song ngữ từ tổng quan sản phẩm đến kiến trúc, database, API, AI tools, cài đặt, kiểm thử, bảo mật và roadmap.

See [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) for the complete bilingual guide covering product scope, architecture, database, APIs, AI tools, setup, testing, security, and roadmap.

## Tính năng hiện có

- Supabase Google OAuth và xác thực JWT ở FastAPI.
- Chat tối giản với Gemini, dán/chọn tối đa 3 ảnh có preview, lịch sử đúng role, đổi tên/xóa hội thoại và tiêu đề cục bộ không tốn thêm quota AI.
- Vòng function calling nhiều bước do backend kiểm soát cho Calendar và Tasks/deadline: đọc dữ liệu thật, tạo một/nhiều sự kiện hoặc task, dời, cập nhật, xóa, tìm giờ trống và tự động phân bổ buổi ôn tập.
- Ảnh thời khóa biểu được gửi cùng text tới Gemini; nếu yêu cầu “tạo lại” chưa rõ gộp hay thay thế, thời gian áp dụng hoặc recurrence, trợ lý sẽ hỏi lại thay vì tự đoán/xóa lịch.
- Phản hồi rỗng, tool lỗi hoặc stream thiếu sự kiện hoàn tất được báo lỗi rõ ràng; ứng dụng không còn dùng câu trả lời thành công giả.
- Calendar Schedule-X tháng/tuần/ngày/lịch biểu, mini-calendar, sự kiện cả ngày, recurrence ngày/tuần/tháng.
- Trục thời gian 24 giờ hoàn chỉnh (00:00 - 24:00) với chiều cao lưới thoáng đãng (1680px) và cuộn thông minh đến giờ làm việc ban ngày.
- Vạch theo dõi thời gian thực (Real-time Current Time Indicator) với chấm tròn phát sáng đa tầng chuẩn Google Calendar, tự động cập nhật từng phút theo múi giờ.
- Kéo thả mượt mà xuyên suốt các ngày trong tuần (15-min snap, ghost card đối chiếu) và tay nắm thay đổi thời lượng (resize handle) tiện lợi.
- Hệ thống thông báo đẩy màn hình hệ điều hành (Desktop Notifications qua Service Worker `sw.js` ngầm), hoạt động cả khi đang mở tab khác hoặc thu nhỏ trình duyệt, kèm âm thanh chuông báo tinh tế và điều hướng 1-click chuyển đến sự kiện trên lịch.
- Tính năng Bật/Tắt thông báo tức thì ngay trên menu Chuông (Navbar) và bảng Cài đặt chi tiết (Bật/tắt thông báo, Bật/tắt âm thanh chuông, Tùy chỉnh thời gian nhắc trước 5/10/15/30 phút).
- Hiệu ứng Spotlight phát sáng đa tầng trực tiếp tại DOM (Zero Re-render) trỏ vào sự kiện khi chuyển từ thông báo.
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
├── frontend/                 # React, Vite, Tailwind CSS, Schedule-X
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
GEMINI_MODEL=gemini-3.5-flash-lite
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

- Backend: `45 passed`, gồm unit, API, schema-contract, concurrency, validation, tool-loop, ảnh, quota và Tasks/deadline regression tests.
- Frontend: `29 passed`, gồm recurrence Schedule-X, chuyển ngày từ mini-calendar, kéo-thả chuỗi lặp, timezone/DST/theme, modal UX, retry/auth refresh và SSE chat; TypeScript check và production build thành công.
- GitHub Actions tự chạy hai suite, production build và bundle budget trên mọi push/PR.

Nếu Gemini trả HTTP `429`, API key/model đang hết hạn mức hoặc bị giới hạn tạm thời. Hãy chờ quota phục hồi hoặc kiểm tra quota của project Gemini; backend sẽ giữ nguyên dữ liệu và không tuyên bố thao tác đã hoàn tất.

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
