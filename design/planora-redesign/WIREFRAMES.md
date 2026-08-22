# Wireframes desktop — Planora redesign

Khung thiết kế chính: 1440 × 960. Kiểm tra bổ sung: 1280 × 800 và 1024 × 768 ở zoom 100%/125%.

## 1. App shell và Calendar

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Logo Planora       [Trợ lý AI] [Lịch]                🔔  Theme  Avatar      │
├──────────────────────┬───────────────────────────────────────────────────────┤
│ [+ Tạo mới]          │ [Hôm nay] ‹ ›  18–24 Tháng 8      [Ngày Tuần Tháng] │
│                      ├───────────────────────────────────────────────────────┤
│ Mini Calendar        │ GMT+7 │ T2 │ T3 │ T4 │ T5 │ T6 │ T7 │ CN          │
│                      │───────┼────┼────┼────┼────┼────┼────┼─────────────│
│ Lịch của tôi         │ 07:00 │    │    │    │    │    │    │             │
│ ● Học tập            │ 08:00 │ event card │    │ lab card │             │
│ ● Cá nhân            │ 09:00 │    │    │    │    │    │    │             │
│ ● Deadline           │ ...   │    │    │    │    │    │    │             │
│                      │ 20:00 │         AI event ✦        │                 │
│ Tasks            4   │                                                     │
│ □ Ôn chương 3        │                                         [AI mini]   │
│ □ Nộp bài nhóm       │                                                     │
│                      │                                                     │
│ Trash                │                                                     │
└──────────────────────┴───────────────────────────────────────────────────────┘
```

Sidebar có ba trạng thái: expanded 280px, compact 76px và overlay dưới 1024px.

## 2. AI Assistant

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Logo Planora       [Trợ lý AI] [Lịch]                🔔  Theme  Avatar      │
├───────────────────┬──────────────────────────────────────────────────────────┤
│ + Cuộc trò chuyện │                  Planora AI                              │
│                   │  User: [ảnh thời khóa biểu]                              │
│ Hôm nay           │                                                          │
│ • Xếp TKB mới     │  ✦ Đang xử lý                                             │
│ • Lịch ôn thi     │  ✓ Đọc ảnh  ✓ Trích xuất 6 môn  • Kiểm tra xung đột      │
│                   │                                                          │
│ Tuần trước        │  ┌─ Lịch xem trước ───────────────────────────────────┐  │
│ • Deadline Toán   │  │ 6 sự kiện · 18–24/08 · chưa ghi vào lịch          │  │
│                   │  └────────────────────────────────────────────────────┘  │
│                   │                                                          │
│                   │  [Nhập yêu cầu hoặc dán ảnh...]                 [Gửi]    │
└───────────────────┴──────────────────────────────────────────────────────────┘
```

## 3. Login

```text
┌──────────────────────────────────┬───────────────────────────────────────────┐
│ Planora                          │  Live calendar preview                    │
│                                  │  ┌─────────────────────────────────────┐  │
│ Lịch học thông minh,             │  │ Tuần này       76% kế hoạch         │  │
│ nhẹ đầu hơn mỗi ngày.            │  │  T2  T3  T4  T5  T6                │  │
│                                  │  │  các event card nhiều màu           │  │
│ AI hiểu ảnh thời khóa biểu,      │  └─────────────────────────────────────┘  │
│ deadline và thời gian rảnh.      │                                           │
│                                  │  ✦ AI suggestion card                    │
│ [ Tiếp tục với Google ]          │                                           │
└──────────────────────────────────┴───────────────────────────────────────────┘
```

## 4. Event modal

```text
┌──────────────────────────────────────────────────────┐
│ ●  Chỉnh sửa sự kiện                              × │
│    Do Planora AI sắp xếp                             │
├──────────────────────────────────────────────────────┤
│ Tiêu đề                                               │
│ [ Ôn Triết học                                      ] │
│ [Ngày 21/08] [13:00] → [15:00]    [Cả ngày □]        │
│ [Danh mục] [Màu]                                     │
│ [Không lặp / Hằng ngày / Tuần / Tháng]               │
│ Mô tả                                                 │
│ [...................................................] │
│ ⚠ Khung giờ đang trống                                │
├──────────────────────────────────────────────────────┤
│ [Xóa]                              [Hủy] [Lưu thay đổi]│
└──────────────────────────────────────────────────────┘
```

## 5. Settings và Trash

Settings dùng modal hai cột: navigation bên trái, form đang chọn bên phải. Trash dùng drawer phải để người dùng vẫn thấy Calendar phía sau. Xóa vĩnh viễn luôn mở confirmation dialog riêng.

## 6. Breakpoint behavior

- 1440px+: sidebar mở, toolbar đầy đủ, task preview hiển thị.
- 1280–1439px: sidebar compact tùy chọn, timezone thu gọn thành GMT+7.
- 1024–1279px: sidebar mặc định compact; title và view switch co lại; Tasks mở bằng drawer.
- Dưới 1024px: chưa phải mục tiêu chính của vòng này nhưng không được mất chức năng cơ bản.
