# Sunflower ERP — hướng dẫn làm việc cho Claude

Bộ nguyên tắc dưới đây đã được người dùng duyệt ngày 24/10/2026. Muốn đổi nguyên tắc thì phải hỏi người dùng.

ERP nội bộ cho doanh nghiệp kinh doanh và sản xuất tem nhãn Sunflower. Giao diện và tài liệu
nghiệp vụ viết bằng tiếng Việt; định danh trong code (biến, collection, field) giữ tiếng Anh.

## Dự án và stack

- Repository Git chính là thư mục này (`sunflower/sunflower`). Thư mục cha `sunflower/` chỉ chứa
  file làm việc tạm của công cụ cũ, không thuộc repo.
- **React 19 + TypeScript 6 + Vite 8 (SPA).** Không phải Next.js, không có router: `src/app/AppShell.tsx`
  điều hướng bằng state `activePage` và `switch`.
- **Firebase:** Auth + Firestore phía client (`src/infrastructure/firebase`). Không dùng Storage cho ảnh
  (ảnh nén Base64 lưu trong Firestore; file lớn dùng link ngoài).
- **API:** Vercel Functions `api/**/*.ts` → logic tại `server/*.ts` (Firebase Admin SDK).
  `server/` được phép import **model thuần** từ `src/features/*/model` để dùng chung quy tắc.
  Mỗi file trong `api/` là một function; gói Vercel Hobby chỉ cho **tối đa 12** (vượt là deploy lỗi). Thêm thao tác
  mới vào endpoint `manage` có sẵn qua trường `action`, không tạo file mới (test `deployment-limits` kiểm tra).
- Quyền dữ liệu thật nằm ở `firestore.rules` / `storage.rules`. Quyền màn hình ở
  `src/app/navigation/accessControl.ts`. Ẩn nút trên UI **không** phải là bảo mật.

## Lệnh

| Việc | Lệnh |
|---|---|
| Chạy giao diện | `npm run dev` — chỉ Vite, **không phục vụ `/api`** (cần `vercel dev`) |
| Build (client + server + Vite) | `npm run build` |
| Toàn bộ test | `npm test` |
| Một bộ test | `node --test tests/<ten>.test.cjs` |
| Lint | `npm run lint` hoặc `npx eslint <file>` |
| Định dạng | `npm run format -- <file>` / `npm run format:check -- <file>` (Prettier, cấu hình `.prettierrc.json`) |

Baseline ngày 25/10/2026:
- Build đạt; có sẵn cảnh báo chunk > 500 KB.
- Test 348/348 đạt.
- Lint 187 lỗi: phần lớn `no-explicit-any` (174), còn 9 `set-state-in-effect` và 2 cảnh báo `exhaustive-deps`
  chờ quyết định vì sửa sẽ đổi thời điểm chạy. Không commit nếu số lỗi tăng.
- Toàn bộ code, CSS và `tests/` đã theo Prettier (trừ tài liệu `.md`, `vercel.json`, `scripts/clear-db.js`).

Test mới nạp file TypeScript bằng `tests/helpers/loadTs.cjs` (`createLoader(stubs)`, `readSource`).
Không chép lại loader vào từng file test.

Khi chạy nặng thì chạy tuần tự (Node từng hết bộ nhớ khi build, test và lint chạy song song).

**Tuyệt đối không chạy `npm run db:clear`** — script xóa và tạo lại dữ liệu Firebase.

## Bản đồ mã nguồn

```text
api/                 Vercel Functions (mỏng: xác thực → gọi server/)
server/              Logic máy chủ: transaction sổ kho/tiền, LSX, danh mục, chấm công, users
src/app/             AppShell, providers, phân quyền màn hình, cấu hình app
src/features/<x>/    pages/ components/ model/ api/ index.ts — mỗi phân hệ nghiệp vụ
src/components, hooks, services, domain, context   Lớp dùng chung cũ, VẪN đang dùng
src/shared/          Kiểu và tiện ích không phụ thuộc feature
src/infrastructure/  firebase/ (client, authAdapter, firestoreAdapter, erpDataGateway), local-storage/
src/styles/          ErpUiStandards.css, Theme.css, ContentTabs.css — chuẩn UI dùng chung
tests/               node:test + loader TypeScript tự viết, stub Firebase trong bộ nhớ
docs/                Tài liệu nghiệp vụ và kỹ thuật (xem mục Tài liệu)
```

