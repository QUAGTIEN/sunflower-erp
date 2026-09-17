# HƯỚNG DẪN VÀ QUY TẮC PHÁT TRIỂN DỰ ÁN (DEVELOPER GUIDELINES)

Tệp này là nguồn quy tắc bắt buộc khi phân tích, thiết kế, chỉnh sửa hoặc thêm tính năng cho hệ thống ERP Sản xuất Tem Nhãn Sunflower.

## 0. PHẠM VI, THỨ TỰ ƯU TIÊN VÀ TÍCH HỢP TASTE SKILL

### 0.1. Thứ tự ưu tiên

Khi có hai chỉ dẫn khác nhau, áp dụng theo thứ tự sau:

1. Yêu cầu rõ ràng của người dùng trong tác vụ hiện tại.
2. Quy tắc trong `docs/DEVELOPER_GUIDELINES.md`.
3. Design token, component dùng chung và hành vi đã thống nhất trong codebase.
4. Skill dự án `sunflower-erp-ui`.
5. Skill `design-taste-frontend`, chỉ với vai trò tham khảo chống giao diện AI đại trà.

Quy tắc ở mức thấp hơn không được tự động ghi đè quy tắc ở mức cao hơn. Không thay đổi kiến trúc, dependency, dữ liệu, quyền truy cập hoặc luồng nghiệp vụ chỉ để đáp ứng một gợi ý thẩm mỹ.

### 0.2. Design Read và cấu hình mặc định của Sunflower ERP

Mặc định đọc sản phẩm như sau:

> Hệ thống ERP nội bộ cho nhân viên văn phòng và các bộ phận vận hành, dùng ngôn ngữ thị giác sáng, tin cậy, tiết chế, mật độ thông tin cao và ưu tiên tốc độ thao tác.

Ba tham số Taste Skill của dự án:

- `DESIGN_VARIANCE: 3`: bố cục ổn định, dễ dự đoán và nhất quán giữa các phân hệ.
- `MOTION_INTENSITY: 2`: chỉ dùng hover, focus, active và chuyển trạng thái ngắn có mục đích.
- `VISUAL_DENSITY: 8`: ưu tiên bảng, form và dữ liệu nghiệp vụ trong không gian desktop.

Các giá trị này thay thế baseline của Taste Skill khi làm màn hình ERP. Người dùng có thể yêu cầu điều chỉnh cho một màn hình cụ thể, nhưng các ràng buộc nghiệp vụ, khả năng sử dụng và tiếp cận vẫn phải được giữ.

### 0.3. Phần Taste Skill được phép áp dụng

- Audit giao diện và nhận diện design token hiện tại trước khi sửa.
- Giữ nguyên kiến trúc thông tin, tên điều hướng, field, hành vi và quyền truy cập nếu người dùng không yêu cầu thay đổi.
- Tránh các dấu hiệu giao diện AI đại trà: gradient tím xanh vô cớ, glow, glassmorphism, card lặp lại, bóng đổ nặng, nhãn trang trí và nội dung giả.
- Khóa tính nhất quán của bảng màu, màu nhấn, hệ border-radius, typography và khoảng cách.
- Chỉ dùng card khi card thể hiện một nhóm nghiệp vụ hoặc cấp độ thông tin thực sự.
- Hoàn thiện đầy đủ trạng thái default, hover, focus, active, disabled, loading, empty, error, success và dữ liệu dài.
- Kiểm tra nội dung hiển thị, độ tương phản, responsive, thao tác bàn phím và hiệu năng trước khi bàn giao.
- Ưu tiên cải tiến có mục tiêu: typography, nhịp khoảng cách, độ rõ của phân cấp và phản hồi thao tác trước khi thay đổi bố cục lớn.

### 0.4. Phần Taste Skill không áp dụng cho màn hình ERP

