import type { UserProfile } from '@/shared/types';

// ----------------------------------------------------
// SEED MOCK DATA FOR LOCAL STORAGE FALLBACK
// ----------------------------------------------------
export const DEFAULT_USERS: UserProfile[] = [
  { uid: 'u-admin', email: 'admin@sunflower.com', displayName: 'Giám Đốc Lê Minh', role: 'admin', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales', 'design', 'purchase', 'suppliers', 'inventory', 'production', 'delivery', 'accounting', 'users', 'recycle_bin'] },
  { uid: 'u-sale', email: 'sale@sunflower.com', displayName: 'Sale Nguyễn Văn Nam', role: 'sale', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'] },
  { uid: 'u-designer', email: 'designer@sunflower.com', displayName: 'Designer Trần Hà', role: 'designer', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'design'] },
  { uid: 'u-purchaser', email: 'purchase@sunflower.com', displayName: 'Mua Hàng Phạm Đức', role: 'purchaser', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'purchase', 'suppliers', 'inventory'] },
  { uid: 'u-producer', email: 'produce@sunflower.com', displayName: 'Quản Đốc Vũ Thành', role: 'producer', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'production'] },
  { uid: 'u-accountant', email: 'accountant@sunflower.com', displayName: 'Kế Toán Trần Thu', role: 'accountant', active: true, createdAt: '2026-05-01', allowedPages: ['dashboard', 'chat', 'accounting'] }
];

export const DEFAULT_PRODUCT_CLASSIFICATIONS = [
  { id: 'tem_trang_cuon', name: 'Tem Trắng Dạng Cuộn' },
  { id: 'tem_mau_cuon', name: 'Tem Màu Dạng Cuộn' },
  { id: 'tem_mau_to', name: 'Tem Màu Dạng Tờ' },
  { id: 'muc_in', name: 'Mực In Ribbon' }
];

export const DEFAULT_WIND_DIRECTIONS = [
  { id: 'dau_truoc', name: 'Ra đầu trước' },
  { id: 'dau_sau', name: 'Ra đầu sau' },
  { id: 'quay_trai', name: 'Chữ quay trái' },
  { id: 'quay_phai', name: 'Chữ quay phải' },
  { id: 'head_first', name: 'Head First' },
  { id: 'tail_first', name: 'Tail First' },
  { id: 'left_first', name: 'Left First' },
  { id: 'right_first', name: 'Right First' }
];