Phân hệ: dashboard, chat, work-schedule, attendance, crm (dữ liệu thô / tiềm năng / khách hàng),
commercial-map, sales (PO), sales-management, design, procurement, inventory, catalog, production,
delivery, accounting, administration.

Luồng chính: `lead_candidates` → `leads` → `customers` → `pos` → thiết kế / mua hàng / kho / LSX
→ giao hàng (POD) → kế toán.

Hàng đợi PO (`src/features/sales/model/poWorkflow.ts`): `waiting_design` → `waiting_production`
→ `waiting_delivery` → `waiting_invoice` → `waiting_receivable` → `waiting_discount` → `completed`.

## Bộ nguyên tắc làm việc

### A. Phạm vi và trao đổi

1. Chỉ làm đúng phạm vi được yêu cầu. Thay đổi cấu trúc, thay đổi hành vi nghiệp vụ và thiết kế lại UI
   là **ba loại thay đổi riêng**, không gộp trong một lần sửa hoặc một commit.
2. Quyết định nghiệp vụ (tiền, kho, quyền, mốc ghi sổ, dữ liệu thật) là của người dùng. Khi thiếu
   thông tin thì hỏi, không tự suy ra hay tự dùng dữ liệu mẫu. Quyết định đã chốt ghi vào
   `docs/accounting/ACCOUNTING_DECISIONS.md` hoặc tài liệu phân hệ tương ứng.
3. Trước khi sửa: đọc tài liệu phân hệ liên quan, tìm mọi nơi gọi/ghi cùng dữ liệu (`Grep`), nắm luồng cũ.
4. Báo cáo trung thực: đã chạy gì, kết quả gì, còn lỗi gì, phần nào chưa kiểm tra.

### B. Bất biến nghiệp vụ và dữ liệu — không được phá

1. **Một nguồn ghi:** sổ kho NVL, sổ thành phẩm, công nợ/thu chi, LSX, danh mục, chấm công chỉ ghi qua
   transaction máy chủ (`server/*`). Client không ghi trực tiếp các collection này; rules chặn client write.
   Không khôi phục các đường ghi tắt cũ (cộng tồn trực tiếp, cộng `paidAmount`, `qtyDelivered`).
2. **Chống trùng và chống ghi đè:** mọi yêu cầu ghi có `requestId` (idempotency) và kiểm tra `revision`.
   Mất phản hồi thì giữ nguyên payload/requestId để gửi lại; không báo thành công khi máy chủ chưa xác nhận.
3. **Không xóa lịch sử:** chứng từ đã ghi sổ chỉ được **đảo** bằng chứng từ mới; không sửa/xóa.
   Giữ snapshot (LSX đã phát hành, thông tin khách lúc tạo PO).
4. **Không ghép theo tên/mã giống nhau.** Mã khách/NCC khác mã nội bộ; ánh xạ phải được xác nhận rõ.
5. **Tiền và hàng độc lập.** Kho/POD không tự tạo công nợ; trả đủ tiền không có nghĩa đã giao đủ hàng.
   Không suy lịch sử thu chi từ số đã trả hiện có.
6. **Không tự quy đổi đơn vị** (cuộn/mét/m²…); chỉ dùng hệ số khai báo theo từng mã.
7. Ngày ghi sổ là ngày hiện tại theo `Asia/Ho_Chi_Minh`; không ghi lùi ngày hoặc ngày tương lai.
8. Giữ tương thích dữ liệu cũ (`poCompatibility.ts`, ánh xạ trạng thái legacy, normalization trong
   `localCollectionStore.ts`). Đổi schema phải xử lý tài liệu cũ đang có trong Firestore.
