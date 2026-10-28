# Kho NVL — lượt kế toán 3

Mốc đầu lượt: `2235742`, main, origin GitHub đã kiểm tra. Đây là mã nguồn cho sổ số lượng, chưa phải xác nhận triển khai hoặc đối soát số tồn thật.

## Quyết định đã được người dùng xác nhận

- Một kho NVL chung (`raw_main`), chưa theo lô/cuộn/vị trí.
- Xuất vượt tồn phải cảnh báo; người có quyền ghi sổ được xác nhận xuất âm kèm lý do.
- Admin, purchaser có `inventory`, accountant có `accounting` được ghi sổ. Producer có `production` và purchaser chỉ có `purchase` được đọc; không ghi sổ. Chỉ Admin được đảo.
- Ngày hạch toán là ngày hiện tại tại Việt Nam; không lùi hoặc chọn ngày tương lai.
- **Nhập mua NVL chỉ ghi số lượng**, không tự tạo hóa đơn phải trả. Tiền nối ở lượt 5. Hóa đơn cũ giữ nguyên. Nhận hàng mua thành phẩm/gia công vẫn theo luồng cũ tới lượt tương ứng.

## Luồng sử dụng

1. Chuẩn bị mã NVL trong Danh mục hàng và ĐVT/quy đổi có xác nhận theo từng mã. Không tự suy cuộn/mét/m².
2. Mua hàng phát hành đơn mua như hiện tại. Với NVL, thao tác **Nhập kho NVL** mở cùng form **Lập phiếu kho** tại Kho vật tư. Nhập thực nhận từng dòng, có thể nhận nhiều lần; không vượt phần đặt còn lại.
3. Lần nhận đầu chọn mã nội bộ và xác nhận ánh xạ từng dòng. Ánh xạ/quy đổi được giữ cho những lần sau. Không tìm vật tư bằng tên. Chứng từ nguồn thay đổi sau ghi kho bị chặn để đối soát.
4. LSX mới phiên bản 2 đã phát hành/đang chạy có thể cấp nhiều lần và cấp bổ sung; không giới hạn cấp bằng dự kiến vì đây là số thực tế. Phiếu chỉ ghi các dòng có số lượng nhập. Mã đã chốt trên LSX không được đổi.
5. Hoàn NVL nhiều lần theo cùng LSX, tổng hoàn không vượt lượng cấp ròng còn lại. Lệnh hoàn thành vẫn được hoàn NVL, không cấp thêm. Lệnh cũ phiên bản 1 cần đối soát riêng, không đoán vật tư theo sản phẩm.
6. Vật tư nhập tay trên LSX v2 được chọn mã/xác nhận rõ khi ghi kho lần đầu; ánh xạ nằm trong trạng thái kho, không sửa snapshot LSX đã phát hành. LSX có mã nhưng thiếu snapshot bị chặn để đối soát.
7. Form hiển thị quy đổi, tồn theo sổ trước/sau phiếu và kiểm tra lại trên máy chủ. Nếu làm âm tồn, bắt buộc chọn cho phép xuất âm và nhập lý do. Nội dung/lý do ghi phiếu bắt buộc.
8. Ghi sổ đồng thời tạo phiếu, cập nhật số dư, trạng thái nhận mua và audit. Nhận một phần/đủ hàng cập nhật đơn mua và yêu cầu mua tương ứng; PO chỉ đánh dấu đã nhận khi các yêu cầu liên quan đã nhận/hủy hết. Không đổi trạng thái sản xuất/giao hàng hoặc tạo công nợ.
9. Phiếu đã ghi không sửa/xóa. Admin đảo toàn bộ bằng phiếu đối dấu trong ngày hiện tại, bắt buộc lý do. Phiếu gốc được gắn liên kết phiếu đảo; phiếu đảo không đảo tiếp, phiếu gốc không đảo hai lần. Đảo phiếu cấp bị chặn nếu làm lượng cấp ròng âm; cần đảo phiếu hoàn liên quan trước. Đảo nhập/hoàn gây tồn âm cũng phải xác nhận.
10. Không hủy LSX khi còn lượng NVL đã cấp ròng. Hoàn hết hoặc đảo phiếu cấp phù hợp trước. Kiểm tra này cùng transaction với hủy để tránh đua với phiếu cấp.