export const DEFAULT_CUSTOMERS: any[] = [
  { id: 'cust-001', companyName: 'Công ty TNHH AQUA Việt Nam', contactPerson: 'Ông Yoshikawa', phone: '02203-888999', discountRate: 5, debtLimit: 100000000, lastOrderAt: '2026-06-04T07:35:27.000Z', address: 'KCN Đại An, Hải Dương', email: 'aqua@vietnam.com', paymentTerms: '30 ngày', note: 'Khách hàng lớn, cần chăm sóc kỹ', createdBy: 'Giám Đốc Lê Minh', createdAt: '2026-05-01T00:00:00Z', assignedSaleId: 'u-sale', products: [] },
  { id: 'cust-002', companyName: 'Brother Industries Hải Dương', contactPerson: 'Bà Nguyễn Thị Hoa', phone: '02203-777666', discountRate: 8, debtLimit: 150000000, lastOrderAt: '2026-05-15T00:00:00Z', address: 'KCN Phúc Điền, Cẩm Giàng, Hải Dương', email: 'hoa.nt@brother.com.vn', paymentTerms: '45 ngày', note: 'Thanh toán đúng hạn', createdBy: 'Giám Đốc Lê Minh', createdAt: '2026-05-01T00:00:00Z', assignedSaleId: 'u-sale', products: [] },
  { id: 'cust-003', companyName: 'Trancy Logistics Hải Dương', contactPerson: 'Ông Vũ Văn An', phone: '0987-123456', discountRate: 0, debtLimit: 50000000, lastOrderAt: '2026-04-10T00:00:00Z', address: 'KCN Lai Cách, Hải Dương', email: 'an.vv@trancy.com', paymentTerms: 'Thanh toán khi nhận hàng', note: 'Giao nhận tại kho', createdBy: 'Giám Đốc Lê Minh', createdAt: '2026-05-01T00:00:00Z', assignedSaleId: 'u-sale', products: [] },
  { id: 'cust-004', companyName: 'Samsung Electronics Bắc Ninh', contactPerson: 'Mr. Park Ji-sung', phone: '0222-399999', discountRate: 10, debtLimit: 300000000, lastOrderAt: '2026-06-02T00:00:00Z', address: 'KCN Yên Phong, Bắc Ninh', email: 'park@samsung.com', paymentTerms: '60 ngày', note: 'Đơn hàng số lượng rất lớn', createdBy: 'Giám Đốc Lê Minh', createdAt: '2026-05-01T00:00:00Z', assignedSaleId: 'u-sale', products: [] },
  {
    id: 'cust-vft',
    companyName: 'Công ty CP Công nghệ Tạo hình Cơ khí Việt Nam',
    contactPerson: 'Phòng Mua Hàng',
    phone: '0210-3653333',
    discountRate: 0,
    debtLimit: 200000000,
    lastOrderAt: '2026-05-14T00:00:00Z',
    address: 'Lô B9, KCN Thụy Vân, Việt Trì, Phú Thọ',
    email: 'mechanical@vft.com.vn',
    paymentTerms: '30 ngày',
    note: 'MST: 2500558741',
    createdBy: 'Giám Đốc Lê Minh',
    createdAt: '2026-05-01T00:00:00Z',
    assignedSaleId: 'u-sale',
    products: [
      {
        id: 'prod-vft-1',
        productCode: '5.07.006',
        productName: 'Mực in mã vạch: in tem US 150',
        productType: 'muc_in',
        currentPrice: 59000,
        material: 'Mực Wax Resin',
        layoutUrl: '',
        specifications: {
          ribbonType: 'WAX RESIN',
          direction: 'Out side',
          size: 'R110 x D300mm',
          color: 'Đen'
        },
        priceHistory: [
          { date: '2026-05-14', price: 59000, updatedBy: 'Giám Đốc Lê Minh' }
        ]
      },
      {
        id: 'prod-vft-2',
        productCode: '5.07.016',
        productName: 'Tem dán dạng cuộn',
        productType: 'tem_trang_cuon',
        currentPrice: 522,
        material: 'Decal Giấy Fasson AW0339F',
        layoutUrl: '',
        specifications: {
          width: 80,
          height: 55,
          gap: 3,
          qtyPerRoll: 1000,
          core: '76mm',
          dieCut: 'Bo góc R2',
          perforated: 'Không',
          windDirection: 'Ra đầu trước'
        },
        priceHistory: [
          { date: '2026-05-14', price: 1500, note: 'Số lượng 1K pcs', updatedBy: 'Giám Đốc Lê Minh' },
          { date: '2026-06-15', price: 522, note: 'Số lượng 10K pcs', updatedBy: 'Giám Đốc Lê Minh' }
        ]
      },
      {
        id: 'prod-vft-3',
        productCode: '5.07.021',
        productName: 'Tem dán dạng cuộn R80xD110mm',
        productType: 'tem_trang_cuon',
        currentPrice: 93000,
        material: 'Decal nhựa PVC',
        layoutUrl: '',
        specifications: {
          width: 80,
          height: 110,
          gap: 3,
          qtyPerRoll: 1000,
          core: '76mm',
          dieCut: 'Bo góc R2',
          perforated: 'Không',
          windDirection: 'Ra đầu trước'
        },
        priceHistory: [
          { date: '2026-05-14', price: 93000, updatedBy: 'Giám Đốc Lê Minh' }
        ]
      }
    ]
  }
];