- Không dùng các quy tắc dành cho hero, landing page, portfolio, logo wall, testimonial, marquee, bento marketing hoặc scroll storytelling.
- Không tự động cài Tailwind, Motion, GSAP, Three.js, shadcn/ui, Fluent, Carbon hoặc design system khác. Dự án tiếp tục dùng React, Vite, TypeScript và CSS hiện có trừ khi người dùng phê duyệt thay đổi stack.
- Không thêm Dark Mode, theme tự động theo hệ điều hành hoặc section đảo màu.
- Không dùng icon, emoji hoặc SVG trang trí để thay nhãn chữ.
- Không bắt buộc tạo ảnh bằng AI hoặc thêm ảnh trang trí vào màn hình nghiệp vụ.
- Không dùng headline cỡ lớn, khoảng trắng kiểu landing page, bố cục bất đối xứng mạnh hoặc animation theo cuộn.
- Không loại bỏ bảng dữ liệu, form dài hoặc danh sách nghiệp vụ chỉ vì Taste Skill ưu tiên nội dung marketing ngắn.
- Không thay đổi font Inter hiện có chỉ vì Taste Skill khuyến nghị font khác.

---

## 1. QUY TẮC THIẾT KẾ GIAO DIỆN (UI/UX RULES)

### 1.1. Tông màu (Color Theme)
- **Bắt buộc**: Chỉ sử dụng **MÀU SÁNG (Light Theme)** làm chủ đạo.
- Không sử dụng chế độ Dark Mode hoặc các bảng màu tối, âm u.
- Sử dụng màu trắng, xám nhạt, xanh nhạt hoặc các màu pastel lịch sự, tinh tế để tạo không gian làm việc chuyên nghiệp, dễ chịu cho nhân viên văn phòng.
- Sử dụng độ tương phản tốt để dễ đọc số liệu bảng biểu.

### 1.2. Biểu tượng (Icons)
- **QUY TẮC CỐT LÕI**: **TUYỆT ĐỐI KHÔNG SỬ DỤNG ICON** (Không dùng FontAwesome, Lucide, Heroicons, Material Icons, hay bất kỳ ký tự biểu tượng nào).
- **Giải pháp thay thế**: Sử dụng **VĂN BẢN (Text Labels)** rõ nghĩa.
  - *Ví dụ*: Thay vì dùng nút icon `[+]`, hãy dùng nút chữ `Thêm mới`.
  - Thay vì dùng nút icon thùng rác `[🗑️]`, hãy dùng chữ `Xóa`.
  - Thay vì dùng icon kính lúp `[🔍]`, hãy dùng chữ `Tìm kiếm`.
  - Thay vì icon cài đặt `[⚙️]`, hãy dùng chữ `Cấu hình`.
- Thiết kế nút bấm và danh mục điều hướng bằng văn bản rõ ràng, sắp xếp khoa học để bù đắp cho việc thiếu biểu tượng trực quan.

### 1.3. Phong cách (Aesthetic & Vibe)
- **Lịch sự văn phòng, tiện nghi**: Bố cục bảng biểu (table), biểu mẫu (form), bảng thông tin (dashboard) gọn gàng, ngăn nắp.
- Khoảng cách (padding, margin) hợp lý, không quá chật chội nhưng cũng không quá rộng làm lãng phí không gian màn hình.
- Các nút bấm có viền nhẹ (border), hiệu ứng hover đổi màu tinh tế, góc bo tròn nhẹ (border-radius: 4px hoặc 6px) để tạo cảm giác trang nhã, tin cậy.

