# Bàn giao triển khai kế toán

## Kế hoạch hiện hành

7 lượt theo `ACCOUNTING_SPEC.md`. Bản Word 27 trang ban đầu chia 14 lượt; phần chia lượt đó đã được người dùng thay bằng 7 lượt. Không tiếp tục dùng số L01–L14 cũ như 14 phiên triển khai riêng.

| Lượt | Phạm vi | Trạng thái |
|---|---|---|
| 1 | Danh mục, ĐVT, nhập CSV, liên kết dữ liệu cũ | Hoàn thành mã nguồn; kết quả Git theo bàn giao cuối lượt |
| 2 | Kế toán lập LSX và mẫu in công ty | Chưa thực hiện |
| 3 | Kho NVL, nhập mua, cấp/hoàn | Chưa thực hiện |
| 4 | Thành phẩm, giao và trả hàng | Chưa thực hiện |
| 5 | Công nợ và thu chi | Chưa thực hiện |
| 6 | Báo cáo, hàng còn thực hiện và cảnh báo | Chưa thực hiện |
| 7 | Chuyển đổi, triển khai và nghiệm thu | Chưa thực hiện |

## Mốc đầu lượt 1

- Repository: `C:\Users\pham quang tien\Downloads\sunflower\sunflower`.
- Nhánh `main`, remote `origin` = `https://github.com/QUAGTIEN/sunflower-erp.git`.
- HEAD trước lượt: `c2f06b8`. Commit kết quả tra bằng `git log --oneline -- docs/ACCOUNTING_IMPLEMENTATION_STATUS.md` và bàn giao trong chat.
- Các mục có sẵn thuộc người dùng: `.agents/`, `AGENTS.md`, `docs/CODEBASE_MAP.md`, `docs/PROJECT_OVERVIEW.md`, `graphify-out/`, `skills-lock.json`. Không stage/commit những mục này.

## Phần đã làm trong lượt 1

- Danh mục hàng nội bộ cho NVL, thành phẩm, hàng mua bán lại; tạo/cập nhật/ngừng dùng, tìm/lọc, ĐVT và quy đổi theo mã.
- Dùng chung màn hình trong Kế toán và Vật liệu, giữ các tab/chức năng cũ.
- CSV UTF-8 có mẫu, xem trước lỗi từng dòng, chặn mã trùng, 50 dòng/đợt, không ghi dở dang, có lịch sử đợt nhập.
- Liên kết có xác nhận từ inventory, customers.products và pos.items; không tự ghép theo tên/mã, không ghi đè nguồn. Dấu thay đổi, phiên bản và audit trước/sau bảo vệ khi đối chiếu lại.
- `POST /api/catalog/manage`: xác thực tài khoản thật, transaction, mã yêu cầu chống trùng và revision chống ghi đè.
- Tách xác thực dùng chung sang `server/erpCaller.ts`; API LSX vẫn xuất cùng tên `requireProductionCaller` để giữ hợp đồng cũ.
- Cảnh báo nhập liệu chưa lưu khi rời phân hệ/tab hoặc đóng trang; chặn rời lúc đang lưu. Dùng cơ chế guard nhỏ, không đổi kiến trúc điều hướng.
- Rules cho 3 collection mới chỉ đọc đúng quyền, mọi ghi client bị chặn.

## Kiểm tra

Kết quả lượt 1 ngày 22/10/2026: **118/118 test đạt**, build đạt, lint phần mới/server đạt. Baseline giữ nguyên: AppShell 10 lỗi; AccountingPage 17 lỗi; InventoryPage 12 lỗi/1 cảnh báo; không thêm lỗi hoặc cảnh báo ở các file này.

