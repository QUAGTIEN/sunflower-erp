# Lệnh sản xuất — bước triển khai đầu

## Quyết định D-LSX3 (chốt 02/11/2026): lưu là có hiệu lực, không còn bước duyệt

- Bỏ Nháp / Gửi duyệt / Trả về nháp / Duyệt & phát hành. **Lưu** tạo lệnh ở trạng thái `released` (nhãn "Đã lập",
  `releasedAt` = lần lưu đầu). Máy chủ từ chối `submit`, `return`, `release`. Lệnh `draft` / `pending_approval` cũ
  (nhãn "Nháp (cũ)", "Chờ duyệt (cũ)") xử lý như lệnh đã lập; lưu lại sẽ chuyển sang `released`.
- Trước khi bắt đầu sản xuất (`OPEN_PRODUCTION_STATUSES`): **Chỉnh sửa** và **Xóa** được. Xóa là hủy mềm
  (`cancelled`, nhãn "Đã xóa"): ẩn khỏi danh sách, giải phóng số lượng giữ chỗ, giữ lịch sử, xem lại bằng bộ lọc
  trạng thái "Đã xóa"; máy chủ chặn xóa khi lệnh còn NVL đã cấp. Từ lúc bắt đầu sản xuất, lệnh không sửa / xóa được.
- Các kiểm tra trước đây ở bước phát hành chuyển sang **Bắt đầu sản xuất**: đơn hàng đã sẵn sàng sản xuất, thông tin
  dòng và mã nội bộ / NVL chưa đổi (đổi thì chỉnh sửa và lưu lại lệnh), máy đang hoạt động đủ số màu, người chạy máy
  có quyền Sản xuất, có ngày cần và vật tư dự kiến, máy không chạy lệnh khác.
- Mặt hàng của đơn hàng chỉ bị khóa (`productionPlanFrozen`) khi đã có lệnh **bắt đầu** (`startedAt`).
- Trong LSX, **Kế toán và Admin như nhau**: kế toán (đang hoạt động, có quyền Accounting hoặc Production) lập, sửa,
  xóa, bắt đầu, nghiệm thu mọi lệnh như Admin / producer (`canDraftProduction`, `canEditProductionOrder`). Quản lý
  máy vẫn chỉ Admin / producer (`canManageProduction`).
- Ưu tiên bốn mức như tiến độ Thiết kế (`PRODUCTION_PRIORITIES`): `urgent` Cực gấp, `high` Gấp, `normal` Bình thường,
  `low` Thong thả. Giá trị lạ lưu thành Bình thường; ưu tiên dòng chỉ nhận bốn mức này.
- Mọi lệnh (cũ và mới) xuất cùng **một phiếu lệnh sản xuất đen trắng** (`productionPrint.ts`), A4 ngang theo kiểu
  chứng từ: tên công ty, địa chỉ / điện thoại / MST để trống khi chưa có, số phiếu, lần sửa, ngày lập; thông tin
  khách, đơn hàng, người lập, ưu tiên, ngày dự kiến, hạn giao, máy / ca, người chạy máy; bảng mặt hàng (quy cách, gia
  công góc / răng cưa / lõi / mét-tem mỗi cuộn, khách / đơn hàng, mã NVL / khổ, đạt QC), vật tư dự kiến, yêu cầu kỹ
  thuật, ghi chú và năm ô ký. Trường `printTemplate` cũ vẫn lưu nhưng không còn chọn bố cục; bỏ ô Mẫu phiếu.

## Quyết định D-LSX2 (chốt 30/10/2026): một lệnh gồm hàng của nhiều khách

- Thay phần "chỉ của một khách" của D-LSX1: một LSX có thể lấy dòng từ nhiều đơn hàng của **nhiều khách**.
- Mỗi dòng LSX lưu `customerId`, `customerName` của đơn hàng nguồn. Lệnh lưu `customerIds`, `customerNames`,
  `customerName` (nối tên); `customerId` chỉ có khi lệnh gồm một khách, lệnh nhiều khách để trống để không gán cả
  lệnh cho khách đầu tiên. `customerCode` nối mã khách khi có nhiều khách.
- Phiếu nhập thành phẩm tách theo đơn hàng nên mang khách của đơn hàng đó. Phiếu cấp NVL của lệnh nhiều khách không
  ghi `customerId`; "Khách đang dùng" vật tư tính cho từng khách của lệnh, mã thành phẩm tính theo khách của dòng.

