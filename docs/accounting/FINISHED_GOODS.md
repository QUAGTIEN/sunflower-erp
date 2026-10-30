# Thành phẩm và hàng giao — lượt kế toán 4

Mốc đầu lượt: `54b09f8`, main/origin. Đây là sổ **số lượng**, chưa có giá vốn hoặc công nợ mới. Quyết định trực tiếp: hỗ trợ cả nhập kho công ty và NCC giao thẳng khách; giữ nhóm ghi sổ lượt 3, người có Giao hàng xác nhận POD, chỉ Admin đảo phiếu/đóng thiếu có lý do và xác nhận khách.

## Luồng sử dụng

1. **Nhập từ QC:** Sản xuất → chi tiết LSX v2 hoàn thành → Nhập thành phẩm từ QC. Chọn lượng đạt thực nhập, có thể nhập nhiều lần; tổng không vượt `goodQuantity`. QC hoặc in LSX không tự cộng kho. LSX gồm nhiều PO (D-LSX1) hiện thành một nguồn cho mỗi PO; phiếu nhập ghi `poId` của PO đó và chỉ nhận dòng của PO đó. Dòng có snapshot giữ đúng mã/quy đổi; dòng chưa liên kết phải chọn mã thành phẩm và xác nhận, không sửa snapshot lịch sử.
2. **Hàng mua/gia công về công ty:** Mua hàng → đơn mua → Nhập kho hàng mua/gia công. Nhận từng dòng/từng phần; ánh xạ dòng PO thiếu định danh phải được chọn rõ. Có dòng PO hợp lệ trên nguồn thì không được đổi sang dòng khác. Mã nội bộ, ĐVT, quy đổi kiểm tra lại ở máy chủ.
3. **Xuất kho giao:** Lập chuyến chứa PO; Vật liệu → Thành phẩm hoặc Giao hàng → Hàng giao & thành phẩm → Xuất giao. Phiếu xuất làm giảm tồn công ty và tăng hàng đang giao; không tăng lượng khách đã nhận. Chặn âm kho thành phẩm, không có lựa chọn vượt âm. Chỉ xuất trước khi chuyến xuất phát.
4. **Xuất phát/POD:** Duyệt → bốc hàng → xuất phát; mỗi PO trong chuyến phải có hàng đang giao. Xác nhận theo phiếu xuất gốc, từng dòng/từng phần, người nhận và mã/link POD hoặc ảnh/chữ ký. Có khung ký trực tuyến, ảnh nén JPEG tối đa 800px/250KB; không dùng Storage. POD không trừ kho lần hai.
5. **NCC giao thẳng:** Mua hàng → đơn mua → NCC giao thẳng khách. Phiếu phân bổ lượng nguồn mua sang hàng đang giao; không qua kho/xe công ty, không cộng/trừ tồn giả. Sau đó dùng cùng luồng POD. Trạng thái đã nhận của đơn mua dựa vào lượng đã nhận thực tế, không chỉ lượng NCC đã gửi.
6. **Giao thất bại:** Nhận lại theo lượng còn đang giao của phiếu gốc. Hàng từ công ty quay lại công ty thì tăng tồn. Hàng NCC giao thẳng chọn thực tế quay về công ty (có nhập kho) hoặc NCC (không nhập kho, mở lại phần cần NCC cung cấp). Hoãn chuyến không tự tạo phiếu hoàn.
7. **Khách trả:** Chỉ trả tối đa lượng đã nhận ròng trên phiếu gốc. Giảm lượng khách nhận ròng và mở lại phần cần giao. Hàng công ty về kho công ty; hàng NCC giao thẳng có thể về công ty hoặc NCC. Về NCC mở lại lượng cần NCC cung cấp, không tạo tồn công ty. Không tự sinh giảm trừ nợ/hoàn tiền.
8. **Giao bù:** Dùng phiếu xuất mới theo phần thiếu đã mở lại, kiểm tra tồn/nguồn như bình thường. Hàng về kho công ty có thể xuất lại từ kho; không nhập lại một lần nữa theo đơn mua.
9. **Đóng thiếu:** Admin ghi lý do và bằng chứng khách chấp nhận; chỉ đóng phần thiếu thực tế, không còn hàng đang giao. Không ghi lượng thiếu thành `qtyDelivered`. Có thể đảo để mở lại phần thiếu.
10. **Đảo:** Admin đảo toàn bộ phiếu bằng chứng từ mới, giữ phiếu gốc/liên kết/audit. Phải đảo nghiệp vụ phụ thuộc trước; không cho đảo nếu làm âm kho, vượt nguồn hoặc phần được giải phóng đã dùng cho phiếu khác.

