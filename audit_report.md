# Backend & System Audit Report — Calendar Agent

> Cập nhật ngày: 2026-08-21
>
> Nền được audit: commit `1051f23`; trạng thái dưới đây phản ánh vòng hoàn thiện hiện tại.
>
> Phạm vi: Backend, database, frontend logic, AI Agent, hiệu năng, bảo mật, kiểm thử và triển khai.
> UI/UX được gọt giũa trong vòng triển khai tiếp theo, đồng thời giữ nguyên các phát hiện kỹ thuật lịch sử bên dưới để truy vết.

## 1. Kết quả kiểm tra hiện tại

- Backend unit/API/contract tests: `37 passed`.
- Frontend: `9 passed`, TypeScript check và production build thành công.
- Smoke test Supabase + Gemini thật đã qua:
  - tạo và đăng nhập tài khoản tạm;
  - đọc/cập nhật profile;
  - tạo event và chặn conflict;
  - recurrence, Trash, restore và permanent delete;
  - CRUD Tasks;
  - Gemini nhận ảnh và đọc Calendar thật; truy vấn Tasks/deadline dùng dữ liệu thật;
  - tạo, đổi tên, đọc và xóa conversation.
- Frontend dependency audit offline: không phát hiện vulnerability trong dữ liệu audit hiện có.
- Python `pip check`: không phát hiện dependency conflict.
- Main frontend bundle còn khoảng `310 KB`, gzip khoảng `103 KB`; Calendar, Supabase và Markdown được tách chunk.

Live verification đã bổ sung kiểm tra concurrent recurrence, shared rate limit và chuỗi API thật. Kiểm thử trình duyệt đăng nhập đầu-cuối vẫn phụ thuộc môi trường OAuth/hosting đích.

### Trạng thái triển khai backend ngày 2026-08-21

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| P0.1 Scheduler đủ thời lượng | Đã sửa | Lập nhiều buổi/ngày, session cuối linh hoạt, trả requested/planned/remaining/complete và có regression tests. |
| P0.2 Chat streaming race | Đã sửa | AbortController, generation/sequence guard, retry và thao tác dừng stream ngăn dữ liệu hội thoại cũ ghi vào hội thoại mới. |
| P0.3 Atomic chat persistence | Đã sửa và triển khai | Conversation + hai messages được lưu bằng RPC transaction; operation ID, replay idempotent và partial recovery đã hoạt động. |
| P0.4 Timezone/all-day | Đã sửa full-stack | Lịch, modal, kéo-thả, Tasks, badge và Trash dùng timezone hồ sơ; all-day giữ ngày độc lập UTC, có test DST. |
| P1.1 Recurrence exhaustion | Đã sửa | Giới hạn 5 năm/2.000 occurrence và so sánh bằng iterator thay vì materialize toàn bộ series. |
| P1.2 Atomic recurrence conflict | Đã sửa và triển khai | RPC recurrence-aware dùng advisory transaction lock; live concurrent test xác nhận một request thắng và một request nhận 409. |
| P1.3 Shared rate limit | Đã sửa và triển khai | Quota PostgreSQL RPC dùng chung giữa worker/instance; lỗi kiểu timestamp đã được sửa bằng migration kế tiếp. |
| P1.4 Pagination/range limits | Đã sửa backend | Events, Trash, Tasks, Conversations và Messages có maximum page size; frontend range loading sẽ làm sau. |
| P1.5 History budget | Sửa một phần | Đã giới hạn 48.000 ký tự và giữ messages mới nhất; chưa có token counter/summary lâu dài. |
| P1.6 Blocking I/O/tool orchestration | Đã sửa phần AI | Tắt SDK automatic function execution; backend điều phối tối đa 8 vòng, tool Supabase chạy trong threadpool và phản hồi rỗng trở thành lỗi. Load test production vẫn được khuyến nghị. |
| P1.7 Profile validation | Đã sửa | Timezone IANA, day range và empty PATCH được kiểm tra trước DB. |
| P1.8 Conversation ownership FK | Đã sửa và triển khai | Composite foreign key bảo vệ quan hệ owner đã có trên database từ xa. |
| P1.9 Tool input bounds | Đã sửa phần chính | Giới hạn planning horizon, total/session duration, query range, bulk events và description. |
| P1.10 Error mapping | Đã sửa | Có request ID và mapping PostgREST/upstream errors sang 4xx/503. |
| P2.1 SSE end-to-end | Đã sửa | Backend có heartbeat/disconnect; frontend bắt buộc `done`, hỗ trợ AbortSignal, malformed payload và thông báo stream gián đoạn. |
| P2.2/P2.3 Resource/render | Đã sửa | Preview dùng object URL có revoke; token được batch theo animation frame và auto-scroll tôn trọng vị trí đọc. |
| P2.4 Background title | Đã sửa | Stream kết thúc trước; title được tạo bằng background task và không ghi đè title đã đổi. |
| P2.5/P2.6 Tests/bundle | Đã cải thiện | Có backend, schema, frontend timezone/theme tests, CI và bundle budget 450 KB; main chunk dưới budget. |
| AI ảnh/text và Tasks | Đã sửa | 11 tool Calendar/Tasks trong allow-list; ảnh và text đi cùng một request; agent hỏi lại yêu cầu gộp/thay thế/recurrence mơ hồ; frontend tự tải lại Tasks sau action AI. |