## Quyết định D-LSX1 (chốt 27/10/2026): một lệnh gồm nhiều PO

- Lập lệnh chọn được **khách hàng, PO và mã sản phẩm độc lập**; một LSX có thể lấy dòng từ nhiều PO (phạm vi khách
  xem D-LSX2).
- Mỗi PO có bao nhiêu mã thì giữ bấy nhiêu dòng; cùng mã ở hai PO là hai dòng riêng, không gộp số lượng.
- Không lập lệnh cho hàng không thuộc PO (sản xuất tồn kho) trong đợt này.
- Bỏ bước chốt cột “Cần SX” trước lệnh đầu: dòng nào đưa vào lệnh là dòng cần sản xuất. Dòng mua bán lại / dịch vụ
  (`workType` mua_nvl/mua_hang/dich_vu, loại giấy/máy in/máy quét/mực in) không bao giờ là dòng sản xuất
  (`productionItemIds`). PO đã chốt danh sách theo luồng cũ giữ danh sách đó.
- Nút **Xuất lệnh sản xuất** mở phiếu (xem D-LSX3) và hộp thoại in, chọn "Lưu thành PDF".
- Giao diện theo kiểu chứng từ MISA (duyệt 27/10/2026, chỉnh theo D-LSX3). Mọi bảng (danh sách lệnh, mặt hàng / vật tư
  khi lập và ở chi tiết, danh sách máy, danh sách dao) dùng bộ công cụ bảng chuẩn như Kinh doanh
  (`useStandardTableColumns`): kéo đổi thứ tự cột, nút **Tùy chỉnh cột** (bố cục dùng chung, chỉ Admin sửa), không có
  dòng mở rộng / thu gọn.
  - **Danh sách:** ô tìm kiếm, nút **Bộ lọc** (trạng thái gồm "Đã xóa", mức ưu tiên, lệnh mới / cũ), nút tùy chỉnh cột,
    nút "Lập lệnh sản xuất" bên phải. Cột Số LSX, Khách hàng, Đơn hàng, Mặt hàng, Số dòng, Ưu tiên, Ngày cần, Trạng thái;
    thêm được Dự kiến sản xuất, Máy, Người chạy máy, Người lập, Ngày lập. Menu dòng: Chi tiết, Xuất lệnh sản xuất,
    Chỉnh sửa, Xóa (hai mục cuối chỉ khi chưa bắt đầu). Danh sách giữ nguyên tìm kiếm / bộ lọc / trang khi mở lệnh.
  - **Lập lệnh:** thanh tiêu đề (quay lại, tên, **Xóa** khi sửa lệnh đã lưu, **Lưu**). Thông tin chung dạng chứng từ
    gọn, nhãn bên trái ô, chia ba nhóm trên nền nhạt: *Đơn hàng & khách* (khách hàng dạng thẻ theo dòng đã chọn —
    D-LSX2 — và nút **Chọn hàng** ngay cạnh, ngày cần *, ưu tiên dạng ô chọn bốn mức), *Kế hoạch sản xuất* (khoảng
    ngày dự kiến, máy, người chạy máy, ca / tổ), *Ghi chú* (yêu cầu kỹ thuật, ghi chú chung). Lưới **Mặt hàng**: STT,
    khách hàng, đơn hàng, mã SP, tên, quy cách, ĐVT, còn lại, tồn TP, SL lệnh, mã nội bộ, khổ NVL, ưu tiên dòng, nút bỏ
    dòng. Nút **Chọn hàng** mở hộp thoại ba cột tick lồng nhau:
    tick khách hàng → hiện đơn hàng của khách đó; tick đơn hàng → hiện mã sản phẩm còn cần sản xuất; tick mã (hoặc cả
    đơn) rồi "Đồng ý" thêm dòng với số lượng còn lại. Bỏ tick khách hoặc đơn sẽ bỏ luôn phần đã chọn bên dưới.
    Hộp thoại liệt kê **mọi khách có đơn hàng** (trừ đơn đã xóa). Đơn hoặc dòng chưa lập lệnh được vẫn hiện, làm mờ,
    không tick được và ghi lý do (`PICKER_BLOCKS` trong `draftLines.ts`): đơn đã qua giai đoạn sản xuất, có LSX cũ
    chưa đối soát theo dòng, đơn chưa có mặt hàng, hàng mua / dịch vụ, số lượng trên đơn không hợp lệ, đã lập lệnh đủ,
    đã có trong lệnh. Đơn còn hàng cần sản xuất xếp trước.
  - **Chi tiết lệnh:** tiêu đề có Xuất lệnh sản xuất (biểu tượng), **Chỉnh sửa**, **Xóa**, **Bắt đầu sản xuất** khi
    chưa bắt đầu. Thông tin chung dạng lưới (cảnh báo nếu máy của lệnh không còn trong danh mục máy), rồi các tab Mặt
    hàng (tìm kiếm, lọc theo đơn hàng, tùy chỉnh cột; thông số đầy đủ ở tooltip ô Quy cách), Vật tư (vật tư dự kiến,
    sổ cấp NVL), Thành phẩm (sổ thành phẩm, QC khi đang sản xuất), Lịch sử.

