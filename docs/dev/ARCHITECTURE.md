# Kiến trúc Sunflower ERP

## Tổng thể

```text
Trình duyệt (React SPA, Vite)
  ├── đọc/ghi thường  ──> Firebase Auth + Firestore (client SDK, chịu firestore.rules)
  └── ghi sổ/quản trị ──> /api/* (Vercel Functions) ──> server/* ──> Firebase Admin SDK (transaction)
```

- **Đọc và ghi hồ sơ thông thường** (CRM, PO, thiết kế, mua hàng, giao hàng…) đi thẳng từ client qua
  `src/infrastructure/firebase/erpDataGateway.ts` → `firestoreAdapter.ts`, được `firestore.rules` kiểm soát.
- **Nghiệp vụ cần toàn vẹn** đi qua API. Đây là danh mục hàng, LSX, sổ kho NVL/thành phẩm, công nợ/tiền,
  báo cáo kế toán, chấm công, cấu hình trường và tài khoản. Rules chặn client ghi trực tiếp các collection này.
- Chế độ local (`localCollectionStore.ts`) chỉ dùng khi chưa cấu hình Firebase. Khi Firebase đã bật mà gặp lỗi,
  hệ thống trả lỗi ra, không tự chuyển sang lưu local.

## Lớp mã nguồn

| Lớp | Vai trò |
|---|---|
| `src/app` | AppShell (đăng nhập, sidebar, `activePage` + `switch`, subscriptions dùng chung), providers, phân quyền màn hình |
| `src/features/<x>` | Phân hệ nghiệp vụ: `pages/`, `components/`, `model/` (kiểu + quy tắc thuần), `api/` (gọi dữ liệu/API), `index.ts` |
| `src/components`, `src/hooks` | Component/hook UI dùng chung (bảng, bộ lọc, phân trang, toast, menu dòng, cấu hình trường) |
| `src/services` | Audit, thông báo, cấu hình trường, bố cục cột, quản trị user phía client |
| `src/domain` | Quy tắc dùng chung nhiều phân hệ: tài chính PO, tương thích PO cũ, thông báo, bộ lọc hệ thống |
| `src/context` | Ngôn ngữ, ngữ cảnh trang, bố cục cột |
| `src/shared` | Kiểu (`UserProfile`, `UserRole`…) và tiện ích thuần |
| `src/infrastructure` | Adapter Firebase và local storage |
| `src/data` | Seed và dữ liệu địa giới tĩnh |
| `src/styles` | `ErpUiStandards.css`, `Theme.css`, `ContentTabs.css` |
| `api/` | Entry Vercel Function: xác thực người gọi, đọc body, gọi `server/`, trả JSON |
| `server/` | Logic máy chủ và transaction; được import `src/features/*/model` để dùng chung quy tắc |

## Hướng phụ thuộc

```text
app ──> features ──> shared
 │         │  ▲
 │         ▼  │
 └──> components / hooks / services / domain / context ──> infrastructure
server ──> src/features/*/model (chỉ model thuần)
```

Quy tắc (ESLint ép hai quy tắc đầu):

1. `src/shared` không import `app`, `features`, `infrastructure`.
2. `src/domain` và `src/features/*/model` không import `services`, `infrastructure`, `components`.
   Model phải thuần để test và `server/` dùng lại được.
3. Feature không import file nội bộ của feature khác; dùng `index.ts`, `model/` hoặc `api/` công khai.
4. `app` điều phối, không chứa quy tắc nghiệp vụ riêng của phân hệ.
5. Import ngoài thư mục hiện tại dùng alias `@/` (client). `server/` dùng đường dẫn tương đối có đuôi `.js`.

## Mẫu ghi sổ trên máy chủ

Các writer trong `server/` (warehouse, finishedGoods, accountingLedger, productionOrders, itemCatalog,
attendance) theo cùng khuôn:

1. `requireActiveErpCaller` (`server/erpCaller.ts`) xác thực token và đọc hồ sơ `users` thật.
2. Kiểm tra quyền theo vai trò/`allowedPages` trong model.
3. Kiểm tra kích thước và định dạng payload.
4. Transaction Firestore: đọc hết, kiểm tra `revision` và nguồn, rồi mới ghi.
5. Cùng transaction ghi số dư, chứng từ, trạng thái nguồn, audit và biên nhận `requestId`.
6. Gửi lại cùng `requestId` trả về kết quả cũ; cùng `requestId` nhưng khác nội dung thì bị từ chối.

## Triển khai

- `vercel.json` rewrite mọi đường dẫn trừ `/api/` về `index.html`. `npm run dev` không chạy API; dùng `vercel dev`.
- `firebase.json` khai báo `firestore.rules`, `firestore.indexes.json`, `storage.rules`.
- Web, API và rules phải được deploy cùng phiên bản. Push Git không phải là deploy.