Ba migration `202608210001`, `202608210002` và `202608210003` đã được áp dụng lên Supabase từ xa; live API verification sau migration đã thành công.

Vòng xác minh AI mới đã chạy thành công với ảnh + đọc Calendar và truy vấn Tasks/deadline trên Gemini/Supabase thật. Lượt kiểm tra ghi dữ liệu tiếp theo bị Gemini trả HTTP `429` do quota/rate limit bên ngoài; hệ thống hiển thị đúng lỗi, không trả câu thành công giả và không ảnh hưởng dữ liệu người dùng.

---

## 2. P0 — Lỗi nghiệp vụ và tính nhất quán nghiêm trọng

### P0.1. AI lập lịch không bảo đảm đủ thời lượng

**File liên quan**

- `backend/agent/scheduler_logic.py`
- `backend/agent/tools.py`

**Hiện trạng**

- `distribute_study_sessions()` chỉ tạo tối đa một buổi trong một ngày.
- Số session được tính bằng `round(total_hours * 60 / session_duration)`, có thể làm thiếu hoặc thừa thời lượng.
- Sau khi duyệt hết ngày, hàm không kiểm tra số phút còn thiếu.
- `auto_plan_study_sessions()` vẫn trả thành công với số session đã tạo được.
- Đã tái hiện: yêu cầu 5 giờ, còn 2 ngày trước kỳ thi, hệ thống chỉ tạo 2 giờ nhưng không báo kế hoạch thiếu.

**Yêu cầu sửa**

- Tính kế hoạch bằng tổng số phút thay vì làm tròn số session.
- Cho phép nhiều session trong cùng ngày nếu có đủ slot.
- Session cuối có thể ngắn hơn `session_duration` để đạt chính xác tổng thời lượng.
- Trả về `requested_minutes`, `planned_minutes`, `remaining_minutes` và `complete`.
- Nếu không đủ slot, AI phải thông báo rõ kế hoạch chỉ hoàn thành một phần.

**Acceptance criteria**

- Yêu cầu 5 giờ phải tạo đủ 300 phút hoặc trả `complete=false` và số phút còn thiếu.
- Không tạo session sau hoặc trong ngày thi.
- Không tạo session trùng event hiện có hay session vừa được lập.
- Có test cho nhiều session/ngày, thiếu slot và session cuối có thời lượng ngắn hơn.

### P0.2. Race condition trong chat streaming

**File liên quan**

- `frontend/src/components/chat/ChatView.tsx`
- `frontend/src/api/chat.ts`

**Hiện trạng**

- Người dùng có thể tạo chat mới hoặc chuyển conversation khi request cũ vẫn đang stream.
- Callback `onStart`, `onToken` và `onActions` của request cũ vẫn có thể cập nhật state hiện tại.
- Chuyển nhanh A → B có thể khiến response tải A ghi đè messages của B.
- Không có cơ chế hủy request khi component unmount hoặc context conversation thay đổi.

