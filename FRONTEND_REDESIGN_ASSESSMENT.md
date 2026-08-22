# Đánh giá rủi ro và quyết định thiết kế frontend Planora

## 1. Kết luận điều hành

Planora có thể chuyển sang Schedule-X mà vẫn giữ drag-and-drop và resize miễn phí, nhưng không nên dùng Schedule-X v4 cho mục tiêu này. Phương án được chọn cho prototype là pin bộ Schedule-X open-source v3.7.3 (MIT), kết hợp adapter React 4.1.0 có hỗ trợ React 19.

Phương án này chỉ được đưa vào production sau khi vượt qua cổng Go/No-Go về tương tác. Nếu drag/resize không đủ mượt hoặc không ổn định, Planora giữ FullCalendar engine và áp dụng toàn bộ visual system mới. Không triển khai cách hack DOM trên Schedule-X v4.

## 2. Bằng chứng technical spike

- `@schedule-x/react@4.1.0` khai báo hỗ trợ React 16.7 đến React 19.
- `@schedule-x/calendar@3.7.3`, `@schedule-x/drag-and-drop@3.7.3` và `@schedule-x/resize@3.7.3` vẫn tồn tại trên npm với license MIT.
- Prototype tạm đã build thành công với React 19.1.1, Vite 7, TypeScript, Temporal, recurrence, drag-and-drop và resize.
- Adapter React cần khai báo trực tiếp `@schedule-x/shared` và dùng `skipLibCheck` vì declaration package hiện chưa hoàn toàn tự chứa. Đây là lỗi tích hợp có thể kiểm soát, không phải lỗi runtime Calendar.
- Production preview của spike trả HTTP 200.
- Chưa coi interaction DnD/resize là đạt cho đến khi có browser QA kéo thật trên Day, Week, Month và all-day area.

## 3. Quyết định theo từng rủi ro

| Risk | Đánh giá sau kiểm tra | Quyết định |
|---|---|---|
| R-01 Drag/resize | Giảm từ cực cao xuống cao nếu pin v3.7.3; vẫn có rủi ro maintenance | Dùng plugin MIT v3 trong prototype, không tự hack DOM v4; giữ fallback FullCalendar reskin |
| R-02 React 19 | Adapter chính thức hỗ trợ React 19; spike build đạt | Cô lập Calendar trong wrapper, khai báo dependency còn thiếu và pin version |
| R-03 Timezone/RRule | Vẫn là rủi ro dữ liệu lớn nhất | Tạo adapter hai chiều, fixture DST/all-day/recurrence và không gỡ code cũ trước parity |
| R-04 AI race | Bulk AI mutation hiện có tính nguyên tử; reload nhiều lần vẫn cần tránh | Ghost preview cho đề xuất; mutation thật chỉ refresh một lần sau `done` |
| R-05 Brand/error | Rose dễ bị hiểu là lỗi | Tách Rose brand, Crimson error, Amber warning, Emerald success, Indigo AI |
| R-06 Desktop widths | 1024/125% zoom dễ quá tải | Sidebar 3 trạng thái: mở, compact, overlay; giảm mật độ toolbar dưới 1280px |
| R-07 Sa đà thư viện | Pin v3 có thể tạo nợ nâng cấp | Gắn Go/No-Go rõ ràng và dừng migration nếu không đạt interaction gate |

## 4. Cổng Go/No-Go cho Calendar engine

Schedule-X chỉ được chọn làm production engine khi đạt toàn bộ điều kiện:

1. React 19 StrictMode không tạo duplicate calendar instance hoặc memory leak.
2. Day/Week/Month/List render đúng dữ liệu thật.
3. Drag event trong ngày, qua ngày khác và vào all-day area hoạt động đúng.
4. Resize snap 30 phút, không tạo end trước start.
5. Recurring event không bị sửa một occurrence ngoài ý muốn.
6. Backend conflict làm UI rollback về vị trí cũ.
7. All-day và timezone Asia/Ho_Chi_Minh không lệch ngày.
8. Dark mode, 1024px, 1280px, 1440px và zoom 125% không vỡ layout.
9. Bundle nằm trong budget được thiết lập sau khi đo baseline mới.

Nếu một điều kiện quan trọng không đạt, chuyển sang FullCalendar reskin. Visual design và các component Planora vẫn được giữ nguyên nên fallback không làm mất công thiết kế.

## 5. Chiến lược AI–Calendar

### Đưa vào thiết kế hiện tại

- Trạng thái tiến trình rõ: đọc ảnh, trích xuất, kiểm tra xung đột, hoàn tất.
- Action cards cho sự kiện/task vừa tạo, sửa hoặc xóa.
- Calendar tự refresh một lần sau batch AI action.
- Event vừa thay đổi được pulse nhẹ và tự cuộn vào vùng nhìn thấy.
- Conflict card hiển thị hai lịch và các hành động an toàn.

### Thiết kế sẵn nhưng cần thay đổi backend trước khi triển khai

- Ghost Events chưa ghi database.
- “Áp dụng tất cả / Chỉnh sửa nhanh / Hủy” cho lịch trích từ ảnh.
- Ghi đè lịch cũ hoặc giữ cả hai từ conflict card.

Các tính năng này cần chế độ dry-run/proposal ở AI tools. Không giả lập ở frontend bằng cách gọi tool ghi thật rồi hoàn tác.

### Roadmap sau redesign

- Pomodoro timer tạo focus block.
- Tuần chẵn/tuần lẻ.
- Split view Chat 35% + Calendar 65%.

Ba mục này là tính năng mới, không thuộc feature parity của redesign đầu tiên.

## 6. Nguyên tắc thiết kế đã chọn

- Visual gần Schedule-X nhưng có nhận diện Planora rõ ràng.
- Trẻ trung, nhiều màu, không trẻ con và không phủ gradient quá mức.
- Rose là màu hành động chính; Indigo là màu AI.
- Mật độ thông tin cao ở Calendar, mật độ thấp hơn ở Chat và Login.
- Chuyển động 140–220ms; pulse sau AI tối đa 3 giây; tôn trọng reduced motion.
- Desktop-first nhưng sử dụng được ở 1024px và zoom 125%.
- Mọi trạng thái phải có loading, empty, error, success và disabled rõ ràng.

## 7. Phạm vi mockup

Bộ mockup độc lập thể hiện:

- Login.
- AI Assistant với tiến trình đọc ảnh và action card.
- Calendar tuần với sidebar, Tasks và event palette.
- Event modal.
- Settings.
- Trash.
- Light/Dark mode.

Mockup không thay thế code production và không gọi backend. Sau khi supervisor duyệt, agent mới chuyển design system vào frontend thật.