## Màn hình

- Kho vật tư gộp chung Tồn kho (NVL + thành phẩm + hàng mua), Phiếu kho và Báo cáo nhập xuất tồn; theo dõi hàng giao và tiến độ từng mã/PO nằm ở `Giao hàng → Hàng giao & thành phẩm`.
- Giao hàng thêm **Hàng giao & thành phẩm**, có lọc theo chuyến; thao tác POD cũ mở phiếu mới, không còn cộng `qtyDelivered` trực tiếp. Chuyến mới không ghi lượng kế hoạch thành lượng đã giao. Kế hoạch đã tham gia sổ được khóa sửa/xóa trực tiếp.
- Tiến độ theo từng dòng PO và ĐVT; không cộng lẫn cuộn/cái/mét thành một tổng. Đã nhận ròng, đang giao, cần xuất thêm và đóng thiếu là các số độc lập.
- Kết quả điểm giao phân biệt đã giao, đã hoàn, giao/hoàn một phần. Lịch sử phiếu là nguồn chi tiết; ảnh/POD gần nhất trên chuyến chỉ phục vụ tra nhanh. Đảo POD gần nhất xóa bản sao tra nhanh, giữ bằng chứng trong phiếu gốc.
- Bảng một dòng, số căn phải, phân trang/Menu thao tác dùng component chung; modal có tải/lỗi/thử lại, xác nhận ghi sổ và cảnh báo dữ liệu chưa lưu. Mất phản hồi giữ nguyên payload/requestId để kiểm tra lại, không báo thành công giả.

## Sổ và tính toán

| Nơi lưu                                              | Nội dung                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `warehouse_balances/fg_<catalogItemId>`              | `warehouseId: finished_main`, số dư ĐVT cơ sở, revision                                                            |
| `warehouse_vouchers/<requestId>`                     | Phiếu TP theo ngày Việt Nam, nguồn/PO/chuyến/phiếu xuất gốc, snapshot dòng, delta vật lý, POD, lý do, liên kết đảo |
| `goods_order_state/<poId>`                           | Fingerprint PO, revision, ánh xạ theo ID dòng, lượng đặt/xuất/nhận/hoàn/trả/đóng thiếu ở ĐVT cơ sở                 |
| `goods_source_state/<production hoặc purchase>_<id>` | Fingerprint nguồn, ánh xạ từng dòng, phần nhập và phần NCC giao thẳng/nhận/hoàn, revision                          |
| `goods_dispatch_state/<dispatchId>`                  | Lượng xuất/nhận/hoàn/trả theo dòng của từng phiếu xuất gốc                                                         |
| `goods_requests`, `goods_counters`, `audit_events`   | Chống trùng theo người/nội dung, lịch sử thao tác; số phiếu mới lấy từ `code_counters` `PN`/`PX` (D-MA1), phiếu cũ giữ `TP-YYYYMMDD-xxxx`                                                   |

Sổ NVL cùng collection vẫn dùng `raw_main`; API/bảng/dashboard NVL lọc riêng, không trộn thành phẩm vào số NVL.

