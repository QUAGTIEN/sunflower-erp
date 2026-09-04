# Cấu hình trường thông tin

## Phạm vi

Vào **Cấu hình → Trường thông tin**, chọn một trong ba bảng: Dữ liệu thô, Lead hoặc Khách hàng. Cấu hình độc lập theo bảng; không ánh xạ giá trị khi chuyển hồ sơ giữa các phân hệ.

### Trường hệ thống

- Có thể đổi tên hiển thị, chú thích, thứ tự và ẩn/hiện các cột cho phép.
- Mã khách hàng và tên doanh nghiệp/khách hàng luôn hiển thị. Checkbox chọn hàng và cột thao tác giữ nguyên.
- Các trường chỉ có trên biểu mẫu được đổi nhãn/chú thích, không tự biến thành cột bảng.
- Nhãn được áp dụng vào các biểu mẫu nhập/chỉnh sửa đã tích hợp. Các khối địa bàn dùng cùng cấu hình nhãn.
- Không đổi khóa lưu trữ, kiểu dữ liệu, công thức, danh mục liên kết, quy tắc bắt buộc hoặc quyền nghiệp vụ.
- Ẩn cột không xóa giá trị, không ẩn ô nhập và không phải là phân quyền bảo mật.
- Danh mục tiêu chí bộ lọc giữ ở tab riêng. Bản này không thay bố cục biểu mẫu, mẫu in, file xuất hay nội dung lịch sử đã ghi.

### Trường tùy chỉnh

Giữ các kiểu đã hỗ trợ: văn bản ngắn/dài, số nguyên/thập phân, tiền tệ, phần trăm, ngày/ngày giờ, chọn một/chọn nhiều, có/không, điện thoại, email, đường dẫn. Không thêm công thức tùy ý.

- Tạo, sửa nhãn/hướng dẫn, thiết lập bắt buộc, hiển thị cột mặc định, tìm kiếm/lọc và thứ tự.
- Không đổi bảng, mã hoặc kiểu của trường đã tạo.
- Ngừng sử dụng giữ nguyên dữ liệu lịch sử; có thể khôi phục.
- Phải ngừng sử dụng trước khi xóa. API quét cả hồ sơ đã lưu trữ trong collection sở hữu và chặn xóa nếu có giá trị, kể cả `0` hoặc `false`.
- Xóa là **có thể khôi phục**: giữ định nghĩa với `removed: true`, không xóa cứng. Cách này giữ khả năng đọc lại dữ liệu nếu một client cũ/offline ghi thêm giá trị sau khi kiểm tra. Chọn bộ lọc **Đã xóa (có thể khôi phục)** để phục hồi.
- Lựa chọn đã ngừng dùng vẫn giữ mã/nhãn để đọc được giá trị cũ.
- Quyền xem/sửa theo vai trò hiện có điều khiển giao diện, không phải bảo mật cấp trường trên tài liệu Firestore. Không lưu dữ liệu bí mật vào một trường chỉ dựa vào các checkbox này. Phân quyền đọc từng trường thực sự cần một thiết kế lưu trữ/API riêng.

## Lưu trữ và bảo vệ

- `entity_system_field_overrides/{table}`: chỉ chứa metadata của các trường trong allowlist `systemFieldConfig.ts`.
- `entity_field_definitions/{id}`: định nghĩa trường tùy chỉnh, tương thích dữ liệu cũ; giá trị vẫn nằm tại `customFieldValues[id]` của hồ sơ.
- `/api/fields/manage`: kiểm tra Firebase ID token và hồ sơ Admin đang hoạt động bằng `requireAdmin`; kiểm tra kiểu/mã bất biến, tên trùng, dữ liệu trước khi xóa và revision trước khi ghi.
- Ghi cấu hình và audit trong cùng transaction. Hai admin lưu từ revision cũ nhận lỗi xung đột thay vì ghi đè âm thầm.
- Firebase client không được ghi trực tiếp hai collection metadata sau khi cập nhật rules. Không thay quyền đọc/ghi các collection hồ sơ CRM.
- Local demo dùng adapter local riêng. Lỗi Firebase/API trong chế độ production không được chuyển sang lưu local.

## Triển khai online

1. Triển khai code frontend **và** `api/fields/manage.ts` trên Vercel hoặc runtime tương thích. Rewrite hiện có loại trừ `/api/`.
2. API cần các biến server `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, cùng cơ chế của API quản trị tài khoản. Không dùng tiền tố `VITE_` cho credential server và không commit khóa.
3. Sau khi API sẵn sàng, triển khai `firestore.rules` cho đúng Firebase project. Rules mới cho phép người dùng hoạt động đọc `entity_system_field_overrides` và chỉ API Admin SDK ghi hai collection metadata. Không dán riêng một đoạn `allow write: true` để xử lý lỗi quyền.
4. Tải lại tab cũ. Kiểm tra bằng Admin: đổi nhãn, ẩn cột tùy chọn, thêm trường, ngừng dùng/khôi phục. Kiểm tra tài khoản Sale không gọi được API cấu hình.
5. Nếu rollback về giao diện cũ ghi trực tiếp Firestore, cần xem xét rules cùng phiên bản; không chỉ rollback frontend. Giữ bản metadata để không mất cấu hình.

Push Git không đồng nghĩa Firestore rules đã được publish. Thay đổi này không tự triển khai rules hoặc chỉnh dữ liệu production.

## Kiểm thử

```sh
npm run test:fields
npm run build
```

Các kiểm thử chạy module thực với Firestore giả lập trong bộ nhớ, không truy cập production: bảo vệ trường nhận diện, allowlist, đổi thứ tự/hide đúng cả header và body, giữ colspan, nhãn dịch mặc định, bảo toàn controls/form values, khóa kiểu/mã, xung đột revision, giá trị lịch sử, lưu/khôi phục metadata và chặn yêu cầu không có quyền.

Đã kiểm tra giao diện trên localhost ở chế độ local: mở hai nhóm trường, đổi nhãn và thấy nhãn mới trên bảng/biểu mẫu Dữ liệu thô, tạo trường tùy chỉnh. Hộp thoại xác nhận native của trình duyệt kiểm thử bị công cụ điều khiển chặn; phần ngừng dùng/xóa/khôi phục được kiểm tra ở mức API unit test, chưa smoke-test trên Firebase thật.
