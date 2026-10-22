# Chấm công theo lịch tháng

## Phạm vi đã triển khai

- Phân hệ `attendance` độc lập, nằm ngay dưới Công việc trên sidebar. Không thay đổi chức năng Công việc, header, logo hoặc thứ tự các mục khác.
- Ba tab: Chấm công, Duyệt chấm công, Thiết lập chấm công. Không có bộ đếm sau tên tab.
- Chấm công chỉ dùng lịch tháng có kẻ ô, không có tab Lịch tháng/Bảng công phụ, bảng danh sách ngày, tổng kết hay ghi chú phía trên/dưới lịch. Giữ thanh chọn tháng và nhân viên (Admin), tải lại và hành động gửi duyệt khi phù hợp. Lịch bắt đầu từ thứ Hai, tự hiển thị 4–6 tuần; desktop ưu tiên lịch rộng, màn hình hẹp cuộn ngang.
- Bấm ô trống để nhập mới. Bấm ngày đã chấm mở thông tin chỉ đọc và gửi yêu cầu sửa/xóa kèm lý do. Chờ quản lý duyệt thì mới thay đổi công. Modal hỗ trợ bàn phím, giữ focus và Escape; có cảnh báo bỏ dữ liệu chưa lưu. Toast phân biệt đã lưu công và đã gửi yêu cầu.
- Full-time: Đi làm, phút trễ, giờ OT. Part-time: tổng giờ làm trong ngày, phút trễ; không có giờ vào/ra hoặc trường OT riêng. Các trạng thái hiển thị ngay trong ô ngày. Tổng số liệu vẫn tính từ công đã lưu và có trong bảng duyệt tháng, không hiện thành hàng tổng kết trên lịch.
- Duyệt chấm công: chọn Yêu cầu sửa/xóa hoặc Bảng công tháng, lọc tháng/tên/trạng thái và phân trang. Yêu cầu có công gốc, nội dung đề nghị, lý do, trạng thái; quản lý xem chi tiết rồi duyệt hoặc từ chối kèm lý do. Xem bảng công tháng đưa về lịch, không mở lại bảng danh sách ngày đã bỏ.
- Thiết lập: chọn hình thức làm việc và Admin duyệt cho từng nhân viên đang hoạt động; có tìm kiếm, phân trang và lưu những dòng đã đổi.

## Mặc định nghiệp vụ cho bản đầu

Các mặc định sau được thông báo khi bắt đầu triển khai vì trước đó chưa có câu trả lời riêng cho từng điểm:

1. Hình thức làm việc theo thiết lập nhân viên, không chọn lại tùy ý mỗi ngày. Chưa thiết lập thì chưa được nhập công; không tự gán Full-time cho toàn bộ tài khoản cũ.
2. Full-time đi làm = 1 công/ngày. Part-time có giờ làm > 0 = 1 buổi/ngày; nhiều ca cùng ngày nhập tổng giờ vào một bản ghi.
3. Nhân viên đang hoạt động được vào Chấm công cá nhân, kể cả hồ sơ cũ chưa có `attendance` trong `allowedPages`. Không sửa hàng loạt hồ sơ tài khoản. Mặc định trang mới của cả sáu vai trò có attendance.
4. Nhân viên chỉ xem/cập nhật công của mình. Admin xem tổng hợp, thiết lập và duyệt. Admin cũng chỉ nhập công của chính mình; không có chức năng chấm công hộ. Hai tab quản lý vẫn hiện nhưng bị vô hiệu hóa đối với nhân viên.
5. Gửi duyệt theo tháng. Tháng đang chờ/đã duyệt không được thêm công mới. Ngày đã chấm luôn cấm sửa/xóa trực tiếp, kể cả khi còn nháp hoặc Admin trả về tháng. Nhân viên gửi đề nghị sửa/xóa; chỉ Admin được phân duyệt mới áp dụng thay đổi. Có thể yêu cầu điều chỉnh cả tháng đang chờ/đã duyệt; nếu được chấp nhận, tháng trở về Cần chỉnh sửa để gửi duyệt tháng lại. Từ chối yêu cầu giữ nguyên dữ liệu gốc.
6. Nếu có chỉ định người duyệt thì chỉ Admin đó được duyệt/trả về khi tài khoản còn hoạt động. Nếu bỏ trống, tất cả Admin đều có thể xử lý. Nếu người duyệt đã khóa/xóa, Admin khác có thể trả về/duyệt để phục hồi luồng; người duyệt phải hợp lệ khi nhân viên gửi duyệt. Bản đầu cho phép Admin duyệt công của chính mình, có audit.
7. Không ghi nhận ngày tương lai theo múi giờ `Asia/Ho_Chi_Minh`. Cho phép nhập bù ngày trước; không có quy định ngày khóa sổ riêng.
8. Giờ làm Part-time > 0 và <= 24 giờ/ngày; OT từ 0 đến 24 giờ/ngày; tối đa hai chữ số thập phân. Phút trễ là số nguyên 0–1.440. Đây là giới hạn dữ liệu nhập, không phải quy định tính lương.

