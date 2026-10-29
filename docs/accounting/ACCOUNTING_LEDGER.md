# Sổ công nợ và thu chi — lượt 5

Mốc đầu lượt `cc04ef8`, main/origin. Quyết định trực tiếp ngày 23/10/2026:

- Kế toán xác nhận chứng từ để tăng công nợ; kho/POD không tự tạo tiền.
- VND; đơn giá chưa thuế, thuế suất nhập theo chứng từ, làm tròn đến đồng; hạn nợ nhập riêng. Phân bổ tới từng dòng mã của chứng từ, có thể nhiều dòng/nhiều đơn.
- Admin và accountant có Accounting được lập/ghi sổ; chỉ Admin đảo phiếu, khóa/mở kỳ. Sale/Mua hàng không ghi tiền. Ngày ghi sổ hiện tại Việt Nam.

## Màn hình và thao tác

Kế toán giữ các tab Công nợ & thu chi, Báo cáo lãi gộp đơn hàng, Danh mục hàng. Báo cáo lãi gộp/công thức/in/sửa chi phí hiện hữu được giữ, không có biểu đồ mới và không được coi là giá vốn thực tế.

Trong Công nợ & thu chi chọn:

| Nội dung | Chức năng |
|---|---|
| Công nợ khách hàng/NCC | Tổng hợp đầu kỳ đã nhập, phát sinh ròng, tiền đã phân bổ, còn nợ và ứng trước riêng; chi tiết theo chứng từ, mã đơn, mã hàng, hạn nợ |
| Thu chi | Các khoản tiền mặt/chuyển khoản; số tiền gốc, đã phân bổ, đã hoàn, còn chưa phân bổ |
| Ứng trước & phân bổ | Khoản tiền còn chưa dùng; phân bổ nhiều lần vào nhiều dòng/chứng từ hoặc hoàn phần chưa dùng |
| Sổ chứng từ | Lịch sử công nợ, đầu kỳ, thu/chi, phân bổ, hoàn tiền, điều chỉnh, đảo; mở chi tiết và Admin đảo |
| Đầu kỳ & kỳ kế toán | Lập số dư có ngày đối chiếu/tham chiếu; ứng trước đầu kỳ; Admin khóa/mở tháng |
| Dữ liệu cũ | Hóa đơn trước sổ mới chỉ đọc, gồm dữ liệu từng xóa mềm có dấu phân biệt; không sửa/xóa/cộng đã trả |

Bảng một dòng, trạng thái chữ, menu RowActionMenu và phân trang chung. Form native dialog có label, Escape, xác nhận ghi, guard khi chưa lưu/đang gửi, lỗi/tải/thử lại. Mất phản hồi giữ nguyên requestId, ngày và nội dung, chỉ báo thành công khi máy chủ xác nhận. Tải lại số liệu yêu cầu xác nhận lại thông tin trước khi ghi.

## Luồng công nợ

1. Chọn đúng đối tác; lập chứng từ từ các dòng phiếu hàng thực tế, một hoặc nhiều nguồn của cùng đối tác/loại nợ.
2. Phải thu lấy phiếu khách xác nhận nhận/POD ở sổ thành phẩm. Phải trả lấy nhập mua NVL, nhập hàng mua/gia công, POD của NCC giao thẳng hoặc hàng giao thẳng thất bại thực tế nhập về công ty. Xuất hàng, QC và NCC chỉ mới gửi hàng chưa phải bằng chứng ghi nợ.
3. Mã/tên/ĐVT và đơn lấy từ phiếu/nguồn ở máy chủ. Kế toán nhập/xác nhận lượng, đơn giá chưa thuế, chiết khấu bằng đồng, thuế suất và hạn nợ theo chứng từ thật. Giá trên đơn chỉ gợi ý; không tự mặc định thuế suất từ tên hàng.
4. Tổng lượng ghi công nợ không vượt dòng nguồn; AR/AP có giới hạn riêng khi dùng cùng POD NCC giao thẳng. Dòng trùng, nguồn đảo, sai đối tác hoặc hóa đơn cũ cùng nguồn bị chặn. Không ghép theo tên.
5. Tiền hàng sau làm tròn đến đồng trừ chiết khấu dòng; thuế tính trên tiền sau chiết khấu và làm tròn đến đồng. Dùng số nguyên/BigInt theo hệ số thập phân để tính; không lấy tổng tiền client gửi. Cho dòng hàng không thu tiền, không tự bịa giá.
6. Ghi chứng từ chưa làm thay đổi số lượng kho hay thực nhận. Đơn đã giao đủ chỉ chuyển chờ thu khi toàn bộ POD hiện hành đã được lập công nợ; chỉ đánh dấu paid khi toàn bộ phần đó hết nợ. Chứng từ từng phần trả đủ không làm toàn PO được coi đã thu đủ. PO đang sản xuất/giao dở giữ giai đoạn hàng hiện tại.

## Tiền, ứng trước và điều chỉnh