### 1.4. Tính nhất quán và hệ thống thiết kế
- Giao diện phải theo phong cách ERP: rõ ràng, gọn, có mật độ thông tin cao và ưu tiên hiệu quả thao tác.
- Cùng một chức năng phải có cùng cách hiển thị, cách đặt tên và cách tương tác ở mọi phân hệ.
- Không tự tạo phong cách riêng cho từng trang hoặc viết lại một component đã có sẵn chỉ để thay đổi hình thức.
- Không lạm dụng thẻ, màu nền, bóng đổ, viền nổi bật hoặc góc bo tròn lớn.
- Mỗi màn hình chỉ nên có một hành động chính được nhấn mạnh rõ ràng.
- Các giá trị màu sắc, khoảng cách, kích thước chữ, chiều cao control và border-radius phải được khai báo bằng design token hoặc biến CSS dùng chung.
- Ưu tiên tái sử dụng và mở rộng `src/styles/ErpUiStandards.css` thay vì tạo quy chuẩn giao diện cục bộ cho từng trang.

### 1.5. Khoảng cách và kích thước
- Sử dụng hệ khoảng cách theo bội số của 4 để giữ nhịp bố cục đồng đều.
- Khoảng cách nhỏ giữa các thành phần liên quan: `4px`.
- Khoảng cách giữa nhãn chữ và thành phần đi kèm: `8px`.
- Khoảng cách giữa các trường trong biểu mẫu: `12px`.
- Padding tiêu chuẩn trong khối nội dung: `16px`.
- Khoảng cách giữa các khu vực nghiệp vụ lớn: `20px` đến `24px`.
- Padding tiêu chuẩn của trang trên desktop: `20px` đến `24px`.
- Không để vùng tiêu đề hoặc khoảng trắng đầu trang chiếm quá nhiều chiều cao làm thu hẹp nội dung chính.
- Các màn hình cùng loại phải dùng cùng chiều rộng nội dung và cùng khoảng cách lề.

### 1.6. Chữ và phân cấp nội dung (Typography)
- Toàn hệ thống chỉ sử dụng một font chữ chính thống nhất.
- Tiêu đề trang: `20px`, font-weight `600`.
- Tiêu đề khu vực hoặc thẻ thông tin: `15px` đến `16px`, font-weight `600`.
- Nội dung chính: `14px`, font-weight `400`.
- Nhãn trường và tiêu đề cột: `13px`, font-weight từ `500` đến `600`.
- Nội dung phụ, thời gian và chú thích: `12px`, sử dụng màu trung tính dễ đọc.
- Không viết hoa toàn bộ tiêu đề, ngoại trừ mã nghiệp vụ, từ viết tắt hoặc nhãn đặc biệt cần thiết.
- Không dùng quá nhiều chữ đậm trên cùng một màn hình; chữ đậm chỉ dùng để thể hiện phân cấp hoặc dữ liệu quan trọng.
- Nội dung dài phải rút gọn bằng ellipsis và cung cấp `title` hoặc tooltip để xem đầy đủ.

### 1.7. Màu sắc và trạng thái
- Màu xanh đậm thương hiệu là màu hành động chính của hệ thống.
- Chỉ dùng màu nổi bật cho nút chính, tab đang chọn, menu đang chọn, liên kết và trạng thái cần chú ý.
- Nội dung thông thường sử dụng màu đen xanh hoặc xám đậm; nội dung phụ sử dụng màu xám trung tính.
- Không dùng nhiều màu chỉ để trang trí hoặc để phân biệt các khối không có khác biệt nghiệp vụ.
- Mỗi trạng thái nghiệp vụ phải sử dụng cùng tên gọi và cùng cách trình bày trên toàn hệ thống.
- Không chỉ dựa vào màu sắc để truyền đạt trạng thái; luôn phải có nhãn chữ rõ nghĩa.
- Màu chữ, màu nền và màu viền phải đảm bảo độ tương phản đủ để đọc trong thời gian làm việc dài.

### 1.8. Tiêu đề trang (Page Header)
- Tiêu đề trang đặt bên trái; nhóm hành động chính đặt bên phải trên cùng một hàng khi đủ không gian.
- Tab hoặc bộ lọc cấp trang đặt ngay bên dưới tiêu đề nếu có.
- Không hiển thị dòng giải thích bên dưới tiêu đề nếu nội dung đó không giúp người dùng thực hiện công việc.
- Chiều cao, padding, cỡ chữ và vị trí của vùng tiêu đề phải thống nhất giữa các phân hệ.
- Không đặt tiêu đề trong một thẻ quá lớn hoặc tạo khoảng trắng dư thừa trước nội dung chính.

