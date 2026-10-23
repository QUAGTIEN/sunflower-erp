# Bàn giao triển khai kế toán

## Kế hoạch hiện hành

7 lượt theo `ACCOUNTING_SPEC.md`. Bản Word 27 trang ban đầu chia 14 lượt; phần chia lượt đó đã được người dùng thay bằng 7 lượt. Không tiếp tục dùng số L01–L14 cũ như 14 phiên triển khai riêng.

| Lượt | Phạm vi | Trạng thái |
|---|---|---|
| 1 | Danh mục, ĐVT, nhập CSV, liên kết dữ liệu cũ | Hoàn thành mã nguồn; kết quả Git theo bàn giao cuối lượt |
| 2 | Kế toán lập LSX và mẫu in công ty | Hoàn thành mã nguồn; chưa nghiệm thu bản in trên trình duyệt/máy in |
| 3 | Kho NVL, nhập mua, cấp/hoàn | Hoàn thành mã nguồn; chưa deploy/đối soát tồn đầu kỳ thật |
| 4 | Thành phẩm, giao và trả hàng | Hoàn thành mã nguồn; chưa deploy/đối soát dữ liệu thật |
| 5 | Công nợ và thu chi | Hoàn thành mã nguồn; chưa deploy/chuyển số dư thật |
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

## Đợt đồng bộ giao diện trước lượt 3 — ngày 22/10/2026

Mốc đầu đợt: `9834a18`. Đây là chỉnh giao diện riêng theo yêu cầu người dùng, **chưa bắt đầu nghiệp vụ lượt 3**.

- Sản xuất, Mua hàng, Vật liệu, Kế toán và component Danh mục hàng dùng chế độ bảng một dòng, có nội dung đầy đủ khi rê chuột; giữ chế độ chữ thích ứng của các phân hệ khác. Chữ dài không tràn ô, số liệu căn phải, trạng thái chuyển sang chữ thuần.
- Thao tác từng dòng dùng menu chữ `…`; Kế toán giữ nguyên chức năng và điều kiện quyền của Chi tiết/Sửa/Xóa/Thu nợ/Trả tiền/Sửa chi phí/In phiếu. Bổ sung phân trang chung cho hai bảng Kế toán.
- Đồng bộ nút tìm kiếm/lọc/tùy chỉnh cột/đóng/sửa, thanh lọc Vật liệu và các bảng liên quan. Menu thao tác có giới hạn kích thước theo màn hình và cuộn khi danh sách dài. Mẫu in LSX không thay đổi.
- Không sửa API, rules, cấu trúc dữ liệu, công thức, hàm ghi nghiệp vụ hoặc dữ liệu Firebase thật. Lỗi tải Danh mục hàng do kết nối/rules vẫn cần kiểm tra riêng, không được coi là đã giải quyết bằng chỉnh UI.
- Build đạt; **137/137 test đạt**, gồm 8 test mới tại `tests/operational-ui.test.cjs` và bộ hồi quy lượt 2. Test thao tác thực qua JSX/hàm xử lý, mô phỏng vị trí menu và chính sách một dòng; không mở trình duyệt.
- Lint các component/hook chỉnh sửa đạt. Baseline trang cũ không tăng: ProductionPage 11 lỗi; PurchasePage 0; InventoryPage 12 lỗi/1 cảnh báo; AccountingPage 17 lỗi.
- Chưa kiểm tra bố cục trên trình duyệt/máy in và chưa xác nhận deploy web/Firebase. Commit kết quả tra Git và bàn giao cuối đợt.

## Điều chỉnh giao diện tiếp theo — ngày 22/10/2026

Mốc đầu đợt: `d785d13`. Người dùng chốt **giữ Báo cáo lãi gộp đơn hàng, chỉ bỏ biểu đồ**, thay cho yêu cầu bỏ cả tab đã nêu trước đó.