Không bao gồm tính lương, trừ lương vì đi trễ, phép/nghỉ lễ, nửa công, GPS, máy chấm công, nhập/xuất Excel hoặc đồng bộ kế toán. Chưa có quy định tự trừ phút trễ khỏi công/giờ làm; các chỉ số được cộng riêng đúng yêu cầu.

## Luồng sử dụng

1. Admin vào Thiết lập chấm công, chọn Full-time/Part-time và người duyệt; lưu.
2. Nhân viên mở Chấm công, chọn tháng và ngày; nhập rồi lưu trong modal. Không có nút lưu cả lịch thứ hai.
3. Công mới chỉ cập nhật ô ngày sau khi API xác nhận. Ngày đã có công hiển thị chỉ đọc. Muốn điều chỉnh: chọn Yêu cầu sửa/xóa, nhập lý do và nội dung mới rồi gửi. Ô ngày giữ công cũ và hiện Chờ duyệt sửa/xóa.
4. Admin mở tab Duyệt, chọn yêu cầu và kiểm tra công gốc/nội dung đề nghị. Duyệt áp dụng đúng snapshot đã gửi trong cùng transaction, không lấy số giờ mới tùy ý từ người duyệt. Từ chối bắt buộc có lý do và không đổi công. Nhân viên xem trạng thái/phản hồi bằng cách bấm ngày đó.
5. Không cho trùng nhiều yêu cầu chờ duyệt trên cùng ngày. Chưa xử lý hết yêu cầu thì không được gửi/duyệt cả tháng. Sau từ chối có thể gửi đề nghị mới; hồ sơ yêu cầu trước vẫn giữ.
6. Nhân viên gửi duyệt tháng sau xác nhận; tháng cần có ít nhất một ngày công. Quản lý duyệt/trả về tháng theo luồng cũ, nhưng trả về tháng không mở quyền sửa ngày trực tiếp. Khi duyệt điều chỉnh của tháng đang chờ/đã duyệt, cần gửi duyệt tháng lại.

## Lưu trữ và bảo toàn dữ liệu

- `attendance_settings/{uid}`: `userId`, `employmentType` (`full_time` / `part_time`), `reviewerId`, revision và dấu thời gian/người sửa.
- `attendance_months/{uid}_{YYYY-MM}`: nhân viên, tháng, hình thức làm việc, map `days` theo `YYYY-MM-DD`, trạng thái, revision, người duyệt và dấu thời gian. Thêm map tùy chọn `changeRequests`; tài liệu cũ không có map này vẫn đọc/hiển thị bình thường, không cần migration.
- Yêu cầu chứa ngày, loại sửa/xóa, snapshot trước/sau, hình thức làm việc, lý do, người duyệt được chốt lúc gửi, trạng thái pending/approved/rejected và dấu thời gian xử lý. Không cấp quyền mở khóa để nhân viên tự sửa sau duyệt; hệ thống áp dụng snapshot được chấp nhận. Giới hạn 200 yêu cầu/tháng và tài liệu 700 KB để nằm trong giới hạn Firestore; audit chỉ lấy ngày/yêu cầu liên quan nhằm không nhân đôi cả lịch sử trong mỗi sự kiện.
- Mỗi ngày chỉ chứa `worked`, `hours`, `lateMinutes`, `overtimeHours`. Tên nhân viên/loại công không lấy từ snapshot tùy ý do client gửi.
- Hình thức làm việc được giữ lại trong tháng khi tháng đã có công. Đổi thiết lập không đổi cách diễn giải dữ liệu tháng cũ; tháng chưa có ngày công dùng thiết lập mới. Xóa hết các ngày vẫn giữ bản ghi tháng và revision để ngăn phiên cũ ghi đè.
- Người duyệt được chốt khi gửi duyệt, không đổi ngầm khi Admin sửa thiết lập. Đổi người duyệt của tháng đang khóa cần trả về rồi gửi lại; trường hợp người duyệt mất hoạt động có đường phục hồi như trên.
- Xóa/khóa tài khoản không xóa dữ liệu công; Admin vẫn xem được tháng lịch sử theo tên nhân viên đã lưu.
- Không có seed giả, không sửa `users`, PO, tồn kho hoặc dữ liệu các phân hệ khác để tạo chấm công.