### 1.9. Tab chuyển nội dung
- Tab hiển thị dạng chữ trên một hàng, có khoảng cách đồng đều.
- Tab đang chọn sử dụng chữ xanh đậm và đường gạch dưới cùng màu chủ đạo.
- Không dùng nền xanh lớn, khung bao hoặc kiểu nút bấm cho từng tab.
- Chiều cao, padding và khoảng cách giữa các tab phải thống nhất trên toàn hệ thống.
- Chuyển tab không được làm thay đổi vị trí tiêu đề, thanh công cụ hoặc làm giật bố cục.
- Khi số lượng tab không đủ chỗ, ưu tiên cuộn ngang thay vì xuống nhiều hàng gây thay đổi chiều cao.

### 1.10. Bảng dữ liệu
- Hàng dữ liệu sử dụng nền trắng; không dùng nền xám trắng xen kẽ.
- Chỉ sử dụng đường ngang mảnh để phân tách hàng; hạn chế đường dọc và khung bao nặng.
- Chiều cao hàng tiêu chuẩn từ `44px` đến `48px`.
- Hàng tiêu đề cột có thể sử dụng nền xám xanh rất nhạt để phân biệt với dữ liệu.
- Mỗi ô dữ liệu ưu tiên hiển thị một dòng; nội dung dài dùng ellipsis và tooltip hoặc `title`.
- Nội dung chữ căn trái, số liệu căn phải; trạng thái và thao tác có thể căn giữa nếu phù hợp.
- Cột thao tác phải đặt cuối bảng và giữ vị trí nhất quán.
- Không đặt nút lớn trong từng hàng; hành động phụ phải gom vào menu văn bản gọn, tuân thủ quy tắc không dùng icon.
- Bảng nhiều cột phải hỗ trợ cuộn ngang mà không làm vỡ bố cục trang.
- Cột nhận diện chính và cột thao tác nên được giữ cố định khi điều đó giúp thao tác trên bảng rộng.
- Thanh phân trang phải nằm cuối bảng, không che dữ liệu và dùng chung một mẫu trên mọi phân hệ.
- Trạng thái tải dữ liệu, không có dữ liệu, lỗi tải và không có kết quả tìm kiếm phải có cách trình bày thống nhất.

### 1.11. Biểu mẫu nhập liệu
- Biểu mẫu dài phải được chia thành các thẻ thông tin theo đúng nhóm nghiệp vụ.
- Trên desktop ưu tiên hai thẻ cân đối trên một hàng; màn hình hẹp tự chuyển thành một cột.
- Các trường có quan hệ nghiệp vụ phải được đặt gần nhau theo thứ tự nhập liệu tự nhiên.
- Nhãn trường luôn đặt phía trên ô nhập; không dùng placeholder để thay thế hoàn toàn cho nhãn.
- Chiều cao tiêu chuẩn của input, select và nút là `36px` đến `40px`.
- Trường bắt buộc phải có dấu `*`; lỗi kiểm tra dữ liệu hiển thị ngay dưới trường liên quan.
- Trường hệ thống hoặc trường không được phép chỉnh sửa phải có trạng thái chỉ đọc rõ ràng.
- Nút lưu và hủy phải đặt ở vị trí thống nhất; hành động lưu ưu tiên phía dưới bên phải của form.
- Khi người dùng rời trang trong lúc có dữ liệu chưa lưu, hệ thống phải cảnh báo để tránh mất dữ liệu.