## Giao diện

- Kho vật tư (`inventory`): **Danh mục vật tư / Phiếu kho** (trong Phiếu kho có chế độ xem **Danh sách phiếu / Nhập xuất tồn**). Bảng một dòng, tìm/lọc qua `DataWorkspaceFilters`, phân trang và RowActionMenu chung. Không số đếm sau tên tab. Bấm dòng vật tư mở khung Thẻ vật tư bên phải.
- Theo dõi số dư và lịch sử từng mã, thiết lập ngưỡng tối thiểu theo ĐVT cơ sở. Dưới ngưỡng hiển thị Cần nhập hàng; tồn âm có chữ cảnh báo. Chưa cấu hình thì không tự điền ngưỡng giả.
- Báo cáo khoảng ngày: đầu kỳ là tổng phiếu trước ngày bắt đầu; nhập/xuất là tổng delta dương/âm trong kỳ; cuối = đầu + nhập − xuất. Tính cả phiếu gốc và phiếu đảo, không loại phiếu gốc đã đảo.
- Chi tiết LSX có lịch sử cấp/hoàn thực tế và thao tác đúng quyền; producer chỉ xem. Ngưỡng và cảnh báo bảng kho là phạm vi lượt 3; chưa có hệ thống nhắc hạn/tổng hợp lượt 6.
- Mở kho cho Kế toán có Accounting bằng quyền hiệu lực, không ghi lại hồ sơ users. Màn hình quản trị giải thích quyền kế thừa. Không thêm quyền cấp kho cho Sản xuất hoặc Sale.
- Mất kết nối sau gửi phiếu: form giữ nguyên toàn bộ yêu cầu và mã yêu cầu; khóa sửa dữ liệu, cho kiểm tra/gửi lại đúng yêu cầu để nhận biên nhận cũ. Nếu đóng khi chưa rõ kết quả, phải kiểm tra lịch sử trước khi lập phiếu khác.

## Dữ liệu và bảo toàn lịch sử

| Collection               | Vai trò                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `warehouse_balances`     | Mỗi mã NVL một số dư ĐVT cơ sở, revision, ngưỡng tối thiểu                                               |
| `warehouse_vouchers`     | Phiếu bất biến và các dòng snapshot số lượng gốc/cơ sở/hệ số, nguồn, người/ngày ghi, lý do, liên kết đảo |
| `warehouse_source_state` | Ánh xạ theo dòng nguồn, fingerprint, lượng đã nhận hoặc cấp ròng (ĐVT cơ sở), revision                   |
| `warehouse_requests`     | Biên nhận requestId + dấu nội dung/người thực hiện chống trùng                                           |
| `warehouse_counters`     | Số phiếu theo ngày Việt Nam, `KHO-YYYYMMDD-xxxx`                                                         |
| `audit_events`           | Dòng phiếu, lý do, dấu nguồn, người/thời gian; ngưỡng có trước/sau                                       |

`purchase_orders` có `warehouseReceiptRevision`, `warehouseReceivedComplete`, status nhận một phần/đủ, actualReceiveDate. `procurement_requests` nhận revision/status tương ứng khi còn liên kết đúng đơn mua.

`inventory` và `warehouse_exports` cũ giữ nguyên, chỉ đọc để đối soát. Gỡ đường điều chỉnh/cộng/trừ/xóa cũ trên màn hình và chặn ghi client bằng rules; nhập mua không chạy lại đường cộng kho theo tên. **Không tự lấy tồn cũ làm đầu kỳ, không nhập số giả hoặc backfill hóa đơn/LSX.** Đơn mua cũ đã received nhưng chưa có trạng thái kho mới không được ghi nhận lại.

