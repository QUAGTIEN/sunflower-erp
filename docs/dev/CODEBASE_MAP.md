# Bản đồ mã nguồn — sửa ở đâu

Đối chiếu commit `4853828` (24/10/2026). Kiến trúc tổng thể: [ARCHITECTURE.md](ARCHITECTURE.md).

## Điểm vào

- `src/main.tsx`: CSS/font, reset dữ liệu local cũ, render `AppProviders` → `AppShell`.
- `src/app/AppShell.tsx`:
  - đăng nhập và sidebar;
  - `activePage` + `switch` (`renderPageContent(pageId)`) để render trang (lazy import từ `index.ts` của feature);
  - **giữ trang sống:** `mountedPages` giữ tối đa 5 phân hệ gần nhất (`app/navigation/pageKeepAlive.ts`), mỗi trang
    bọc trong `app/KeepAlivePage.tsx` (ẩn bằng `hidden`, không vẽ lại khi ẩn). Trang ẩn vẫn chạy effect của mình:
    effect toàn cục chỉ dành cho trang đang hiện phải đọc `useIsPageActive()` (`context/PageActiveContext.ts`).
    Chuyển trang chạy trong `useTransition`; sidebar đổi ngay, thanh tiến trình chạy ở đầu `.app-main`;
    vị trí cuộn được nhớ theo từng trang. Đăng xuất gỡ toàn bộ trang đã giữ;
  - subscriptions realtime dùng chung khai báo trong `COLLECTION_PAGES` (collection → các trang cần). Còn trang
    đang giữ cần thì giữ kết nối; hết trang cần thì đóng sau 2 phút (`SUBSCRIPTION_LINGER_MS`). Lần đầu vào trang,
    khi collection chưa có snapshot đầu tiên, trang hiện `PageLoadingFallback` thay vì bảng trống. Collection
    session: `users`, `messages`, `channels`, `notifications`;
  - truyền dữ liệu và callback xuống các trang.
- `src/app/navigation/accessControl.ts`: `getDefaultPagesForRole`, `canAccessPage` (gồm quyền kế thừa).
- `src/app/config/appConfig.ts`: nhãn trang cho audit, module thông báo, logo.

## Phân hệ

| Phân hệ (page id) | Mã nguồn chính | Dữ liệu / API |
|---|---|---|
| Dữ liệu thô (`customer_data`) | `features/crm/pages/CustomerDataPage.tsx`, `components/LeadCandidateWorkspace.tsx` (+ `components/leadCandidateWorkspace/`, hooks `useLeadCandidateFilters`, `useCandidateBatchQueue`, `useCandidateSchedule`, `useCandidateFileDrafts`, `useEmployeeActivityMonitor`), `RawDataOverview.tsx` | `lead_candidates`, `model/leadCandidateModels.ts`, `rawDataOverview.ts` |
| Tiềm năng (`leads`) | `features/crm/pages/LeadsPage.tsx`, `LeadOverviewDashboard.tsx` | `leads`, `model/crmModels.ts`, `taxCodeUniqueness.ts`, `leadProfileConfig.ts` |
| Khách hàng (`crm`) | `features/crm/pages/CrmPage.tsx`, `CustomerProductEditor.tsx`, `CustomerOverview.tsx` | `customers`, `model/customerRepository.ts`, `customerProductCatalog.ts` |
| Thương mại (`commercial_map`) | `features/commercial-map/pages/CommercialMapPage.tsx` | `public/map-data`, `src/data` |
| Đơn hàng (`sales`) | `features/sales/pages/SalesPage.tsx`, `components/POFormFullScreen.tsx` | `pos`, `model/poWorkflow.ts`, `api/poWorkflowService.ts`, `src/domain/poFinancials.ts`, `poCompatibility.ts` |
| Quản lý Sale (`sales_management`) | `features/sales-management/` | `audit_events`, `user_presence`, hồ sơ CRM |
| Thiết kế, Kho mẫu (`design`, `design_library`) | `features/design/pages/` | `design_requests`, `api/designRequestService.ts` |
| Mua hàng, NCC (`purchase`, `suppliers`) | `features/procurement/pages/` | `procurement_requests`, `purchase_orders`, `suppliers`, `api/procurementService.ts` |
| Vật liệu (`inventory`) | `features/inventory/pages/InventoryPage.tsx`, `components/WarehouseVoucherDialog.tsx`, `FinishedGoodsWorkspace.tsx`, `GoodsVoucherDialog.tsx` | `/api/warehouse/manage`, `/api/warehouse/finished` |
| Danh mục hàng | `features/catalog/components/ItemCatalogWorkspace.tsx` (dùng trong Vật liệu và Kế toán) | `/api/catalog/manage` |
| Sản xuất (`production`) | `features/production/pages/ProductionPage.tsx`, `components/ProductionOrderWorkspace.tsx`, `MachineManagement.tsx` | `/api/production/manage`, `machines`, `model/productionPrint.ts`, `whiteLabelPrint.ts` |
| Giao hàng (`delivery`) | `features/delivery/pages/DeliveryPage.tsx` | `deliveries`, `delivery_vehicles`, POD qua `/api/warehouse/finished` |
| Kế toán (`accounting`) | `features/accounting/pages/AccountingPage.tsx`, `AccountingLedgerWorkspace.tsx`, `LedgerDialog.tsx`, `AccountingReportsWorkspace.tsx` | `/api/accounting/manage`, `/api/accounting/reports` |
| Tổng quan (`dashboard`) | `features/dashboard/pages/DashboardPage.tsx` | props từ AppShell, `src/components/VisualCharts.tsx` |
| Công việc (`work_schedule`) | `features/work-schedule/` | `work_schedule_items` |
| Chấm công (`attendance`) | `features/attendance/` | `/api/attendance/manage`, `attendance_months`, `attendance_settings` |
| Chat (`chat`) | `features/chat/pages/ChatPage.tsx`, `src/components/FloatingChat.tsx` | `messages`, `channels` |
| Tài khoản, Cấu hình, Thùng rác | `features/administration/pages/` | `/api/users/manage`, `/api/fields/manage` |

