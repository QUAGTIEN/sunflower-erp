# Nghiệp vụ kế toán và kế hoạch triển khai

## Phạm vi đã chốt

Kế hoạch chính thức gồm **7 lượt**, thay cho cách chia 14 lượt trong bản Word ngày 21/10/2026. Các mục kỹ thuật cũ được gộp, không bỏ nghiệp vụ.

| Lượt | Kết quả |
|---|---|
| 1 | Chuẩn hóa mã nội bộ, ĐVT, nhập danh mục cũ và liên kết dữ liệu hiện có |
| 2 | Kế toán lập LSX, mẫu in theo biểu mẫu thực tế, bảo toàn lệnh cũ |
| 3 | Sổ kho NVL, nhận mua, cấp/hoàn vật tư, kiểm soát thiếu kho |
| 4 | Nhập thành phẩm từ sản xuất, xuất giao, giao từng phần và trả hàng |
| 5 | Đầu kỳ công nợ, phát sinh, thu chi, ứng trước, phân bổ theo đơn/mã |
| 6 | Báo cáo tháng, hàng còn giao/nhận, hạn thanh toán và cảnh báo tồn |
| 7 | Chuyển đổi dữ liệu thật, kiểm thử tích hợp, triển khai và nghiệm thu |

Yêu cầu đã xác nhận: theo dõi **cả nợ tiền và hàng chưa giao/nhận**, **cả NVL và thành phẩm**, bổ sung **Kế toán lập LSX**. Sale không truy cập Sản xuất. Lượt 2 đã bổ sung quyền lập LSX cho Kế toán theo hợp đồng bên dưới.

## Quy tắc xuyên suốt

- R01: Tạo/in/phát hành LSX không phải xuất kho; QC không thay thế phiếu nhập thành phẩm.
- R02: Tiền và hàng độc lập; trả đủ tiền không có nghĩa đã giao đủ hàng.
- R03: Một yêu cầu ghi sổ có một tác động; giao dịch phải chống trùng và chống ghi đè phiên bản cũ.
- R04: Mã khách/NCC khác mã nội bộ. Không tự ghép theo tên hoặc chuỗi mã giống nhau.
- R05: Giữ lịch sử và snapshot. Phiếu đã ghi sổ sẽ dùng đảo/điều chỉnh, không xóa lịch sử.
- R06: Đầu kỳ và ngày chuyển đổi phải đối chiếu. Không suy diễn lịch sử thu chi từ số đã trả hiện tại.

## Hợp đồng dữ liệu lượt 1

### Danh mục nội bộ

Collection `item_catalog` lưu:

- `id`: `itm-` + SHA-256 của mã đã chuẩn hóa NFKC, trim, chữ hoa tiếng Việt. Cùng mã chuẩn hóa luôn dùng cùng document, kể cả khi hai người tạo đồng thời.
- `code`, `normalizedCode`, `name`, `kind`: `raw_material`, `finished_good`, `resale`.
- `baseUnit`: ĐVT cơ sở, chuẩn hóa chữ thường/khoảng trắng; `m2` và `m²` tương đương. Không coi `tem` và `cái` tương đương.
- `conversions`: tối đa 12 cặp `{unit, factor}`; **1 đơn vị giao dịch = factor × ĐVT cơ sở**, chỉ đúng cho mã đó. Không tự quy đổi cuộn, mét, diện tích.
- `notes`: quy cách/ghi chú; `active`, `revision`, ngày tạo/cập nhật và người cập nhật.

Mã, nhóm, ĐVT cơ sở và hệ số đã lưu không đổi. Được sửa tên/ghi chú, thêm ĐVT quy đổi, ngừng/kích hoạt mã. Mã ngừng sử dụng vẫn được giữ chỗ; không tạo lại cho hàng khác. Quy cách khác cần mã khác. Quy tắc này tránh đổi ý nghĩa số lượng ở các lượt kho sau.

### Liên kết dữ liệu hiện có

Collection `catalog_links` lưu **liên kết có xác nhận**, không ghi đè hồ sơ gốc:

- `source`: `{type, documentId, rowKey}`. Nguồn: vật tư `inventory`, sản phẩm trong `customers.products`, dòng trong `pos.items`.
- `sourceKey`: JSON của bộ ba trên; không dùng mã khách làm khóa toàn hệ thống.
- `rowKey`: `id:<ID dòng>` khi có ID, `index:<vị trí>` cho dòng cũ thiếu ID. Vật tư dùng document ID, rowKey rỗng.
- `sourceFingerprint`: dấu thay đổi nội dung kỹ thuật, đơn vị và thông tin định danh liên quan; PO gồm lượng đặt. Chỉ để phát hiện dữ liệu cũ, không phải cơ chế phân quyền.
- `catalogItemId`, `sourceUnit`, `baseUnit`, `factor`: ánh xạ và quy đổi đã xác nhận.
- `revision`, `updatedAt`, `updatedById`, tên/mã/nhãn nguồn dùng đối chiếu.

Máy chủ đọc lại nguồn, kiểm tra dấu thay đổi, bản sửa liên kết và quy đổi trước khi ghi. Tạo mã từ dòng nguồn ghi **mã + liên kết trong cùng transaction**. Đổi liên kết có audit trước/sau.

Không tự nối sản phẩm hai khách vì cùng mã. Không tự nối dòng PO nhập tay với danh mục khách. Không mặc định sản phẩm khách là thành phẩm; người tạo chọn nhóm. Vật tư kho cũ chỉ liên kết sang nhóm NVL.

Nguồn thiếu tên/ĐVT hoặc trùng ID dòng bị chặn liên kết. Không dùng bộ normalize CRM để tự sinh đơn vị/ID khi đọc nguồn chuyển đổi. Dòng cũ theo vị trí cần kiểm tra lại dấu thay đổi khi sử dụng; đây **không phải việc đã backfill ID cố định cho mọi PO cũ**.

`resolveCatalogSource` trả `unlinked`, `linked`, `stale`, `inactive`. Các lượt kho phải đọc lại nguồn và ánh xạ phía máy chủ, chặn các trạng thái chưa hợp lệ; không tin `catalogItemId`/hệ số do client tự gửi. LSX đã phát hành phải tiếp tục dùng snapshot kỹ thuật của chính LSX, không thay bằng danh mục hiện tại.

### Nhập danh mục

CSV UTF-8, tối đa 1 MB/50 dòng mỗi đợt; máy chủ còn giới hạn payload 250 KB. Không thêm thư viện Excel. Người dùng lưu bảng Excel thành CSV UTF-8, tải mẫu, xem trước và xác nhận. Chưa đọc trực tiếp `.xlsx`.

Cột theo đúng thứ tự:

```csv
code,name,kind,baseUnit,conversions,notes
NVL-VI-DU,Giấy ví dụ,raw_material,m²,,Thay bằng dữ liệu công ty
TP-VI-DU,Tem ví dụ,finished_good,cái,cuộn:1000,Quy đổi chỉ đúng mã này
```

Chấp nhận dấu phẩy, chấm phẩy hoặc tab; dấu nháy CSV và ghi chú nhiều dòng. Nhiều quy đổi ngăn bằng `|`. Tất cả dòng phải hợp lệ, mã không trùng trong tệp hay trong danh mục (kể cả ngừng sử dụng). Không tự ghi đè hoặc bỏ qua dòng lỗi. Nếu một dòng không lưu được thì toàn đợt không ghi.

`catalog_requests` lưu mã yêu cầu, người thực hiện, dấu nội dung, số mã và kết quả. Gửi lại đúng yêu cầu trả kết quả cũ; tái sử dụng mã yêu cầu cho nội dung/người khác bị từ chối. Lịch sử đợt CSV hiển thị trên màn hình nhập. Đây là biên nhận ghi danh mục, không phải chứng từ kho hoặc tiền.

### Quyền và nơi sử dụng

- Admin đang hoạt động; purchaser có trang Inventory/Purchase; accountant có trang Accounting được quản lý danh mục.
- Cùng component tại **Vật liệu → Danh mục hàng** và **Kế toán → Danh mục hàng**. Lượt 1 không mở trang kho cho Kế toán; lượt 3 bổ sung quyền kho hiệu lực bên dưới.
- Sale/producer/designer không tự được quyền quản trị danh mục mới dù có quyền trang khác.
- API xác thực token và tài khoản thật trên máy chủ; client không ghi trực tiếp 3 collection mới. Rules cho đúng nhóm đọc và từ chối toàn bộ client write.
- Demo chỉ đọc; lỗi mạng/API không được chuyển thành lưu local rồi báo thành công.

## Hợp đồng dữ liệu và workflow lượt 2

### Kế toán lập LSX

