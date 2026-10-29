# Chấm công

## Quyết định nghiệp vụ (D-ATT1, chốt 27/10/2026)

Thay toàn bộ luồng cũ "nhân viên tự chấm, gửi duyệt tháng, yêu cầu sửa/xóa".

1. **Chỉ Admin và Kế toán** (`role` `admin` hoặc `accountant`, tài khoản đang hoạt động) được chấm công, cho mọi nhân
   viên kể cả chính mình. Chấm và lưu là có hiệu lực, không có duyệt hay chốt tháng.
2. Các vai trò khác (Sale, Thiết kế, Mua hàng, Sản xuất…) chỉ **xem bảng công của chính mình**; máy chủ chỉ trả dữ liệu
   của họ.
3. Loại công một ngày: **Đi làm** (phút trễ, giờ OT), **Nửa buổi** (0,5 công; nửa còn lại là nghỉ có phép hoặc không
   phép), **Nghỉ có phép**, **Nghỉ không phép**. Mỗi ngày có ghi chú (tối đa 500 ký tự). Part-time chấm theo giờ làm
   (> 0, tối đa 24), có phút trễ, không có nửa buổi và OT.
4. Ngày chưa chấm hiển thị "chưa chấm", **không** tính vắng. Không chấm ngày tương lai (giờ Việt Nam).
5. **Ngày nghỉ**: Chủ nhật và ngày lễ lớn tự tính theo năm. Nghỉ vào ngày nghỉ không tính gì; nếu đi làm thì chấm như
   bình thường và được đếm ở cột "Làm ngày nghỉ". Không chấm nghỉ phép/không phép vào ngày nghỉ.
6. Admin/Kế toán đặt thêm ngày nghỉ (có tên), biến ngày nghỉ mặc định thành ngày làm, hoặc trả ngày về mặc định.
7. Chưa thiết lập hình thức làm việc thì coi là **Full-time**; Admin/Kế toán đổi sang Part-time khi cần. Loại công được
   lưu kèm từng ngày nên đổi hình thức sau này không làm đổi nghĩa ngày đã chấm.
8. Dữ liệu chấm công cũ không chuyển sang. Bản mới dùng collection mới và không đọc `attendance_months`,
   `attendance_settings` nữa; hai collection này vẫn bị rules chặn, người dùng tự xóa trên Firebase Console khi muốn.

## Giao diện

- **Chấm công** (chỉ Admin/Kế toán): dải tổng hợp của ngày đang chọn (nhân viên, đi làm, nửa buổi, nghỉ có/không
  phép, chưa chấm); lịch tháng tự giãn chiều cao theo nội dung, mỗi ô hiển thị cụm nhãn `Đi làm N` / `N chưa chấm`
  và danh sách người đi trễ/nửa buổi/nghỉ theo từng dòng gọn gàng (tên bên trái, trạng thái bên phải, tối đa 10 dòng,
  còn lại "+N khác"); khung bên phải liệt kê mọi nhân viên của ngày đang chọn. Bấm tên để mở hộp thoại chấm công
  (chọn loại công bằng ô checkbox vuông). "Chấm cả ngày đi làm" chấm Full-time chưa chấm; icon lịch mở hộp thoại
  ngày nghỉ; "Thiết lập NV" chọn Full-time/Part-time.
- **Bảng công** (mọi vai trò): Admin/Kế toán xem được bảng công tổng hợp của toàn bộ nhân viên hoặc chọn xem bảng công
  của từng nhân viên (qua ô chọn nhân viên trên thanh công cụ hoặc bấm vào tên nhân viên trên bảng); nhân viên thường
  chỉ xem bảng công của chính mình. Khi xem từng người, màn hình hiển thị thêm dải tổng hợp tháng và bảng chi tiết
  từng ngày trong tháng. Bảng ký hiệu dùng X đi làm, T trễ, ½ nửa buổi, P nghỉ có phép, V nghỉ không phép, số giờ với
  Part-time; cột ngày nghỉ tô xám; cuối dòng là Công, Trễ (phút), Phép, Vắng, OT và Làm ngày nghỉ.
- Tháng đã xem được giữ trong bộ nhớ và hiện ngay khi quay lại, dữ liệu mới tải ngầm.

## Ngày lễ mặc định

`src/features/attendance/model/vietnamHolidays.ts` tính theo Bộ luật Lao động 2019, điều 112:

- 1/1; Tết Nguyên đán 5 ngày (30 tháng Chạp đến mùng 4); Giỗ Tổ 10/3 âm lịch; 30/4; 1/5; 2/9 và 1/9.
- Lễ một ngày rơi vào Chủ nhật được nghỉ bù vào ngày làm việc kế tiếp. Tết không tính nghỉ bù riêng.
- Âm lịch theo thuật toán Hồ Ngọc Đức ở múi giờ UTC+7, không dùng thư viện lịch Trung Quốc (UTC+8), vì có năm ngày
  đầu tháng âm lệch nhau (ví dụ Tết 2030 ở Việt Nam là 02/02).
- Số ngày nghỉ Tết và ngày kèm 2/9 do Nhà nước công bố mỗi năm; nếu khác mặc định, Admin/Kế toán sửa trên lịch.

Thứ tự áp dụng cho một ngày: thiết lập của công ty → ngày lễ mặc định → Chủ nhật (`resolveDay`).

## Tổng hợp tháng (`timesheetTotals`)

| Chỉ tiêu | Cách tính |
|---|---|
| Ngày công | Đi làm 1, Nửa buổi 0,5; Part-time đếm buổi và cộng giờ làm riêng |
| Trễ | Tổng phút trễ và số lần trễ |
| Phép | Nghỉ có phép 1, nửa buổi nghỉ có phép 0,5 |
| Vắng | Nghỉ không phép 1, nửa buổi nghỉ không phép 0,5 |
| OT | Tổng giờ OT |
| Làm ngày nghỉ | Số ngày đi làm/nửa buổi rơi vào ngày nghỉ |

## Lưu trữ

| Collection | Nội dung |
|---|---|
| `attendance_sheets/{uid}_{YYYY-MM}` | Nhân viên, tháng, map `days` theo ngày, revision |
| `attendance_profiles/{uid}` | Hình thức làm việc (`full_time` / `part_time`), revision |
| `attendance_calendars/{YYYY}` | Map `overrides` theo ngày (`off`, `name`), revision |
| `attendance_requests/{requestId}` | Người gửi, dấu nội dung và kết quả, để gửi lại không ghi lần hai |

Mỗi ngày chấm lưu loại công, hình thức làm việc, giờ/phút, ghi chú, người chấm và thời điểm chấm.

## Đọc dữ liệu

Màn hình đọc thẳng Firestore (`useAttendanceWorkspace`), nên tháng đã xem hiện ngay từ bộ nhớ đệm và thay đổi của người
khác tự cập nhật. Quyết định của người dùng ngày 29/10/2026: đọc thẳng Firestore, ghi vẫn qua API.

| Người xem | Truy vấn | Rules cho phép |
|---|---|---|
| Admin/Kế toán đang hoạt động | `users`, mọi `attendance_profiles`, `attendance_sheets` theo `month`, `attendance_calendars` | Đọc toàn bộ |
| Nhân viên khác | `attendance_profiles` và `attendance_sheets` lọc `userId` = chính mình, `attendance_calendars` | Chỉ tài liệu có `userId` của mình |

Truy vấn của nhân viên bắt buộc lọc `userId`, nếu không rules từ chối cả truy vấn. Lịch ngày nghỉ công ty không riêng
tư nên mọi tài khoản đang hoạt động đều đọc được. Sau khi lưu, phản hồi máy chủ được giữ đến khi bản Firestore có
revision mới hơn, để lần lưu kế tiếp không gửi revision cũ.

## API và an toàn

- `POST /api/attendance/manage`, xác thực bằng `requireActiveErpCaller`, chỉ dùng để ghi:
  - `save_day` `{ userId, date, entry | null, expectedRevision }`: chấm, sửa hoặc xóa công một ngày.
  - `mark_present` `{ date }`: chấm Đi làm cho mọi nhân viên Full-time đang hoạt động chưa có công ngày đó; không ghi
    đè ngày đã chấm, bỏ qua Part-time, từ chối ngày nghỉ.
  - `set_profiles` `{ changes: [{ userId, employmentType, expectedRevision }] }`.
  - `set_day_off` `{ date, off: true | false | null, name, expectedRevision }`.
- Mọi thao tác ghi cần `requestId`, chạy trong transaction, kiểm tra revision và ghi `audit_events`. Không tin tên,
  vai trò hay người chấm do client gửi.
- `firestore.rules` chặn mọi ghi trực tiếp vào các collection chấm công, kể cả Admin; `attendance_requests` và hai
  collection cũ bị chặn cả đọc.
- Web và `firestore.rules` phải deploy cùng phiên bản: web mới đọc thẳng sẽ bị từ chối nếu rules cũ còn chặn đọc.
- Không có fallback lưu local khi Firebase lỗi.

Không bao gồm: tính lương, trừ lương vì đi trễ, máy chấm công, GPS, xuất Excel.
