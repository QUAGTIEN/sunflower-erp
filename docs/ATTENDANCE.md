# Chấm công theo lịch tháng

## Phạm vi đã triển khai

- Phân hệ `attendance` độc lập, nằm ngay dưới Công việc trên sidebar. Không thay đổi chức năng Công việc, header, logo hoặc thứ tự các mục khác.
- Ba tab: Chấm công, Duyệt chấm công, Thiết lập chấm công. Không có bộ đếm sau tên tab.
- Chấm công có hai cách xem: Lịch tháng (mặc định) và Bảng công theo ngày. Lịch bắt đầu từ thứ Hai, tự hiển thị 4–6 tuần đúng theo tháng; desktop ưu tiên lịch rộng, màn hình hẹp cuộn ngang.
- Bấm ngày mở modal nhỏ; lưu từng ngày, sửa hoặc xóa có thông báo kết quả. Xóa dùng hộp xác nhận chung. Modal hỗ trợ bàn phím, giữ focus và Escape; có cảnh báo khi bỏ dữ liệu nhập chưa lưu.
- Full-time: Đi làm, phút trễ, giờ OT. Tổng kết: tổng công, tổng phút trễ, tổng OT.
- Part-time: tổng giờ làm trong ngày, phút trễ; không có giờ vào/ra hoặc trường OT riêng. Tổng kết: tổng giờ, tổng phút trễ, số buổi.
- Duyệt chấm công: lọc tháng, tên, trạng thái; phân trang; xem bảng công, duyệt hoặc yêu cầu chỉnh sửa.
- Thiết lập: chọn hình thức làm việc và Admin duyệt cho từng nhân viên đang hoạt động; có tìm kiếm, phân trang và lưu những dòng đã đổi.

## Mặc định nghiệp vụ cho bản đầu

Các mặc định sau được thông báo khi bắt đầu triển khai vì trước đó chưa có câu trả lời riêng cho từng điểm:

1. Hình thức làm việc theo thiết lập nhân viên, không chọn lại tùy ý mỗi ngày. Chưa thiết lập thì chưa được nhập công; không tự gán Full-time cho toàn bộ tài khoản cũ.
2. Full-time đi làm = 1 công/ngày. Part-time có giờ làm > 0 = 1 buổi/ngày; nhiều ca cùng ngày nhập tổng giờ vào một bản ghi.
3. Nhân viên đang hoạt động được vào Chấm công cá nhân, kể cả hồ sơ cũ chưa có `attendance` trong `allowedPages`. Không sửa hàng loạt hồ sơ tài khoản. Mặc định trang mới của cả sáu vai trò có attendance.
4. Nhân viên chỉ xem/cập nhật công của mình. Admin xem tổng hợp, thiết lập và duyệt. Admin cũng chỉ nhập công của chính mình; không có chức năng chấm công hộ. Hai tab quản lý vẫn hiện nhưng bị vô hiệu hóa đối với nhân viên.
5. Gửi duyệt theo tháng. Tháng đang chờ duyệt hoặc đã duyệt khóa cả sửa và xóa. Admin trả về, có lý do bắt buộc, rồi nhân viên sửa/gửi lại. Không tự mở khóa sau khi đổi thiết lập.
6. Nếu có chỉ định người duyệt thì chỉ Admin đó được duyệt/trả về khi tài khoản còn hoạt động. Nếu bỏ trống, tất cả Admin đều có thể xử lý. Nếu người duyệt đã khóa/xóa, Admin khác có thể trả về/duyệt để phục hồi luồng; người duyệt phải hợp lệ khi nhân viên gửi duyệt. Bản đầu cho phép Admin duyệt công của chính mình, có audit.
7. Không ghi nhận ngày tương lai theo múi giờ `Asia/Ho_Chi_Minh`. Cho phép nhập bù ngày trước; không có quy định ngày khóa sổ riêng.
8. Giờ làm Part-time > 0 và <= 24 giờ/ngày; OT từ 0 đến 24 giờ/ngày; tối đa hai chữ số thập phân. Phút trễ là số nguyên 0–1.440. Đây là giới hạn dữ liệu nhập, không phải quy định tính lương.

Không bao gồm tính lương, trừ lương vì đi trễ, phép/nghỉ lễ, nửa công, GPS, máy chấm công, nhập/xuất Excel hoặc đồng bộ kế toán. Chưa có quy định tự trừ phút trễ khỏi công/giờ làm; các chỉ số được cộng riêng đúng yêu cầu.

## Luồng sử dụng

1. Admin vào Thiết lập chấm công, chọn Full-time/Part-time và người duyệt; lưu.
2. Nhân viên mở Chấm công, chọn tháng và ngày; nhập rồi lưu trong modal. Không có nút lưu cả lịch thứ hai.
3. Dữ liệu trong ô ngày, bảng công và tổng kết cập nhật sau khi API xác nhận lưu thành công. Khi lỗi, modal giữ dữ liệu để xử lý.
4. Nhân viên gửi duyệt tháng sau bước xác nhận. Chỉ gửi tháng có ít nhất một ngày công.
5. Admin xem bảng công trong tab Duyệt, xác nhận duyệt hoặc nhập lý do trả về. Có thể trả về cả tháng đã duyệt để điều chỉnh.
6. Nhân viên thấy lý do cần sửa, cập nhật và gửi lại. Gửi lại xóa trạng thái/lý do của lần duyệt cũ trong bản hiện tại; lịch sử audit vẫn được giữ.