- Kế toán đang hoạt động, có trang Accounting hoặc Production được vào Sản xuất. Hồ sơ cũ chỉ có Accounting được nhận quyền hiệu lực này mà không sửa dữ liệu users. Màn hình quản trị người dùng giải thích quyền kế thừa.
- Kế toán tạo nháp từ PO, sửa và gửi duyệt **nháp do chính mình lập**, xem/in lệnh. Không phát hành, trả về nháp, hủy lệnh, bắt đầu chạy máy, QC, quản lý máy hoặc sửa luồng lệnh cũ. Admin/producer giữ quyền xử lý hiện có.
- UI và API cùng kiểm tra. API lấy vai trò/người thực hiện từ tài khoản xác thực, không tin nội dung client. Quyền ghi trực tiếp Firestore không mở rộng; LSX mới vẫn chỉ ghi qua transaction máy chủ.
- Mở danh sách máy với quyền chỉ đọc không khởi tạo các máy mặc định trong Firestore.

### Danh mục trên LSX

- API LSX thêm thao tác tra cứu chỉ đọc `action: catalog`, tham số `poId`, trả mã NVL đang hoạt động và liên kết mã cho từng dòng PO. Producer tra cứu qua API, không được mở quyền quản trị trực tiếp danh mục.
- Dòng hàng giữ nguyên kỹ thuật/số lượng/ĐVT từ PO. Máy chủ ưu tiên liên kết `po_item` đã xác nhận. Chỉ kế thừa liên kết `customer_product` khi có đúng customerProductId, đúng phiên bản và nội dung kỹ thuật/ĐVT trùng hồ sơ khách hiện tại. Không đoán mã từ tên hoặc chuỗi mã giống nhau.
- Lệnh cũ, dòng nhập tay hoặc chưa có liên kết vẫn lưu được theo luồng cũ, hiển thị rõ chưa liên kết. Lượt kho phải đối soát trước hạch toán; không dùng khả năng lưu nháp này để bỏ qua kiểm soát kho.
- Liên kết đã có nhưng stale/inactive chặn lưu/phát hành. Máy chủ bỏ mọi snapshot danh mục do client gửi, đọc lại danh mục/liên kết và quy đổi.
- `lines[].catalog` và `materials[].catalog` lưu snapshot `{id, code, name, baseUnit, sourceUnit, factor, revision, linkId?, linkRevision?}`. Vật tư được chọn từ danh mục còn lưu `catalogItemId`; chỉ nhận nhóm raw_material và ĐVT có hệ số khai báo.
- Đổi danh mục/liên kết sau gửi duyệt yêu cầu trả về nháp, lưu lại rồi duyệt. Sau phát hành, lệnh tiếp tục dùng snapshot đã lưu, không tự thay từ danh mục hiện tại. Không backfill hoặc ghi đè PO/LSX lịch sử.

### Mẫu in tem trắng

- Ảnh mẫu người dùng gửi ngày 22/10/2026 là đầu vào cho **Tem trắng — mẫu công ty v1** (`printTemplate: {id: white_label, version: 1}`). Không nhập mã/tên/số lượng ví dụ trên ảnh vào dữ liệu thật.
- Phiếu chung hiện có (`standard`, v1) vẫn là mặc định; lệnh thiếu printTemplate tiếp tục dùng phiếu chung. Người lập chọn mẫu khi tạo/sửa nháp. Không tự suy mẫu theo tên sản phẩm, không cung cấp HTML mẫu tùy ý.
- Phiếu tem trắng A4 ngang có thông tin đầu lệnh, 12 cột kỹ thuật/ảnh, vật tư dự kiến, vùng kho cấp, thừa/thiếu và chữ ký. Dùng logo sẵn có trong repository; không lấy logo/hotline hoặc ảnh cuộn ví dụ trên mẫu làm dữ liệu thật.
- `customerCode` chụp mã khách từ PO/hồ sơ khách lúc lưu. `lines[].printDetails` bổ sung khổ NVL (mm) và ưu tiên riêng theo dòng; không sửa kỹ thuật PO. Không lấy chiều rộng con tem làm khổ NVL.
- Chia nội dung theo 6 dòng sản phẩm/5 dòng vật tư mỗi tờ; ghi chú dài có trang bổ sung, không bỏ dữ liệu. Bản nháp/chờ duyệt/hủy có dấu cảnh báo không dùng triển khai sản xuất.
- Các ô cấp kho, thừa/thiếu và ký xác nhận để trống để ghi nhận theo chứng từ thực tế. Không điền số 0 giả, không coi mẫu in là phiếu kho đã ghi sổ. In không đổi trạng thái, tồn kho hay công nợ.

