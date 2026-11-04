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
| D05b-2 | ~~Kế toán chỉ lập, sửa/gửi duyệt nháp của mình~~ — thay bởi D-LSX3 (02/11/2026): trong LSX kế toán như Admin (lập, sửa, xóa, bắt đầu, nghiệm thu mọi lệnh); vẫn không quản lý máy | Người dùng chốt bỏ bước duyệt và cho kế toán quyền như Admin ở LSX (`docs/modules/PRODUCTION_ORDERS.md`) |
| D05c | ~~Quyền Sản xuất kế thừa từ Accounting~~ — bỏ theo D-PQ1 (02/11/2026): trang phải được tick rõ. Trước đây: quyền Sản xuất kế thừa từ Accounting chỉ áp dụng vai trò accountant, không sửa users cũ và không mở quyền ghi client rules | Cho hồ sơ hiện hữu dùng được, không vô tình cấp quản lý kho/máy/lệnh cũ |
| D02g | Máy chủ lấy liên kết PO trước; kế thừa sản phẩm khách chỉ khi đúng ID, phiên bản, kỹ thuật và ĐVT | Tái dùng danh mục lượt 1, không ghép nhầm dòng nhập tay hoặc snapshot cũ |
| D02h | Mã nội bộ/quy đổi được chụp trên lệnh; thay đổi trước khi bắt đầu sản xuất phải chỉnh sửa và lưu lại; lệnh đã chạy dùng snapshot (D-LSX3 thay mốc phát hành bằng mốc bắt đầu) | Không thay ý nghĩa phiếu lịch sử hoặc nội dung đã chạy |

## Quyết định lượt 3 — đã được người dùng xác nhận ngày 23/10/2026

| Mã | Quyết định |
|---|---|
| D02f-3 / D03-3 | Một kho NVL chung; chưa quản lý lô/cuộn/vị trí. Không chuyển tồn cũ tự động; đầu kỳ thật chốt ở lượt 7 |
| D04-3 | Cảnh báo xuất âm, cho người có quyền ghi sổ xác nhận kèm lý do; không ghi lùi/ngày tương lai |
| D05b-3 | Admin và Kế toán có Accounting hoặc Kho vật tư ghi sổ (D-PQ1 bỏ vai trò purchaser); chỉ Admin đảo; Kỹ thuật (producer) chỉ xem |
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


## Quyết định lượt 5 — người dùng xác nhận ngày 23/10/2026

| Mã | Quyết định |
|---|---|
| D06-5 | Kế toán xác nhận chứng từ tăng nợ từ giao/nhận thực tế; kho/POD không tự tạo nợ |
| D06a-5 | VND, giá chưa thuế, thuế suất nhập theo chứng từ, làm tròn đến đồng, hạn nợ riêng |
| D07-5 | Phân bổ tiền tới từng dòng mã của chứng từ, nhiều dòng/đơn; khoản chưa dùng giữ riêng ở ứng trước |
| D05b-5 | Admin và accountant có Accounting lập/ghi sổ; chỉ Admin đảo/khóa/mở kỳ; Sale/Mua hàng không ghi tiền; không ghi lùi ngày |

Lựa chọn triển khai trong phạm vi: giảm nợ chạm tiền đã phân bổ cần đảo phân bổ trước, sau đó giảm/phân bổ lại/hoàn tiền chưa dùng; không tự giảm tiền theo hàng trả. Số dư và ứng trước đầu kỳ có chứng từ đối chiếu riêng, không tự chuyển dữ liệu thật. Rules bảo vệ liên kết đối tác, nguồn hàng và metadata; API kho/tiền dùng cùng phụ thuộc khi đảo. Màn hình mới dành Admin/Kế toán Accounting; không tự cấp quyền trang cho vai trò khác. Chi tiết ACCOUNTING_LEDGER.md. Chuyển đổi số thật vẫn theo D09 lượt 7.

## Lựa chọn triển khai lượt 6

Người dùng đồng ý code/push phạm vi lượt 6. Sau khi push `22de146`, người dùng trả lời “Áp dụng đề xuất” cho cả hai câu hỏi về ngày cảnh báo/tuổi nợ và quyền báo cáo tổng hợp. D10a-6 và D10b-6 đã được xác nhận trực tiếp; mã lượt 6 đã khớp, không cần sửa logic. D10c-6 và D10d-6 tiếp tục là các lựa chọn kỹ thuật trong phạm vi triển khai:

| Mã | Lựa chọn |
|---|---|
| D10a-6 | Báo trước 3 ngày, bộ lọc chỉnh 0–365; tuổi nợ quá hạn 1–30/31–60/61–90/trên 90; chưa có lịch tự gửi cảnh báo |
| D10b-6 | Báo cáo tổng hợp đầy đủ chỉ Admin/Kế toán Accounting; tóm tắt AR khách của Sale theo phân công CRM, AP tại NCC của Kế toán có Mua hàng/Nhà cung cấp (D-PQ1, trước là Purchaser); không mở quyền trang/ghi sổ tiền |
| D10c-6 | Báo cáo tiền theo ngày ghi sổ, đảo tác động ngày đảo; ứng trước và tiền vào/ra tách phân bổ. Hàng/kho ở báo cáo này là số hiện tại, không bị lọc theo kỳ tiền |
| D10d-6 | Không cộng hóa đơn cũ chưa chuyển đổi với nợ mới/đầu kỳ; giữ riêng cho lượt 7 đối soát. Không tự ghi lùi theo openingAsOf |

| D10e-UI | 25/10/2026 — người dùng chọn bỏ hẳn khối công nợ ngoài Kế toán: không còn bảng "Công nợ & cảnh báo" ở Dashboard, dòng "Công nợ theo sổ mới / Tải lại công nợ" và số nợ đầu trang chi tiết ở Khách hàng và Nhà cung cấp. Giữ cột "Công nợ" trong bảng khách/NCC theo phạm vi D10b-6; xem đầy đủ tại Kế toán |

Ngưỡng thành phẩm/hàng mua dùng cùng nhóm ghi kho lượt 3 và quy tắc `< ngưỡng`; null khác 0. Không thay hạn nợ, điều khoản thương mại, dung sai giao, khóa kỳ hoặc quyền đảo đã chốt. D09 ngày cắt/đầu kỳ thật vẫn chưa chốt.

## Phân quyền 5 vai trò — người dùng chốt ngày 02/11/2026

| Mã | Quyết định |
|---|---|
| D-PQ1 | Còn 5 vai trò: Admin, Sale, Thiết kế, Kỹ thuật (`producer`), Kế toán. Bỏ vai trò Mua hàng; mua hàng, NCC, kho NVL thuộc Kế toán. Mỗi vai trò chỉ được tick trang thuộc chức năng của mình, không xem chéo, không quyền ngầm. LSX: Kế toán = Admin; Kỹ thuật chạy/nghiệm thu, toàn quyền máy và dao, xem toàn bộ kho. Giao hàng: Kế toán và Kỹ thuật (sẽ làm lại sau). Tài khoản vai trò cũ bị chặn và do Admin xóa. Chi tiết: `docs/business/PROJECT_OVERVIEW.md` mục 3 |
| D-TR1 | Thùng rác chỉ Admin dùng; khôi phục/xóa vĩnh viễn qua máy chủ, không xóa vĩnh viễn bản ghi đã vào sổ tiền/hàng, hóa đơn cũ chỉ đọc; xóa mềm ghi người và thời gian xóa |
| D-BM1 | Bỏ quyền ngầm của email khởi tạo (chỉ dùng khi chưa có Admin thật); hồ sơ `users` riêng tư (chính chủ + Admin), đồng nghiệp xem qua `user_directory`; production luôn đăng nhập Firebase, bỏ mật khẩu demo |
| D-BM2 | Nhân viên tự đổi mật khẩu; Admin xem được mật khẩu nhân viên (người dùng chọn sau khi được giải thích rủi ro): lưu bản mã hóa AES-256-GCM phía máy chủ, xem theo yêu cầu, tự ẩn, ghi lịch sử mỗi lần xem |
| D-PO1 | 03/11/2026: không màn nào còn chọn tay trạng thái đơn (bỏ "Cập nhật nhanh" ở chi tiết đơn hàng và ở Tổng quan); hàng đợi PO chỉ chuyển theo thiết kế, LSX, giao hàng và sổ kế toán. Chiết khấu từng dòng chỉ sửa trong form Sửa đơn. quyền xem KPI/giá giữ nguyên. Chi tiết đơn dùng đúng bố cục form tạo đơn, không còn tab LSX/chuyến giao: LSX và chuyến giao xem ở phân hệ Sản xuất, Giao hàng |
| D-PO2 | 04/11/2026: mỗi đơn một trang, mở ra là sửa được luôn. Quyền giữ nguyên: Admin, Sale sửa; vai trò khác và đơn đã có phân bổ sản xuất chỉ xem (khóa ô nhập). Nhân bản chỉ còn ở menu "…" của danh sách đơn |
