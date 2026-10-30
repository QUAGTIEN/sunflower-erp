# Chuẩn mã chứng từ và mã hàng

## Quyết định D-MA1 (chốt 30/10/2026)

Người dùng đồng ý bộ mã dưới đây. Mã chỉ gồm chữ in hoa không dấu, chữ số và dấu "-"; do hệ thống tự cấp; đã cấp thì
không sửa, không dùng lại kể cả khi chứng từ bị hủy hoặc xóa. Số thứ tự đệm 0 và **đánh lại mỗi tháng**.

| Đối tượng | Khuôn mã | Ví dụ |
|---|---|---|
| Đơn hàng | `DH-YYMM-NNNN` | `DH-2610-0007` |
| Lệnh sản xuất | `LSX-YYMM-NNNN` | `LSX-2610-0015` |
| Thành phẩm theo khách | `TP-MÃKH-NNN` | `TP-AQUA-012` |
| Hàng chuẩn / tem trắng | `TC-NNNN` | `TC-0031` |
| Hàng mua bán lại | `HM-NNNN` | `HM-0004` |
| Nguyên vật liệu | `NVL-NHÓM-NNN` | `NVL-DCG-001` |
| Yêu cầu mua | `YCM-YYMM-NNNN` | `YCM-2610-0003` |
| Đơn mua NCC | `DM-YYMM-NNNN` | `DM-2610-0002` |
| Phiếu nhập kho | `PN-YYMM-NNNN` | `PN-2610-0040` |
| Phiếu xuất kho | `PX-YYMM-NNNN` | `PX-2610-0052` |
| Chuyến giao hàng | `GH-YYMM-NNNN` | `GH-2610-0011` |

Nhóm NVL: `DCG` decal giấy, `DCN` decal nhiệt, `PP` màng PP, `PET` màng PET, `MUC` mực, `RIB` ribbon, `KEO` keo,
`LOI` lõi giấy. Thêm nhóm mới phải được người dùng duyệt.

- **Mã khách viết tắt** (3–5 chữ in hoa, ví dụ `AQUA`) dùng trong mã thành phẩm; Admin hoặc Kế toán đặt khi tạo khách,
  không sửa được sau khi khách đã có đơn hàng. Mã khách hiện có `KH-NNNN` giữ nguyên.
- Quy cách (khổ, chất liệu, kích thước) không nằm trong mã sản phẩm mà ở trường riêng.
- **Số PO của khách** là trường tham chiếu "Số PO khách", tìm kiếm được, không dùng làm mã chính. Mã sản phẩm của khách
  tiếp tục lưu ở bảng liên kết có xác nhận, không tự ghép theo tên hay mã (nguyên tắc B4).
- **Mã đã cấp giữ nguyên.** Bộ mã mới chỉ áp dụng cho chứng từ và mã hàng tạo sau khi phiên bản có bộ mã mới được triển
  khai. Mã sản phẩm hiện có không đổi; đổi mã cũ (nếu muốn) là một đợt chuyển đổi riêng, giữ mã cũ làm tham chiếu.

## Hiện trạng cấp mã (trước khi áp dụng D-MA1)

| Chứng từ | Mã hiện tại | Nơi cấp | Ghi chú |
|---|---|---|---|
| Đơn hàng | `PO-YYYYMM-NNNN` | Trình duyệt, đếm theo đơn đã có | Hai người tạo cùng lúc có thể trùng số |
| Lệnh sản xuất | `LSX-YYYYMMDD-NNNN` | Máy chủ, bộ đếm theo ngày | |
| Phiếu kho NVL | `KHO-YYYYMMDD-NNNN` | Máy chủ, bộ đếm theo ngày | |
| Phiếu thành phẩm / giao | `TP-YYYYMMDD-NNNN` | Máy chủ, bộ đếm theo ngày | Trùng tiền tố `TP` với mã thành phẩm mới |
| Chứng từ tiền | `KT-YYYYMMDD-NNNN` | Máy chủ | Ngoài phạm vi D-MA1 |
| Đơn mua | `PUR-YYMM-` + 4 số ngẫu nhiên | Trình duyệt | Có thể trùng |
| Chuyến giao hàng | `DEL-YYMM-` + 4 số ngẫu nhiên | Trình duyệt | Có thể trùng |
| Yêu cầu mua | `MH-…`, `PR-<LSX>-NN` | Trình duyệt / máy chủ | Theo mã đơn hàng hoặc LSX nguồn |
| Khách hàng / NCC | `KH-NNNN`, `NCC-NNNN` | Trình duyệt | Giữ nguyên |

## Thứ tự triển khai

1. Đơn hàng `DH` và lệnh sản xuất `LSX` theo tháng, cấp số bằng bộ đếm trong giao dịch để không trùng.
2. Mã khách viết tắt và mã hàng tự cấp trong danh mục (`TP`, `TC`, `HM`, `NVL-NHÓM`).
3. Yêu cầu mua, đơn mua, phiếu nhập / xuất kho, chuyến giao hàng.