### Mẫu lệnh sản xuất A4 chuẩn

- **Lệnh sản xuất — mẫu A4 chuẩn v1** (`printTemplate: {id: production_order, version: 1}`), bố cục theo mẫu tham chiếu
  người dùng gửi ngày 30/10/2026: đầu phiếu công ty, số phiếu/lần sửa đổi, ngày ban hành, bảng thành phẩm (mã, tên, quy
  cách, ĐVT, số lượng, khách, đơn hàng), vật tư dự kiến kèm cột SL lĩnh thực tế để trống, yêu cầu kỹ thuật, ghi chú và ký
  Người lập lệnh / Giám đốc sản xuất / Trưởng phòng KHSX.
- Dòng tổng chỉ cộng khi mọi dòng cùng ĐVT; không quy đổi đơn vị. Định mức vật tư theo từng thành phẩm/công đoạn chưa có
  trong dữ liệu lệnh nên vật tư in theo cả lệnh.
- Đầu phiếu dùng chung `src/shared/print/printSheet.ts`. Địa chỉ, điện thoại, MST công ty chưa được người dùng cung cấp
  nên in dòng chấm để điền tay. Xuất PDF qua hộp thoại in của trình duyệt ("Lưu dưới dạng PDF").

## Hợp đồng lượt 3 — sổ số lượng NVL

Đã triển khai mã nguồn theo quyết định người dùng tại `ACCOUNTING_DECISIONS.md`; chi tiết collection, API, quyền, kiểm tra và giới hạn tại `WAREHOUSE.md`.

- Một kho NVL chung, nhập mua từng phần, cấp nhiều lần/bổ sung và hoàn theo LSX; số dư và phiếu mới tách khỏi dữ liệu cũ để đối soát. Không tự cộng tồn cũ vào đầu kỳ.
- Ánh xạ mã/quy đổi có xác nhận, đóng băng theo dòng nguồn; LSX đã phát hành giữ snapshot. Ghi sổ qua một API transaction; phiếu đã ghi chỉ đảo, không sửa/xóa. Admin đảo; kế toán Accounting và mua hàng Inventory cùng Admin được ghi. Xuất âm có cảnh báo, xác nhận/lý do; ngày hiện tại tại Việt Nam.
- Vật liệu có số dư theo mã, ngưỡng thấp, lịch sử phiếu và nhập xuất tồn theo khoảng ngày. Mua hàng NVL dùng cùng form; chi tiết LSX hiển thị phiếu cấp/hoàn. Không hủy LSX khi còn NVL cấp ròng.
- Kế toán Accounting kế thừa quyền Vật liệu; không sửa users cũ. Dashboard đọc số dư mới, không trộn tồn cũ. Cột “Tồn theo sổ” và thông báo làm rõ chưa có đầu kỳ thật.
- Nhập mua NVL không tự sinh payable; tiền nối ở lượt 5 theo yêu cầu trực tiếp. Hóa đơn và nhận mua không phải NVL giữ luồng hiện tại. Lưu/phát hành/in/QC LSX không tự hạch toán kho.

## Phạm vi chưa thực hiện

Chưa nhập dữ liệu thật hoặc đầu kỳ tồn/nợ; danh mục không tự đổi số lượng/tiền. Đã có mã nguồn thành phẩm/giao/trả ở lượt 4; đã có sổ công nợ/thu chi mới ở lượt 5; chưa có giá vốn/sổ cái/tích hợp thuế/ngân hàng. Supplier SKU riêng, lô/cuộn/vị trí, giữ chỗ NVL và khóa chất lượng chưa có. Chưa kiểm tra trình duyệt/máy in thật hoặc deploy API/web/rules thực tế.

Kho cũ chỉ đọc; sổ số lượng mới có ở lượt 3–4, chưa bao gồm đầu kỳ chưa đối soát. Lượt 5 đã thay ghi thanh toán trực tiếp bằng sổ công nợ/thu chi mới; hóa đơn trước đó chỉ đọc. Nhận mua mọi loại chỉ ghi số lượng qua API kho, không tự tạo payable. Không coi các lượt 1–5 là đã chuyển đổi dữ liệu thật hoặc hoàn thành báo cáo/nghiệm thu.

## Kiểm tra bắt buộc các lượt tiếp theo

Build client và server; test hành vi liên quan, quyền, dữ liệu cũ, request gửi lại và đồng thời. Lint phần mới; so sánh baseline khi đụng trang cũ. Không tự kiểm thử trình duyệt nếu người dùng chưa yêu cầu. Commit đúng file công việc và push `origin/main`; phân biệt push với deploy API, deploy rules và chuyển dữ liệu thật.