**Yêu cầu sửa**

- Mỗi request phải có request/generation ID.
- Chỉ callback thuộc request hiện tại mới được phép cập nhật state.
- Dùng `AbortController` để hủy stream khi tạo chat mới, chuyển conversation, component unmount hoặc người dùng chủ động dừng.
- Request tải conversation cũng cần sequence ID hoặc cancellation.

**Acceptance criteria**

- Chuyển A → B liên tục không bao giờ hiển thị message của A trong B.
- Tạo chat mới trong lúc stream không tự động quay lại chat cũ.
- Request bị hủy không được hiển thị như lỗi hệ thống.
- Có frontend test tái hiện và ngăn regression cho cả hai race condition.

### P0.3. AI tool có thể thay đổi calendar nhưng chat không được lưu

**File liên quan**

- `backend/routes/chat.py`
- `backend/agent/gemini_agent.py`
- `backend/agent/tools.py`

**Hiện trạng**

- Gemini automatic function calling có thể tạo, dời hoặc xóa event trước khi assistant message được persist.
- Nếu stream bị ngắt hoặc lưu message lỗi, calendar mutation vẫn có thể tồn tại mà không có lịch sử chat tương ứng.
- Tạo conversation và chèn user/assistant messages không nằm trong một transaction.
- Retry request có nguy cơ gọi lại tool và tạo dữ liệu lần hai.

**Yêu cầu sửa**

- Thêm operation ID/idempotency key cho mỗi chat request và tool mutation.
- Dùng transaction hoặc database RPC cho việc tạo conversation và lưu exchange.
- Ghi audit record cho calendar mutation do AI thực hiện.
- Nếu tool đã chạy nhưng stream bị ngắt, phải persist được trạng thái kết quả hoặc recovery record.
- Retry cùng operation ID không được thực hiện mutation lần hai.

**Acceptance criteria**

- Mỗi AI calendar mutation liên kết được với conversation/message hoặc operation record.
- Không tạo conversation rỗng khi insert messages thất bại.
- Retry cùng request không tạo event trùng.
- Có test disconnect trước và sau khi tool execution.

### P0.4. Xử lý timezone và all-day event không nhất quán

**File liên quan**

- `frontend/src/components/calendar/EventModal.tsx`
- `frontend/src/components/calendar/CalendarView.tsx`
- `frontend/src/components/calendar/TaskPanel.tsx`
- `backend/models/event.py`
- `backend/models/profile.py`
- `backend/agent/tools.py`
- `supabase/schema.sql`

**Hiện trạng**

- AI dùng timezone trong profile nhưng frontend chủ yếu dùng timezone của thiết bị.
- All-day event được chuyển thành UTC midnight, có thể lùi ngày tại timezone âm.
- Đã tái hiện: event lưu `2026-08-21T00:00:00Z` được mở lại thành ngày `2026-08-20` tại `America/New_York`.
- Một số ngày mặc định dùng `toISOString().slice(0, 10)`, có thể lùi ngày tại UTC+7 trước 07:00.
- Validation recurrence dùng `start_time.date()` hoặc `start_time::date`, không bảo đảm đó là ngày trong timezone của user.

**Yêu cầu sửa**

- Xác định một chiến lược timezone thống nhất cho backend, frontend và database.
- Timed events tiếp tục lưu bằng `timestamptz`.
- All-day events phải được biểu diễn bằng ngày độc lập hoặc serialize mà không chuyển qua UTC instant.
- Các khái niệm “hôm nay”, deadline, recurrence date và calendar range phải theo profile timezone.
- Frontend phải render theo profile timezone hoặc bỏ các timezone không được hỗ trợ đầy đủ.
- Có kế hoạch migration cho all-day events hiện có.

**Acceptance criteria**

- Tạo, mở lại và chỉnh sửa all-day event không đổi ngày tại Việt Nam, New York, London và Tokyo.
- Có test tại nửa đêm, UTC+7, timezone âm và DST.
- Recurrence validation dùng ngày địa phương đúng của user.