Dữ liệu: mỗi dòng LSX lưu `poId`, `poCode`, `lineId` (`poId__itemId`); lệnh lưu `poIds`, `poCodes`, `poCode` (nối các
mã) và `poId` là PO đầu tiên để màn hình cũ vẫn đọc được. Lệnh trước đây (một PO, dòng không có `poId`) đọc như cũ.
Phân bổ số lượng tính theo cặp PO + dòng; máy chủ đọc lệnh theo `poId` và `poIds` (array-contains) rồi gộp.
QC gửi kết quả theo `lineId` (kết quả chỉ có `itemId` vẫn nhận khi không trùng). Mỗi PO tự chuyển chờ giao khi các
dòng sản xuất của chính PO đó đủ sản lượng đạt. `action: catalog` nhận `poIds` và trả liên kết mã theo khóa
`poId::itemId`. Nhập thành phẩm từ lệnh nhiều PO tách thành từng nguồn `<lệnh>--<PO>`; mỗi phiếu nhập thuộc một PO
(xem `../accounting/FINISHED_GOODS.md`).

## Đã triển khai

- Nhóm menu **Sản xuất** gồm các mục riêng **Lệnh sản xuất**, **Danh sách máy**, **Danh sách dao**, **Giao hàng**; trang
  Sản xuất không có tab, mỗi mục chỉ hiện đúng dữ liệu của mình. Đơn hàng không còn tab LSX. Toàn bộ lệnh mới / cũ dùng chung `production_commands`; có thể tìm kiếm, lọc loại lệnh và tạo lệnh mới tại Sản xuất.
- Chọn dòng từ một hoặc nhiều PO của cùng khách (xem D-LSX1), chia từng dòng thành nhiều LSX. Dòng nhập tay dùng `itemId`, không phụ thuộc mã sản phẩm.
- Lưu (đã lập) → Bắt đầu sản xuất → Nghiệm thu QC (D-LSX3). Chỉnh sửa / xóa mềm được trước khi bắt đầu; không xóa cứng lệnh mới.
- Lưu thông số từ PO, nhân sự, máy, ca, ngày cần, ưu tiên, ghi chú và vật tư dự kiến. Từ khi bắt đầu sản xuất, thông số và dòng hàng được khóa; danh mục sản phẩm thay đổi không sửa lệnh đã chạy.
- QC ghi nhận sản lượng đạt / hỏng theo từng mặt hàng và ĐVT. Thiếu sản lượng có thể lập lệnh bổ sung. PO chỉ chuyển từ chờ sản xuất sang chờ giao khi đủ sản lượng đạt của toàn bộ các dòng cần SX.
- Xem trước / in A4 ngang / lưu PDF, có vật tư dự kiến, cột SL lĩnh thực tế để ghi tay và chữ ký. Lệnh đã xóa có cảnh báo không dùng để triển khai.
- Chống phân bổ vượt PO, trùng yêu cầu, ghi đè phiên bản cũ và hai lệnh chạy cùng máy bằng giao dịch máy chủ. Mã LSX `LSX-YYMM-NNNN` đánh số liên tục theo tháng Việt Nam (D-MA1, bộ đếm `production_counters/LSX-YYMM`); lệnh cũ giữ mã `LSX-YYYYMMDD-NNNN`. Lưu nhật ký và audit trong cùng giao dịch.