## Lưu trữ và bảo toàn dữ liệu

- `attendance_settings/{uid}`: `userId`, `employmentType` (`full_time` / `part_time`), `reviewerId`, revision và dấu thời gian/người sửa.
- `attendance_months/{uid}_{YYYY-MM}`: nhân viên, tháng, hình thức làm việc, map `days` theo `YYYY-MM-DD`, trạng thái, revision, người duyệt và dấu thời gian.
- Mỗi ngày chỉ chứa `worked`, `hours`, `lateMinutes`, `overtimeHours`. Tên nhân viên/loại công không lấy từ snapshot tùy ý do client gửi.
- Hình thức làm việc được giữ lại trong tháng khi tháng đã có công. Đổi thiết lập không đổi cách diễn giải dữ liệu tháng cũ; tháng chưa có ngày công dùng thiết lập mới. Xóa hết các ngày vẫn giữ bản ghi tháng và revision để ngăn phiên cũ ghi đè.
- Người duyệt được chốt khi gửi duyệt, không đổi ngầm khi Admin sửa thiết lập. Đổi người duyệt của tháng đang khóa cần trả về rồi gửi lại; trường hợp người duyệt mất hoạt động có đường phục hồi như trên.
- Xóa/khóa tài khoản không xóa dữ liệu công; Admin vẫn xem được tháng lịch sử theo tên nhân viên đã lưu.
- Không có seed giả, không sửa `users`, PO, tồn kho hoặc dữ liệu các phân hệ khác để tạo chấm công.

## API, quyền và đồng thời

- Endpoint `POST /api/attendance/manage`; action `load`, `settings`, `save_day`, `delete_day`, `submit`, `approve`, `return`.
- Xác minh Firebase ID token, trạng thái Auth và hồ sơ ERP hiện tại bằng `requireActiveErpCaller`. Không tin `role`, `active`, `employeeName`, tổng công, trạng thái hoặc revision mới do client gửi.
- Nhân viên tải đúng hai tài liệu của mình theo UID/tháng; không nhận danh sách công hoặc cấu hình của người khác. Admin tải tháng được chọn và danh sách nhân viên đã lược bỏ email/quyền truy cập.
- Mỗi thay đổi dùng Firestore transaction và `expectedRevision`; khi xung đột, API từ chối thay vì ghi đè. Tải lại dữ liệu trước khi tiếp tục.
- Thao tác tháng có request ID và hash; gửi lại đúng yêu cầu vừa xử lý không ghi lần hai. Sau lỗi kết nối, cần tải lại để xác định kết quả trước khi gửi thao tác mới.
- Lưu/xóa, chuyển trạng thái và thay đổi thiết lập đều ghi audit trước/sau trong cùng transaction.
- Firestore rules chặn toàn bộ đọc/ghi trực tiếp từ client vào hai collection chấm công, kể cả Admin. Chỉ API có Admin SDK truy cập sau khi kiểm tra quyền. Default-deny có sẵn đã chặn hai collection; các rule cụ thể bổ sung để ghi rõ ranh giới.
- Chế độ local không tự chuyển sang localStorage khi API lỗi. Cần Firebase thật và API máy chủ, tương tự LSX.
- Truy vấn tháng chỉ dùng một điều kiện equality, không cần composite index mới.

## Kiểm tra và triển khai

- `tests/attendance.test.cjs`: lịch/tháng/năm nhuận/múi giờ, số liệu hợp lệ, tổng công/giờ, API, quyền, bảo mật đọc, khóa tháng, duyệt/trả về, snapshot cấu hình, audit, retry, xung đột transaction và handlers UI không chạy trình duyệt.
- Chạy build TypeScript client/server và Vite; lint phần mới; regression Công việc, LSX, giao diện thao tác, phân trang và phản hồi lưu/xóa.
- Chưa kiểm thử trình duyệt, thiết bị thực, Firestore emulator hoặc môi trường Firebase/Vercel thật. Test transaction dùng adapter bộ nhớ có mô phỏng retry/version; không thay thế kiểm thử tích hợp thật.
- Push Git không xác nhận triển khai. Trước khi dùng cần triển khai frontend và API `/api/attendance/manage` trên Vercel với cấu hình Firebase Admin hiện có. Đồng bộ `firestore.rules` trong quy trình triển khai rules; không mở quyền client để xử lý lỗi API.
- Sau triển khai: Admin thiết lập nhân viên; kiểm tra hai tài khoản riêng với Full-time/Part-time, quyền riêng tư, lưu/xóa, gửi duyệt, duyệt và trả về. Không tự deploy dữ liệu demo.
