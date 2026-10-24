---
name: sunflower-erp-ui
description: Design, implement, or review frontend UI for the Sunflower ERP (tables, forms, dashboards, modals, navigation, toolbars, filters, tabs, CSS). Use for any change under src/**/*.tsx or *.css that affects what users see. Not for backend-only, data-only, or docs-only tasks.
---

# Sunflower ERP UI

## Đọc trước khi sửa

1. `docs/dev/DEVELOPER_GUIDELINES.md` — quy chuẩn UI bắt buộc. Đọc mục 0 và mục liên quan tới loại màn hình.
2. `src/styles/ErpUiStandards.css` (dùng `Grep` tìm class/token cần dùng, không đọc toàn bộ nếu không cần).
3. Màn hình mục tiêu và **ít nhất một màn hình cùng loại đã chuẩn** để sao đúng pattern.

## Thứ tự ưu tiên

1. Yêu cầu rõ ràng của người dùng.
2. `CLAUDE.md` và `docs/dev/DEVELOPER_GUIDELINES.md`.
3. Component, token, hợp đồng dữ liệu và hành vi đang có.
4. Skill này.

Thay đổi hình thức không được ngầm đổi logic nghiệp vụ, route, field, quyền, schema Firebase, audit hay dependency.

## Chuẩn

- ERP nội bộ: sáng, tin cậy, tiết chế, mật độ thông tin cao, tối ưu desktop. Chuẩn tham chiếu **MISA**.
- Pattern mới chưa có mẫu trong dự án: **hỏi người dùng ảnh tham chiếu MISA** trước khi làm.
- Đồng nhất giữa các phân hệ là bắt buộc; không tạo biến thể riêng cho một trang.
- Icon `lucide-react` luôn kèm chữ (ngoại lệ: nút ba chấm, nút đóng, phân trang dùng chung).
- Không Tailwind/Motion/shadcn/design system khác, không dark mode, không gradient/glow/card trang trí.

## Component dùng lại trước khi viết mới

`DataTablePagination`, `RowActionMenu`, `TableColumnCustomizer`, `ReorderableTableColumns`, `ExpandableTableText`,
`AdvancedDataFilters`, `DataWorkspaceFilters`, `MutationToast`, `DeleteConfirmationDialog`, `PageBackButton`,
`PageContextHeader`, `SearchableProvinceSelect` (trong `src/components`). Hook bảng trong `src/hooks`.
Cảnh báo rời trang: `src/shared/feedback/navigationGuard.ts`.

## Quy trình

1. Phân loại màn hình: bảng, form, dashboard, cấu hình hay workflow.
2. Xác định phần cần giữ và thay đổi nhỏ nhất giải quyết đúng vấn đề.
3. Dùng class/token của `ErpUiStandards.css` trước khi thêm CSS cục bộ. Giá trị lặp lại đưa vào token.
4. Viết đủ trạng thái: default, hover, focus, disabled, loading, empty, error, success, dữ liệu dài.
5. Phòng lỗi ngay khi viết:
   - chữ không bị cắt ngoài ý muốn (chỉ ô dữ liệu bảng dùng ellipsis + `title`);
   - lớp nổi đúng `z-index`, không bị `overflow` của khung cha cắt;
   - không tràn ngang; layout không nhảy khi đổi tab hoặc tải dữ liệu.
6. **Không mở trình duyệt, không chạy app, không chụp màn hình.** Chạy build và lint file đã sửa. Khi bàn giao,
   liệt kê ngắn các điểm người dùng nên kiểm tra trên giao diện (màn hình, trạng thái, độ rộng).