## Quyền và dữ liệu

- Sale không truy cập trang Sản xuất và không được gọi API tạo / sửa / xóa LSX, kể cả nháp do Sale lập trước đây. Dữ liệu những lệnh này vẫn giữ nguyên để Admin / nhân sự Sản xuất tiếp tục xử lý.
- Admin / nhân sự có vai trò `producer` **và** quyền Sản xuất, cùng Kế toán đang hoạt động có quyền Accounting hoặc Production (D-LSX3), được lập, sửa, xóa, bắt đầu và nghiệm thu mọi LSX. Người chạy máy phải đang hoạt động và có quyền Sản xuất.
- Kế toán không quản lý máy. Accounting được kế thừa quyền vào Sản xuất cho hồ sơ cũ mà không sửa users; Sale tiếp tục bị chặn. Mở danh sách máy bằng Kế toán không khởi tạo máy mặc định trong Firestore.
- Các LSX cũ nằm cùng danh sách tại **Sản xuất → Lệnh sản xuất**, mở chi tiết để báo cáo hoàn thành hoặc bàn giao theo quyền cũ. Không tự đoán phân bổ theo dòng PO; PO có lệnh cũ cần đối soát trước khi lập lệnh mới.
- Đã bỏ cơ chế trừ giấy / mực bằng hệ số cố định khi hoàn thành lệnh cũ. Lệnh cũ hoàn thành được đánh dấu cần đối soát, không tự đưa toàn PO sang chờ giao.
- Lệnh đã lập giữ chỗ số lượng nhưng vẫn cho phép bộ phận thiết kế cập nhật PO. Khi bắt đầu sản xuất, máy chủ kiểm tra lại nguồn dữ liệu; nếu đã đổi phải chỉnh sửa và lưu lại lệnh. Từ khi có lệnh bắt đầu, cấm sửa mặt hàng của PO. Xóa toàn bộ lệnh chưa chạy sẽ mở lại phạm vi kế hoạch.

## Danh sách máy

- Gom thông số, năng lực, trạng thái, LSX đang phân công, ca / người vận hành và hạn giao vào một bảng chuẩn: tìm kiếm, lọc trạng thái / loại máy, tùy chỉnh và kéo cột. Có thống kê tải máy; bỏ băng cảnh báo "LSX chưa khớp danh mục máy" (cảnh báo nằm ở chi tiết từng lệnh).

## Danh sách dao

- Bảng chuẩn như danh sách máy: tìm kiếm, lọc trạng thái sử dụng / răng cưa, tùy chỉnh và kéo cột (`die-catalog`).
- Giữ chức năng thêm / sửa / ngừng sử dụng máy; không ngừng máy còn LSX hoạt động. Không còn tab Lịch máy riêng.

## Bổ sung lượt kế toán 2 — ngày 22/10/2026

- Khổ NVL và ưu tiên từng dòng lưu trong `lines[].printDetails`, không thay kỹ thuật PO. `customerCode` lấy từ PO hoặc hồ sơ khách khi lưu. Các mẫu phiếu theo `printTemplate` đã thay bằng phiếu chung D-LSX3; các ô chưa có nghiệp vụ kho thực tế để trống, không tự điền số 0/người cấp/thời gian giả.
- `/api/production/manage` thêm `action: catalog` để đọc mã NVL đang dùng và liên kết dòng PO. Producer tra cứu qua API, không cấp quyền quản trị danh mục. Không cần mã yêu cầu cho thao tác chỉ đọc.
- Tạo/sửa/bắt đầu đọc lại liên kết mã phía máy chủ. Ưu tiên liên kết PO đã xác nhận; chỉ kế thừa liên kết sản phẩm khách khi đúng ID, phiên bản và kỹ thuật/ĐVT. Snapshot lưu mã, tên, ĐVT cơ sở/gốc, hệ số và revision; không tin snapshot client. Vật tư chọn mã phải là NVL và có hệ số quy đổi được khai báo.
- Dòng chưa liên kết giữ khả năng lưu/in theo luồng cũ; ghi rõ chưa liên kết, cần đối soát trước hạch toán kho ở lượt 3. Liên kết đã có nhưng stale/inactive bị chặn lưu/bắt đầu. Đổi danh mục sau khi lưu yêu cầu chỉnh sửa và lưu lại trước khi bắt đầu; không thay mã trên lệnh đã chạy.
- Không đổi số tồn, công nợ hoặc backfill lệnh cũ. Chi tiết hợp đồng và quyết định tại `../accounting/ACCOUNTING_SPEC.md`, `../accounting/ACCOUNTING_DECISIONS.md`.

