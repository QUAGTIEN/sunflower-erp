# Quyết định nghiệp vụ kế toán

Kế hoạch chính thức: 7 lượt, theo `ACCOUNTING_SPEC.md`. Yêu cầu trực tiếp đã chốt: cả tiền và hàng, cả NVL và thành phẩm, Kế toán được lập LSX ở lượt 2, Sale tiếp tục bị chặn Sản xuất.

## Các lựa chọn triển khai của lượt 1

Đây là lựa chọn kỹ thuật trong phạm vi được cho phép code, không thay thế các quyết định kế toán còn chờ xác nhận.

| Mã | Lựa chọn | Căn cứ |
|---|---|---|
| D02a | Mã nội bộ độc lập; mã chuẩn hóa duy nhất, không tái dùng mã đã ngừng | Tránh ghép nhầm sản phẩm giữa khách; giữ lịch sử |
| D02b | Mỗi mã một ĐVT cơ sở; quy đổi khai báo riêng cho mã | Không thể suy hệ số cuộn/mét/diện tích từ tên |
| D02c | Giữ mã, nhóm, ĐVT và hệ số đã lưu; thêm quy đổi hoặc tạo mã mới | Không thay đổi ý nghĩa số lượng lịch sử |
| D02d | Liên kết lưu riêng; nguồn cũ không bị ghi đè | Bảo toàn PO, LSX đóng băng và số tồn hiện tại |
| D02e | Nhập CSV UTF-8 có xem trước, tối đa 50 dòng/đợt, tạo mới toàn bộ hoặc không ghi | Không thêm dependency; tránh bỏ sót hoặc ghi một phần |
| D05a | Quản trị danh mục cho Admin; Mua hàng có Inventory/Purchase; Kế toán có Accounting | Đúng công việc đã thống nhất, không mở quyền kho/LSX/thu chi mới |

## Các lựa chọn triển khai của lượt 2

| Mã | Lựa chọn | Căn cứ |
|---|---|---|
| D01a | Mẫu tem trắng v1 theo ảnh thật được gửi ngày 22/10/2026; giữ phiếu chung v1 làm mặc định | Có đầu vào biểu mẫu; bảo toàn cách in lệnh cũ, người lập chọn mẫu rõ ràng |
| D01b | Thêm khổ NVL và ưu tiên theo dòng ở LSX, không sửa kỹ thuật PO | Khổ vật liệu đầu vào khác chiều rộng con tem; không tự suy số liệu |
| D01c | Cấp kho, thừa/thiếu, người cấp và chữ ký để trống trên bản in | Chưa có chứng từ cấp/hoàn kho thực tế ở lượt 2; không bịa dữ liệu mẫu |
| D05b-2 | Kế toán có Accounting hoặc Production được lập, sửa/gửi duyệt nháp của mình; không hủy, phát hành, chạy máy, QC hay quản lý máy | Người dùng cho thêm Kế toán lập LSX; chọn phạm vi tối thiểu, giữ quyền vận hành cho Sản xuất/Admin |
| D05c | Quyền Sản xuất kế thừa từ Accounting chỉ áp dụng vai trò accountant, không sửa users cũ và không mở quyền ghi client rules | Cho hồ sơ hiện hữu dùng được, không vô tình cấp quản lý kho/máy/lệnh cũ |
| D02g | Máy chủ lấy liên kết PO trước; kế thừa sản phẩm khách chỉ khi đúng ID, phiên bản, kỹ thuật và ĐVT | Tái dùng danh mục lượt 1, không ghép nhầm dòng nhập tay hoặc snapshot cũ |
| D02h | Mã nội bộ/quy đổi và mẫu in được chụp trên lệnh; thay đổi trước phát hành phải trả về lưu lại; sau phát hành dùng snapshot | Không thay ý nghĩa phiếu lịch sử hoặc nội dung đã duyệt |

## Quyết định lượt 3 — đã được người dùng xác nhận ngày 23/10/2026