- Đang giao = xuất − khách nhận gộp − hoàn giao thất bại.
- Đã nhận ròng = khách nhận gộp − khách trả.
- Cần xuất thêm = đặt − xuất + hoàn giao thất bại + khách trả − đóng thiếu.
- Báo cáo kho chỉ dùng delta vật lý. NCC gửi thẳng/POD/đóng thiếu không phải nhập hoặc xuất kho công ty.
- Lượng nguồn mua đã dùng gồm nhập công ty và giao thẳng chưa hoàn về NCC. Đơn mua chỉ hoàn thành khi đã nhận đủ tại công ty/khách; giao thất bại về công ty cũng là đã cung cấp. Khách trả thẳng NCC giảm phần cung cấp ròng, trả về công ty giữ phần NCC đã cung cấp.

`pos.items[].qtyDelivered` được tính lại từ sổ, không cộng vào dữ liệu client cũ. Các cờ `goodsFlowVersion`, `goodsRevision`, `goodsReady`, `goodsDeliveryClosed` do API quản lý; receipt không tự đẩy PO sang giai đoạn giao hàng. Sau nghiệp vụ giao, PO thiếu hàng ở waiting_delivery; nếu còn ở giai đoạn sản xuất thì giữ waiting_production để lập/phát hành phần LSX còn lại. QC phần cuối giữ tiến độ giao đã có khi chuyển chờ giao. PO đủ/đóng thiếu ở waiting_invoice. Đây là hàng sẵn sàng cho lượt 5, chưa phải ghi sổ công nợ.

## API và quyền

`POST /api/warehouse/finished`: load/post/reverse/close_short/trip_status. Xác thực Firebase Auth và hồ sơ ERP đang hoạt động qua `requireActiveErpCaller`; không tin vai trò, tồn, hệ số hoặc snapshot client. Load chỉ trả trường cần cho lượng hàng, không trả giá mua. Không lưu local khi lỗi API.

- Ghi nhập/xuất/hoàn/trả: Admin; purchaser có Inventory; accountant có Accounting.
- POD và chuyển trạng thái chuyến: tài khoản đang hoạt động có Giao hàng hoặc Admin.
- Đảo/đóng thiếu: chỉ Admin.
- Producer có Production chỉ đọc sổ liên quan, không tự được quyền ghi kho. Sale không được mở Sản xuất; lượt này không tự cấp trang/quyền mới vào users.

Transaction kiểm tra tất cả nguồn/số dư/phiên bản trước khi ghi. Phiếu, tiến độ nguồn/PO/chuyến, số dư, xe, request/counter và audit cùng thành công hoặc không ghi. Khóa xe theo `activeGoodsTripId` tránh giải phóng xe của chuyến khác. Tối đa 50 dòng, payload450KB, số lượng dương tối đa 6 số lẻ, ngày ghi sổ hiện tại Việt Nam. Không lùi ngày.

Rules chặn client ghi sổ/metadata; khóa nguồn mua đã phát hành và PO/chuyến đã tham gia sổ khỏi sửa nội dung, tiến độ hoặc xóa ngoài API. Khi lập thêm đơn mua cho PO đã vào sổ, thông tin NCC/giá nằm ở đơn mua/yêu cầu mua; không ghi lại `pos.items` đã khóa.

## Dữ liệu cũ và giới hạn

- Không sửa/chuyển tồn cũ, phiếu giao, hóa đơn, POD hoặc LSX v1. Đơn mua cũ đã received mà chưa có state mới; PO đã giao/đóng thiếu cũ mà chưa có state mới bị chặn để đối soát, không tính lại thành phát sinh mới.
- Chuyến cũ đang chạy, xe đang running không có khóa sổ mới cần đối soát trước khi dùng luồng mới. Không tự gắn phiếu mới vào lượng giao cũ hoặc tự giải phóng xe cũ. Lượt 7 cần quy trình chuyển đổi có xác nhận.
- Một kho thành phẩm chung; chưa có lô/cuộn/vị trí, nhiều kho, giữ chỗ hoặc kho cách ly chất lượng hàng trả. Phiếu về công ty ghi nhận số lượng vật lý; chưa là kết luận hàng đủ điều kiện chất lượng.
- Chưa mở tồn đầu kỳ thật, hạch toán giá vốn, phân bổ tiêu hao, credit note/hoàn tiền, thuế hoặc sổ công nợ mới. Quy trình hóa đơn cho PO đã vào sổ cần nối ở lượt 5; các hóa đơn/thu chi cũ được giữ nguyên, không tự dựng lại từ phiếu hàng.