- Bốn phân hệ Sản xuất/Mua hàng/Vật liệu/Kế toán và Danh mục hàng dùng đúng nút ba chấm mặc định của RowActionMenu như Đơn hàng/Khách hàng. Bỏ biến thể ký tự `…` và CSS kích thước riêng; giữ nguyên menu, quyền và cách xử lý.
- Bỏ số đếm sau tên tab trên toàn bộ nơi tìm thấy, gồm tab chính, tab hồ sơ/phân loại, thư mục tài liệu, dữ liệu thô và cấu hình trường. Rà soát mã nguồn 48 nút tab không còn biểu thức số đếm. Số liệu báo cáo, thẻ tổng hợp, tiến độ và phân trang giữ nguyên.
- Kế toán bỏ biểu đồ Top 5 cùng phần chuẩn bị dữ liệu chỉ phục vụ biểu đồ; bảng lãi gộp, tính toán, phân trang, sửa chi phí và in phiếu được giữ lại.
- Build đạt; **142/142 test liên quan đạt**. Lint phần sạch đạt; so sánh các trang cũ với mốc đầu đợt không thêm lỗi/cảnh báo (Accounting 17; Sales 36; Crm 115; Leads 4 lỗi/1 cảnh báo).
- Không đổi API/rules, dữ liệu thật hoặc bắt đầu nghiệp vụ lượt 3. Chưa kiểm thử trình duyệt hay xác nhận triển khai web/Firebase; kết quả push ghi trong bàn giao cuối đợt.

## Đầu lượt 3

Các mục dưới đây là checklist đầu lượt; kết quả đã thực hiện ghi ở phần Kết quả lượt 3 sau checklist.

1. Kiểm tra Git, đọc quy tắc dự án và ba tài liệu ACCOUNTING cùng PRODUCTION_ORDERS. Dùng mốc cuối lượt 2, không triển khai lại quyền/mẫu.
2. Xác nhận D02f/D03/D04/D05b: số kho, lô/cuộn/vị trí, giữ chỗ/khóa chất lượng, ngưỡng tồn, cảnh báo hay chặn âm, quyền ghi sổ/đảo và lùi ngày. Không dùng dữ liệu mẫu để thay đầu vào thực tế.
3. Đọc luồng inventory, warehouse_exports, procurement/purchase_orders và các hàm ghi tồn thực tế. Thiết lập **một nguồn ghi sổ kho**; tránh chạy song song cộng/trừ tồn cũ và mới.
4. Triển khai nhận mua, cấp nhiều lần/hoàn/cấp bổ sung theo LSX và lịch sử; transaction có chống trùng, revision, kiểm tra mã/quy đổi và tồn. Không suy hệ số cuộn/mét hoặc cấp theo vật tư dự kiến mà không có phiếu thực tế.
5. Kiểm tra nguồn liên kết trước hạch toán, đối soát các dòng LSX cũ/chưa liên kết; không thay snapshot lệnh đã phát hành bằng danh mục hiện tại. Chưa nhập đầu kỳ thật trước khi được xác nhận.
6. Chưa đưa thành phẩm/giao hàng/công nợ vào lượt 3 ngoài điểm nối đã thống nhất. Xem D06 nếu nối nhận mua với tiền; không tự chọn mốc tăng nợ.
7. Build/test/lint theo phạm vi, cập nhật tài liệu, commit đúng file và push origin/main; không tự kiểm thử trình duyệt/deploy dữ liệu thật.

## Kết quả lượt 3 — ngày 23/10/2026

Mốc đầu lượt `2235742`, main, origin GitHub đã đối chiếu. Phạm vi/luồng/collection và hạn chế chi tiết tại `WAREHOUSE.md`; quyết định trực tiếp đã cập nhật trong `ACCOUNTING_DECISIONS.md`.

- Sổ số lượng NVL một kho chung, nhập mua từng phần, cấp nhiều lần/bổ sung, hoàn theo lượng cấp ròng và đảo phiếu. Mã/quy đổi từ danh mục xác thực trên máy chủ; không ghép vật tư theo tên hoặc tin snapshot ở đơn mua do client tạo.
- Một nguồn ghi transaction cho số dư/phiếu/trạng thái nhận/audit/biên nhận; chống trùng và stale revision/đua đồng thời. Mất phản hồi giữ nguyên yêu cầu để gửi lại, chưa có xác nhận không báo thành công. Cảnh báo/xác nhận xuất âm có lý do, không ghi lùi/ngày tương lai.
- Quyền đúng quyết định: Admin, Mua hàng Inventory, Kế toán Accounting ghi; chỉ Admin đảo. Producer có Production chỉ đọc. Kế toán Accounting vào Vật liệu theo quyền hiệu lực, không ghi lại hồ sơ users.
- Vật liệu: số dư/ngưỡng/lịch sử/báo cáo theo kỳ/danh mục/dữ liệu cũ chỉ đọc. Mua hàng NVL mở phiếu thực nhận dùng chung; không chạy cộng kho theo tên hoặc tự tạo payable. Chi tiết LSX có cấp/hoàn thực tế, chặn hủy khi còn NVL cấp ròng. Dashboard đọc số dư mới theo quyền, không trộn tồn cũ.
- Giữ `inventory`, `warehouse_exports`, hóa đơn và LSX cũ; chặn client ghi tồn cũ. Đơn NVL cũ đã received không ghi nhận lại. Nguồn mua NVL đã phát hành không sửa/xóa nhận hàng ngoài API. Đồng bộ yêu cầu mua giữ trạng thái nhận một phần, không tự hủy nó khi đối chiếu PO.
- Chưa chuyển tồn đầu kỳ thật hoặc nhập dữ liệu Firebase thật. Không có giữ chỗ NVL/khóa chất lượng, nhiều kho/lô/cuộn/vị trí, thành phẩm/giao/trả hoặc công nợ mới. Nhận mua khác NVL vẫn giữ luồng cũ; kết nối tiền thực hiện lượt 5.