### 1.12. Nút và thao tác
- Mỗi màn hình chỉ nên có một nút chính nổi bật bằng màu xanh đậm.
- Nút phụ sử dụng nền trắng, viền trung tính và không cạnh tranh thị giác với nút chính.
- Hành động nguy hiểm như xóa hoặc hủy dữ liệu phải dùng chữ rõ nghĩa, màu cảnh báo phù hợp và yêu cầu xác nhận.
- Không sử dụng hai cách gọi khác nhau cho cùng một hành động, ví dụ không dùng lẫn `Thêm`, `Tạo mới` và `Bổ sung` nếu cùng một ý nghĩa.
- Kích thước, padding và trạng thái hover, focus, disabled của nút phải đồng nhất giữa các trang.
- Tuân thủ quy tắc tại mục 1.2: nút và hành động phải dùng nhãn chữ rõ nghĩa, không thay thế bằng icon đơn lẻ.

### 1.13. Phản hồi hệ thống
- Mọi thao tác bất đồng bộ phải có phản hồi rõ ràng: đang xử lý, thành công hoặc thất bại.
- Phải có giao diện thống nhất cho các trường hợp: đang tải, không có dữ liệu, không có quyền, mất kết nối và lỗi hệ thống.
- Không hiển thị trực tiếp stack trace, mã lỗi Firestore hoặc nội dung lỗi kỹ thuật cho người dùng cuối.
- Thông báo thành công phải ngắn gọn, cho biết hành động nào vừa hoàn tất.
- Thông báo lỗi phải giải thích được vấn đề và hướng xử lý tiếp theo nếu có.
- Hành động xóa, ghi đè hoặc thay đổi dữ liệu quan trọng phải có bước xác nhận.

### 1.14. Điều hướng và menu
- Menu bên trái phải giữ nguyên chiều rộng, vị trí và nhịp khoảng cách giữa các trang.
- Mục đang chọn sử dụng nền xanh nhạt vừa đủ, không có viền nổi; chữ không được đậm quá mức.
- Tên phân hệ phải ngắn gọn, dễ hiểu và ưu tiên từ 2 đến 3 từ.
- Nút quay lại phải đưa người dùng về đúng màn hình trước đó và giữ bộ lọc, tab hoặc trang dữ liệu khi có thể.
- Chỉ sử dụng breadcrumb khi màn hình có từ hai cấp điều hướng trở lên và người dùng cần biết vị trí hiện tại.
- Không thay đổi thứ tự menu hoặc luồng điều hướng của phân hệ khác khi không có yêu cầu nghiệp vụ trực tiếp.

### 1.15. Khả năng sử dụng và tiếp cận
- Vùng bấm tối thiểu của nút và control phải đạt khoảng `32px` đến `36px`.
- Input, button, tab, menu và modal phải có trạng thái hover, focus, selected và disabled rõ ràng.
- Form, tab, modal và menu phải hỗ trợ thao tác bàn phím ở mức phù hợp.
- Modal phải khóa thao tác với nền, có tiêu đề rõ ràng và hỗ trợ đóng bằng phím `Escape` khi an toàn.
- Không dùng chỉ màu sắc, vị trí hoặc hình thức để truyền đạt thông tin quan trọng; phải có nội dung chữ đi kèm.
- Nội dung có thể cuộn phải có dấu hiệu trực quan hợp lý và không tạo nhiều vùng cuộn lồng nhau nếu không cần thiết.

### 1.16. Responsive
- Ưu tiên tối ưu cho desktop vì đây là hệ thống ERP phục vụ công việc nội bộ.
- Không để nội dung tràn, đè lên nhau hoặc vượt khỏi vùng nhìn ở độ rộng màn hình nhỏ hơn.
- Bảng nhiều cột phải cuộn ngang; không ép cột quá hẹp làm dữ liệu khó đọc.
- Form hai cột phải tự chuyển thành một cột ở màn hình hẹp.
- Thanh hành động có thể xuống dòng nhưng không được che tiêu đề hoặc nội dung chính.
- Không ẩn chức năng quan trọng trên màn hình nhỏ nếu chưa có cách truy cập thay thế rõ ràng.