## API, quyền và đồng thời

- Endpoint `POST /api/attendance/manage`; action `load`, `settings`, `save_day` (chỉ tạo ngày mới), `submit`, `approve`, `return`, `request_change`, `approve_change`, `reject_change`. Action cũ `delete_day` luôn bị từ chối; `save_day` lên ngày đã có công cũng bị từ chối, để client cũ không vượt quy trình duyệt.
- Xác minh Firebase ID token, trạng thái Auth và hồ sơ ERP hiện tại bằng `requireActiveErpCaller`. Không tin `role`, `active`, `employeeName`, tổng công, trạng thái hoặc revision mới do client gửi.
- Nhân viên tải đúng hai tài liệu của mình theo UID/tháng; không nhận danh sách công hoặc cấu hình của người khác. Admin tải tháng được chọn và danh sách nhân viên đã lược bỏ email/quyền truy cập.
- Mỗi thay đổi dùng Firestore transaction và `expectedRevision`; khi xung đột, API từ chối thay vì ghi đè. Tải lại dữ liệu trước khi tiếp tục.
- Thao tác tháng có request ID và hash; gửi lại đúng yêu cầu vừa xử lý không ghi lần hai. Sau lỗi kết nối, cần tải lại để xác định kết quả trước khi gửi thao tác mới.
- Tạo công/yêu cầu, duyệt/từ chối, chuyển trạng thái và thay đổi thiết lập đều ghi audit trước/sau trong cùng transaction. Duyệt yêu cầu kiểm tra lại công gốc và revision; nếu công gốc đã thay đổi, không áp dụng yêu cầu cũ.
- Firestore rules chặn toàn bộ đọc/ghi trực tiếp từ client vào hai collection chấm công, kể cả Admin. Chỉ API có Admin SDK truy cập sau khi kiểm tra quyền. Default-deny có sẵn đã chặn hai collection; các rule cụ thể bổ sung để ghi rõ ranh giới.
- Chế độ local không tự chuyển sang localStorage khi API lỗi. Cần Firebase thật và API máy chủ, tương tự LSX.
- Truy vấn tháng chỉ dùng một điều kiện equality, không cần composite index mới.

## Kiểm tra và triển khai

- `tests/attendance.test.cjs`: lịch/tháng/năm nhuận/múi giờ, số liệu hợp lệ, tổng công/giờ, API, quyền, bảo mật đọc, khóa ngày/tháng, đề nghị sửa/xóa và duyệt/từ chối, snapshot công gốc/cấu hình, audit, retry, xung đột transaction và handlers UI không chạy trình duyệt.
- Chạy build TypeScript client/server và Vite; lint phần mới; regression Công việc, LSX, giao diện thao tác, phân trang và phản hồi lưu/xóa.
- Chưa kiểm thử trình duyệt, thiết bị thực, Firestore emulator hoặc môi trường Firebase/Vercel thật. Test transaction dùng adapter bộ nhớ có mô phỏng retry/version; không thay thế kiểm thử tích hợp thật.
- Push Git không xác nhận triển khai. Trước khi dùng cần triển khai frontend và API `/api/attendance/manage` trên Vercel với cấu hình Firebase Admin hiện có. Đồng bộ `firestore.rules` trong quy trình triển khai rules; không mở quyền client để xử lý lỗi API.
- Lượt tinh gọn và thêm duyệt sửa/xóa không đổi Firestore rules hoặc thêm collection/index. Cần triển khai đồng thời frontend và API mới; chỉ cập nhật frontend không bảo đảm chặn sửa/xóa của client cũ.
- Sau triển khai: Admin thiết lập nhân viên; kiểm tra hai tài khoản riêng với Full-time/Part-time, quyền riêng tư, tạo công, yêu cầu sửa/xóa, duyệt/từ chối, gửi duyệt tháng và trả về. Không tự deploy dữ liệu demo.