### Kiểm tra lượt 3

Build TypeScript client/server và Vite đạt, còn cảnh báo chunk lớn hiện có. Lint mã TypeScript mới/thay đổi ngoài AppShell đạt 0 lỗi/cảnh báo; AppShell giữ baseline 10 lỗi/0 cảnh báo, không thêm chẩn đoán mới. Không dọn lỗi cũ ngoài phạm vi.

**76/76 test trực tiếp đạt**: warehouse 26, production-orders 40, operational-ui 10. Kiểm tra gồm sai số thập phân ở preview, nguồn mua có snapshot giả, nhận NVL không ghi tiền, ghi đồng thời/gửi lại và khóa hủy khi còn NVL cấp.

Chạy rộng toàn bộ bộ test để rà soát còn 2 lỗi có sẵn tại `lead-workspace-tabs.test.cjs` (regex chuẩn bị danh sách không khớp mã hiện tại) và `raw-data-overview.test.cjs` (loader thiếu require cho import model). Đã đối chiếu test và nguồn liên quan với HEAD đầu lượt; chúng không đổi, lỗi cũng tái hiện trên nội dung HEAD. Lượt chạy rộng đạt 255/257; sau đó thêm 1 test preview thập phân và chạy lại bộ trực tiếp 76/76. Không sửa các phân hệ này trong lượt kho.

Test giao dịch dùng mô phỏng có retry/version; rules kiểm tra hợp đồng tĩnh, chưa chạy emulator. Chưa mở trình duyệt, thử máy in, deploy Vercel/rules hoặc chuyển dữ liệu thật. Cần triển khai web + API + rules cùng phiên bản; push Git không xác nhận đã triển khai.

### Bắt đầu lượt 4

1. Đọc lại các quyết định và `WAREHOUSE.md`; giữ một nguồn ghi, không khôi phục handler tồn cũ.
2. Chốt D08: thời điểm trừ kho giao khách, hàng đi đường, giao thất bại, trả/giao bù và dung sai. Cần mã thành phẩm/quy đổi rõ, không đoán từ mã khách.
3. Nhập thành phẩm từ QC theo lượng đạt có thật; QC không tự ghi kho. Giao/trả từng phần có chống trùng, không vượt lượng nguồn hợp lệ, có đảo/audit và bảo toàn chuyến/phiếu cũ.
4. Chưa nối tiền hoặc tự nhập đầu kỳ thật. Công nợ nối lượt 5; ngày chuyển đổi/đầu kỳ và triển khai/nghiệm thu ở lượt 7 theo xác nhận riêng.


## Kết quả lượt 4 — ngày 23/10/2026

Mốc đầu lượt 54b09f8, main/origin đã kiểm tra. Người dùng xác nhận cả nhập kho công ty và NCC giao thẳng ngay lượt 4, giữ quyền ghi kho, Giao hàng POD, Admin đảo/đóng thiếu có lý do và khách chấp nhận. Chi tiết tại FINISHED_GOODS.md.

