# Lệnh sản xuất — bước triển khai đầu

## Đã triển khai

- Menu **Sản xuất** nằm ngay dưới **Đơn hàng**, có hai tab **Lệnh sản xuất** và **Danh sách máy**. Đơn hàng không còn tab LSX. Toàn bộ lệnh mới / cũ dùng chung `production_commands`; có thể tìm kiếm, lọc loại lệnh và tạo lệnh mới tại Sản xuất.
- Chọn một PO, xác định các dòng cần sản xuất (không tự coi hàng mua lại / dịch vụ là hàng sản xuất), chia từng dòng thành nhiều LSX. Dòng nhập tay dùng `itemId`, không phụ thuộc mã sản phẩm.
- Nháp → Chờ duyệt → Duyệt & phát hành → Bắt đầu sản xuất → Nghiệm thu QC. Có trả về nháp và hủy lệnh chưa chạy; không xóa cứng lệnh mới.
- Lưu thông số từ PO, nhân sự, máy, ca, ngày cần, ưu tiên, ghi chú và vật tư dự kiến. Sau phát hành, thông số và dòng hàng được khóa; danh mục sản phẩm thay đổi không sửa phiếu đã phát hành.
- QC ghi nhận sản lượng đạt / hỏng theo từng mặt hàng và ĐVT. Thiếu sản lượng có thể lập lệnh bổ sung. PO chỉ chuyển từ chờ sản xuất sang chờ giao khi đủ sản lượng đạt của toàn bộ các dòng cần SX.
- Xem trước / in A4 ngang / lưu PDF, có vật tư dự kiến, vùng ghi cấp kho / đối soát và chữ ký. Bản nháp / hủy có cảnh báo không dùng để triển khai.
- Chống phân bổ vượt PO, trùng yêu cầu, ghi đè phiên bản cũ và hai lệnh chạy cùng máy bằng giao dịch máy chủ. Mã LSX đánh số liên tục theo ngày Việt Nam. Lưu nhật ký và audit trong cùng giao dịch.

## Quyền và dữ liệu

- Sale không truy cập trang Sản xuất và không được gọi API tạo / sửa / gửi duyệt / hủy LSX, kể cả nháp do Sale lập trước đây. Dữ liệu những lệnh này vẫn giữ nguyên để Admin / nhân sự Sản xuất tiếp tục xử lý.
- Admin / nhân sự có vai trò `producer` **và** quyền Sản xuất được lập, sửa, gửi duyệt, phát hành, chạy và nghiệm thu LSX. Người chạy phải đang hoạt động và có quyền Sản xuất.
- Các LSX cũ nằm cùng danh sách tại **Sản xuất → Lệnh sản xuất**, mở chi tiết để báo cáo hoàn thành hoặc bàn giao theo quyền cũ. Không tự đoán phân bổ theo dòng PO; PO có lệnh cũ cần đối soát trước khi lập lệnh mới.
- Đã bỏ cơ chế trừ giấy / mực bằng hệ số cố định khi hoàn thành lệnh cũ. Lệnh cũ hoàn thành được đánh dấu cần đối soát, không tự đưa toàn PO sang chờ giao.
- Nháp giữ chỗ số lượng nhưng vẫn cho phép bộ phận thiết kế cập nhật PO. Khi phát hành, máy chủ kiểm tra lại nguồn dữ liệu; nếu đã đổi phải trả về nháp và lưu lại. Sau phát hành, cấm sửa mặt hàng của PO. Hủy toàn bộ lệnh chưa chạy sẽ mở lại phạm vi kế hoạch.

## Danh sách máy

- Gom thông số, năng lực, trạng thái, LSX đang phân công, ca / người vận hành và hạn giao vào một bảng. Có thống kê tải máy và cảnh báo lệnh chưa khớp danh mục.
- Giữ chức năng thêm / sửa / ngừng sử dụng máy; không ngừng máy còn LSX hoạt động. Không còn tab Lịch máy riêng.

## Chưa triển khai ở bước này

Phiếu cấp NVL thực tế nhiều lần, lô / kho, quy đổi ĐVT, hoàn kho, cấp bổ sung và hạch toán tiêu hao. Các vùng cấp kho / đối soát trên bản in để ghi nhận theo chứng từ riêng, **không phải dữ liệu xuất kho đã được xác nhận**.

Không có thao tác lưu / phát hành / in / nghiệm thu LSX nào tự trừ tồn kho. Khi nối phiếu kho ở bước sau cần một nguồn hạch toán duy nhất, chống ghi nhận hai lần.

## Triển khai

1. Triển khai ứng dụng và API `POST /api/production/manage` trên Vercel. API dùng các biến máy chủ hiện có: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Không đưa khóa này vào biến `VITE_*`.
2. Triển khai `firestore.rules` cùng phiên bản: `firebase deploy --only firestore:rules`. Quy tắc mới chặn ghi trực tiếp lệnh mới và bảo vệ phạm vi / phiên bản phân bổ trong PO. Các truy vấn chỉ dùng chỉ mục đơn trường `poId`, `machineId`.
3. Local cần API máy chủ (ví dụ `vercel dev`); `vite` đơn thuần không phục vụ `/api`. Chế độ dữ liệu demo chỉ xem danh sách, không giả lập giao dịch hoặc âm thầm lưu local khi API lỗi.
4. Danh mục máy phải được lưu trong hệ thống; mở **Sản xuất → Danh sách máy** để cấu hình trước khi phát hành.

## Kiểm tra

- `node --test tests/production-orders.test.cjs`: kiểm thử model và API với mô phỏng giao dịch có retry / kiểm tra phiên bản, không kết nối dữ liệu thật.
- Kiểm thử hai tab Sản xuất, lệnh cũ / mới, quyền Sale, danh sách máy; các kiểm thử PO nhập tay, đồng bộ mã sản phẩm, build TypeScript / Vite và lint theo phạm vi.
- Chưa kiểm thử trình duyệt, máy in thực hoặc triển khai quy tắc trên Firebase trong lượt này.