## Hợp đồng lượt 4 — thành phẩm và hàng giao

Mã nguồn theo FINISHED_GOODS.md, quyết định D08-4 tại ACCOUNTING_DECISIONS.md. Nội dung này thay phần nhận mua không phải NVL còn luồng cũ ở hợp đồng lượt 3 phía trên.

- Nhập thành phẩm từng phần theo lượng đạt LSX v2 hoàn thành; hàng mua/gia công nhập kho hoặc NCC giao thẳng. Một kho thành phẩm chung, không trộn NVL.
- Xuất giảm tồn, tăng đang giao; POD thực nhận từng dòng. Hoàn giao thất bại, khách trả/giao bù có phiếu gốc/cap; hàng giao thẳng quay về công ty hoặc NCC theo thực tế. Không xuất âm thành phẩm.
- Admin/Mua hàng Inventory/Kế toán Accounting ghi số lượng; người có Giao hàng xác nhận POD; chỉ Admin đảo/đóng thiếu có xác nhận khách. Không ghi lượng thiếu thành đã giao.
- Transaction là nguồn duy nhất ghi số dư, nguồn, PO/chuyến/xe, phiếu/audit/requestId. Rules khóa đường ghi tắt và nguồn đã phát sinh. Không nhập đầu kỳ, không tự chuyển phiếu cũ hoặc sinh tiền từ nhận hàng.
- Mua hàng bỏ handler tự sinh payable khi nhận hàng không phải NVL. Hóa đơn đã có giữ nguyên; mốc tăng/giảm công nợ và quyền tiền cần chốt ở lượt 5. Chưa có nghiệm thu hoặc xác nhận deploy thực tế.


## Hợp đồng lượt 5 — sổ công nợ và tiền

Đã có mã nguồn theo ACCOUNTING_LEDGER.md và D05b-5/D06-5/D07-5. Phần này thay mô tả luồng tiền còn cũ ở bàn giao các lượt trước.

Kế toán xác nhận nguồn hàng để ghi nợ, thu/chi lập riêng rồi phân bổ tới dòng mã/chứng từ. Có ứng trước, đầu kỳ, điều chỉnh/hàng trả, hoàn tiền, đảo và khóa kỳ; bảo toàn chứng từ cũ. Phân quyền/tiền VND/làm tròn/ngày theo quyết định trực tiếp. Một transaction bảo vệ số dư, nguồn, PO, khoản tiền, chứng từ, audit và retry. Số chưa dùng không tự bù trừ và số đã trả cũ không tự biến thành lịch sử tiền.

Báo cáo tháng/cảnh báo và đồng bộ các chỉ tiêu CRM/NCC/Dashboard là lượt 6. Chuyển đầu kỳ thật, dữ liệu lịch sử và deploy/nghiệm thu vẫn lượt 7; chưa thực hiện trong lượt 5.

## Hợp đồng lượt 6 — báo cáo và cảnh báo

Đã có mã nguồn theo ACCOUNTING_REPORTS.md. Công nợ theo kỳ phát lại sự kiện, giữ lịch sử đảo khác tháng, dư đầu/phát sinh/cuối và ứng trước riêng; dòng tiền khác phân bổ. Có tổng hợp tuổi nợ, chi tiết chứng từ/đơn/mã và CSV theo bộ lọc.

Hàng còn giao/nhận và kho là snapshot hiện tại, có ghi rõ thời điểm, dùng ID/quy đổi/counter của lượt 3–4; không áp dụng kỳ tiền hoặc suy số cũ thành sự kiện mới. Nguồn cũ/thay đổi/mất dòng đưa vào đối soát. Ngưỡng tồn dùng chung cho NVL và thành phẩm/hàng mua, giữ quyền ghi kho và revision.

Khách hàng/NCC/Dashboard dùng số dư sổ mới, nợ cũ chưa chuyển đổi và ứng trước riêng. Báo cáo đầy đủ chỉ Admin/Kế toán Accounting; Sale/Mua hàng chỉ có tóm tắt đúng phân hệ/phạm vi hiện có, không có quyền ghi tiền. Cảnh báo trước mặc định 3 ngày có bộ lọc, chưa tự gửi thông báo. Không sửa rules, không chuyển dữ liệu thật/deploy; lượt 7 vẫn chưa thực hiện.