- Sổ số lượng thành phẩm riêng; nhập từng phần từ QC LSX v2 và hàng mua/gia công. Xuất giảm kho/tăng đang giao; POD từng dòng không trừ lần hai. Giao thất bại, khách trả/giao bù, tuyến NCC giao thẳng và hoàn về NCC/công ty; chặn âm thành phẩm.
- Cùng transaction ghi số dư, phiếu, nguồn, PO/chuyến/xe, request/counter và audit. Kiểm tra snapshot, cap/revision, idempotency/đồng thời, quyền. Admin đảo chứng từ, không sửa/xóa phiếu; đóng thiếu không tăng lượng đã giao.
- Vật liệu có tab Thành phẩm; Sản xuất có lịch sử nhập theo LSX; Mua hàng mở phiếu số lượng; Giao hàng có hàng giao/POD, dùng API trạng thái chuyến, không còn cộng qtyDelivered trực tiếp. Bỏ tự tạo payable khi nhận mua không phải NVL, giữ hóa đơn cũ để nối lượt 5.
- Rules khóa nguồn mua, PO/chuyến đã vào sổ và xe đang gắn chuyến; collection sổ chỉ ghi qua máy chủ. Đơn mua thêm cho PO đã vào sổ lưu giá/NCC ở đơn/yêu cầu mua, không ghi lại PO.items đã khóa.
- Không nhập/chuyển dữ liệu thật, đầu kỳ, giá vốn hoặc công nợ mới. PO/đơn mua đã nhận theo luồng cũ cần đối soát, không tự ghi lại. Trả hàng chưa có xử lý chất lượng/cách ly hay tiền.

### Kiểm tra lượt 4

Kết quả cuối lượt ghi trong bàn giao Git/chat và phần cập nhật bên dưới. Không kiểm thử trình duyệt, máy in, Firestore emulator hoặc deploy Vercel/rules; chưa ghi dữ liệu Firebase thật. Push Git khác triển khai môi trường thật. Cần web/API/rules cùng phiên bản.

### Lượt 5 tiếp theo

Chốt mốc tăng nợ mua/bán, hạn nợ/kỳ/thuế/làm tròn, quyền ghi/đảo tiền và khóa kỳ; phân bổ thu chi/ứng trước theo chứng từ/đơn/mã. Nối từ ID chứng từ kho/giao thực tế, hỗ trợ điều chỉnh tiền hàng trả theo quyết định được duyệt; không suy lịch sử tiền từ số lượng hoặc tự chuyển hóa đơn cũ thành sổ mới. Lượt 6 báo cáo/cảnh báo, lượt 7 chuyển đổi/triển khai/nghiệm thu theo kế hoạch 7 lượt đã chốt.


### Kết quả kiểm tra cuối lượt 4

- Build TypeScript client/server + Vite đạt; còn cảnh báo chunk lớn hiện có.
- 104/104 test trực tiếp đạt: finished-goods 28, warehouse 26, production-orders 40, operational-ui 10. Có kiểm tra API xác thực, retry payload bất biến, preview tồn và khung ký; không mở trình duyệt.
- Lượt chạy rộng toàn bộ test đạt 282/284, còn đúng 2 lỗi đã có ở lead-workspace-tabs (regex không khớp mã hiện tại) và raw-data-overview (loader thiếu require). Sau đó bổ sung 1 test biên API và 1 test tích hợp giao từng phần–sản xuất, chạy lại bộ trực tiếp 104/104. Các nguồn/test của 2 lỗi cũ không thay đổi trong lượt này.
- Lint phần mới và phần đã sạch đạt 0 lỗi/cảnh báo. AppShell giữ 10 lỗi cũ; DeliveryPage giảm từ 26 xuống 14 lỗi cũ, không thêm loại/chẩn đoán mới khi đối chiếu HEAD đầu lượt và chuẩn hóa vị trí dòng. Không dọn lỗi ngoài phạm vi.
- Test transaction mô phỏng có retry/version, rules kiểm tra tĩnh; chưa có nghiệm thu emulator/Firebase/trình duyệt thật. Chưa deploy, chưa nhập đầu kỳ hoặc tác động dữ liệu thật.

Giao từng phần giữ PO còn sản xuất ở waiting_production để lập/phát hành phần LSX còn lại. Khi QC phần cuối chuyển chờ giao, API LSX giữ tiến độ giao thực tế đã có, không đặt lại pending. Kiểm thử tích hợp gọi hai API trên cùng kho dữ liệu mô phỏng.


## Kết quả lượt 5 — ngày 23/10/2026

Mốc đầu lượt cc04ef8, main/origin đã đối chiếu. Đã đọc lại quy tắc, skill UI, chuẩn CSS, luồng thực tế Accounting/Sale/Dashboard/Mua hàng, sổ kho và rules. Ba câu trả lời trực tiếp của người dùng: Kế toán xác nhận tăng nợ; VND/đơn giá chưa thuế/thuế nhập theo chứng từ/làm tròn đồng/hạn riêng/phân bổ tới dòng mã; Admin/Kế toán Accounting ghi, chỉ Admin đảo và khóa/mở kỳ, không ghi lùi ngày.

