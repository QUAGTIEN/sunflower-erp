# Bàn giao triển khai kế toán

## Kế hoạch hiện hành

7 lượt theo `ACCOUNTING_SPEC.md`. Bản Word 27 trang ban đầu chia 14 lượt; phần chia lượt đó đã được người dùng thay bằng 7 lượt. Không tiếp tục dùng số L01–L14 cũ như 14 phiên triển khai riêng.

| Lượt | Phạm vi | Trạng thái |
|---|---|---|
| 1 | Danh mục, ĐVT, nhập CSV, liên kết dữ liệu cũ | Hoàn thành mã nguồn; kết quả Git theo bàn giao cuối lượt |
| 2 | Kế toán lập LSX và mẫu in công ty | Hoàn thành mã nguồn; chưa nghiệm thu bản in trên trình duyệt/máy in |
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
- Lượt 1 chưa nối bộ chọn LSX; lượt 2 đã bổ sung tra cứu/liên kết và snapshot cho lệnh tạo/sửa mới (bên dưới). Bộ chọn sản phẩm PO và dòng nhập tay được bảo toàn, không tự backfill chứng từ cũ.
- Kho thủ công, nhận mua và cộng paid hiện hữu vẫn chạy theo luồng cũ. Chưa có sổ kho/công nợ mới; chỉ được thay ở các lượt 3–5 với một nguồn ghi duy nhất.

## Kết quả lượt 2 — ngày 22/10/2026

Mốc đầu lượt: `1d9ceb3`, nhánh main, origin GitHub giữ nguyên. Commit kết quả tra qua `git log --oneline -- docs/ACCOUNTING_IMPLEMENTATION_STATUS.md` và bàn giao trong chat.

- Kế toán được tạo, sửa/gửi duyệt nháp của mình, xem/in LSX tại Sản xuất. Accounting kế thừa quyền này cho hồ sơ cũ, không ghi lại users. Không mở quyền phát hành, hủy, chạy máy, QC, lệnh cũ hay quản lý máy; Sale bị chặn.
- Nhận ảnh mẫu LSX tem trắng thực tế từ người dùng. Thêm lựa chọn mẫu tem trắng v1, giữ phiếu chung v1 và lệnh cũ. Bổ sung khổ NVL, ưu tiên dòng, snapshot mã khách; ô kho cấp/thừa thiếu/chữ ký vẫn trống.
- API tra cứu danh mục chỉ đọc trong luồng LSX. Chọn mã NVL hoạt động và ĐVT có quy đổi rõ; mã/tên lấy lại từ máy chủ. Dòng hàng lấy liên kết PO đã xác nhận hoặc liên kết sản phẩm khách có đúng ID/phiên bản/kỹ thuật. Không ghép theo tên/mã.
- Chụp mã nội bộ/quy đổi/revision trên lệnh. Chặn stale/inactive và thay đổi danh mục trước phát hành; không sửa lệnh đã phát hành từ danh mục hiện tại. Dòng chưa liên kết vẫn theo luồng cũ, cần đối soát trước hạch toán kho.
- Form có trạng thái tải/lỗi/thử lại danh mục, trường mã/tên NVL đã chọn chỉ đọc; cảnh báo khi bỏ nháp/rời phân hệ/tab và chặn rời lúc đang lưu. Mở máy ở chế độ đọc không khởi tạo dữ liệu máy.
- Không thêm dependency, không sửa rules, không ghi dữ liệu Firebase thật hoặc tác động số tồn/công nợ.

### Kiểm tra lượt 2

- **129/129 test đạt**: production-orders (39), item-catalog (27), customer-product-catalog, customer-product-order-sync, po-manual-entry, table-viewport-layout, mutation-feedback, field-configuration.
- Build TypeScript client/server và Vite đạt; còn cảnh báo chunk lớn hiện có.
- Lint phần server/model/API/component LSX mới và UserManagementPage đạt (0 lỗi/cảnh báo). ProductionPage giữ baseline 11 lỗi/0 cảnh báo, không thêm lỗi/cảnh báo so với HEAD đầu lượt.
- Test mô phỏng transaction kiểm tra quyền, chống trùng/đồng thời, snapshot, liên kết, quy đổi và bảo toàn tồn. Test HTML kiểm tra trường mẫu, escape, dữ liệu dài, chia trang và lệnh cũ. Không thay thế kiểm thử giao diện thực tế.
- Chưa mở trình duyệt theo yêu cầu người dùng; chưa nghiệm thu PDF/máy in thật. Bố cục mẫu cần kiểm tra thực tế khi được yêu cầu.
- Chưa xác nhận deploy Vercel hoặc rules Firebase. Lượt 2 cần deploy web/API mới; rules giữ nguyên lượt 1, vẫn phải kiểm tra môi trường thật đã triển khai các rules trước đó. Push Git không phải xác nhận deploy.

## Đầu lượt 3

1. Kiểm tra Git, đọc quy tắc dự án và ba tài liệu ACCOUNTING cùng PRODUCTION_ORDERS. Dùng mốc cuối lượt 2, không triển khai lại quyền/mẫu.
2. Xác nhận D02f/D03/D04/D05b: số kho, lô/cuộn/vị trí, giữ chỗ/khóa chất lượng, ngưỡng tồn, cảnh báo hay chặn âm, quyền ghi sổ/đảo và lùi ngày. Không dùng dữ liệu mẫu để thay đầu vào thực tế.
3. Đọc luồng inventory, warehouse_exports, procurement/purchase_orders và các hàm ghi tồn thực tế. Thiết lập **một nguồn ghi sổ kho**; tránh chạy song song cộng/trừ tồn cũ và mới.
4. Triển khai nhận mua, cấp nhiều lần/hoàn/cấp bổ sung theo LSX và lịch sử; transaction có chống trùng, revision, kiểm tra mã/quy đổi và tồn. Không suy hệ số cuộn/mét hoặc cấp theo vật tư dự kiến mà không có phiếu thực tế.
5. Kiểm tra nguồn liên kết trước hạch toán, đối soát các dòng LSX cũ/chưa liên kết; không thay snapshot lệnh đã phát hành bằng danh mục hiện tại. Chưa nhập đầu kỳ thật trước khi được xác nhận.
6. Chưa đưa thành phẩm/giao hàng/công nợ vào lượt 3 ngoài điểm nối đã thống nhất. Xem D06 nếu nối nhận mua với tiền; không tự chọn mốc tăng nợ.
7. Build/test/lint theo phạm vi, cập nhật tài liệu, commit đúng file và push origin/main; không tự kiểm thử trình duyệt/deploy dữ liệu thật.