## Bổ sung lượt kế toán 3 — ngày 23/10/2026

- Phiếu cấp nhiều lần/bổ sung, hoàn nhiều lần và đảo có ở sổ kho NVL mới. Chi tiết LSX v2 hiển thị lịch sử và mở form theo quyền; Producer chỉ xem. Admin/Mua hàng Inventory/Kế toán Accounting ghi sổ; chỉ Admin đảo.
- Cấp cho lệnh đã lập/đang chạy, hoàn thêm cả lệnh hoàn thành; không hoàn vượt lượng cấp ròng. Không xóa LSX khi còn NVL cấp ròng. Không sửa snapshot LSX để gán mã; dòng nhập tay v2 cần chọn/xác nhận mã ở kho, lệnh cũ v1 cần đối soát riêng.
- Một kho chung, quy đổi khai báo theo mã, cảnh báo xuất âm và xác nhận/lý do. Nhận mua NVL chỉ số lượng, không tự sinh công nợ. `inventory` và `warehouse_exports` cũ chỉ đọc, không tự chuyển đầu kỳ. Chi tiết tại `WAREHOUSE.md`.

## Chưa triển khai

Đã bổ sung nhập thành phẩm/giao/trả ở lượt kế toán 4, xem `../accounting/FINISHED_GOODS.md`. Chưa có giá thành/giá vốn, phân bổ tiêu hao, nhiều kho/lô/cuộn/vị trí hoặc chuyển đổi đầu kỳ thật. Các vùng cấp kho / đối soát trên bản in vẫn để ghi theo chứng từ riêng, không tự đổ dữ liệu hoặc chữ ký giả.

Không có thao tác lưu / bắt đầu / in / nghiệm thu LSX nào tự trừ tồn kho. Chỉ phiếu thực tế qua API kho làm đổi số dư mới; không chạy song song đường ghi tồn cũ.

## Triển khai

1. Triển khai ứng dụng và API `POST /api/production/manage` trên Vercel. API dùng các biến máy chủ hiện có: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Không đưa khóa này vào biến `VITE_*`.
2. Triển khai `firestore.rules` cùng phiên bản: `firebase deploy --only firestore:rules`. Quy tắc mới chặn ghi trực tiếp lệnh mới và bảo vệ phạm vi / phiên bản phân bổ trong PO. Các truy vấn chỉ dùng chỉ mục đơn trường `poId`, `machineId`.
3. Local cần API máy chủ (ví dụ `vercel dev`); `vite` đơn thuần không phục vụ `/api`. Chế độ dữ liệu demo chỉ xem danh sách, không giả lập giao dịch hoặc âm thầm lưu local khi API lỗi.
4. Danh mục máy phải được lưu trong hệ thống; mở **Sản xuất → Danh sách máy** để cấu hình trước khi bắt đầu sản xuất.

Lượt 2 không thay `firestore.rules` so với lượt 1: quyền đọc cần thiết đã có, ghi lệnh mới qua API. Vẫn phải xác nhận triển khai rules của các lượt trước; chưa có xác nhận môi trường thật đã dùng phiên bản đó. Push Git không xác nhận deploy Vercel/Firebase.

Lượt 3 thay rules và thêm `/api/warehouse/manage`; cần web/API/rules cùng phiên bản. Chưa deploy hoặc ghi dữ liệu thật trong lượt này.

## Kiểm tra

- `node --test tests/production-orders.test.cjs`: kiểm thử model và API với mô phỏng giao dịch có retry / kiểm tra phiên bản, không kết nối dữ liệu thật.
- Kiểm thử hai tab Sản xuất, lệnh cũ / mới, quyền Sale, danh sách máy; các kiểm thử PO nhập tay, đồng bộ mã sản phẩm, build TypeScript / Vite và lint theo phạm vi.
- Chưa kiểm thử trình duyệt, máy in thực hoặc triển khai quy tắc trên Firebase trong lượt này.
- Lượt 2 bổ sung test quyền Kế toán/nháp của người khác, liên kết PO/sản phẩm khách, mã stale/inactive, snapshot sau phát hành, quy đổi NVL, mẫu có phiên bản, dữ liệu dài và bản in nhiều trang. Kiểm tra HTML sinh ra không thay thế nghiệm thu bố cục trên trình duyệt/máy in thật.

