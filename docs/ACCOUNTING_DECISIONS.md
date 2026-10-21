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

## Quyết định cần đầu vào công ty trước lượt tương ứng

| Mã | Cần xác nhận | Lượt cần |
|---|---|---|
| D01 | Mẫu LSX thực tế, loại mẫu, trường dữ liệu và vùng ký | 2 |
| D02f | Dữ liệu mã thật, hệ số thực tế; có quản lý lô/cuộn/vị trí hay không | 1 khi nhập thật; cấu trúc kho ở 3 |
| D03 | Số kho, giữ chỗ, lượng khóa chất lượng; ngưỡng tối thiểu theo thực tế hay khả dụng | 3 |
| D04 | Cảnh báo hay chặn xuất âm; ngoại lệ; kiểm soát lùi ngày | 3 |
| D05b | Ai ghi sổ kho, duyệt tiền, đảo phiếu, khóa/mở kỳ; phạm vi sửa nháp LSX | 2/3/5 |
| D06 | Mốc ghi tăng nợ bán/mua, hạn nợ, tiền tệ, thuế và làm tròn | 3 khi nối mua; 5 |
| D07 | Phân bổ thu chi tới dòng mã hay chứng từ, gợi ý và ứng trước | 5 |
| D08 | Mốc trừ kho giao khách, hàng đi đường, giao thất bại, trả/giao bù | 4 |
| D09 | Ngày chuyển đổi, đầu kỳ tiền/kho và hàng còn thực hiện, thiếu lịch sử | 7 |
| D10 | Ngày nhắc, dung sai giao nhận/đóng thiếu, quyền xem công nợ | 6 |

Không có mẫu thật thì chưa chốt mẫu in. Không có đầu kỳ được xác nhận thì không chạy nhập số dư thật. Không bịa lịch sử thanh toán hoặc suy số quy đổi từ mã hàng.
