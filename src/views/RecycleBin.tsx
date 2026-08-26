import React, { useState, useEffect } from 'react';
import { dbService, UserProfile } from '../services/firebaseService';
import { useLanguage } from '../context/LanguageContext';
import { Trash2, Archive, RefreshCw } from 'lucide-react';

interface RecycleBinProps {
  currentUser: UserProfile;
  onRefresh: () => void;
}

interface DeletedItem {
  id: string;
  collection: string;
  typeLabel: string;
  name: string;
  deletedAt: string;
  details: string;
  originalData: RecycleRecord | DeletedProductData;
}

interface RecycleRecord extends Record<string, unknown> {
  id: string;
  deleted?: boolean;
  deletedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  products?: unknown[];
}

interface DeletedProductData {
  customerId: string;
  product: RecycleRecord;
}

interface RecycleCollectionDefinition {
  name: string;
  label: string;
  getName: (item: RecycleRecord) => string;
}

const asText = (value: unknown): string => typeof value === 'string' ? value : '';
const readName = (item: RecycleRecord, ...keys: string[]): string => (
  keys.map(key => asText(item[key])).find(Boolean) || item.id
);

const toRecycleRecord = (value: unknown): RecycleRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = asText(source.id);
  return id ? { ...source, id } : null;
};

export const RecycleBin: React.FC<RecycleBinProps> = ({ currentUser, onRefresh }) => {
  const { t } = useLanguage();
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const collections: RecycleCollectionDefinition[] = [
      { name: 'customers', label: 'Khách hàng', getName: item => readName(item, 'companyName', 'name', 'customerCode', 'code') },
      { name: 'leads', label: 'Khách hàng tiềm năng', getName: item => readName(item, 'companyName', 'name') },
      { name: 'pos', label: 'Đơn đặt hàng PO', getName: item => readName(item, 'poCode') },
      { name: 'suppliers', label: 'Nhà cung cấp', getName: item => readName(item, 'supplierName', 'name', 'code') },
      { name: 'purchase_orders', label: 'Đơn mua hàng NCC', getName: item => readName(item, 'purCode') },
      { name: 'production_commands', label: 'Lệnh sản xuất LSX', getName: item => readName(item, 'cmdCode') },
      { name: 'deliveries', label: 'Phiếu giao hàng', getName: item => readName(item, 'deliveryCode') },
      { name: 'invoices', label: 'Hóa đơn Kế toán', getName: item => readName(item, 'invoiceCode', 'invoiceNo') }
    ];

    const unsubs: (() => void)[] = [];
    const rawData: Record<string, RecycleRecord[]> = {};

    const updateList = () => {
      const allDeleted: DeletedItem[] = [];
      collections.forEach(col => {
        const list = rawData[col.name] || [];
        list.forEach(item => {
          if (item.deleted === true) {
            allDeleted.push({
              id: item.id,
              collection: col.name,
              typeLabel: col.label,
              name: col.getName(item),
              deletedAt: item.updatedAt || item.createdAt || 'N/A',
              details: JSON.stringify(item),
              originalData: item
            });
          }

          // Scan for soft-deleted products inside active customers
          if (col.name === 'customers' && item.deleted !== true && Array.isArray(item.products)) {
            item.products.map(toRecycleRecord).filter((product): product is RecycleRecord => Boolean(product)).forEach(prod => {
              if (prod.deleted === true) {
                const companyName = readName(item, 'companyName', 'name');
                allDeleted.push({
                  id: `${item.id}::${prod.id}`,
                  collection: 'customer_products',
                  typeLabel: 'Mã sản phẩm khách hàng',
                  name: `[${companyName}] ${readName(prod, 'productCode')} - ${readName(prod, 'productName')}`,
                  deletedAt: prod.deletedAt || item.updatedAt || item.createdAt || 'N/A',
                  details: JSON.stringify({ customerId: item.id, product: prod }),
                  originalData: { customerId: item.id, product: prod }
                });
              }
            });
          }
        });
      });
      // Sort by deletedAt descending
      allDeleted.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
      setDeletedItems(allDeleted);
      setLoading(false);
    };

    collections.forEach(col => {
      const unsub = dbService.subscribeCollection(col.name, (data) => {
        rawData[col.name] = data.map(toRecycleRecord).filter((item): item is RecycleRecord => Boolean(item));
        updateList();
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const handleRestore = async (item: DeletedItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn khôi phục "${item.name}" (${item.typeLabel})?`)) {
      return;
    }
    try {
      if (item.collection === 'customer_products') {
        const { customerId, product } = item.originalData as DeletedProductData;
        const customer = toRecycleRecord(await dbService.getDocument('customers', customerId));
        if (customer) {
          const updatedProducts = (customer.products || []).map(toRecycleRecord).filter((entry): entry is RecycleRecord => Boolean(entry)).map(p => {
            if (p.id === product.id) {
              const restoredProduct = { ...p };
              delete restoredProduct.deleted;
              delete restoredProduct.deletedAt;
              return restoredProduct;
            }
            return p;
          });
          await dbService.updateDocument('customers', customerId, { products: updatedProducts });
          alert('Đã khôi phục sản phẩm thành công!');
          onRefresh();
          return;
        }
      }

      await dbService.updateDocument(item.collection, item.id, { deleted: false });
      alert('Đã khôi phục thành công!');
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi khôi phục.');
    }
  };

  const handleHardDelete = async (item: DeletedItem) => {
    if (!window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN "${item.name}" (${item.typeLabel})? Hành động này không thể hoàn tác.`)) {
      return;
    }
    try {
      if (item.collection === 'customer_products') {
        const { customerId, product } = item.originalData as DeletedProductData;
        const customer = toRecycleRecord(await dbService.getDocument('customers', customerId));
        if (customer) {
          const updatedProducts = (customer.products || [])
            .map(toRecycleRecord)
            .filter((entry): entry is RecycleRecord => Boolean(entry))
            .filter(entry => entry.id !== product.id);
          await dbService.updateDocument('customers', customerId, { products: updatedProducts });
          alert('Đã xóa vĩnh viễn sản phẩm thành công!');
          onRefresh();
          return;
        }
      }

      await dbService.deleteDocument(item.collection, item.id);
      alert('Đã xóa vĩnh viễn thành công!');
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi xóa vĩnh viễn.');
    }
  };

  const filtered = deletedItems.filter(item => {
    if (filterType === 'all') return true;
    return item.collection === filterType;
  });

  if (currentUser.role !== 'admin') {
    return (
      <div className="card text-center" style={{ padding: '40px' }}>
        <h2 style={{ color: 'var(--accent-red)' }}>{t('Quyền truy cập bị từ chối')}</h2>
        <p>Chỉ Giám Đốc mới có quyền truy cập vào Kho Rác hệ thống.</p>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={24} style={{ color: 'var(--accent-red)' }} />
            <span>{t('Thùng rác')}</span>
          </h1>
          <p className="view-subtitle">{t('Quản lý các tài liệu đã bị xóa tạm thời (Soft-deleted)')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ marginRight: '8px', fontWeight: 'bold' }}>{t('Lọc theo loại')}:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-control"
              style={{ width: '220px', display: 'inline-block' }}
            >
              <option value="all">-- {t('Tất cả')} --</option>
              <option value="pos">{t('Đơn đặt hàng PO')}</option>
              <option value="customers">{t('Khách hàng')}</option>
              <option value="leads">{t('Khách hàng tiềm năng')}</option>
              <option value="customer_products">{t('Mã sản phẩm khách hàng')}</option>
              <option value="suppliers">{t('Nhà cung cấp')}</option>
              <option value="purchase_orders">{t('Đơn mua hàng NCC')}</option>
              <option value="production_commands">{t('Lệnh sản xuất LSX')}</option>
              <option value="deliveries">{t('Phiếu giao hàng')}</option>
              <option value="invoices">{t('Hóa đơn Kế toán')}</option>
            </select>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {t('Tổng cộng')}: <strong>{filtered.length}</strong> {t('mục đã xóa')}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card text-center" style={{ padding: '30px' }}>
          <div>{t('Đang tải dữ liệu Kho Rác...')}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-muted" style={{ padding: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Archive size={48} style={{ color: '#94a3b8', marginBottom: '12px' }} />
          <p>{t('Kho rác trống. Không có tài liệu nào bị xóa tạm thời.')}</p>
        </div>
      ) : (
        <div className="card table-container" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>STT</th>
                <th>{t('Loại Tài Liệu')}</th>
                <th>{t('Tên / Mã Hiển Thị')}</th>
                <th>{t('ID Tài Liệu')}</th>
                <th>{t('Thời Gian Xóa')}</th>
                <th style={{ textAlign: 'right' }}>{t('Thao Tác')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, index) => (
                <tr key={`${item.collection}-${item.id}`}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="badge" style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--accent-red)',
                      border: '1px solid var(--accent-red)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {item.typeLabel}
                    </span>
                  </td>
                  <td><strong>{item.name}</strong></td>
                  <td><code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.id}</code></td>
                  <td>{item.deletedAt}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleRestore(item)}
                      className="btn"
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        color: 'var(--accent-green)',
                        border: '1px solid var(--accent-green)',
                        marginRight: '8px',
                        padding: '4px 10px',
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>{t('Khôi phục')}</span>
                    </button>
                    <button
                      onClick={() => handleHardDelete(item)}
                      className="btn btn-danger"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 size={14} />
                      <span>{t('Xóa vĩnh viễn')}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