9. Không đổi tên collection, field, route, trạng thái hay sự kiện audit một cách ngầm định.
10. Không dùng dữ liệu giả trông như thật trên giao diện; không fallback sang lưu local để che lỗi Firebase.

### C. Bảo mật và quyền

1. API lấy vai trò/người thực hiện từ tài khoản đã xác thực trên máy chủ (`server/erpCaller.ts`),
   không tin dữ liệu client gửi lên (tổng tiền, catalogItemId, hệ số, vai trò…).
2. Thay đổi quyền phải sửa đồng bộ cả UI (`accessControl.ts`), API (`server/*`) và `firestore.rules`,
   kèm test. Không tự mở thêm quyền cho vai trò nào.
3. Không đọc, in hoặc commit nội dung `.env*`, khóa Firebase Admin, token. Không đưa khóa bí mật vào `VITE_*`.
4. Không hiển thị stack trace, mã lỗi Firestore hay dữ liệu vượt quyền cho người dùng cuối.

### D. Kiến trúc và cách viết code

1. Hướng phụ thuộc: `app → features → shared`; `infrastructure` chỉ là adapter. `shared` không import
   feature/app/infrastructure; `model/` và `src/domain` không import UI/adapter (ESLint đang ép).
2. Feature không import file nội bộ của feature khác; dùng `index.ts` hoặc `model/`/`api/` công khai.
3. Import ngoài thư mục hiện tại dùng alias `@/`.
4. **Code phải sạch, gọn, dễ review:**
   - Mỗi câu lệnh một dòng, dòng ≤ 120 ký tự. Không dồn nhiều khai báo `useState`/logic trên một dòng.
   - Tên biến/hàm rõ nghĩa theo nghiệp vụ; không viết tắt khó hiểu (`d`, `x`, `fail`, `rows`… cho mọi thứ).
   - Hàm làm một việc, ngắn; tách logic nghiệp vụ khỏi JSX (đưa vào `model/` hoặc hook).
   - Không lặp code: tìm và dùng lại helper/component có sẵn trước khi viết mới.
   - Không để code chết, `console.log`, comment cũ hay đoạn bị comment-out.
   - Comment giải thích *vì sao* (quy tắc nghiệp vụ, ràng buộc), không lặp lại code làm gì.
   - Kiểu dữ liệu rõ ràng; không thêm `any` mới.
   - Diff nhỏ, tập trung: một commit giải quyết một việc, người review đọc là hiểu.
5. Không định dạng lại hay refactor code không liên quan trong cùng thay đổi nghiệp vụ.
   File `.ts/.tsx` đã sửa phải qua `npm run format -- <file>` trước khi commit. Định dạng lại phần chưa
   theo Prettier (CSS, tests) là commit `style(...)` riêng, không đổi hành vi; build và test lại trước khi commit.
   Test đọc mã nguồn bằng regex phải chịu được khoảng trắng/xuống dòng (`\s*`, `\s+`).
6. Không thêm, thay hoặc nâng cấp dependency khi chưa được người dùng đồng ý.
7. Lint: code mới/được sửa phải sạch lỗi; file cũ không được tăng số lỗi so với baseline.

### E. Giao diện

UI phải đọc `docs/dev/DEVELOPER_GUIDELINES.md` và dùng skill `sunflower-erp-ui` (`.claude/skills`).

**Chuẩn chất lượng:** giao diện chuyên nghiệp như các phần mềm ERP hiện đại, lấy **MISA** làm chuẩn tham chiếu
(gọn, mật độ cao, rõ ràng, thao tác nhanh). Khi làm màn hình hoặc pattern mới mà chưa có mẫu tương tự trong
dự án, **hỏi người dùng gửi ảnh tham chiếu MISA** trước khi thiết kế; không tự sáng tác phong cách.

