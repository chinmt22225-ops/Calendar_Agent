# Kế hoạch thiết kế lại frontend Planora với Schedule-X

## 1. Mục tiêu

Thiết kế lại toàn bộ frontend Planora theo phong cách gần Schedule-X: trẻ trung, nhiều màu, phù hợp sinh viên, bắt mắt nhưng vẫn dễ sử dụng. Giao diện ưu tiên desktop, sử dụng chuyển động nhẹ nhàng và giữ nguyên toàn bộ chức năng hiện có.

Quy trình thực hiện đã thống nhất:

1. Lập kế hoạch.
2. Dựng wireframe.
3. Xây dựng bộ design token.
4. Tạo mockup hoàn chỉnh.
5. Người dùng duyệt.
6. Triển khai code.

## 2. Các quyết định đã chốt

- Chuyển hoàn toàn từ FullCalendar sang Schedule-X.
- Chỉ sử dụng thư viện và tính năng miễn phí.
- Thiết kế lại toàn bộ ứng dụng: Login, Navbar, AI Assistant, Calendar, Tasks, Trash, Settings và các modal.
- Phong cách gần Schedule-X, trẻ trung và nhiều màu.
- Giữ tên Planora và logo hiện tại.
- Màu chủ đạo theo hướng đỏ hồng.
- Ưu tiên trải nghiệm desktop.
- Animation nhẹ nhàng, tinh tế.
- Giữ nguyên 100% chức năng và luồng backend hiện tại.
- Chỉ bắt đầu code sau khi wireframe, design token và mockup được duyệt.

## 3. Lưu ý quan trọng về Schedule-X miễn phí

Schedule-X có React adapter, các chế độ xem lịch, recurrence, custom components, light/dark theme và Events Service phù hợp với Planora.

Tuy nhiên, các plugin chính thức sau hiện thuộc Schedule-X Premium:

- Drag-and-drop sự kiện.
- Resize sự kiện.
- Interactive event modal.
- Drag-to-create.
- Resource scheduler.

Technical spike xác nhận có thể dùng bộ Schedule-X v3.7.3 open-source (MIT), trong đó drag-and-drop và resize vẫn là package miễn phí. Prototype React 19 + Vite + recurrence + drag + resize đã build thành công. Planora sẽ pin phiên bản này và chỉ migration sau khi kiểm thử kéo/resize thực tế đạt cổng Go/No-Go; không hack DOM của Schedule-X v4.

Nếu interaction QA không đạt, phương án dự phòng là giữ FullCalendar engine nhưng áp dụng toàn bộ giao diện, design tokens và component mới theo phong cách Schedule-X.

Modal tạo/sửa sự kiện sẽ tiếp tục là component React riêng của Planora, được thiết kế lại theo phong cách Schedule-X.

Tài liệu tham khảo:

- [Schedule-X React](https://schedule-x.dev/docs/frameworks/react)
- [Calendar views](https://schedule-x.dev/docs/calendar/views)
- [Theme customization](https://schedule-x.dev/docs/calendar/theme)
- [Event recurrence](https://schedule-x.dev/docs/calendar/plugins/recurrence)
- [Drag and Drop Premium](https://schedule-x.dev/docs/calendar/plugins/drag-and-drop)
- [Resize Premium](https://schedule-x.dev/docs/calendar/plugins/resize)
- [Interactive Event Modal Premium](https://schedule-x.dev/docs/calendar/plugins/interactive-event-modal)

## 4. Kiến trúc frontend dự kiến

### 4.1. Calendar engine

- Gỡ FullCalendar sau khi Schedule-X đạt đầy đủ feature parity.
- Sử dụng Schedule-X React để hiển thị Day, Week, Month và List/Agenda.
- Sử dụng Events Service để cập nhật dữ liệu trên Calendar.
- Sử dụng recurrence plugin miễn phí cho chuỗi lặp ngày/tuần/tháng.
- Dùng custom components cho event card, day header, time axis và month event.
- Đồng bộ light/dark mode của Planora với theme Schedule-X.

### 4.2. Data adapter

Tạo một lớp chuyển đổi độc lập giữa dữ liệu backend và Schedule-X:

- ISO datetime và timezone sang Temporal.
- Temporal sang payload API hiện tại.
- Timed event và all-day event.
- Recurrence ngày/tuần/tháng và ngày kết thúc.
- Category, màu, trạng thái hoàn thành và AI-generated badge.
- Giữ nguyên ID để cập nhật, xóa, Trash và khôi phục chính xác.

### 4.3. Backend

- Không thay đổi API hoặc database nếu không thật sự cần thiết.
- Giữ nguyên authentication, Calendar API, Tasks API, AI Assistant và Supabase.
- Mọi thao tác kéo/thả hoặc resize vẫn phải gọi backend và rollback giao diện nếu backend báo conflict.

## 5. Kế hoạch wireframe desktop

Wireframe chính được dựng ở khung desktop 1440px.

### 5.1. Login

- Hero giới thiệu Planora và giá trị của AI Calendar Agent.
- Minh họa lịch học trực quan.
- Nút đăng nhập Google nổi bật.
- Trình bày ngắn gọn khả năng tránh trùng lịch và tự lập kế hoạch.
- Có đầy đủ trạng thái cấu hình thiếu, loading và lỗi đăng nhập.

### 5.2. Navbar

- Logo Planora ở bên trái.
- Chuyển AI Assistant/Calendar ở trung tâm.
- Thông báo, theme và tài khoản ở bên phải.
- Thiết kế đầy đủ trạng thái hover, active, focus, badge và popover.

### 5.3. AI Assistant

- Sidebar lịch sử hội thoại gọn, dễ quét.
- Màn hình chào với prompt phù hợp sinh viên.
- Composer nổi, hỗ trợ paste và chọn ảnh rõ ràng.
- Preview ảnh, xóa ảnh và hiển thị lỗi upload.
- Card kết quả Calendar/Tasks trực quan.
- Hiển thị trạng thái AI đang đọc ảnh, kiểm tra lịch hoặc thực hiện công cụ.
- Câu hỏi xác nhận gộp/thay thế lịch phải nổi bật và dễ hiểu.
- Có trạng thái empty, loading, streaming, error, retry và stop.

### 5.4. Calendar

- Sidebar gồm mini-calendar, category filters, Tasks và Trash.
- Toolbar gồm Hôm nay, điều hướng, tiêu đề thời gian, timezone và view switcher.
- Event card nhiều màu nhưng bảo đảm tương phản và khả năng đọc.
- Hiển thị AI badge, recurrence, trạng thái hoàn thành và current-time indicator.
- Nhấn khoảng trống để mở tạo sự kiện.
- Nhấn sự kiện để mở chi tiết/chỉnh sửa.
- Có trạng thái loading, empty, error và interaction pending.

### 5.5. Tasks

- Nhóm công việc sắp đến hạn, đang thực hiện và đã hoàn thành.
- Deadline và priority dễ nhận biết.
- Quick complete, sửa và xóa.
- Tự tải lại sau khi AI tạo, sửa hoặc xóa task.

### 5.6. Trash

- Hiển thị các sự kiện đã xóa mềm.
- Cho phép khôi phục hoặc xóa vĩnh viễn.
- Xóa vĩnh viễn phải có bước xác nhận rõ ràng.

### 5.7. Settings

- Chia thành các nhóm Giao diện, Hồ sơ, Giờ học và Pomodoro.
- Light/Dark/System dưới dạng visual selector.
- Có validation, loading, save success và save error.

### 5.8. Event modal

- Phân cấp rõ tiêu đề, thời gian và thông tin bổ sung.
- Hỗ trợ all-day, category, màu, mô tả và recurrence.
- Hiển thị AI indicator và cảnh báo conflict.
- Phân biệt rõ Lưu, Hủy và Xóa.

## 6. Bộ design token

Design token sẽ được trình duyệt trước khi khóa màu cụ thể.

### 6.1. Màu sắc

- Primary theo hướng đỏ hồng.
- Accent gồm coral, rose, peach và berry.
- Các palette sự kiện riêng cho học tập, cá nhân, deadline, nghỉ ngơi và AI.
- Light mode dùng nền trắng pha hồng rất nhẹ.
- Dark mode không dùng màu đen tuyệt đối.
- Chuẩn bị 2–3 phương án palette đỏ hồng để người dùng chọn.

### 6.2. Typography và hình khối

- Typography trẻ trung, hiện đại và dễ đọc.
- Spacing theo lưới 4/8px.
- Border radius thống nhất cho button, card, event, input và modal.
- Shadow nhẹ để tạo chiều sâu, tránh hiệu ứng quá nặng.

### 6.3. Motion và accessibility

- Animation khoảng 120–240ms.
- Chuyển động nhẹ cho hover, popover, modal, sidebar và event state.
- Hỗ trợ `prefers-reduced-motion`.
- Màu chữ và control đạt tối thiểu WCAG AA.
- Có focus state và keyboard navigation rõ ràng.

## 7. Danh sách mockup cần duyệt

- Login.
- Navbar và popover tài khoản/thông báo.
- AI Assistant trạng thái rỗng.
- AI Assistant có ảnh và kết quả công cụ.
- Calendar tuần.
- Calendar tháng.
- Calendar ngày và List/Agenda.
- Tasks.
- Trash.
- Event modal.
- Settings.
- Light mode và dark mode.
- Loading, empty, error, confirmation và conflict states.

Mỗi mockup phải được duyệt trước khi chuyển sang code.

## 8. Các giai đoạn triển khai code

### Giai đoạn A — Technical spike (đã hoàn thành bước package/build)

- Cài Schedule-X trong một prototype độc lập.
- Kiểm tra Day/Week/Month/List, locale Việt Nam và timezone.
- Thử adapter với dữ liệu thật nhưng không thay đổi backend.
- Pin Schedule-X v3.7.3 MIT để giữ drag-and-drop và resize miễn phí.
- Đánh giá recurrence, all-day và rollback khi conflict.
- Chỉ tiếp tục migration khi prototype đạt acceptance criteria.

### Giai đoạn B — Nền tảng giao diện

- Tách file CSS lớn thành design tokens, foundations và component styles.
- Thiết kế lại app shell, Login và Navbar.
- Đồng bộ light/dark/system.

### Giai đoạn C — Calendar migration

- Tích hợp Schedule-X read-only.
- Hoàn thiện data adapter.
- Tích hợp create/edit/delete modal.
- Tích hợp recurrence, all-day và timezone.
- Thêm drag-and-drop, resize và rollback.
- Hoàn thiện sidebar, category filters và empty/error states.

### Giai đoạn D — Các chức năng liên quan

- Thiết kế lại Tasks và đồng bộ action từ AI.
- Thiết kế lại Trash và luồng khôi phục/xóa vĩnh viễn.
- Thiết kế lại Settings.
- Thiết kế lại AI Assistant và luồng ảnh/text.

### Giai đoạn E — Gọt giũa

- Animation và micro-interactions.
- Accessibility và keyboard navigation.
- Desktop responsive ở 1440px, 1280px và 1024px.
- Dark mode QA.
- Tối ưu bundle và render.

### Giai đoạn F — Chuyển đổi chính thức

- Chạy toàn bộ feature-parity tests.
- Chỉ gỡ FullCalendar khi Schedule-X đã thay thế đầy đủ.
- Cập nhật tài liệu và dependencies.
- Production build, smoke test và kiểm tra Git diff trước khi triển khai.

## 9. Tiêu chí nghiệm thu

### 9.1. Feature parity

- Day, Week, Month và List/Agenda hoạt động.
- Tạo sự kiện từ nút và từ khoảng thời gian trên lịch.
- Sửa, xóa mềm, khôi phục và xóa vĩnh viễn.
- Drag-and-drop và resize có rollback khi API lỗi hoặc conflict.
- Daily/weekly/monthly recurrence hoạt động đúng.
- All-day event giữ đúng ngày theo timezone hồ sơ.
- Tasks, filters, badge sắp tới và trạng thái hoàn thành không bị mất.
- AI action tự cập nhật Calendar và Tasks.
- Chat vẫn hỗ trợ text, paste ảnh và chọn file.
- Light/Dark/System được lưu và áp dụng cho Schedule-X.

### 9.2. Chất lượng giao diện

- Giao diện có nhận diện Planora rõ ràng.
- Trẻ trung và nhiều màu nhưng không gây rối mắt.
- Thông tin ngày, giờ, deadline và trạng thái dễ quét.
- Không có text bị cắt, tràn hoặc che control ở các độ rộng desktop mục tiêu.
- Loading, error và destructive actions đều có phản hồi rõ ràng.

### 9.3. Kiểm thử kỹ thuật

- Unit tests cho event adapter và Temporal/timezone.
- Component tests cho view switcher, modal, Tasks, Trash và AI actions.
- Regression tests cho recurrence, all-day và drag/resize rollback.
- Accessibility checks cho focus, keyboard và contrast.
- TypeScript check và production build thành công.
- Bundle không vượt budget đã thống nhất.
- Không xóa FullCalendar trước khi toàn bộ kiểm thử Schedule-X đạt.

## 10. Vai trò và cơ chế phê duyệt

### Agent

Agent chịu trách nhiệm trực tiếp thực hiện toàn bộ công việc:

- Phân tích và thiết kế UX/UI.
- Dựng wireframe, design token và mockup.
- Cài đặt và tích hợp Schedule-X miễn phí.
- Tích hợp drag-and-drop và resize từ bộ Schedule-X v3.7.3 MIT; chỉ tự xây lớp interaction riêng nếu một giới hạn nhỏ có thể cô lập và được supervisor phê duyệt.
- Viết code frontend, adapter dữ liệu và các component cần thiết.
- Giữ nguyên kết nối với backend hiện tại.
- Viết và chạy kiểm thử, xử lý regression và gọt giũa giao diện.
- Báo cáo kết quả, rủi ro và các lựa chọn cần phê duyệt.

### Supervisor

Người dùng giữ vai trò supervisor:

- Duyệt wireframe.
- Chọn bảng màu/design token.
- Duyệt mockup.
- Góp ý và yêu cầu chỉnh sửa tại từng checkpoint.
- Phê duyệt trước khi agent chuyển sang giai đoạn code hoặc thay đổi quan trọng.

Agent không yêu cầu supervisor tự viết code, tự cài thư viện hoặc tự xây drag-and-drop/resize. Agent cũng không tự thay đổi các quyết định sản phẩm đã chốt nếu chưa có sự đồng ý của supervisor.

## 11. Bước tiếp theo

Bộ đánh giá rủi ro, wireframe, design tokens và mockup tương tác độc lập đã được chuẩn bị. Supervisor duyệt hướng thiết kế này trước khi agent chuyển các component và Calendar engine vào frontend production.