## Bổ sung lượt kế toán 4 — ngày 23/10/2026

Chi tiết LSX v2 hiển thị lịch sử phiếu thành phẩm, mở nhập thực tế khi lệnh hoàn thành và người dùng có quyền kho. Nhập từng phần, tổng không vượt lượng đạt QC, đóng băng mã/quy đổi và kiểm tra nguồn trên máy chủ. Producer chỉ xem; QC/in/lưu không tự tăng tồn. Phiếu mới qua /api/warehouse/finished, tách số dư NVL và giữ lệnh cũ; cần deploy web/API/rules cùng phiên bản. Chưa có đầu kỳ thật, công nợ mới hoặc nghiệm thu Firebase/trình duyệt thật. Xem FINISHED_GOODS.md.

## Bổ sung xử lý thiếu/dư sản lượng — ngày 28/10/2026

- **Nghiệm thu SL dư (`surplusQuantity`):** Khi nghiệm thu QC, ngoài SL đạt và SL hỏng, hỗ trợ nhập **SL dư** (`surplusQuantity >= 0`). SL dư được lưu riêng trên dòng LSX, không tính vào phân bổ/hoàn thành PO và được nhập kho qua phiếu `production_surplus_receipt`.
- **Cảnh báo tồn dư khi lập LSX:** Bảng mặt hàng trong form lập LSX hiển thị nhãn `"Kho đang có N <ĐVT> dư"` nếu mã thành phẩm đã liên kết đang có tồn kho dương.
- **Thao tác nhanh khi thiếu hàng trên LSX hoàn thành:** Khi LSX đã hoàn thành (`completed`) mà có dòng thiếu sản lượng (`goodQuantity < quantity`), bảng mặt hàng hiển thị rõ `"Thiếu N <ĐVT>"` và thanh thao tác hiển thị 2 nút nhanh:
  1. **Lập lệnh bổ sung:** Mở form lập LSX điền sẵn khách hàng, các dòng PO còn thiếu với số lượng bằng đúng phần thiếu, vật tư dự kiến và ghi chú tham chiếu LSX gốc.
  2. **Đề nghị mua thêm NVL (`action: 'request_materials'`):** Tạo yêu cầu mua hàng (`procurement_requests`, `sourcingType: 'raw_material'`, trạng thái `new`) từ danh sách vật tư dự kiến của LSX trong giao dịch máy chủ; không tự tạo đơn mua (`purchase_orders`) hay công nợ.

## Kế hoạch và vật tư khi lập lệnh — ngày 30/10/2026

- Thông tin chung có **Bắt đầu / Hoàn thành dự kiến** (`plannedStartDate`, `plannedEndDate`, tùy chọn, ngày hoàn
  thành không trước ngày bắt đầu) và **Yêu cầu kỹ thuật chung** (`technicalNotes`, tách khỏi ghi chú chung). Lệnh cũ
  để trống. Chi tiết lệnh và phiếu in hiển thị các trường này.
- Bảng vật tư dự kiến có thêm **Cần dùng** = số lượng × (1 + hao hụt), **Tồn kho** và **Thiếu**, quy về ĐVT
  của dòng bằng hệ số quy đổi đã khai báo của mã NVL (`materialShortage`). Dòng chưa chọn mã hoặc ĐVT chưa có quy
  đổi hiện "—", không tự quy đổi. `action: catalog` trả thêm `materialBalances` (tồn kho NVL theo ĐVT cơ sở).
- `action: request_material_shortage`: với lệnh chưa bắt đầu hoặc đang chạy, máy chủ đọc tồn kho
  NVL trong cùng giao dịch và tạo `procurement_requests` (`sourcingType: raw_material`, `new`) **chỉ cho phần thiếu**
  của vật tư đã có mã và quy đổi. Không giữ chỗ, không trừ kho, không tạo đơn mua hay công nợ. Hết thiếu thì từ chối.
  Lệnh hoàn thành vẫn dùng `request_materials` như trước.