## API → server

| Endpoint | Server | Ghi chú |
|---|---|---|
| `/api/catalog/manage` | `server/itemCatalog.ts` | Danh mục, CSV, liên kết nguồn cũ |
| `/api/production/manage` | `server/productionOrders.ts`, `productionCatalog.ts` | LSX (`requireProductionCaller`) |
| `/api/warehouse/manage` | `server/warehouse.ts` | Sổ NVL `raw_main` |
| `/api/warehouse/finished` | `server/finishedGoods.ts` | Thành phẩm `finished_main`, giao/POD/trả |
| `/api/accounting/manage` | `server/accountingLedger.ts` | Công nợ, thu chi, kỳ |
| `/api/accounting/reports` | `server/accountingReports.ts` | Báo cáo, chỉ đọc |
| `/api/attendance/manage` | `server/attendance.ts` | Chấm công |
| `/api/fields/manage` | `server/fieldConfiguration.ts` | Cấu hình trường, chỉ Admin |
| `/api/users/manage` | `server/adminUsers.ts` | Tài khoản Firebase Auth, chỉ Admin (`requireAdmin`) |

Dùng chung: `server/erpCaller.ts` (xác thực), `server/firebaseAdmin.ts` (khởi tạo Admin SDK),
`server/financeSourceGuard.ts` (chặn đảo kho khi đã vào sổ tiền), `AdminApiError`/`jsonResponse` trong `adminUsers.ts`.

## Thành phần dùng chung hay sửa

- Bảng: `src/components/DataTablePagination.tsx`, `RowActionMenu.tsx`, `TableColumnCustomizer.tsx`,
  `ReorderableTableColumns.tsx`, `ExpandableTableText.tsx`.
- Hook bảng: `src/hooks/useDataTablePagination.ts`, `useSharedTableColumns.ts`, `useReorderableTableColumns.ts`,
  `useGlobalTableColumnResize.ts`, `useAdaptiveTableText.ts`. Thứ tự cột cá nhân lưu localStorage theo UID
  (`sunflower:*columns:`); bố cục dùng chung lưu `table_column_layouts`.
- Bộ lọc: `AdvancedDataFilters.tsx`, `advancedDataFilterModel.ts`, `DataWorkspaceFilters.tsx`.
- Phản hồi: `MutationToast.tsx` + `src/shared/feedback/mutationFeedback.ts`, `DeleteConfirmationDialog.tsx`
  + `deleteConfirmation.ts`, `navigationGuard.ts` (cảnh báo rời trang khi chưa lưu).
- Cấu hình trường: `features/administration/components/*FieldConfiguration.tsx`, `src/components/ConfiguredSystemFields.tsx`,
  `EntityCustomFields.tsx`, `InlineEntityFieldManager.tsx`, `src/hooks/useSystemFieldConfiguration.ts`,
  `useEntityFieldDefinitions.ts`; metadata `entity_system_field_overrides`, `entity_field_definitions`.
  Chi tiết: [../modules/FIELD_CONFIGURATION.md](../modules/FIELD_CONFIGURATION.md).
- Audit/thông báo: `src/services/auditService.ts`, `notificationService.ts`, `src/domain/notificationModels.ts`.

## Khi sửa luồng PO

Hàng đợi chuẩn nằm trong `poWorkflow.ts`. Khi đổi chuyển trạng thái, tìm mọi nơi gọi `getPOQueueUpdate` và
mọi thao tác ghi `pos`. Writer kho/tiền ở `server/` cũng đọc và cập nhật PO. Không bỏ ánh xạ trạng thái legacy
và `poCompatibility.ts`.

## Test

- `tests/*.test.cjs` dùng `node:test`; chạy tất cả bằng `npm test`. Loader dùng chung
  `tests/helpers/loadTs.cjs` (`createLoader(stubs)`) transpile TypeScript, resolve alias `@/` và `.js → .ts`, stub CSS.
  Một số test cũ (`customer-product-catalog`, `po-manual-entry`…) cố ý dùng loader chặt: import chưa stub là lỗi.
  Firebase/Admin được stub bằng store trong bộ nhớ.
- Nhiều test đọc mã nguồn dạng văn bản để kiểm tra hợp đồng tĩnh, kể cả `firestore.rules`. Đổi tên hàm hoặc
  class có thể làm test lỗi dù hành vi không đổi.
- Màn lớn đã tách: JSX con nằm ở thư mục cùng tên (`components/leadCandidateWorkspace/`, `pages/leadsPage/`,
  `production/components/productionOrderEditor/` (bảng mặt hàng, vật tư của form LSX),
  `sales/components/poForm/`), logic ở `features/crm/hooks/`. `POFormFullScreen` giữ state trong file vì test
  `po-manual-entry` gán state theo thứ tự `useState`.
  Test tĩnh đọc cả màn bằng `readModuleSource(file, folder)` trong `tests/helpers/loadTs.cjs`.
- File lớn cần đọc có mục tiêu: `CrmPage.tsx` (~3.3k dòng), `LeadsPage.tsx` (~2.1k), `POFormFullScreen.tsx` (~1.9k),
  `LeadCandidateWorkspace.tsx` (~1.7k), `SalesPage.tsx`, `AppShell.tsx`. `src/data/vietnamAdministrativeUnits.ts` là dữ liệu tĩnh 13k dòng.