- Phiếu thu từ khách/chi cho NCC tạo khoản tiền chưa phân bổ. Không tự nhập tăng `paidAmount` và không ép tiền vào một hóa đơn.
- Mỗi phiếu phân bổ chỉ dùng một khoản tiền, có thể chọn nhiều chứng từ/dòng mã cùng đối tác và cùng AR/AP. Không vượt tiền còn dùng hoặc nợ từng dòng; không tự chia theo tỷ lệ.
- Thanh toán dư giữ ở ứng trước. Hoàn tiền chỉ từ phần chưa dùng: khách nhận lại tiền là dòng tiền ra; NCC hoàn cho công ty là dòng tiền vào.
- Điều chỉnh tăng/giảm nợ có tham chiếu và lý do, số tiền đã gồm thuế theo chứng từ điều chỉnh. Không sửa giá/thuế gốc của chứng từ đã ghi. Nếu phần giảm đụng vào tiền đã phân bổ, Admin đảo phân bổ liên quan trước, sau đó giảm nợ, phân bổ lại hoặc hoàn tiền chưa dùng.
- Có thể nối giảm nợ với phiếu khách trả thực tế. Cần đúng phiếu xuất gốc, mã/dòng, không vượt lượng trả và lượng trên dòng công nợ. Phải trả chỉ nối tự nhiên khi hàng giao thẳng được trả NCC; hàng về kho công ty không tự giảm nợ NCC.
- Điều chỉnh theo chứng từ riêng vẫn được ghi khi không có phiếu hàng phù hợp; không tự tạo phiếu trả vật lý. Lượt 3 chưa có nghiệp vụ xuất trả NVL cho NCC, không giả lập nghiệp vụ này bằng điều chỉnh tiền.

## Đầu kỳ và lịch sử

- Chức năng lập đầu kỳ có ngày đối chiếu, tham chiếu, đối tác, số tiền, đơn/mã nếu đã xác định. Không có chi tiết thì lưu rõ chưa xác định, không tự chia nợ theo mã hay dựng số lượng hàng.
- Ứng trước đầu kỳ lập riêng, có thể phân bổ/hoàn sau; không tạo dòng tiền thu/chi mới vào ngày nhập số dư.
- Ngày ghi sổ vẫn là hôm nay, ngày đối chiếu chỉ là nguồn đầu kỳ. Không tự nạp dữ liệu Firebase thật hoặc tổng hợp `paidAmount` cũ thành phiếu thu giả. Chuyển đổi thật/ngày cắt và số được xác nhận ở lượt 7.
- `invoices` cũ không đổi số liệu. Các chứng từ ghi nhận mới có bản chiếu `acc_<documentId>` phục vụ màn hình cũ đang đọc invoices; số tiền/đã trả được tính từ sổ, không ghi từ client. Dư đầu kỳ không tạo bản chiếu invoices, tránh cộng trùng với hóa đơn lịch sử.
- CRM/NCC/Dashboard hiện vẫn có các chỉ tiêu tham khảo dùng invoices cũ và bản chiếu chứng từ mới; chưa phải bộ báo cáo tháng/đối soát đầu kỳ mới. Sổ Kế toán là nơi xem số mới đã ghi. Đồng bộ báo cáo/cảnh báo thuộc lượt 6, chuyển dữ liệu lịch sử thật thuộc lượt 7.

## Bất biến, quyền và kỳ

Phiếu đã ghi giữ nguyên lịch sử; đảo tạo phiếu mới liên kết gốc. Không đảo nợ khi còn phân bổ/điều chỉnh đang hiệu lực, kể cả hai điều chỉnh bù nhau có tổng bằng 0. Không đảo khoản tiền khi còn phân bổ/hoàn; đảo điều chỉnh không được làm số còn nợ âm. Hoàn/đảo không xóa bằng chứng.

Phiếu hàng đã dùng lập công nợ hoặc điều chỉnh hàng trả bị chặn đảo ở cả API NVL/thành phẩm; cần đảo tiền liên quan trước. Hai phía hàng/tiền cùng đọc trạng thái nguồn trong transaction để xử lý cạnh tranh, không chỉ kiểm tra ở UI.

Admin khóa/mở kỳ tháng kèm lý do; kỳ hiện tại khóa chặn ghi mới. Đảo còn kiểm tra kỳ gốc, cần mở kỳ đó trước nếu đã khóa. Gửi lại yêu cầu đã thành công vẫn nhận kết quả cũ, không ghi mới. Đây là khóa chứng từ của sổ mới, không phải xác nhận đã thực hiện khóa sổ cái/báo cáo thuế.

Khách/NCC đã có phát sinh được đánh dấu `financeLinked` do API quản lý, chặn xóa cứng từ client. Ngừng sử dụng vẫn giữ công nợ/tiền để xem và tất toán, không lập nợ mới. Không sửa hồ sơ users hoặc mở quyền Sale/Mua hàng vào API tiền. Thùng rác không sửa/xóa hóa đơn cũ và không xóa cứng hồ sơ đã có liên kết tiền.

## Hợp đồng kỹ thuật

