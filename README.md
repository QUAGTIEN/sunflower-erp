# Sunflower ERP

Hệ thống ERP nội bộ dành cho quy trình kinh doanh và sản xuất tem nhãn Sunflower. Ứng dụng sử dụng React, TypeScript, Vite và Firebase, đồng thời hỗ trợ local storage khi Firebase runtime không khả dụng.

## Chạy dự án

```bash
npm install
npm run dev
```

Các lệnh kiểm tra và chạy production:

```bash
npm run build
npm run lint
npm run preview
```

Sao chép `.env.example` thành `.env` và điền cấu hình Firebase trước khi dùng backend thật. Không commit file `.env` hoặc thông tin xác thực.

## Cấu trúc chính

```text
sunflower/
├── .agents/skills/    # Skill dành cho agent và quy tắc UI
├── .codex/            # Hook tự động hóa Codex
├── docs/              # Kiến trúc và hướng dẫn phát triển
├── scripts/           # Script bảo trì chạy thủ công
├── api/               # API entry points
├── server/            # Server-side code
├── public/            # Static assets
└── src/
    ├── app/           # Composition, providers và lifecycle
    ├── features/      # Module nghiệp vụ ERP
    ├── shared/        # Kiểu dữ liệu và utility dùng chung
    ├── infrastructure/ # Firebase và local-storage adapters
    └── data/          # Seed và dữ liệu tĩnh
```

Xem [kiến trúc source](docs/ARCHITECTURE.md) và [quy tắc phát triển](docs/DEVELOPER_GUIDELINES.md) trước khi thay đổi cấu trúc hoặc giao diện.

## Skill và agent guidance

- `AGENTS.md`: quy tắc điều phối ở cấp dự án.
- `.agents/skills/sunflower-erp-ui/SKILL.md`: hướng dẫn UI dành riêng cho ERP.
- `.agents/skills/design-taste-frontend/SKILL.md`: tham chiếu anti-slop phụ trợ.
- `skills-lock.json`: nguồn và phiên bản của skill được cài đặt.
- `.codex/hooks.json`: hook Graphify.

## Script bảo trì

`npm run db:clear` xóa và tạo lại dữ liệu Firebase theo seed trong script. Đây là thao tác phá hủy dữ liệu; chỉ chạy khi đã xác nhận đúng project Firebase và có bản sao lưu cần thiết.

## Triển khai

- Firebase: `firebase.json`, `firestore.rules`, `storage.rules`.
- Vercel: `vercel.json` và thư mục `api/`.
- Production build: `npm run build` tạo thư mục `dist/`.
- Cấu hình trường thông tin: xem [phạm vi, bảo vệ dữ liệu và thứ tự triển khai API/rules](docs/FIELD_CONFIGURATION.md). Kiểm thử bằng `npm run test:fields`.