---

## 3. P1 — Backend, database và khả năng chịu tải

### P1.1. Recurrence có thể gây CPU và memory exhaustion

**File liên quan**

- `backend/agent/recurrence.py`
- `backend/models/event.py`
- `backend/routes/events.py`

**Hiện trạng**

- Candidate occurrences được materialize thành list.
- Conflict check dùng vòng lặp occurrences lồng nhau cho từng event.
- `recurrence_end` không có horizon hợp lý.
- Chuỗi recurrence kéo dài rất xa có thể khóa worker hoặc dùng quá nhiều bộ nhớ.

**Yêu cầu sửa**

- Giới hạn recurrence theo số occurrence hoặc horizon, ví dụ tối đa 2–5 năm.
- Không materialize toàn bộ occurrence khi kiểm tra conflict.
- Dùng iterator hoặc phép tính giao nhau dựa trên recurrence rule.
- Reject input vượt giới hạn bằng 422.
- Tool AI phải có guard tương tự API.

**Acceptance criteria**

- Recurrence cực dài bị từ chối nhanh.
- Conflict check hoàn thành trong giới hạn thời gian xác định.
- Có performance test với dataset lớn.

### P1.2. Conflict recurrence chưa được bảo vệ nguyên tử

**Hiện trạng**

- PostgreSQL exclusion constraint chỉ kiểm tra khoảng thời gian gốc của row.
- Conflict của các occurrence được kiểm tra ở application trước insert/update.
- Hai request đồng thời vẫn có thể cùng vượt qua bước kiểm tra.

**Yêu cầu sửa**

- Dùng transaction và advisory lock theo `user_id`, hoặc RPC database thực hiện check-and-write.
- Áp dụng cho create, update, restore và AI bulk create.
- Bulk create phải all-or-nothing.

**Acceptance criteria**

- Hai request đồng thời tạo recurrence trùng: chỉ một request thành công.
- Không tồn tại partial insert khi một event trong bulk bị conflict.

### P1.3. Rate limiter không phù hợp triển khai nhiều instance

**File liên quan**

- `backend/db/rate_limit.py`

**Hiện trạng**

- Rate limit chỉ tồn tại trong RAM của một process.
- Nhiều worker/instance có quota độc lập.
- Restart làm mất quota.
- Dictionary key user không được dọn hoàn toàn sau khi queue rỗng.

**Yêu cầu sửa**

- Dùng Redis hoặc shared storage có TTL.
- Tách quota cho chat, image upload, calendar mutation và auto-plan nặng.
- Giữ response header `Retry-After`.

**Acceptance criteria**

- Nhiều worker dùng chung quota.
- Key tự hết hạn.
- Có integration test cho 429 và reset window.

### P1.4. API không có pagination và calendar range loading đầy đủ

**File liên quan**

- `backend/routes/chat.py`
- `backend/routes/events.py`
- `backend/routes/tasks.py`
- `frontend/src/context/CalendarContext.tsx`

**Hiện trạng**

- Conversations, messages và tasks được tải không giới hạn.
- Frontend tải toàn bộ events ngay khi đăng nhập.
- Dataset tăng sẽ làm response lớn, render chậm và tăng tải Supabase.

**Yêu cầu sửa**

- Events tải theo visible calendar range.
- Conversations, messages và tasks dùng cursor pagination hoặc limit/offset có giới hạn.
- Backend áp dụng maximum page size.
- Range query vẫn phải trả recurrence series có occurrence trong khoảng cần xem.

**Acceptance criteria**

- Không endpoint danh sách nào trả dữ liệu không giới hạn.
- Calendar chỉ tải range đang hiển thị và prefetch hợp lý.
- Page size vượt maximum bị điều chỉnh hoặc từ chối.

### P1.5. Chat history giới hạn theo số message thay vì token budget

**File liên quan**

- `backend/agent/gemini_agent.py`

**Hiện trạng**