### 1.17. Chế độ hiển thị
- Tuân thủ mục 1.1: hệ thống chỉ sử dụng Light Theme trong phạm vi hiện tại.
- Không thêm nút chuyển Dark Mode, biến thể màu tối hoặc CSS tự động đổi giao diện theo hệ điều hành.
- Nếu sau này có yêu cầu triển khai Dark Mode, phải xây dựng bộ design token riêng cho nền, chữ, viền, bảng, input, modal, biểu đồ và trạng thái; không được chỉ đảo màu trắng thành đen.

### 1.18. Tái sử dụng component và kiểm tra tính nhất quán
- Trước khi tạo component mới, phải kiểm tra các thành phần dùng chung hiện có: page header, tab, toolbar, button, form field, data table, modal, pagination, empty state, loading state và toast/notification.
- Không tạo component dùng chung mới nếu chỉ được sử dụng một lần hoặc không giải quyết được sự lặp lại thực tế.
- Không viết CSS cục bộ để ghi đè quy chuẩn chung nếu có thể bổ sung an toàn vào hệ thống design token hoặc component nền.
- Trang mới phải được đối chiếu với các trang cùng loại để đảm bảo thống nhất về tiêu đề, khoảng cách, bảng, form và hành động.
- Trước khi hoàn thành thay đổi giao diện, phải kiểm tra tối thiểu các trạng thái: mặc định, hover, focus, disabled, loading, empty, error và dữ liệu dài.

---

## 2. QUY TẮC KỸ THUẬT & DỮ LIỆU (TECHNICAL RULES)

### 2.0. Kiến trúc và dependency

- Giữ stack hiện tại: React, Vite, TypeScript, Firebase và CSS dùng chung của dự án.
- Trước khi import thư viện bên thứ ba, phải kiểm tra `package.json` và xác nhận thư viện đã tồn tại.
- Không thêm, thay hoặc nâng cấp dependency chỉ để thay đổi hình thức khi chưa có yêu cầu rõ ràng của người dùng.
- Không chuyển sang Tailwind, CSS-in-JS hoặc design system khác trong một thay đổi UI cục bộ.
- Không đổi route, tên field, thứ tự field, collection Firestore, schema dữ liệu hoặc analytics/audit event một cách ngầm định.

### 2.1. Quản lý Hình ảnh (Base64)
- **Không sử dụng dịch vụ Cloud Storage (Firebase Storage)** để lưu hình ảnh trực tiếp.
- Mọi hình ảnh tải lên (ảnh mẫu tem, ảnh duyệt màu thiết kế, ảnh chữ ký biên bản giao hàng) phải được xử lý qua Client:
  1. Sử dụng `FileReader` để đọc file ảnh dưới dạng Data URL.
  2. Vẽ ảnh lên một thẻ `<canvas>` ẩn để thay đổi kích thước (tối đa 600px - 800px chiều rộng/cao).
  3. Nén chất lượng ảnh bằng `canvas.toDataURL('image/jpeg', 0.7)` (chất lượng 70%) để chuyển thành chuỗi Base64.
  4. Lưu chuỗi Base64 này trực tiếp dưới dạng trường kiểu `String` trong cơ sở dữ liệu **Firebase Firestore**.
- Khi hiển thị, truyền trực tiếp chuỗi Base64 vào thuộc tính `src` của thẻ `<img>`.

### 2.2. Quản lý File lớn (PDF, Excel, AI, Corel)
- Các file tài liệu và file thiết kế gốc có dung lượng lớn (> 1MB) không được lưu dưới dạng Base64 vào Firestore (tránh giới hạn 1MB của tài liệu Firestore).
- Sử dụng các ô nhập **Đường dẫn liên kết ngoài (Link Google Drive, OneDrive...)**. Người dùng tải file lên dịch vụ lưu trữ ngoài và dán link vào ERP để chia sẻ.