const MOCK_BASE64_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="%23eff6ff" stroke="%231e3a8a" stroke-width="2"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%231e3a8a" font-weight="bold">MẪU THIẾT KẾ</svg>';

export const DEFAULT_POS: any[] = [
  {
    id: 'po-001',
    poCode: 'PO-2606-3648',
    customerId: 'cust-001',
    customerName: 'Công ty TNHH AQUA Việt Nam',
    orderDate: '2026-06-01T00:00:00Z',
    dueDate: '2026-06-11T00:00:00Z',
    status: 'design_sent',
    totalAmount: 5000000,
    netAmount: 4750000,
    items: [
      { productCode: 'P-001', productName: 'tem', quantity: 10000, unit: 'cái', unitPrice: 500, totalPrice: 5000000, material: 'Decal Giấy Fasson AW0339F', size: '100x100mm' }
    ],
    historyLogs: [
      { status: 'receive_po', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-01T09:00:00Z', note: 'Đã nhận PO của khách hàng' },
      { status: 'bom_extracted', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-01T10:30:00Z', note: 'Đã hoàn thành bóc tách NVL' },
      { status: 'design_sent', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-02T14:00:00Z', note: 'Đã gửi file thiết kế cho khách hàng' }
    ],
    assignedSaleId: 'u-sale',
    createdBy: 'Giám Đốc Lê Minh'
  },
  {
    id: 'po-002',
    poCode: 'PO-202606-0001',
    customerId: 'cust-002',
    customerName: 'Brother Industries Hải Dương',
    orderDate: '2026-06-02T00:00:00Z',
    dueDate: '2026-06-15T00:00:00Z',
    status: 'supplier_confirmed',
    totalAmount: 40000000,
    netAmount: 36800000,
    items: [
      { productCode: 'P-002', productName: 'Tem bạc thông số kỹ thuật Máy in', quantity: 50000, unit: 'cái', unitPrice: 800, totalPrice: 40000000, material: 'Decal Nhựa PVC Avery Dennison', size: '120x80mm' }
    ],
    historyLogs: [
      { status: 'receive_po', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-02T09:00:00Z' },
      { status: 'bom_extracted', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-02T10:00:00Z' },
      { status: 'design_sent', updatedBy: 'Designer Trần Hà', updatedAt: '2026-06-02T14:00:00Z' },
      { status: 'layout_pending', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-02T16:00:00Z' },
      { status: 'supplier_ordered', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-03T09:00:00Z' },
      { status: 'supplier_confirmed', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-06-03T11:00:00Z', note: 'Nhà cung cấp đã xác nhận giao decal' }
    ],
    assignedSaleId: 'u-sale',
    createdBy: 'Giám Đốc Lê Minh'
  },
  {
    id: 'po-003',
    poCode: 'PO-202605-0001',
    customerId: 'cust-001',
    customerName: 'Công ty TNHH AQUA Việt Nam',
    orderDate: '2026-05-25T00:00:00Z',
    dueDate: '2026-06-10T00:00:00Z',
    status: 'producing',
    totalAmount: 30000000,
    netAmount: 28500000,
    items: [
      { productCode: 'P-003', productName: 'Tem nhãn nước giặt AQUA 500ml', quantity: 20000, unit: 'cái', unitPrice: 1500, totalPrice: 30000000, material: 'Decal Giấy Fasson AW0339F', size: '150x150mm' }
    ],
    historyLogs: [
      { status: 'receive_po', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-25T09:00:00Z' },
      { status: 'bom_extracted', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-25T11:00:00Z' },
      { status: 'design_sent', updatedBy: 'Designer Trần Hà', updatedAt: '2026-05-26T10:00:00Z' },
      { status: 'layout_pending', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-26T15:00:00Z' },
      { status: 'supplier_ordered', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-27T09:00:00Z' },
      { status: 'supplier_confirmed', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-27T14:00:00Z' },
      { status: 'production_pending', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-28T09:00:00Z' },
      { status: 'producing', updatedBy: 'Quản Đốc Vũ Thành', updatedAt: '2026-05-28T14:00:00Z', note: 'Lên khuôn máy in Flexo 4 màu, bắt đầu chạy' }
    ],
    assignedSaleId: 'u-sale',
    createdBy: 'Giám Đốc Lê Minh'
  },
  {
    id: 'po-004',
    poCode: 'PO-202604-0001',
    customerId: 'cust-003',
    customerName: 'Trancy Logistics Hải Dương',
    orderDate: '2026-04-01T00:00:00Z',
    dueDate: '2026-04-18T00:00:00Z',
    status: 'delivered',
    totalAmount: 4000000,
    netAmount: 4000000,
    items: [
      { productCode: 'P-004', productName: 'Tem nhãn Barcode dán thùng Trancy', quantity: 10000, unit: 'cái', unitPrice: 400, totalPrice: 4000000, material: 'Decal Giấy Fasson AW0339F', size: '100x70mm' }
    ],
    historyLogs: [
      { status: 'receive_po', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-04-01T09:00:00Z' },
      { status: 'delivered', updatedBy: 'Vũ Thành', updatedAt: '2026-04-18T10:00:00Z', note: 'Giao hàng thành công có ký nhận đầy đủ' }
    ],
    assignedSaleId: 'u-sale',
    createdBy: 'Giám Đốc Lê Minh'
  },
  {
    id: 'po-vft-553',
    poCode: 'VFT26-553',
    customerId: 'cust-vft',
    customerName: 'Công ty CP Công nghệ Tạo hình Cơ khí Việt Nam',
    orderDate: '2026-05-14T09:00:00Z',
    dueDate: '2026-06-05T00:00:00Z',
    expectedDeliveryDate: '2026-06-05T00:00:00Z',
    status: 'supplier_ordered',
    totalAmount: 46806480,
    discountAmount: 0,
    netAmount: 46806480,
    items: [
      { itemId: 'item-vft-1', productCode: '5.07.006', productName: 'Mực in mã vạch: in tem US 150', quantity: 200, unit: 'Cuộn', unitPrice: 59000, totalPrice: 11800000, size: 'R110 x D300mm', material: 'Mực in', supplierId: 'sup-minhduc', supplierName: 'Cty Minh Đức', purchasePrice: 58000 },
      { itemId: 'item-vft-2', productCode: '5.07.016', productName: 'Tem dán dạng cuộn', quantity: 100, unit: 'Cuộn', unitPrice: 48000, totalPrice: 4800000, size: 'R80 x D55 mm', material: 'Decal giấy, 1 cuộn 1000 tem', supplierId: 'sup-pal', supplierName: 'Công ty PAL', purchasePrice: 2000 },
      { itemId: 'item-vft-3', productCode: '5.07.021', productName: 'Tem dán dạng cuộn', quantity: 150, unit: 'Cuộn', unitPrice: 93000, totalPrice: 13950000, size: 'R80xD110mm', material: 'Decal giấy, 1 cuộn 1000 tem', supplierId: 'sup-pal', supplierName: 'Công ty PAL', purchasePrice: 2000 },
      { itemId: 'item-vft-4', productCode: '5.05.005', productName: 'Tem dán VFI in màu (Box)', quantity: 15440, unit: 'pcs', unitPrice: 686, totalPrice: 10591840, size: 'Rộng 80 x dài 100mm', material: 'Decal nhựa', supplierId: 'sup-tamnhinmoi', supplierName: 'Cty Tầm Nhìn Mới', purchasePrice: 500 },
      { itemId: 'item-vft-5', productCode: '5.05.007', productName: 'Tem dán VFI in màu (CTN-931)', quantity: 5, unit: 'cuộn', unitPrice: 230000, totalPrice: 1150000, size: 'Rộng 80 x Dài 100mm', material: 'Decal giấy, 1 cuộn 1000 tem', supplierId: 'sup-halinh', supplierName: 'Cty Hà Linh', purchasePrice: 200000 },
      { itemId: 'item-vft-6', productCode: '5.05.012', productName: 'Tem dán BULL-VIT in màu', quantity: 240, unit: 'Pcs', unitPrice: 686, totalPrice: 164640, size: '80x100mm (DxR)', material: 'Decal nhựa', supplierId: 'sup-tamnhinmoi', supplierName: 'Cty Tầm Nhìn Mới', purchasePrice: 500 },
      { itemId: 'item-vft-7', productCode: '5.05.017', productName: 'Tem dán CHAVESBAO dạng cuộn', quantity: 15, unit: 'Cuộn', unitPrice: 130000, totalPrice: 1950000, size: '70x70 mm', material: 'Decal giấy, 1000pcs/ cuộn', supplierId: 'sup-lehuy', supplierName: 'Cty Lê Huy', purchasePrice: 100000 },
      { itemId: 'item-vft-8', productCode: '5.07.005', productName: 'Tem dán dạng cuộn', quantity: 20, unit: 'Cuộn', unitPrice: 120000, totalPrice: 2400000, size: 'R100xD120 mm', material: 'Decal giấy, 1 cuộn 1000 tem', supplierId: 'sup-pal', supplierName: 'Công ty PAL', purchasePrice: 2000 }
    ],
    historyLogs: [
      { status: 'receive_po', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-14T09:00:00Z', note: 'Đã nhận đơn hàng PO VFT26-553 từ Khách hàng' },
      { status: 'bom_extracted', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-14T10:30:00Z', note: 'Đã hoàn thành bóc tách NVL' },
      { status: 'design_sent', updatedBy: 'Designer Trần Hà', updatedAt: '2026-05-15T14:00:00Z', note: 'Đã gửi file mẫu thiết kế layout' },
      { status: 'layout_pending', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-16T16:00:00Z', note: 'Khách hàng duyệt thiết kế' },
      { status: 'supplier_ordered', updatedBy: 'Giám Đốc Lê Minh', updatedAt: '2026-05-18T09:00:00Z', note: 'Đã phân bổ và chuyển đặt hàng các nhà cung cấp Minh Đức, PAL, Tầm Nhìn Mới, Hà Linh, Lê Huy.' }
    ],
    assignedSaleId: 'u-sale',
    createdBy: 'Giám Đốc Lê Minh'
  }
];

export const DEFAULT_DESIGNS: any[] = [
  { id: 'ds-001', poId: 'po-001', poCode: 'PO-2606-3648', designerId: 'u-designer', designerName: 'Designer Trần Hà', fileUrl: MOCK_BASE64_IMAGE, status: 'approved', notes: 'Thiết kế tem cơ bản cho Aqua', updatedAt: '2026-06-02T14:00:00Z' }
];

export const DEFAULT_INVENTORY = [
  { id: 'inv-001', materialName: 'Decal Giấy Fasson AW0339F', category: 'paper', qtyInStock: 500, qtyReserved: 100, minQtyAlert: 200, unit: 'm²', defaultSupplierId: 'sup-001', updatedAt: '2026-06-01T08:00:00Z' },
  { id: 'inv-002', materialName: 'Decal Nhựa PVC Avery Dennison', category: 'paper', qtyInStock: 300, qtyReserved: 50, minQtyAlert: 100, unit: 'm²', defaultSupplierId: 'sup-002', updatedAt: '2026-06-01T08:00:00Z' },
  { id: 'inv-003', materialName: 'Mực Flexo DIC Process Black', category: 'ink', qtyInStock: 25, qtyReserved: 5, minQtyAlert: 10, unit: 'kg', defaultSupplierId: 'sup-003', updatedAt: '2026-06-01T08:00:00Z' },
  { id: 'inv-004', materialName: 'Mực Flexo DIC Process Cyan', category: 'ink', qtyInStock: 20, qtyReserved: 5, minQtyAlert: 10, unit: 'kg', defaultSupplierId: 'sup-003', updatedAt: '2026-06-01T08:00:00Z' },
  { id: 'inv-005', materialName: 'Màng BOPP bóng 12mic', category: 'film', qtyInStock: 800, qtyReserved: 200, minQtyAlert: 300, unit: 'm²', defaultSupplierId: 'sup-001', updatedAt: '2026-06-01T08:00:00Z' },
  { id: 'inv-006', materialName: 'Lõi Giấy phi 76mm', category: 'others', qtyInStock: 150, qtyReserved: 20, minQtyAlert: 50, unit: 'cuộn', defaultSupplierId: 'sup-004', updatedAt: '2026-06-01T08:00:00Z' },
];

export const DEFAULT_SUPPLIERS: any[] = [
  { id: 'sup-001', supplierName: 'Decal Fasson Việt Nam', contactPerson: 'Nguyễn Văn Hùng', phone: '0912-333444', email: 'sales@fasson.com.vn', address: 'KCN Amata, Đồng Nai' },
  { id: 'sup-002', supplierName: 'Avery Dennison Vietnam', contactPerson: 'Trần Thị Thu', phone: '0904-555666', email: 'sales@avery.vn', address: 'VSIP I, Bình Dương' },
  { id: 'sup-003', supplierName: 'Mực In Flexo DIC', contactPerson: 'Phạm Minh Tuấn', phone: '0989-123789', email: 'tuan.pm@dic.com', address: 'KCN Tân Bình, TP.HCM' },
  { id: 'sup-004', supplierName: 'Nhà máy Lõi Giấy Việt', contactPerson: 'Lê Hoàng Anh', phone: '0976-554433', email: 'sales@loigiayviet.com', address: 'KCN Phố Nối A, Hưng Yên' },
  { id: 'sup-minhduc', supplierName: 'Cty Minh Đức', contactPerson: 'Nguyễn Văn Đức', phone: '0912-111222', email: 'minhduc@gmail.com', address: 'Hà Nội' },
  { id: 'sup-tamnhinmoi', supplierName: 'Cty Tầm Nhìn Mới', contactPerson: 'Lê Văn Tầm', phone: '0989-333444', email: 'tamnhinmoi@gmail.com', address: 'Hà Nội' },
  { id: 'sup-halinh', supplierName: 'Cty Hà Linh', contactPerson: 'Nguyễn Thị Linh', phone: '0904-555666', email: 'halinh@gmail.com', address: 'Hà Nội' },
  { id: 'sup-lehuy', supplierName: 'Cty Lê Huy', contactPerson: 'Vũ Lê Huy', phone: '0976-777888', email: 'lehuy@gmail.com', address: 'Hà Nội' },
  { id: 'sup-pal', supplierName: 'Công ty PAL', contactPerson: 'Trần Văn Pal', phone: '0987-999000', email: 'pal@gmail.com', address: 'Hải Dương' },
  { id: 'sup-kuner', supplierName: 'Hãng Giấy Kuner', contactPerson: 'Hãng Giấy Kuner', phone: '02203-999888', email: 'kuner@gmail.com', address: 'Hải Dương' }
];

export const DEFAULT_PURCHASE_ORDERS: any[] = [
  {
    id: 'pur-001',
    purCode: 'PUR-2606-0001',
    supplierId: 'sup-001',
    supplierName: 'Decal Fasson Việt Nam',
    linkedPoId: 'po-002',
    linkedPoCode: 'PO-202606-0001',
    items: [
      { materialName: 'Decal Nhựa PVC Avery Dennison', quantity: 150, unit: 'm²', unitPrice: 45000, totalPrice: 6750000 }
    ],
    totalPrice: 6750000,
    status: 'confirmed',
    expectedReceiveDate: '2026-06-08T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-06-03T09:00:00Z'
  },
  {
    id: 'pur-vft-minhduc',
    purCode: 'PUR-2605-VFT-0001',
    supplierId: 'sup-minhduc',
    supplierName: 'Cty Minh Đức',
    linkedPoId: 'po-vft-553',
    linkedPoCode: 'VFT26-553',
    items: [
      { materialName: 'Mực in mã vạch: in tem US 150', quantity: 200, unit: 'Cuộn', unitPrice: 58000, totalPrice: 11600000 }
    ],
    totalPrice: 11600000,
    status: 'ordered',
    expectedReceiveDate: '2026-06-05T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-05-18T09:00:00Z'
  },
  {
    id: 'pur-vft-pal',
    purCode: 'PUR-2605-VFT-0002',
    supplierId: 'sup-pal',
    supplierName: 'Công ty PAL',
    linkedPoId: 'po-vft-553',
    linkedPoCode: 'VFT26-553',
    items: [
      { materialName: 'Gia công bế tem trắng (STT 2, 3, 8)', quantity: 270, unit: 'Cuộn', unitPrice: 2000, totalPrice: 540000 }
    ],
    totalPrice: 540000,
    status: 'ordered',
    expectedReceiveDate: '2026-06-05T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-05-18T09:00:00Z'
  },
  {
    id: 'pur-vft-tamnhinmoi',
    purCode: 'PUR-2605-VFT-0003',
    supplierId: 'sup-tamnhinmoi',
    supplierName: 'Cty Tầm Nhìn Mới',
    linkedPoId: 'po-vft-553',
    linkedPoCode: 'VFT26-553',
    items: [
      { materialName: 'In nhanh tem VFI & BULL-VIT (STT 4, 6)', quantity: 15680, unit: 'pcs', unitPrice: 500, totalPrice: 7840000 }
    ],
    totalPrice: 7840000,
    status: 'ordered',
    expectedReceiveDate: '2026-06-05T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-05-18T09:00:00Z'
  },
  {
    id: 'pur-vft-halinh',
    purCode: 'PUR-2605-VFT-0004',
    supplierId: 'sup-halinh',
    supplierName: 'Cty Hà Linh',
    linkedPoId: 'po-vft-553',
    linkedPoCode: 'VFT26-553',
    items: [
      { materialName: 'Tem dán VFI in màu CTN-931 (STT 5)', quantity: 5, unit: 'cuộn', unitPrice: 200000, totalPrice: 1000000 }
    ],
    totalPrice: 1000000,
    status: 'ordered',
    expectedReceiveDate: '2026-06-05T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-05-18T09:00:00Z'
  },
  {
    id: 'pur-vft-lehuy',
    purCode: 'PUR-2605-VFT-0005',
    supplierId: 'sup-lehuy',
    supplierName: 'Cty Lê Huy',
    linkedPoId: 'po-vft-553',
    linkedPoCode: 'VFT26-553',
    items: [
      { materialName: 'Tem dán CHAVESBAO dạng cuộn (STT 7)', quantity: 15, unit: 'Cuộn', unitPrice: 100000, totalPrice: 1500000 }
    ],
    totalPrice: 1500000,
    status: 'ordered',
    expectedReceiveDate: '2026-05-19T00:00:00Z',
    actualReceiveDate: '',
    assignedPurchaserId: 'u-purchaser',
    assignedPurchaserName: 'Mua Hàng Phạm Đức',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-05-18T09:00:00Z'
  }
];

export const DEFAULT_PRODUCTION_COMMANDS: any[] = [
  {
    id: 'lsx-001',
    poId: 'po-003',
    poCode: 'PO-202605-0001',
    productCode: 'P-003',
    productName: 'Tem nhãn nước giặt AQUA 500ml',
    quantity: 20000,
    machine: 'Flexo 4 màu',
    operatorId: 'u-producer',
    operatorName: 'Quản Đốc Vũ Thành',
    status: 'producing',
    notes: 'In decal giấy bóng',
    createdAt: '2026-05-28T09:00:00Z'
  }
];

export const DEFAULT_DELIVERIES: any[] = [];

export const DEFAULT_DELIVERY_VEHICLES: any[] = [
  {
    id: 'vehicle-01',
    plate: '29H-123.45',
    vehicleName: 'Xe tải thùng kín 1,25 tấn',
    capacityKg: 1250,
    driverName: 'Nguyễn Văn Hải',
    driverPhone: '0903 111 225',
    status: 'ready',
    suitableRegions: ['Hà Nội', 'Bắc Ninh'],
    createdAt: '2026-07-01T08:00:00Z'
  },
  {
    id: 'vehicle-02',
    plate: '29C-456.78',
    vehicleName: 'Xe tải thùng kín 2,5 tấn',
    capacityKg: 2500,
    driverName: 'Trần Đức Long',
    driverPhone: '0912 334 668',
    status: 'ready',
    suitableRegions: ['Hải Dương', 'Hưng Yên', 'Phú Thọ'],
    createdAt: '2026-07-01T08:00:00Z'
  },
  {
    id: 'vehicle-03',
    plate: '89C-246.80',
    vehicleName: 'Xe tải 1,9 tấn',
    capacityKg: 1900,
    driverName: 'Lê Văn Tài',
    driverPhone: '0988 246 801',
    status: 'maintenance',
    maintenanceNote: 'Bảo dưỡng định kỳ',
    suitableRegions: ['Hưng Yên', 'Hải Dương'],
    createdAt: '2026-07-01T08:00:00Z'
  },
  {
    id: 'vehicle-04',
    plate: '29D-112.23',
    vehicleName: 'Xe van giao hàng 750 kg',
    capacityKg: 750,
    driverName: 'Phạm Minh Quân',
    driverPhone: '0975 112 233',
    status: 'ready',
    suitableRegions: ['Hà Nội'],
    createdAt: '2026-07-01T08:00:00Z'
  }
];

export const DEFAULT_INVOICES: any[] = [
  {
    id: 'inv-001',
    invoiceCode: 'INV-202604-0001',
    poId: 'po-004',
    poCode: 'PO-202604-0001',
    customerId: 'cust-003',
    companyName: 'Trancy Logistics Hải Dương',
    type: 'receivable',
    amount: 4000000,
    paidAmount: 4000000,
    dueDate: '2026-05-18T00:00:00Z',
    status: 'paid',
    assignedAccountantId: 'u-accountant',
    assignedAccountantName: 'Kế Toán Trần Thu',
    createdBy: 'Giám Đốc Lê Minh (ADMIN)',
    createdAt: '2026-04-18T10:00:00Z'
  }
];

export const DEFAULT_CHANNELS: any[] = [
  { id: 'all', name: 'Kênh Chung', desc: 'Thảo luận chung toàn công ty', roles: ['admin', 'sale', 'designer', 'purchaser', 'producer', 'accountant'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' },
  { id: 'accountant', name: 'Kênh Kế Toán', desc: 'Kênh làm việc nội bộ Kế toán', roles: ['admin', 'accountant'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' },
  { id: 'production', name: 'Kênh Sản Xuất', desc: 'Kênh điều hành & báo cáo xưởng sản xuất', roles: ['admin', 'producer'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' },
  { id: 'design', name: 'Kênh Thiết Kế', desc: 'Trao đổi chuyên môn thiết kế & mẫu', roles: ['admin', 'designer'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' },
  { id: 'sale', name: 'Kênh Sale', desc: 'Báo cáo & chia sẻ chiến dịch khách hàng', roles: ['admin', 'sale'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' },
  { id: 'purchase', name: 'Kênh Mua Hàng', desc: 'Trao đổi đặt hàng nguyên vật tư', roles: ['admin', 'purchaser'], members: [], createdBy: 'u-admin', createdAt: '2026-05-01T00:00:00Z' }
];