- Lấy tối đa 40 messages cuối.
- Mỗi message có thể dài 12.000 ký tự.
- Prompt có thể vượt context hoặc tăng chi phí lớn.

**Yêu cầu sửa**

- Giới hạn history theo token budget.
- Luôn giữ system prompt và các messages gần nhất.
- Tóm tắt conversation dài và lưu summary có version.
- Không đưa metadata hoặc nội dung không cần thiết vào prompt.

**Acceptance criteria**

- Prompt luôn dưới budget cấu hình.
- Conversation dài vẫn giữ được thông tin quan trọng qua summary.
- Có test với messages ở kích thước tối đa.

### P1.6. Blocking I/O trong async streaming

**File liên quan**

- `backend/routes/chat.py`
- `backend/agent/gemini_agent.py`
- `backend/agent/tools.py`

**Hiện trạng**

- Một số truy vấn Supabase đồng bộ được gọi từ async generator hoặc tool execution.
- Khi nhiều stream chạy, synchronous network I/O có thể chặn event loop.

**Yêu cầu sửa**

- Dùng async client nếu thư viện hỗ trợ ổn định.
- Nếu chưa thể, bọc synchronous DB/tool I/O trong threadpool.
- Xác minh thread-safety của Supabase client; không dùng chung mutable auth state giữa request.
- Bổ sung concurrency/load test.

**Acceptance criteria**

- Nhiều stream đồng thời không làm health và REST API thông thường bị treo.
- Không còn synchronous network call trực tiếp trên event loop.

---

## 4. P1 — Validation, lỗi API và bảo mật dữ liệu

### P1.7. Profile chấp nhận timezone không tồn tại

**File liên quan**

- `backend/models/profile.py`
- `backend/routes/profile.py`

**Hiện trạng**

- `ProfileUpdate` chấp nhận chuỗi timezone bất kỳ.
- Đã xác nhận `Not/A_Real_Zone` vượt qua Pydantic validation.
- Giá trị này có thể làm `ZoneInfo` lỗi ở chat tiếp theo.
- `day_end > day_start` chỉ được DB kiểm tra.
- Empty PATCH không bị từ chối.

**Yêu cầu sửa**

- Validate timezone bằng `ZoneInfo` hoặc danh sách IANA timezones.
- Validate `day_end > day_start` trong model/service.
- Empty PATCH trả 400.
- Database constraint error phải được map thành 4xx phù hợp.

**Acceptance criteria**

- Timezone không tồn tại trả 422.
- Day range không hợp lệ trả 422 trước khi gọi DB.
- Không còn lỗi 500 phát sinh từ dữ liệu profile người dùng.

### P1.8. Thiếu ràng buộc owner giữa chat message và conversation

**File liên quan**

- `supabase/schema.sql`
- `supabase/migrations/*`

**Hiện trạng**

- Foreign key chỉ liên kết `conversation_id` với `conversations.id`.
- `chat_messages.user_id` không bắt buộc trùng với `conversations.user_id`.
- RLS của message chỉ kiểm tra `chat_messages.user_id`.

**Yêu cầu sửa**

- Thêm unique constraint `(id, user_id)` cho `conversations`.
- Thay bằng composite foreign key `(conversation_id, user_id)` tham chiếu `(conversations.id, conversations.user_id)`.
- Kiểm tra và làm sạch dữ liệu không hợp lệ trước migration.
- Cập nhật đồng thời canonical schema và migration.

**Acceptance criteria**

- Không thể insert message với owner khác owner conversation.
- Fresh schema và toàn bộ migration chain tạo ra cấu trúc tương đương.

### P1.9. AI tool inputs thiếu giới hạn nghiệp vụ

**File liên quan**

- `backend/agent/tools.py`
- `backend/models/event.py`
- `backend/models/task.py`

**Yêu cầu sửa**

- Giới hạn khoảng ngày query, `duration_minutes`, `total_hours`, `session_duration`, số event trong bulk create, độ dài description và recurrence horizon.
- Validate ngày thi và target date trước khi chạy thuật toán.
- Tool trả lỗi có cấu trúc thay vì để exception chung thoát ra.