### 2.3. Cơ sở dữ liệu & Xác thực
- Sử dụng **Firebase Firestore** làm cơ sở dữ liệu lưu trữ cấu trúc.
- Sử dụng **Firebase Auth** để quản lý người dùng và phân quyền (Role-based access control - RBAC).
- Toàn bộ dữ liệu dùng chung giữa các bộ phận, nhưng giao diện sẽ hiển thị các tính năng được phân quyền tương ứng cho từng vai trò: Admin, Sale, Thiết kế (Designer), Mua hàng (Purchaser), Sản xuất (Producer), Kế toán (Accountant).

### 2.4. Bảo toàn nghiệp vụ và dữ liệu

- Thay đổi giao diện không được làm thay đổi quyền truy cập, validation, thứ tự xử lý, dữ liệu gửi lên Firebase hoặc hành vi của workflow.
- Không dùng dữ liệu giả có vẻ chính xác trong giao diện thật. Dữ liệu demo phải được đánh dấu rõ và không được ghi vào môi trường sản xuất.
- Không hiển thị token, mật khẩu, stack trace, mã lỗi nội bộ hoặc dữ liệu vượt quá quyền của người dùng.
- Hành động xóa, ghi đè, duyệt hoặc thay đổi trạng thái nghiệp vụ quan trọng phải giữ bước xác nhận và audit hiện có.

---

## 3. QUY TRÌNH THỰC HIỆN THAY ĐỔI UI

### 3.1. Trước khi sửa

1. Đọc tài liệu này và xác định màn hình thuộc loại bảng, form, dashboard, cấu hình hay workflow.
2. Kiểm tra component dùng chung, `src/styles/ErpUiStandards.css` và ít nhất một màn hình cùng loại.
3. Audit ngắn: vấn đề hiện tại, phần cần giữ, phần cần cải thiện và rủi ro đối với nghiệp vụ.
4. Chọn cải tiến nhỏ nhất giải quyết đúng vấn đề; không redesign toàn bộ phân hệ khi yêu cầu chỉ là thay đổi cục bộ.

### 3.2. Trong khi sửa

- Tái sử dụng component và class hiện có trước khi tạo mới.
- Đưa giá trị dùng lặp lại vào design token hoặc CSS dùng chung; tránh magic number và override cục bộ không cần thiết.
- Giữ nguyên semantic HTML, label, thứ tự tab bàn phím, focus management và thông báo lỗi.
- Motion chỉ được dùng cho phản hồi thao tác hoặc chuyển trạng thái, không dùng để trang trí. Luôn hỗ trợ `prefers-reduced-motion` nếu có animation tự động.
- Không sửa copy, route, field hoặc luồng nghiệp vụ ngoài phạm vi yêu cầu.

### 3.3. Kiểm tra trước khi hoàn thành

- [ ] Đúng Light Theme, màu nhấn và hệ border-radius của dự án.
- [ ] Không có icon, emoji trang trí, gradient/glow vô cớ hoặc card lặp lại không có ý nghĩa.
- [ ] Typography, spacing, header, tab, bảng, form và nút khớp các màn hình cùng loại.
- [ ] Có đủ trạng thái loading, empty, error, success, disabled và dữ liệu dài khi liên quan.
- [ ] Label, CTA và tên trạng thái dùng từ nhất quán, không trùng ý hoặc mơ hồ.
- [ ] Contrast đạt WCAG AA; focus nhìn thấy được; thao tác bàn phím và Escape hoạt động khi liên quan.
- [ ] Desktop hoạt động hiệu quả; màn hình hẹp không tràn, chồng lấp hoặc che chức năng quan trọng.
- [ ] Không phát sinh dependency, thay đổi dữ liệu hoặc thay đổi quyền ngoài phạm vi.
- [ ] Chạy lint/build hoặc kiểm tra tương ứng với mức rủi ro của thay đổi.
