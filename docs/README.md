# Tài liệu Sunflower ERP

Quy tắc làm việc cho người phát triển và AI: [../CLAUDE.md](../CLAUDE.md).

| Thư mục | Tài liệu | Nội dung |
|---|---|---|
| `business/` | [PROJECT_OVERVIEW.md](business/PROJECT_OVERVIEW.md) | Mục tiêu, vai trò, phân hệ, luồng nghiệp vụ, thuật ngữ |
| | [CODE_STANDARDS.md](business/CODE_STANDARDS.md) | Chuẩn mã đơn hàng, LSX, mã hàng, chứng từ (D-MA1) |
| `dev/` | [ARCHITECTURE.md](dev/ARCHITECTURE.md) | Kiến trúc, lớp mã nguồn, hướng phụ thuộc, mẫu ghi sổ máy chủ |
| | [CODEBASE_MAP.md](dev/CODEBASE_MAP.md) | Sửa ở đâu: phân hệ → file, API → server, component dùng chung |
| | [DEVELOPER_GUIDELINES.md](dev/DEVELOPER_GUIDELINES.md) | Quy chuẩn UI/UX (chuẩn MISA) và quy tắc kỹ thuật |
| `modules/` | [PRODUCTION_ORDERS.md](modules/PRODUCTION_ORDERS.md) | Lệnh sản xuất, máy, mẫu in |
| | [ATTENDANCE.md](modules/ATTENDANCE.md) | Chấm công theo lịch tháng |
| | [FIELD_CONFIGURATION.md](modules/FIELD_CONFIGURATION.md) | Cấu hình trường hệ thống/tùy chỉnh |
| `accounting/` | [STATUS.md](accounting/STATUS.md) | **Trạng thái hiện tại** của kế hoạch kế toán 7 lượt |
| | [ACCOUNTING_SPEC.md](accounting/ACCOUNTING_SPEC.md) | Kế hoạch, quy tắc xuyên suốt R01–R06, hợp đồng dữ liệu |
| | [ACCOUNTING_DECISIONS.md](accounting/ACCOUNTING_DECISIONS.md) | Quyết định nghiệp vụ đã chốt (D01–D10) |
| | [WAREHOUSE.md](accounting/WAREHOUSE.md) | Sổ kho NVL (lượt 3) |
| | [FINISHED_GOODS.md](accounting/FINISHED_GOODS.md) | Thành phẩm, giao hàng, POD, trả hàng (lượt 4) |
| | [ACCOUNTING_LEDGER.md](accounting/ACCOUNTING_LEDGER.md) | Công nợ, thu chi, ứng trước, kỳ (lượt 5) |
| | [ACCOUNTING_REPORTS.md](accounting/ACCOUNTING_REPORTS.md) | Báo cáo, tuổi nợ, cảnh báo (lượt 6) |
| `archive/` | [ACCOUNTING_HANDOVER_LOG.md](archive/ACCOUNTING_HANDOVER_LOG.md) | Nhật ký bàn giao từng lượt (lịch sử, không cập nhật) |
| | `Sunflower_ERP_Luong_ke_toan_va_ke_hoach_code.docx` | Bản Word kế hoạch kế toán gốc 21/10/2026 (đã thay bằng kế hoạch 7 lượt) |

Tài liệu mô tả trạng thái **hiện tại**. Khi thay đổi nghiệp vụ, quyền, collection hoặc API, cập nhật tài liệu
tương ứng trong cùng commit. Không ghi nhật ký bàn giao vào tài liệu; lịch sử đã có trong Git.