- `npm run build`: TypeScript client/server và Vite. Cảnh báo chunk lớn là cảnh báo hiện có, không thêm dependency để xử lý ngoài phạm vi.
- `node --test tests/item-catalog.test.cjs`: model, CSV, đơn vị, transaction retry/đồng thời, liên kết, bảo toàn nguồn, auth, client lỗi mạng, handler form thật, navigation guard. Kiểm tra rules trong test này là **hợp đồng tĩnh**, không thay thế chạy rules emulator.
- Hồi quy: production-orders, customer-product-catalog, customer-product-order-sync, po-manual-entry, table-viewport-layout, mutation-feedback và field-configuration.
- Lint phần mới và server LSX; với AppShell, AccountingPage, InventoryPage so sánh với HEAD đầu lượt, không đòi dọn toàn bộ lỗi cũ trong lượt này.
- Chưa kiểm thử trình duyệt theo yêu cầu người dùng. Chưa kiểm tra máy in hoặc dữ liệu thật. Kết quả cuối cùng và số test ghi tại bàn giao chat cuối lượt.

## Triển khai và dữ liệu thật

Chưa xác nhận deploy API/web hoặc `firestore.rules` trong lượt này. Push Git không thay cho xác nhận deploy. **Chưa nhập hoặc sửa dữ liệu Firebase thật.** Không thay số tồn, đầu kỳ tiền hoặc nợ bằng thao tác danh mục.

Khi triển khai được cho phép: deploy ứng dụng và API `/api/catalog/manage` cùng rules. API dùng biến Firebase Admin hiện có; không đưa khóa vào `VITE_*`, không in môi trường. Local cần Vercel dev; Vite đơn thuần không phục vụ API. Rules cũ chưa có collection mới sẽ từ chối tải danh mục: không đổi sang lưu local để che lỗi.

## Giới hạn phải nhớ

- Không đọc `.xlsx` trực tiếp; lưu CSV UTF-8 để nhập. CSV tạo danh mục, không tạo tồn/nợ hoặc tự liên kết nguồn.
- Đầu vào mã thật/hệ số thật chưa được cung cấp; người dùng xem trước và xác nhận khi nạp. Tệp mẫu là ví dụ.
- Liên kết dòng cũ thiếu ID dùng vị trí + dấu nội dung; chưa backfill ID cho PO/LSX cũ. Lượt kho phải xác thực lại nguồn; không dùng liên kết stale/inactive.
- Đổi kỹ thuật sản phẩm nguồn làm liên kết cần đối chiếu lại. Thay đổi tên danh mục không sửa lịch sử đơn/lệnh.
- Chưa nối toàn bộ bộ chọn PO/LSX vào danh mục nội bộ; hiện bảo toàn bộ chọn sản phẩm khách và dòng nhập tay. Các bộ phận tra cứu/đối chiếu mã qua màn hình liên kết; không tự tạo snapshot nội bộ vào chứng từ cũ.
- Kho thủ công, nhận mua và cộng paid hiện hữu vẫn chạy theo luồng cũ. Chưa có sổ kho/công nợ mới; chỉ được thay ở các lượt 3–5 với một nguồn ghi duy nhất.

## Đầu lượt 2

1. Kiểm tra Git thực tế và đọc các quy tắc, SPEC, DECISIONS, STATUS cùng `docs/PRODUCTION_ORDERS.md`.
2. Đọc luồng quyền tại `src/app/navigation/accessControl.ts`, `server/adminUsers.ts`, model productionOrder, API/server productionOrders và rules.
3. Tách quyền lập/sửa nháp/gửi duyệt của Kế toán khỏi quyền phát hành, chạy máy, QC và quản lý máy. Sale vẫn bị chặn cả UI/API.
4. Thu thập mẫu thật để chốt ánh xạ và phiên bản biểu mẫu; chưa có thì triển khai phần quyền độc lập và báo rõ phần mẫu còn chờ.
5. Không đưa cấp/hoàn vật tư hoặc công nợ vào lượt 2. Giữ snapshot lệnh phát hành, phân bổ PO, version check và bảo toàn mã cũ.
6. Dùng lại danh mục/liên kết của lượt 1 khi cần; không tự cập nhật PO đóng băng từ danh mục mới.
7. Build, test liên quan, cập nhật bàn giao, commit đúng file và push origin/main. Không tự kiểm thử trình duyệt hay deploy dữ liệu thật.