**Đồng nhất giữa các phân hệ (bắt buộc):** cùng một loại thành phần (header trang, tab, toolbar, bộ lọc,
bảng, form, modal, nút, trạng thái, toast, phân trang) phải trông và hoạt động giống nhau ở mọi phân hệ.
Trước khi sửa, đối chiếu với ít nhất một màn hình cùng loại đã chuẩn. Không tạo biến thể riêng cho một trang.

**Không được có lỗi cơ bản:**
- Không cắt xén chữ ngoài ý muốn: nhãn, nút, tiêu đề, tab, tiêu đề cột không bị cắt hay xuống dòng lệch.
  Chỉ nội dung dữ liệu trong ô bảng được rút gọn, và phải có ellipsis + `title`/tooltip xem đầy đủ.
- Không đè lớp: dropdown, menu, tooltip, modal, toast có `z-index` đúng tầng (dùng token chung) và không bị
  `overflow` của khung cha cắt mất; menu gần mép màn hình phải tự đổi hướng.
- Không vỡ layout: không tràn ngang trang, không chồng phần tử, không nhảy bố cục khi đổi tab/tải dữ liệu/
  hiện lỗi. Kiểm tra với dữ liệu dài, dữ liệu rỗng, nhiều dòng, và độ rộng 1366px, 1920px, màn hình hẹp.
- Căn chỉnh thẳng hàng theo lưới 4px; chiều cao control, khoảng cách, cỡ chữ đúng token.

**Tóm tắt quy chuẩn:**

- Light theme, font Inter; ERP mật độ cao, tiết chế. Không dark mode, gradient, glow, card trang trí.
- Tái sử dụng component và `src/styles/ErpUiStandards.css` trước khi tạo mới; giá trị lặp lại dùng token.
- Bảng: một dòng/ô, ellipsis + `title`, số căn phải, thao tác dòng qua `RowActionMenu`,
  phân trang dùng chung `DataTablePagination`. Tab không có số đếm sau tên.
- Form: nhãn trên ô nhập, `*` cho trường bắt buộc, cảnh báo khi rời trang có dữ liệu chưa lưu,
  chặn rời khi đang lưu. Hành động nguy hiểm phải xác nhận (`DeleteConfirmationDialog`).
- Đủ trạng thái: loading, empty, error, success, disabled, dữ liệu dài. Phản hồi qua `MutationToast`.
- Icon: chỉ dùng `lucide-react` (đã có sẵn); không dùng emoji hay thư viện icon khác, không dùng icon trang trí thẻ/tiêu đề.
  Nút công cụ (quay lại, tải lại, lọc, tùy chỉnh cột, xuất, in, chuyển kiểu xem, tháng trước/sau, đính kèm, thao tác
  dòng) **chỉ có icon** qua `IconButton` / `PageBackButton` (có `aria-label` + tooltip). Hành động chính và hành động
  nguy hiểm (Tạo, Lưu, Gửi duyệt, Xóa, Hủy...) **giữ nhãn chữ**. Nút quay lại luôn đứng đầu header, trước tiêu đề
  (quyết định UI ngày 25/10/2026).
- Bảng: hàng cuối luôn có đường kẻ dưới; vùng trống phía dưới để trơn, không kẻ sẵn đường (CSS chung trong
  `ErpUiStandards.css`).

### F. Kiểm tra trước khi bàn giao

1. Luôn chạy `npm run build`.
2. Chạy test liên quan; thay đổi hành vi phải có test mới (quyền, dữ liệu cũ, gửi lại, đồng thời).
   Khi đụng phần dùng chung thì chạy toàn bộ test và so với baseline.
3. Lint các file đã sửa và so sánh với baseline.
4. Test rules trong repo là kiểm tra hợp đồng tĩnh, không thay cho emulator.
5. **Không mở trình duyệt, không chạy thử app, không chụp màn hình** — người dùng tự kiểm thử giao diện.
   Lỗi cắt chữ/đè lớp/vỡ layout (mục E) phải được phòng ngay khi viết code: đọc kỹ CSS dùng chung, class và
   token của màn hình cùng loại. Khi bàn giao, liệt kê ngắn những điểm người dùng nên kiểm tra trên giao diện.