## Kiểm tra và triển khai

`tests/finished-goods.test.cjs` kiểm tra nguồn/QC, quy đổi, nhiều dòng cùng mã, giao từng phần, POD, hoàn/trả/giao bù, NCC giao thẳng, giới hạn nguồn/tồn, đảo phụ thuộc, đóng thiếu, quyền, retry/đồng thời, dữ liệu cũ, auth API, handler form/hook/chữ ký thật. Transaction dùng mô phỏng có revision/retry; rules kiểm tra hợp đồng tĩnh, chưa chạy emulator.

Cần triển khai web, `/api/warehouse/finished`, API kho/LSX và `firestore.rules` cùng phiên bản. Chưa deploy hoặc kiểm thử trình duyệt/Firebase thật trong lượt này; push Git không xác nhận triển khai. Chưa nhập đầu kỳ thật.

Lượt 5 tiếp theo: chốt mốc tăng nợ mua/bán từ chứng từ có thật, kỳ/thuế/làm tròn, quyền ghi/đảo/khóa kỳ, phân bổ thu chi/ứng trước và tác động tiền của hàng trả. Dùng ID phiếu/nguồn để nối, không suy lịch sử thanh toán từ lượng giao hoặc số đã trả hiện tại.

## Điểm nối lượt 5

Đã có mã nguồn sổ tiền tại ACCOUNTING_LEDGER.md: Kế toán xác nhận POD/nhập mua thực tế để tăng nợ, không tự tăng từ phiếu hàng. Hàng NCC giao thẳng có thể là nguồn AR và AP với cap riêng. Hàng trả có điều chỉnh tiền được xác nhận, không tự giảm nợ/hoàn tiền. API hàng chặn đảo nguồn khi còn phụ thuộc tiền; cần đảo chứng từ tiền trước. Triển khai web/API kho/API kế toán/rules cùng phiên bản; chưa xác nhận deploy hoặc chuyển dữ liệu thật.

## Nghiệp vụ thành phẩm làm dư (28/10/2026 — D-KHO1, D-KHO3, D-KHO5)

- **Ghi nhận SL dư khi nghiệm thu QC (`surplusQuantity`):** Trong `completeOrder` (`server/productionOrders.ts`), ngoài `goodQuantity` và `rejectQuantity` (tổng không vượt `line.quantity`), cho phép nhập `surplusQuantity >= 0` lưu riêng trên từng dòng LSX. `surplusQuantity` không cộng vào `allocatedQuantities` hay `completedProduction` của PO và không làm PO chuyển trạng thái đủ hàng sớm.
- **Phiếu nhập thành phẩm dư từ SX (`production_surplus_receipt`):** Thêm loại phiếu `production_surplus_receipt` trong `/api/warehouse/finished` (`server/finishedGoods.ts`). Giới hạn nhập tối đa theo `line.surplusQuantity * factor` (theo dõi qua `surplusReceived` trong `goods_source_state`), cộng vào tồn vật lý `warehouse_balances/fg_<catalogItemId>`, lưu `customerId`/`customerName` và mã LSX trên phiếu để hiển thị tại mục **Nguồn tồn** trong Thẻ kho. Hỗ trợ Admin đảo phiếu như các phiếu thành phẩm khác.
- **Cảnh báo tồn khi lập LSX (`D-KHO3`):** Action `catalog` của `/api/production/orders` trả kèm `stockBalances` từ `warehouse_balances/fg_<catalogItemId>`; bảng mặt hàng LSX hiển thị nhãn `"Kho đang có N <ĐVT> dư"` khi mã thành phẩm đã liên kết có số dư dương.
