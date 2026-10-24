# Sunflower ERP

Hệ thống ERP nội bộ cho quy trình kinh doanh và sản xuất tem nhãn Sunflower: CRM → đơn hàng (PO) → thiết kế /
mua hàng / kho / sản xuất → giao hàng → kế toán.

Stack: React 19, TypeScript, Vite (SPA), Firebase Auth + Firestore, Vercel Functions (`api/` → `server/`).

## Chạy dự án

```bash
npm install
npm run dev        # chỉ giao diện Vite; API /api/* cần chạy bằng `vercel dev`
npm run build      # TypeScript client + server, rồi Vite build ra dist/
npm run lint
node --test --test-concurrency=2 tests/*.test.cjs
```

Sao chép `.env.example` thành `.env` và điền cấu hình Firebase. Không commit `.env*` hoặc khóa Firebase Admin.

## Cấu trúc

```text
sunflower/
├── CLAUDE.md          # Quy tắc làm việc (đọc trước khi sửa)
├── .claude/skills/    # Skill UI sunflower-erp-ui
├── docs/              # Tài liệu nghiệp vụ, kiến trúc, kế toán — mục lục: docs/README.md
├── api/               # Vercel Functions (entry mỏng)
├── server/            # Logic máy chủ, transaction ghi sổ
├── src/
│   ├── app/           # AppShell, providers, phân quyền màn hình
│   ├── features/      # Các phân hệ nghiệp vụ
│   ├── components/ hooks/ services/ domain/ context/   # Lớp dùng chung
│   ├── shared/        # Kiểu và tiện ích thuần
│   ├── infrastructure/ # Adapter Firebase, local storage
│   ├── styles/        # Chuẩn CSS dùng chung
│   └── data/          # Seed, dữ liệu địa giới
├── tests/             # node:test
├── scripts/           # Script bảo trì chạy thủ công
└── public/            # Static assets, dữ liệu bản đồ
```

## Triển khai

- Firebase: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`.
- Vercel: `vercel.json` và thư mục `api/`.
- Web, API và rules phải deploy cùng phiên bản. Push Git không phải là deploy.

## Cảnh báo

`npm run db:clear` xóa và tạo lại dữ liệu Firebase. Chỉ chạy khi đã xác nhận đúng project và có bản sao lưu.