| Mã | Quyết định |
|---|---|
| D02f-3 / D03-3 | Một kho NVL chung; chưa quản lý lô/cuộn/vị trí. Không chuyển tồn cũ tự động; đầu kỳ thật chốt ở lượt 7 |
| D04-3 | Cảnh báo xuất âm, cho người có quyền ghi sổ xác nhận kèm lý do; không ghi lùi/ngày tương lai |
| D05b-3 | Admin, purchaser có Inventory, accountant có Accounting ghi sổ; chỉ Admin đảo; Producer chỉ xem |
| D06-3 | Nhập mua NVL chỉ ghi số lượng, không tự tạo hóa đơn phải trả; công nợ nối ở lượt 5 |

Chi tiết triển khai tại `WAREHOUSE.md`: cấp/hoàn thực tế, ánh xạ rõ từng dòng, snapshot, biên nhận chống trùng, ngưỡng theo số dư ĐVT cơ sở. Chưa đặt giữ chỗ NVL từ lượng dự kiến hoặc khóa chất lượng. Các lựa chọn về tiền/kỳ, thành phẩm/giao hàng và chuyển đổi thật dưới đây còn cần chốt ở lượt tương ứng.

## Đầu vào còn cần trước các lượt tiếp theo

| Mã | Cần xác nhận | Lượt cần |
|---|---|---|
| D02f | Dữ liệu mã thật, hệ số thực tế khi nhập/chuyển đổi; mở rộng lô/cuộn/vị trí nếu có yêu cầu sau | 7 / mở rộng |
| D03 | Giữ chỗ/khóa chất lượng nếu mở rộng; hiện chỉ số dư phiếu và ngưỡng theo ĐVT cơ sở | Sau phạm vi hiện tại |
| D05b | Ai duyệt tiền, đảo tiền, khóa/mở kỳ kế toán | 5 |
| D06 | Mốc ghi tăng nợ bán/mua, hạn nợ, tiền tệ, thuế và làm tròn; không nối nợ ở lượt 3 | 5 |
| D07 | Phân bổ thu chi tới dòng mã hay chứng từ, gợi ý và ứng trước | 5 |
| D08 | Đã chốt D08-4 bên dưới; thay đổi dung sai/chất lượng hàng trả cần xác nhận riêng | 4 / mở rộng |
| D09 | Ngày chuyển đổi, đầu kỳ tiền/kho và hàng còn thực hiện, thiếu lịch sử | 7 |
| D10 | Ngày nhắc, dung sai giao nhận/đóng thiếu, quyền xem công nợ | 6 |

Mẫu tem trắng đã có đầu vào; mẫu công ty khác chỉ bổ sung khi có tài liệu thật. Không có đầu kỳ được xác nhận thì không chạy nhập số dư thật. Không bịa lịch sử thanh toán hoặc suy số quy đổi từ mã hàng.


## Quyết định lượt 4 — ngày 23/10/2026

| Mã | Quyết định đã chốt |
|---|---|
| D08a-4 | Một kho thành phẩm chung, tách NVL; QC không tự nhập, nhập theo lượng đạt có phiếu; xuất kho tăng hàng đang giao, POD chỉ tăng thực nhận |
| D08b-4 | Hàng mua/gia công hỗ trợ cả nhập kho công ty và NCC giao thẳng khách ngay lượt 4. Giao thẳng không tạo tồn kho công ty |
| D08c-4 | Hoàn giao thất bại/khách trả theo phiếu xuất gốc, mở lại phần cần giao. Hàng giao thẳng chọn đích thực tế công ty/NCC, chỉ về công ty mới tăng tồn công ty |
| D08d-4 | Chặn xuất âm thành phẩm; không tự ghi hàng hoàn khi hoãn chuyến; không coi lượng kế hoạch là đã giao |
| D05b-4 | Giữ nhóm ghi sổ lượt 3; người có Giao hàng xác nhận thực nhận/POD; chỉ Admin đảo phiếu và đóng thiếu có lý do, xác nhận khách |
| D08e-4 | Không tự lấp phần thiếu vào qtyDelivered; không tự chuyển số dư/lịch sử cũ. Công nợ và điều chỉnh tiền hàng trả nối ở lượt 5 |

Chi tiết tại FINISHED_GOODS.md. D08b và D05b-4 là hai câu trả lời trực tiếp của người dùng trong lượt này; kiểm soát phiếu, số dư và chống ghi trùng triển khai trong phạm vi đã duyệt.