**Acceptance criteria**

- Gemini không thể kích hoạt vòng lặp hoặc insert quá lớn.
- Mọi input ngoài giới hạn bị từ chối trước truy vấn hoặc ghi DB.

### P1.10. Supabase error handling chưa thống nhất

**Hiện trạng**

- Nhiều vị trí dùng `.execute().data[0]` mà không kiểm tra data.
- Constraint, timeout và network error có thể thành 500 generic.
- Logic mapping lỗi được lặp lại và không nhất quán.

**Yêu cầu sửa**

- Tạo lớp exception và error mapping dùng chung.
- Không truy cập `[0]` trước khi xác nhận kết quả.
- Map conflict → 409, invalid input/constraint → 422, not found → 404, Supabase unavailable/timeout → 503.
- Log lỗi kèm correlation ID nhưng không log token hoặc secret.

---

## 5. P2 — Frontend logic và quản lý tài nguyên

### P2.1. Streaming protocol chưa có kiểm tra hoàn tất

**File liên quan**

- `frontend/src/api/chat.ts`
- `backend/routes/chat.py`

**Hiện trạng**

- Frontend không bắt buộc nhận event `done`.
- Kết nối đóng giữa chừng có thể bị coi là thành công.
- Không có request timeout, heartbeat hoặc cancellation hoàn chỉnh.
- Parser không xử lý rõ malformed event và buffer cuối.

**Yêu cầu sửa**

- Event `done` là điều kiện thành công bắt buộc.
- Stream đóng trước `done` phải trả lỗi interrupted.
- Thêm heartbeat cho request dài.
- Hỗ trợ `AbortSignal` và timeout.
- Backend kiểm tra client disconnect.
- Parser xử lý buffer cuối và malformed SSE an toàn.

### P2.2. Quản lý ảnh gây tốn bộ nhớ và history không nhất quán

**File liên quan**

- `frontend/src/components/chat/ChatInput.tsx`
- `frontend/src/components/chat/ChatView.tsx`
- `backend/routes/chat.py`

**Hiện trạng**

- Base64 preview được giữ trong message state sau khi gửi.
- Nhiều ảnh lớn có thể làm memory tăng nhanh.
- Khi mở lại conversation, DB chỉ còn `image_count`; ảnh không còn hiển thị.
- Chỉ có giới hạn từng ảnh, chưa có giới hạn request body tổng ở tầng server/proxy.

**Yêu cầu sửa**

- Dùng object URL cho preview và revoke khi remove, send hoặc unmount.
- Không giữ Base64 lâu hơn thời gian upload/request.
- Chọn chính sách lưu ảnh vào Storage hoặc xác định rõ ảnh không được lưu trong history.
- Thêm giới hạn tổng request body.

### P2.3. Streaming gây render quá thường xuyên

**Hiện trạng**

- Mỗi token cập nhật React state.
- Toàn bộ Markdown được parse lại theo mỗi token.
- Scroll effect chạy theo mọi lần cập nhật messages.

**Yêu cầu sửa**

- Batch tokens theo chu kỳ khoảng 30–100 ms.
- Chỉ auto-scroll khi user đang ở gần cuối.
- Không ép scroll nếu user đang đọc phần cũ.
- Chỉ parse Markdown theo nhịp batch.

### P2.4. Sinh conversation title làm tăng độ trễ và chi phí

**File liên quan**

- `backend/agent/gemini_agent.py`
- `backend/routes/chat.py`

**Hiện trạng**

- Chat mới gọi Gemini lần thứ hai để sinh title.
- Title generation chạy trước event `done`, kéo dài thời gian input bị khóa.

**Yêu cầu sửa**

- Persist exchange và kết thúc stream trước khi chờ title.
- Sinh title bằng background job.
- Có thể dùng model rẻ hơn hoặc fallback deterministic.
- Background retry không được ghi đè title người dùng đã tự đổi.

---

## 6. P2 — Kiểm thử, build, triển khai và vận hành

### P2.5. Test coverage chưa đủ

**Bắt buộc bổ sung**

