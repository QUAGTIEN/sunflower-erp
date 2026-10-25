# Báo cáo, hàng còn thực hiện và cảnh báo — lượt 6

Mốc đầu lượt: `b3c96fe`, main/origin. Người dùng duyệt triển khai và push lượt 6 theo phạm vi đã xác định. Chưa triển khai môi trường thật hoặc chuyển đổi dữ liệu.

## Nơi sử dụng

Kế toán → **Báo cáo & cảnh báo**:

| Nội dung | Số liệu / thao tác |
|---|---|
| Công nợ theo kỳ | Dư đầu, tăng nợ, giảm nợ, phân bổ ròng, dư cuối; ứng trước đầu/cuối riêng; tiền vào/ra thực tế |
| Tuổi nợ | Chưa đến hạn, đến hạn hôm nay, quá hạn 1–30 / 31–60 / 61–90 / trên 90 ngày, chưa có hạn; theo đối tác và ngày cuối kỳ |
| Chi tiết đơn / mã | Chứng từ, đơn, mã, dư đầu/phát sinh/cuối, hạn/tuổi nợ; mở chứng từ và lịch sử liên quan; liên kết lượng hàng còn thực hiện **hiện tại** đúng ID dòng |
| Dòng tiền | Thu/chi/hoàn/đảo có dòng tiền thực tế, phương thức tiền mặt/chuyển khoản; không coi phân bổ/ứng trước đầu kỳ là tiền thu mới |
| Hàng còn giao / nhận | Khách/NCC → đơn → dòng: lượng đặt, nhận ròng, đang giao, trả, đóng thiếu, còn thực hiện; mở phiếu nguồn |
| Cảnh báo kho | NVL/thành phẩm/hàng mua: tồn âm, dưới ngưỡng, chưa thiết lập, trong ngưỡng; lịch sử biến động và thiết lập ngưỡng |
| Dữ liệu chưa chuyển đổi | Hóa đơn cũ chỉ đọc; gồm xóa mềm có dấu phân biệt, không cộng vào công nợ sổ mới |

Lọc tháng hoặc từ/đến ngày, đối tác, phải thu/phải trả, từ khóa, tuổi nợ/hạn, kho/trạng thái. Xuất CSV toàn bộ kết quả theo bộ lọc, không chỉ trang đang xem. CSV UTF-8 BOM, giữ số tiền nguyên, escape dấu nháy/xuống dòng và trung hòa công thức trong tên/tham chiếu. Bảng gọn một dòng, title dữ liệu dài, RowActionMenu, phân trang chung; không thêm biểu đồ.

## Tiền theo ngày ghi sổ

`buildDebtReport` đọc snapshot gốc của `finance_documents` và phát lại `finance_entries` theo ngày ghi sổ. Không lấy `voided`, `settled`, `adjustment`, `used` hiện tại để tính báo cáo quá khứ.

`Dư cuối = Dư đầu + Tăng nợ − Giảm nợ − Phân bổ ròng`.

- Dư đầu: mọi tác động nợ có ngày ghi **trước** từ ngày.
- Phát sinh: từ ngày và đến ngày đều bao gồm.
- Phiếu đảo tác động tại ngày đảo; không xóa phiếu gốc ở tháng trước. Đảo phân bổ cho phân bổ ròng âm, hoàn lại ứng trước; không tự tạo dòng tiền.
- Ứng trước: khoản tiền/ứng trước đầu kỳ trừ phân bổ và hoàn, tính riêng theo phía nợ và đối tác. Không tự lấy ứng trước giảm dư nợ.
- Tiền vào/ra lấy `cashDelta`; có thể có thu trước khi lập nợ và phân bổ ở tháng sau. Đảo dòng tiền xuất hiện theo chiều ngược tại ngày đảo.
- Dư đầu kỳ nhập trong kỳ hiển thị tăng nợ trong kỳ nhập. `openingAsOf` chỉ là ngày đối chiếu nguồn, không tự lùi ngày ghi sổ hoặc dựng báo cáo lịch sử. Ứng trước đầu kỳ không tạo dòng tiền.
- Hạn/tuổi nợ tính tại **đến ngày**, chỉ số còn nợ dương được phân nhóm. Chưa có hạn không bị coi là quá hạn.
- Thiếu phiếu gốc, dòng hoặc khoản tiền cần phát lại sẽ báo cần đối soát, không trả số 0 giả. Kiểm tra tổng số nguyên an toàn.

