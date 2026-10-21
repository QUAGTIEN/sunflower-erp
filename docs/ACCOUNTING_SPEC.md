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

Yêu cầu đã xác nhận: theo dõi **cả nợ tiền và hàng chưa giao/nhận**, **cả NVL và thành phẩm**, bổ sung **Kế toán lập LSX**. Sale không truy cập Sản xuất. Quyền LSX thuộc lượt 2, chưa mở trong lượt 1.

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
- Cùng component tại **Vật liệu → Danh mục hàng** và **Kế toán → Danh mục hàng**. Không thêm menu, không mở trang kho cho Kế toán.
- Sale/producer/designer không tự được quyền quản trị danh mục mới dù có quyền trang khác.
- API xác thực token và tài khoản thật trên máy chủ; client không ghi trực tiếp 3 collection mới. Rules cho đúng nhóm đọc và từ chối toàn bộ client write.
- Demo chỉ đọc; lỗi mạng/API không được chuyển thành lưu local rồi báo thành công.

## Phạm vi chưa thực hiện

Chưa nhập dữ liệu thật, chưa tạo đầu kỳ tồn/nợ, chưa cộng trừ kho hay tiền qua danh mục. Chưa tự nối supplier SKU vào đơn mua; phần nguồn mua/nhận kết nối ở lượt 3. Chưa mở quyền LSX cho Kế toán, chưa sửa mẫu LSX. Chưa triển khai giá vốn/sổ cái/thuế/ngân hàng.

Hành vi kho và thanh toán cũ vẫn tồn tại để tương thích, **chưa phải sổ kế toán mới**. Không coi lượt 1 là hoàn thành kho nguyên vật liệu hoặc công nợ.

## Kiểm tra bắt buộc các lượt tiếp theo

Build client và server; test hành vi liên quan, quyền, dữ liệu cũ, request gửi lại và đồng thời. Lint phần mới; so sánh baseline khi đụng trang cũ. Không tự kiểm thử trình duyệt nếu người dùng chưa yêu cầu. Commit đúng file công việc và push `origin/main`; phân biệt push với deploy API, deploy rules và chuyển dữ liệu thật.