Sổ mới khởi đầu từ các phiếu mới, chưa gồm tồn đầu kỳ thật; UI ghi rõ cơ sở này. Dashboard cảnh báo đọc số dư mới theo đúng quyền, không trộn tồn cũ. Cần đối soát/ngày chuyển đổi và phiếu đầu kỳ được xác nhận ở lượt 7 trước khi dùng làm tổng tồn vận hành chính thức. Không dùng xuất âm để thay quy trình chuyển đổi đầu kỳ.

Lượt 3 không có giữ chỗ NVL dự kiến, khóa chất lượng, giá vốn, lô/cuộn/vị trí hay hạch toán tiền. Lượng cấp ròng là số cấp trừ hoàn, chưa phải báo cáo giá thành/tiêu hao đã phân bổ. Mẫu in LSX tiếp tục giữ ô cấp/thừa thiếu/chữ ký trống để ghi theo chứng từ thực tế; in hoặc QC không tự ghi kho.

## API, an toàn và triển khai

`POST /api/warehouse/manage`: load/post/reverse/threshold. Xác thực token thật, kiểm tra thu hồi/khóa Auth và hồ sơ ERP hiện tại bằng `requireActiveErpCaller`. Không tin vai trò, hệ số, snapshot hoặc số tồn client. Tối đa 50 dòng/phiếu, payload 100 KB, lượng dương tối đa 6 số lẻ trong giới hạn tính toán an toàn; snapshot/delta giữ trên máy chủ.

Transaction kiểm tra source, trạng thái, ánh xạ/quy đổi, lượng còn lại, balance revision và requestId trước ghi. Tổng hợp nhiều dòng cùng mã trước kiểm tra âm. Phiếu, số dư, tiến độ, biên nhận, số phiếu và audit cùng ghi hoặc cùng không ghi. Trả lại biên nhận đã thành công cả khi ngày/nguồn đã đổi; không tạo tác động mới.

Phải triển khai **web + API mới + firestore.rules cùng phiên bản**. Rules đóng ghi client cho legacy/sổ mới và bảo vệ nguồn mua NVL khỏi sửa/xóa nhận hàng ngoài API; `warehouse_balances` chỉ đọc theo quyền để Dashboard cập nhật. Các collection còn lại của sổ chỉ đọc qua API. API dùng cấu hình Firebase Admin đã có; không thêm khóa phía client. Vite đơn thuần không phục vụ API, demo không ghi kho local.

Chưa deploy Vercel/Firebase, chưa kết nối dữ liệu thật, chưa nhập tồn đầu kỳ và chưa kiểm thử trình duyệt. Push Git không xác nhận các việc này.

## Kiểm tra và bàn giao tiếp

- `tests/warehouse.test.cjs`: quyền, nhận từng phần, cùng mã nhiều dòng, quy đổi, nguồn cũ, snapshot, xuất âm, return/reversal, chống trùng/đồng thời, ngày, ngưỡng, báo cáo, lỗi mạng và handler form thật.
- `tests/production-orders.test.cjs`: thêm kiểm tra hủy LSX không làm bỏ quên NVL đang cấp. `tests/operational-ui.test.cjs`: kho mới, nhận NVL không chạy ghi tiền/kho cũ, nhận mua khác giữ luồng hiện tại.
- Kiểm tra rules là hợp đồng tĩnh; chưa chạy Firestore emulator. Giao dịch test mô phỏng có retry/version, không thay thế nghiệm thu Firebase và trình duyệt thật.
- Lượt 4 nối sổ thành phẩm/giao/trả theo quyết định D08; giữ một nguồn ghi và không dùng lại các handler tồn cũ. Lượt 5 nối công nợ từ chứng từ mua có thật, không tự dựng lại nợ cho các phiếu kho lịch sử. Lượt 7 chốt chuyển đổi trước khi nhập đầu kỳ thật.