Chi tiết chứng từ mở từ báo cáo ghi rõ là dữ liệu hiện tại; bảng kỳ vẫn giữ số tại ngày cuối đã chọn. Các điều chỉnh có thể nối nhiều dòng/chứng từ, lịch sử chi tiết ghi số tiền toàn phiếu khi mở.

## Hàng và kho hiện tại

Bộ lọc kỳ tiền **không áp dụng** cho hàng/kho. Màn hình ghi ngày snapshot. Không làm báo cáo kho lịch sử bằng trạng thái hiện tại; báo cáo nhập xuất tồn theo kỳ vẫn dùng sổ kho ở Vật liệu.

- Khách: nhận ròng = POD − khách trả; đang giao = đã gửi − POD − giao thất bại hoàn về; còn thực hiện = đặt − nhận ròng − đóng thiếu; cần xuất thêm = còn thực hiện − đang giao.
- NCC NVL: nhận ròng = số lượng cơ sở đã nhận trong trạng thái nguồn / hệ số đã chốt.
- NCC thành phẩm/gia công: nhận ròng = nhập công ty + POD giao thẳng + giao thất bại thực nhập công ty − giao thẳng trả NCC. Đang giao thẳng = NCC gửi − POD − giao thất bại. Chỉ NCC gửi chưa phải công ty/khách đã nhận.
- Từng dòng chia theo hệ số đã chốt về ĐVT của nguồn, không cộng kg/cuộn/cái/hộp thành một tổng. Không suy lượng chưa thanh toán từ tiền nợ.
- Đơn cũ đã giao/nhận nhưng chưa có trạng thái sổ mới, nguồn thay đổi dấu nội dung, thiếu dòng hoặc thiếu đơn: hiển thị cần đối soát/không xác định. Dòng sổ mất nguồn vẫn được giữ trong báo cáo. Không tự chuyển `qtyDelivered` cũ thành POD mới.
- Phiếu gốc và phiếu đảo đều có trong truy vết nguồn. Canceled/deleted có lịch sử hàng được đánh dấu riêng, không coi là cảnh báo giao nhận bình thường.
- Ngưỡng `null` là chưa thiết lập, khác ngưỡng 0. Tồn `< ngưỡng` mới là cần nhập; âm ưu tiên cảnh báo tồn âm. Cùng hàm `stockAlert` tại Kế toán, Vật liệu, thành phẩm và Dashboard.
- Bổ sung thiết lập ngưỡng thành phẩm/hàng mua qua `POST /api/warehouse/manage`, action threshold, `warehouseId: finished_main`, số dư `fg_<catalogItemId>`. Không sửa lượng tồn. Quyền ghi kho giữ lượt 3; revision, requestId, retry và audit giữ nguyên. Ngưỡng mới không cho phép xuất âm thành phẩm.

## Số dư chung và quyền