### I. Tiết kiệm token

1. Đọc có mục tiêu: dùng `Grep`/`Glob` để định vị, chỉ đọc đoạn file cần thiết (`offset`/`limit`), không đọc lại
   file vừa sửa hoặc đã có trong ngữ cảnh. Không đọc `dist/`, `node_modules/`, `public/map-data/`,
   `src/data/vietnamAdministrativeUnits.ts` (dữ liệu tĩnh rất lớn) trừ khi cần đúng nội dung đó.
2. Không chạy lệnh thừa: chỉ chạy test liên quan; build/full test/lint một lần cuối, không lặp lại khi không có
   thay đổi mới. Lọc output dài (`tail`, `grep`) thay vì in toàn bộ.
3. Không dùng subagent/workflow khi người dùng chưa yêu cầu.
4. Trả lời ngắn gọn, đi thẳng vào kết quả; không nhắc lại nội dung đã nói hoặc mô tả dài phương án không làm.

### G. Git và triển khai

1. Commit theo Conventional Commits có scope, viết tiếng Anh, ví dụ `feat(accounting): ...`, `fix(ui): ...`.
   Chỉ stage đúng file của công việc; không commit file chưa được theo dõi của người dùng.
2. Hoàn thành một việc (đã build/test/lint đạt) thì **commit thẳng `main` và push `origin/main`**.
   Không dùng `--force`, không sửa lịch sử đã push, không bỏ qua hook. Kiểm tra không đạt thì không commit,
   báo lại người dùng. Lệnh commit phải phụ thuộc vào **mã thoát** của build/test
   (`npm test && git commit ...`), không chỉ in kết quả ra rồi commit tiếp.
3. **Push ≠ deploy.** Không tự deploy Vercel, deploy `firestore.rules`/indexes, hay ghi/chuyển dữ liệu Firebase
   thật. Web + API + rules cùng phiên bản phải được deploy cùng nhau khi người dùng cho phép.

### H. Tài liệu

1. Tài liệu là **mô tả trạng thái hiện tại**, không phải nhật ký bàn giao. Lịch sử từng lượt đã có trong Git.
2. Thay đổi nghiệp vụ, quyền, collection hoặc API thì cập nhật tài liệu phân hệ trong cùng commit.
3. Quyết định của người dùng ghi ngắn gọn kèm mã quyết định (D0x) và ngày chốt.

## Tài liệu

Mục lục đầy đủ: `docs/README.md`. Đọc tài liệu theo nhu cầu của việc đang làm, không đọc hết.

| Cần gì | Đọc |
|---|---|
| Hiểu nghiệp vụ, vai trò, luồng | `docs/business/PROJECT_OVERVIEW.md` |
| Sửa ở đâu, API nào gọi server nào | `docs/dev/CODEBASE_MAP.md` |
| Lớp mã nguồn, hướng phụ thuộc, mẫu ghi sổ | `docs/dev/ARCHITECTURE.md` |
| Làm giao diện | `docs/dev/DEVELOPER_GUIDELINES.md` + skill `sunflower-erp-ui` |
| Kế toán / kho / thành phẩm / công nợ | `docs/accounting/STATUS.md` → tài liệu lượt tương ứng |
| Quyết định nghiệp vụ đã chốt | `docs/accounting/ACCOUNTING_DECISIONS.md` |
| LSX, chấm công, cấu hình trường | `docs/modules/` |
| Lịch sử bàn giao cũ của Codex | `docs/archive/` (chỉ khi cần truy vết) |

## Trạng thái hiện tại

- Kế toán lượt 1–6 đã có mã nguồn, **chưa deploy web/API/rules, chưa kiểm thử trình duyệt, chưa có dữ liệu thật**.
- **Lượt 7** (chuyển dữ liệu thật, đầu kỳ, triển khai, nghiệm thu) chưa làm; cần người dùng chốt **D09**
  (ngày cắt sổ, đầu kỳ tiền/kho, hàng còn thực hiện) trước khi bắt đầu.