`POST /api/accounting/manage`: post/reverse/period, xác thực token và hồ sơ hiện tại bằng `requireActiveErpCaller`. API chỉ dành cho Admin hoặc accountant có Accounting, lấy danh tính từ máy chủ. Không lưu local khi API lỗi.

Đọc sổ (quyết định của người dùng ngày 29/10/2026): màn Sổ công nợ đọc thẳng Firestore qua `useLedgerLiveData`;
rules cho Admin và accountant có Accounting (`canUseLedger`) đọc `finance_control`, `finance_documents`,
`finance_funds`, `finance_entries`, `finance_source_state`, `finance_periods`. `finance_requests`, `finance_counters`,
`finance_reference_keys` vẫn chặn hoàn toàn; mọi ghi vẫn chặn client. Nguồn chờ ghi nợ, đối tác và đơn đầu kỳ dựng bằng
`buildLedgerView` (`model/ledgerView.ts`). Hộp thoại ghi sổ giữ số liệu lúc mở; số mới chỉ áp dụng khi bấm
"Tải lại số liệu", và `expectedRevision` (revision của `finance_control/main`) vẫn chặn ghi trên số cũ.

| Collection | Vai trò |
|---|---|
| `finance_documents` | Chứng từ charge/opening, dòng gốc đóng băng, phần điều chỉnh/đã phân bổ, liên kết đơn/mã |
| `finance_funds` | Khoản tiền/ứng trước, phần đã dùng và hoàn |
| `finance_entries` | Phiếu lịch sử, phân bổ theo dòng, điều chỉnh, dòng tiền, liên kết đảo |
| `finance_source_state` | Lượng đã dùng theo AR/AP và dòng phiếu hàng/phiếu trả |
| `finance_periods` | Trạng thái khóa tháng và người/lý do |
| `finance_control` | Revision chung để tuần tự hóa các ghi sổ tiền |
| `finance_requests` | Chống trùng theo người và nội dung; xác nhận retry |
| `finance_reference_keys` | Chặn tái dùng tham chiếu theo loại/đối tác/AR-AP, kể cả phiếu đã đảo |
| `finance_counters`, `audit_events` | Số phiếu KT theo ngày Việt Nam và lịch sử nghiệp vụ |

Tối đa 50 dòng, request150KB, tiền nguyên VND tối đa 1.000 tỷ mỗi khoản/chứng từ; số lượng/đơn giá tối đa 6 số lẻ trong giới hạn tính an toàn, thuế suất tối đa 2 số lẻ trong 0–100%. Không có tỷ giá/ngoại tệ. Mọi nguồn, số dư, phiên bản và phụ thuộc được đọc trước khi flush ghi. Chứng từ, nguồn, khoản tiền, bản chiếu, PO, audit và biên nhận cùng commit hoặc cùng không ghi.

Rules đóng toàn bộ ghi client vào invoices và sổ mới, bảo vệ metadata tiền/nguồn/đối tác. Sale/Dashboard không tự tạo hóa đơn khi đổi hàng đợi; hướng tới Kế toán. Mua hàng không ghi lại items của PO đã vào sổ tiền. Thanh toán đủ chuyển về hàng đợi chờ xử lý chiết khấu theo luồng hiện hữu, không tự đóng PO hoặc xóa phần hàng còn thiếu.

## Kiểm tra và triển khai

`tests/accounting-ledger.test.cjs`: tính tiền, nguồn/snapshot, AR/AP, nhiều dòng/chứng từ/khoản tiền, ứng trước, hoàn/điều chỉnh, đảo phụ thuộc, kỳ, quyền, dữ liệu cũ, retry/đồng thời, API, handler form/hook và rules tĩnh. Transaction mô phỏng có version/retry; chưa thay thế emulator/Firebase thật.

Cần triển khai web, API kế toán, hai API kho có guard phụ thuộc và firestore.rules cùng phiên bản. Chưa triển khai web/Firebase, chạy trình duyệt, nạp đầu kỳ hoặc ghi dữ liệu thật trong lượt này. Push Git khác deploy/nghiệm thu.

Lượt 6 tiếp theo: báo cáo đầu/phát sinh/cuối theo tháng, công nợ và hàng còn giao/nhận theo đơn/mã, tuổi nợ/hạn, cảnh báo tồn và thống nhất chỉ tiêu các phân hệ. Lượt 7: chốt cắt dữ liệu, đối soát đầu kỳ thật, chuyển đổi, kiểm thử tích hợp và triển khai/nghiệm thu có xác nhận.

### Cập nhật sau lượt 6

Đã bổ sung báo cáo kỳ và đồng bộ số dư theo ACCOUNTING_REPORTS.md. Đoạn CRM/NCC/Dashboard còn đọc chỉ tiêu invoices ở bàn giao lượt 5 phía trên là trạng thái lịch sử; màn hình hiện dùng tóm tắt documents/funds cho nợ mới, nợ cũ và ứng trước riêng. Bản chiếu invoices vẫn được writer bảo toàn cho tương thích, không cộng lần nữa vào báo cáo mới. Lượt 7 chưa thực hiện; chưa deploy hoặc chuyển số dư thật.