- Báo cáo đầy đủ/API load: chỉ Admin hoặc accountant hoạt động có Accounting. Không mở quyền ghi tiền, đảo, kỳ hoặc trang Kế toán cho Sale/Mua hàng.
- API tóm tắt tại phân hệ đã có: Sale có CRM/Sales chỉ nhận AR của khách được phân công hoặc chưa phân công, tương ứng bộ lọc CRM; Purchaser có Suppliers/Purchase chỉ nhận AP của danh sách NCC hiện có. Không trả chứng từ/thu chi/chi tiết sổ hoặc nợ phía còn lại. Admin/Kế toán nhận cả hai phía.
- Khách hàng (chỉ tiêu và bộ lọc Công nợ sổ mới), tổng quan CRM, NCC dùng cùng số dư từ documents/funds như Kế toán. Nợ cũ chưa đối soát và ứng trước hiện riêng; bỏ cách cộng projection `invoices` với dư đầu kỳ. Lỗi API để số dư chưa xác định, không tự về local hoặc hiển thị nợ bằng 0.
- Dashboard, Khách hàng và Nhà cung cấp không còn khối tóm tắt công nợ (D10e-UI, 25/10/2026); bảng khách/NCC giữ cột "Công nợ". Tổng hợp nợ, ứng trước, nợ gần/quá hạn xem tại Kế toán.
- Người dùng đã xác nhận áp dụng đề xuất: báo trước 3 ngày; tuổi nợ quá hạn 1–30 / 31–60 / 61–90 / trên 90 ngày. Báo cáo tiền tổng hợp chỉ dành Admin/Kế toán có Accounting; Sale/Mua hàng tiếp tục xem dữ liệu được phép ở phân hệ hiện tại. Mã lượt 6 đã khớp các lựa chọn này. Bộ lọc báo cáo vẫn chỉnh được 0–365 ngày; Dashboard dùng 3 ngày. Không tạo thông báo gửi tự động/mail hoặc lịch chạy nền.

`POST /api/accounting/reports`: xác thực token + hồ sơ thật qua `requireActiveErpCaller`; body `{}` tải báo cáo, `{action: partner_summary}` trả tóm tắt phạm vi trên. Các bộ dữ liệu được đọc trong transaction nhất quán; không có ghi/migration khi tải. Client tiếp tục bị chặn đọc trực tiếp sổ tiền. Lượt 6 không sửa Firestore rules hay tạo collection mới.

## Giới hạn và lượt 7

Đây là báo cáo của **sổ nghiệp vụ mới đã ghi**, chưa phải xác nhận đủ dữ liệu kế toán công ty. Chưa chốt ngày cắt, nhập đầu kỳ thật, chuyển hóa đơn/tồn cũ, giá vốn, thuế, sổ cái, báo cáo tài chính hoặc kết nối ngân hàng. Bảng lãi gộp cũ giữ nguyên, chưa thành giá vốn thực tế.

Snapshot API hiện đọc các collection nghiệp vụ trong transaction, tương ứng cách load sổ hiện có. Cần đo với khối lượng dữ liệu thực khi nghiệm thu; không tuyên bố đã kiểm chứng tải lớn.

Lượt 7: chốt nguồn/ngày cắt và bảng đối soát, phê duyệt dữ liệu thật, chuyển đổi có chống trùng/đối soát, kiểm thử tích hợp và nghiệm thu, triển khai web/API/rules cùng phiên bản khi được yêu cầu. Chưa làm các thao tác đó trong lượt 6; push Git không đồng nghĩa deploy.

## Kiểm tra

`accounting-reports.test.cjs`: kỳ/biên ngày/đảo khác tháng/ứng trước/dòng tiền/tuổi nợ/CSV, quyền và phạm vi summary, hàng cơ sở/giao thẳng/nguồn cũ và mất dòng, thao tác lọc/drilldown/xuất toàn bộ kết quả, form retry ngưỡng. `accounting-ledger.test.cjs` đối chiếu báo cáo với writer thực sau nhiều nghiệp vụ. `warehouse.test.cjs` kiểm tra threshold thành phẩm không đổi tồn, quyền/revision/audit/idempotency.

Không mở trình duyệt, không chạy emulator hoặc ghi Firebase thật. Kết quả build/lint/test cuối cùng ghi tại ../archive/ACCOUNTING_HANDOVER_LOG.md và bàn giao chat.