## Bổ sung lượt 4

Sổ thành phẩm/giao/trả đã có mã nguồn, xem FINISHED_GOODS.md. Collection số dư/phiếu dùng chung nhưng lọc kho rõ ràng: NVL raw_main, thành phẩm finished_main với ID số dư fg_<catalogItemId>. API load NVL và Dashboard chỉ đọc phần NVL; báo cáo thành phẩm không trộn hàng NCC giao thẳng/POD vào delta vật lý. Nhận mua mọi nhóm đã chuyển sang phiếu số lượng, không tự tạo payable; thay cho đoạn nhận mua khác còn luồng hiện tại ở bàn giao lượt 3 phía trên. Tiền nối lượt 5. Cần triển khai web/API/rules cùng phiên bản; chưa có đầu kỳ thật hoặc deploy trong lượt này.

## Điểm nối tiền ở lượt 5

Nhận hàng vẫn chỉ ghi lượng. Kế toán xác nhận chứng từ riêng để tăng nợ; xem ACCOUNTING_LEDGER.md. API kho NVL và thành phẩm đọc phụ thuộc finance_source_state trước đảo: phiếu đã dùng ghi nợ/điều chỉnh tiền phải đảo chứng từ tiền liên quan trước. Chưa triển khai dữ liệu thật; cần deploy API kho và kế toán cùng rules/web.

## Quyết định mở rộng Kho vật tư & tồn dư (28/10/2026)

- **D-KHO1 (28/10/2026) — Thành phẩm làm dư:** Phần thành phẩm sản xuất dư (`surplusQuantity` tại nghiệm thu QC) được nhập vào tồn kho thành phẩm chung theo mã nội bộ (`fg_<catalogItemId>`) qua phiếu `production_surplus_receipt`, không cộng vào tiến độ giao/sản xuất của PO gốc. Trên Thẻ kho hiển thị rõ **Nguồn tồn** (từ LSX nào, khách nào) và **Khách đang dùng**.
- **D-KHO2 (28/10/2026) — NVL dư sau SX:** Thuộc kho NVL chung (`raw_main`), ghi rõ nguồn từ LSX/khách nào trên phiếu `production_return` và hiển thị tại mục **Nguồn tồn** trên Thẻ kho.
- **D-KHO3 (28/10/2026) — Cảnh báo tồn dư khi lập LSX:** Khi lập LSX cho mã sản phẩm đang có tồn thành phẩm (`warehouse_balances/fg_<catalogItemId>` > 0), form hiển thị cảnh báo `"Kho đang có N <ĐVT> dư"` để người lập lệnh biết và quyết định điều chỉnh, chưa tự trừ số lượng cần sản xuất.
- **D-KHO4 (28/10/2026) — Quản lý cuộn lẻ:** Hỗ trợ ghi nhận tùy chọn `rollCode` (mã cuộn) và `remainingMeters` (số mét còn lại) trên dòng phiếu hoàn NVL (`production_return`) và hiển thị trực tiếp trong mục **Nguồn tồn** của Thẻ kho.
- **D-KHO5 (28/10/2026) — Theo dõi hàng giao:** Bỏ khỏi Kho vật tư, dùng thống nhất tại `Giao hàng → Hàng giao & thành phẩm`.
- **Tra cứu khách hàng dùng vật tư (`itemUsers`):** Máy chủ tổng hợp danh sách khách hàng đang dùng từng mã vật tư/thành phẩm từ (1) thực tế LSX và phiếu kho, (2) khai báo sản phẩm khách hàng (`customers[].products` và `catalog_links`), trả về trong `action: 'load'` của `/api/warehouse/manage`. Hiển thị cột **Khách đang dùng** trên bảng Tồn kho, cho phép tìm kiếm theo tên khách và xem chi tiết trong Thẻ kho.