- Route tests cho events, tasks, profile và chat.
- Authentication, authorization và cross-user isolation.
- Concurrent recurrence creation.
- Stream disconnect, cancel và malformed SSE.
- Scheduler đủ và thiếu thời lượng.
- Timezone, DST và all-day events.
- Pagination và range query.
- Idempotency của AI tools.
- Frontend state race khi đổi conversation.
- E2E: đăng nhập → chat → AI tạo event → kiểm tra calendar.

Không dùng riêng kết quả `24 passed` hiện tại làm tiêu chuẩn release; vẫn cần integration, concurrency và E2E coverage.

### P2.6. Main frontend bundle quá lớn

**Hiện trạng**

- Main chunk khoảng `692 KB`, gzip khoảng `210 KB`.

**Yêu cầu sửa**

- Tách Supabase, Markdown và các dependency lớn thành chunks hợp lý.
- Tiếp tục lazy-load calendar.
- Thiết lập bundle budget trong CI.
- Route chat không được tải toàn bộ FullCalendar code.

### P2.7. Thiếu cấu hình production deployment

**Yêu cầu sửa**

- Thêm SPA rewrite cho `/chat` và `/calendar`.
- Tách rõ development và production configuration.
- Bổ sung readiness check ngoài health check cơ bản.
- Cân nhắc tắt hoặc bảo vệ API docs ở production.
- Thêm CSP và security headers.
- Xác nhận HTTPS-only và CORS production chỉ cho phép origin hợp lệ.

### P2.8. Dependency và CI chưa tái lập đầy đủ

**Yêu cầu sửa**

- Tạo Python lockfile hoặc pin dependency có kiểm soát.
- CI chạy backend tests, frontend typecheck/build/tests, dependency audit, migration validation và secret scanning.
- Không dùng `npm audit --offline` làm security gate duy nhất.

### P2.9. Thiếu observability production

**Yêu cầu sửa**

- Structured logging với request/correlation ID.
- Metrics cho Gemini, Supabase, active streams, tool executions và requested/planned study minutes.
- Error tracking cho frontend và backend.
- Không log access token, service-role key, Gemini key hoặc ảnh Base64.

---

## 7. Thứ tự triển khai đề xuất

1. Sửa scheduler để bảo đảm đủ thời lượng hoặc báo partial rõ ràng.
2. Thêm cancellation và chống race cho chat/conversation loading.
3. Thêm transaction, audit record và idempotency cho AI mutations.
4. Chuẩn hóa timezone và all-day event storage.
5. Giới hạn recurrence và bảo vệ concurrent conflict.
6. Bổ sung Profile/tool validation và error mapping.
7. Thêm composite foreign key bảo vệ conversation ownership.
8. Chuyển rate limit sang shared storage.
9. Thêm pagination, calendar range loading và token-budget history.
10. Loại synchronous I/O khỏi event loop; hoàn thiện SSE protocol.
11. Tối ưu memory ảnh, token batching và title background job.
12. Hoàn thiện test suite, CI, deployment security và observability.

---

## 8. Definition of Done chung

Một hạng mục chỉ được coi là hoàn thành khi:

- Có test tự động tái hiện lỗi cũ và xác nhận hành vi mới.
- Backend trả status code và error response ổn định.
- Không làm hỏng smoke test Supabase + Gemini hiện tại.
- Migration chạy được trên database đã có dữ liệu và có phương án rollback.
- Fresh schema và migration chain tạo ra cấu trúc tương đương.
- Backend tests, frontend typecheck/build và E2E đều thành công.
- Không thêm secret hoặc dữ liệu người dùng vào repository/log.
- README và `PROJECT_DOCUMENTATION.md` được cập nhật khi hành vi hệ thống thay đổi.

## 9. Ghi chú về báo cáo cũ

Các kết luận cũ như “streaming giả”, “không có Settings”, “không có Tasks”, “không có Router”, “không có dark mode”, “không có rate limit”, “không có soft-delete” hoặc “chưa hỗ trợ recurrence” không còn đúng với commit hiện tại và đã được loại khỏi báo cáo này.