- Sổ mới cho phải thu/phải trả, đầu kỳ và ứng trước đầu kỳ, thu/chi, phân bổ nhiều dòng/chứng từ, hoàn tiền chưa dùng, điều chỉnh tăng/giảm và hàng trả. Ngày/tiền/nguồn/quyền/giới hạn lấy lại tại API, không tin tổng tiền client.
- Một nguồn ghi transaction cho docs/funds/entries/source-state/PO/bản chiếu/audit/request, revision chung, idempotency và tham chiếu chống trùng. Không giảm nợ vượt phần chưa phân bổ; Admin đảo phụ thuộc trước, kể cả điều chỉnh bù nhau về 0.
- UI thay CRUD hóa đơn và nhập paidAmount bằng form chứng từ; vẫn giữ bảng lãi gộp cũ, không thêm biểu đồ. Dữ liệu cũ chỉ đọc. Nguồn đã có hóa đơn cũ cần đối soát, không tự lập lại; không nhập đầu kỳ thật hoặc dựng tiền từ số đã trả cũ.
- Kho/POD thuần số lượng, không tạo nợ tự động. Hai API kho chặn đảo nguồn đã vào tiền cho tới khi đảo tiền liên quan; Sale/Dashboard bỏ tự tạo invoice khi đổi hàng đợi. Rules đóng ghi client vào invoices/sổ, bảo vệ metadata và đối tác có lịch sử tài chính. Mua hàng không ghi lại PO.items đã vào sổ.
- Chứng từ charge mới có bản chiếu invoices phục vụ nơi đọc cũ; đầu kỳ không có bản chiếu để tránh cộng trùng lịch sử. CRM/NCC/Dashboard chưa phải bộ báo cáo đối soát mới, cần thống nhất ở lượt 6; số mới chính thức xem tại Kế toán.
- Đối tác ngừng dùng còn công nợ/tiền vẫn hiển thị và được tất toán, không ghi nợ mới. Chặn xóa cứng hồ sơ đã có phát sinh. Không thay users hoặc mở quyền tiền cho Sale/Mua hàng.

Chi tiết luồng, collection, giới hạn, kiểm tra và triển khai tại ACCOUNTING_LEDGER.md. Cần web + API kế toán + API kho có guard + rules cùng phiên bản. Chưa deploy, trình duyệt/emulator, chuyển dữ liệu hoặc ghi Firebase thật. Push Git khác triển khai.

Lượt tiếp theo là lượt 6: báo cáo tháng đầu/phát sinh/cuối, công nợ/hàng còn thực hiện theo đơn/mã, hạn/tuổi nợ và cảnh báo tồn; không thực hiện chuyển đổi đầu kỳ thật trước lượt 7.


### Kiểm tra cuối lượt 5

- Build TypeScript client/server và Vite đạt; còn cảnh báo chunk lớn hiện có.
- 30 kiểm thử mới tại accounting-ledger đạt; bộ rộng toàn dự án đạt 314/316, chỉ còn 2 lỗi baseline không thuộc lượt này: lead-workspace-tabs (regex requestAnimationFrame) và raw-data-overview (loader thiếu require). 2 test operational-ui cũ được thay bằng hợp đồng sổ tiền/khóa quyền mới; kiểm thử handler phân bổ và retry thực nằm trong bộ kế toán.
- Lint phần mới, API/server, sổ kho và phần sạch thay đổi đạt 0 lỗi/cảnh báo. Trang Accounting giảm từ 17 xuống 5 lỗi any có sẵn, Sales giữ 36, Dashboard giữ 8; không thêm chẩn đoán khi so HEAD đầu lượt. RecycleBin/Purchase đạt lint.
- Rà soát diff rules đã khôi phục đoạn không thuộc kế toán bị mất trong lúc biên tập, thêm test giữ mọi collection guard có sẵn. Chưa chạy rules emulator hoặc trình duyệt; test rules tĩnh không phải xác nhận đã triển khai.
- Không ghi Firebase thật, không nhập đầu kỳ, không deploy web/API/rules. Chỉ commit các file công việc; giữ nguyên mục riêng của người dùng. Kết quả commit/push xem Git và bàn giao cuối chat.
