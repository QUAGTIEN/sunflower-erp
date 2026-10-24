# Trạng thái triển khai kế toán

Cập nhật: 24/10/2026, commit nền `4853828`. Kế hoạch và hợp đồng dữ liệu: [ACCOUNTING_SPEC.md](ACCOUNTING_SPEC.md).
Quyết định đã chốt: [ACCOUNTING_DECISIONS.md](ACCOUNTING_DECISIONS.md). Nhật ký chi tiết từng lượt (lịch sử):
[../archive/ACCOUNTING_HANDOVER_LOG.md](../archive/ACCOUNTING_HANDOVER_LOG.md).

## Tiến độ 7 lượt

| Lượt | Phạm vi | Tài liệu | Trạng thái |
|---|---|---|---|
| 1 | Danh mục hàng nội bộ, ĐVT/quy đổi, nhập CSV, liên kết dữ liệu cũ | ACCOUNTING_SPEC | Có mã nguồn |
| 2 | Kế toán lập LSX, mẫu in tem trắng v1 | [../modules/PRODUCTION_ORDERS.md](../modules/PRODUCTION_ORDERS.md) | Có mã nguồn |
| 3 | Sổ số lượng NVL: nhập mua, cấp/hoàn theo LSX, đảo | [WAREHOUSE.md](WAREHOUSE.md) | Có mã nguồn |
| 4 | Thành phẩm, xuất giao, POD, giao thất bại/trả/giao bù, NCC giao thẳng | [FINISHED_GOODS.md](FINISHED_GOODS.md) | Có mã nguồn |
| 5 | Công nợ phải thu/trả, thu chi, ứng trước, phân bổ, điều chỉnh, khóa kỳ | [ACCOUNTING_LEDGER.md](ACCOUNTING_LEDGER.md) | Có mã nguồn |
| 6 | Báo cáo kỳ, tuổi nợ, hàng còn giao/nhận, cảnh báo tồn | [ACCOUNTING_REPORTS.md](ACCOUNTING_REPORTS.md) | Có mã nguồn |
| 7 | Chuyển dữ liệu thật, đầu kỳ, triển khai, nghiệm thu | — | **Chưa làm** |

"Có mã nguồn" nghĩa là đã có code và test tự động. **Chưa** có các bước sau cho bất kỳ lượt nào:
- deploy web/API/`firestore.rules`;
- chạy rules emulator;
- kiểm thử trên trình duyệt hoặc máy in;
- ghi dữ liệu Firebase thật.

## Thành phần chính

| Phần | Client | API → server | Collection chính |
|---|---|---|---|
| Danh mục hàng | `src/features/catalog` | `/api/catalog/manage` → `server/itemCatalog.ts` | `item_catalog`, `catalog_links`, `catalog_requests` |
| LSX | `src/features/production` | `/api/production/manage` → `server/productionOrders.ts`, `productionCatalog.ts` | `production_commands`, `production_counters` |
| Kho NVL | `src/features/inventory` | `/api/warehouse/manage` → `server/warehouse.ts` | `warehouse_*` (`raw_main`) |
| Thành phẩm/giao | `src/features/inventory`, `delivery` | `/api/warehouse/finished` → `server/finishedGoods.ts` | `warehouse_*` (`finished_main`), `goods_*` |
| Công nợ/tiền | `src/features/accounting` | `/api/accounting/manage` → `server/accountingLedger.ts` | `finance_*` |
| Báo cáo | `src/features/accounting` | `/api/accounting/reports` → `server/accountingReports.ts` | đọc từ các sổ trên |

`server/financeSourceGuard.ts` chặn đảo phiếu kho khi nguồn đã vào sổ tiền. Dữ liệu cũ (`inventory`,
`warehouse_exports`, `invoices`) chỉ đọc, giữ để đối soát ở lượt 7.

## Việc cần trước lượt 7

Người dùng cần chốt **D09** trước khi bắt đầu:
- ngày chuyển đổi;
- số dư đầu kỳ tiền, công nợ và kho NVL/thành phẩm;
- hàng còn giao/nhận;
- cách xử lý hóa đơn và tồn cũ chưa đối soát;
- mã hàng thật cùng hệ số quy đổi thực tế (D02f).

Khi được phép triển khai:
1. Deploy web, toàn bộ API (`api/**`) và `firestore.rules` **cùng một phiên bản**.
2. Biến Firebase Admin chỉ đặt ở môi trường server, không đưa vào `VITE_*`.

## Giới hạn hiện tại

- Một kho NVL và một kho thành phẩm; chưa có lô/cuộn/vị trí, giữ chỗ NVL hay khóa chất lượng.
- Chưa có giá vốn, sổ cái, tích hợp thuế/ngân hàng, hay tự gửi cảnh báo nền.
- Chưa đọc `.xlsx` trực tiếp; danh mục nhập bằng CSV UTF-8.
- Dòng PO/LSX cũ thiếu ID liên kết theo vị trí + dấu nội dung; chưa backfill ID.
