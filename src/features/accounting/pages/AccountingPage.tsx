import { requireConfirmedMutation, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { useLanguage } from '@/context/LanguageContext';
import { RowActionMenu } from '@/components/RowActionMenu';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { getPOQueueLabel, getPOQueueStatus } from '@/features/sales/model/poWorkflow';
import { formatDate } from '@/shared/utils/dateFormatting';
import { ItemCatalogWorkspace } from '@/features/catalog/components/ItemCatalogWorkspace';
import { canManageItemCatalog } from '@/features/catalog/model/itemCatalog';
import { canUseLedger } from '../model/accountingLedger';
import { AccountingReportsWorkspace } from '../components/AccountingReportsWorkspace';
import { AccountingLedgerWorkspace } from '../components/AccountingLedgerWorkspace';
import { confirmAppNavigation } from '@/shared/feedback/navigationGuard';
import './Accounting.css';

interface AccountingProps {
  pos: any[];
  currentUser: UserProfile;
  onRefresh: () => void;
  users: UserProfile[];
}
export const Accounting: React.FC<AccountingProps> = ({ pos, currentUser, onRefresh }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'invoices' | 'costing' | 'catalog' | 'reports'>('invoices');
  const changeTab = (tab: typeof activeTab) => {
    if (confirmAppNavigation()) setActiveTab(tab);
  };
  const [customCostModalPo, setCustomCostModalPo] = useState<any | null>(null);
  const [tempTransportCost, setTempTransportCost] = useState(0),
    [tempLaborCost, setTempLaborCost] = useState(0),
    [tempOtherCost, setTempOtherCost] = useState(0);
  const costingPagination = useDataTablePagination(pos);
  if (!canUseLedger(currentUser))
    return <p role="alert">Chỉ Admin và Kế toán có quyền Kế toán được sử dụng sổ tiền.</p>;
  // Costing calculations for PO
  const calculateCosting = (po: any) => {
    const revenue = po.netAmount || po.totalAmount || 0;
    const quantity = po.items?.[0]?.quantity || 10000;
    const sizeStr = po.items?.[0]?.size || '100x100mm';

    // Calculate square meters
    let w = 100,
      h = 100;
    const parts = sizeStr.toLowerCase().replace('mm', '').split('x');
    if (parts.length === 2) {
      w = parseInt(parts[0]) || 100;
      h = parseInt(parts[1]) || 100;
    }
    const sqm = (w * h * quantity) / 1000000;

    const decalCost = sqm * 32000; // Average cost of paper decal
    const inkCost = (quantity / 1000) * 1500; // Ink cost
    const filmCost = po.items?.[0]?.material.includes('nhựa') ? sqm * 12000 : 0;
    const coreCost = Math.ceil(quantity / 5000) * 8000; // Core cost

    const materialCost = Math.round(decalCost + inkCost + filmCost + coreCost);
    const transportCost = po.transportCost !== undefined ? Number(po.transportCost) : 350000;
    const laborCost = Number(po.laborCost) || 0;
    const otherCost = Number(po.otherCost) || 0;

    const totalCost = materialCost + transportCost + laborCost + otherCost;
    const grossProfit = revenue - totalCost;
    const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue,
      materialCost,
      transportCost,
      laborCost,
      otherCost,
      totalCost,
      grossProfit,
      marginPercent
    };
  };

  const handleOpenCostModal = (po: any) => {
    setCustomCostModalPo(po);
    setTempTransportCost(po.transportCost !== undefined ? Number(po.transportCost) : 350000);
    setTempLaborCost(Number(po.laborCost) || 0);
    setTempOtherCost(Number(po.otherCost) || 0);
  };

  const handleSaveCustomCost = async () => {
    return runMutationAction(
      'AccountingPage.tsx:handleSaveCustomCost',
      async () => {
        if (customCostModalPo) {
          await requireConfirmedMutation(
            dbService.updateDocument('pos', customCostModalPo.id, {
              transportCost: Number(tempTransportCost),
              laborCost: Number(tempLaborCost),
              otherCost: Number(tempOtherCost)
            })
          );
          setCustomCostModalPo(null);
          onRefresh();

          showSuccessToast('Đã lưu thành công');
        }
      },
      undefined
    );
  };

  const printWorkOrder = (po: any) => {
    const c = calculateCosting(po);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${t('In Phiếu SX')} - ${po.poCode}</title>
          <style>
            body { font-family: sans-serif; padding: 30px; line-height: 1.6; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: bold; color: #1e3a8a; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
            th { background-color: #f2f2f2; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; }
            .sig-box { width: 200px; height: 100px; border: 1px dashed #999; margin-top: 10px; text-align: center; line-height: 100px; color: #999; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PHIẾU YÊU CẦU SẢN XUẤT VÀ TÍNH PHÍ</div>
            <div>Mã đơn hàng: ${po.poCode} | Ngày in: ${new Date().toLocaleDateString('vi-VN')}</div>
          </div>
          <div class="grid">
            <div>
              <strong>Khách Hàng:</strong> ${po.customerName}<br>
              <strong>Ngày Đặt Hàng:</strong> ${formatDate(po.orderDate)}<br>
              <strong>Ngày Giao Dự Kiến:</strong> ${formatDate(po.expectedDeliveryDate)}
            </div>
            <div>
              <strong>Hàng đợi xử lý:</strong> ${getPOQueueLabel(po)}<br>
              <strong>Ghi Chú Đơn Hàng:</strong> ${po.notes || 'Không có'}
            </div>
          </div>
          <h3>Thông số tem nhãn và định phí</h3>
          <table>
            <thead>
              <tr>
                <th>Tên sản phẩm</th>
                <th>Quy cách</th>
                <th>Vật liệu</th>
                <th>Số lượng đặt</th>
                <th>Ước tính Chi Phí</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${po.items?.[0]?.productName}</td>
                <td>${po.items?.[0]?.size}</td>
                <td>${po.items?.[0]?.material}</td>
                <td>${po.items?.[0]?.quantity.toLocaleString()} tem</td>
                <td>${c.totalCost.toLocaleString()} đ</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            <div>
              <div>Đại Diện Bán Hàng</div>
              <div class="sig-box">Ký tên</div>
            </div>
            <div>
              <div>Quản Đốc Phân Xưởng</div>
              <div class="sig-box">Ký tên</div>
            </div>
            <div>
              <div>Kế Toán Trưởng</div>
              <div class="sig-box">Ký tên</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div
      className="accounting-view"
      data-erp-table-text="single-line"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <PageContextHeader
        section="Kế toán"
        current={
          activeTab === 'reports'
            ? 'Báo cáo & cảnh báo'
            : activeTab === 'catalog'
              ? 'Danh mục hàng'
              : activeTab === 'costing'
                ? 'Báo cáo lãi gộp đơn hàng'
                : 'Công nợ & thu chi'
        }
      />
      <nav className="content-tabs" role="tablist" aria-label="Kế toán">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invoices'}
          className={activeTab === 'invoices' ? 'active' : ''}
          onClick={() => changeTab('invoices')}
        >
          Công nợ & thu chi
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'costing'}
          className={activeTab === 'costing' ? 'active' : ''}
          onClick={() => changeTab('costing')}
        >
          {t('Báo Cáo Lãi Gộp Đơn Hàng')}
        </button>
        {canManageItemCatalog(currentUser) && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'catalog'}
            className={activeTab === 'catalog' ? 'active' : ''}
            onClick={() => changeTab('catalog')}
          >
            Danh mục hàng
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reports'}
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => changeTab('reports')}
        >
          Báo cáo & cảnh báo
        </button>
      </nav>
      {activeTab === 'invoices' && <AccountingLedgerWorkspace actor={currentUser} onRefresh={onRefresh} />}
      {activeTab === 'reports' && <AccountingReportsWorkspace actor={currentUser} />}
      {activeTab === 'catalog' && <ItemCatalogWorkspace currentUser={currentUser} />}
      {activeTab === 'costing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('Báo Cáo Lãi Gộp Đơn Hàng')}</span>
            </div>
            <div className="table-container accounting-costing-table-wrap erp-primary-data-table">
              <table className="accounting-costing-table" data-resize-key="accounting-costing">
                <thead>
                  <tr>
                    <th>{t('Mã đơn hàng')}</th>
                    <th>{t('Khách Hàng')}</th>
                    <th>{t('Doanh Thu')}</th>
                    <th>{t('Chi Phí NVL')}</th>
                    <th>{t('Nhân Công')}</th>
                    <th>{t('Vận Chuyển')}</th>
                    <th>{t('Chi Phí Khác')}</th>
                    <th>{t('Tổng Chi Phí')}</th>
                    <th>{t('Lãi Gộp')}</th>
                    <th>{t('Tỷ Suất (%)')}</th>
                    <th>{t('Thao Tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {costingPagination.rows.map(po => {
                    const c = calculateCosting(po);
                    const queueStatus = getPOQueueStatus(po);
                    const isEstimated = ![
                      'waiting_invoice',
                      'waiting_receivable',
                      'waiting_discount',
                      'completed'
                    ].includes(queueStatus);

                    return (
                      <tr key={po.id}>
                        <td style={{ fontWeight: 600 }}>{po.poCode}</td>
                        <td>{po.customerName}</td>
                        <td style={{ fontWeight: 600 }}>{c.revenue?.toLocaleString()} đ</td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{c.materialCost?.toLocaleString()} đ</td>
                        <td>{c.laborCost?.toLocaleString()} đ</td>
                        <td>{c.transportCost?.toLocaleString()} đ</td>
                        <td>{c.otherCost?.toLocaleString()} đ</td>
                        <td style={{ fontWeight: 600 }}>{c.totalCost?.toLocaleString()} đ</td>
                        <td style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                          {c.grossProfit?.toLocaleString()} đ
                        </td>
                        <td>
                          <span
                            style={{ color: c.marginPercent > 30 ? 'var(--color-success)' : 'var(--color-warning)' }}
                          >
                            {c.marginPercent.toFixed(1)}%{isEstimated ? ` (${t('Dự kiến')})` : ''}
                          </span>
                        </td>
                        <td>
                          <RowActionMenu
                            label={`Thao tác ${po.poCode}`}
                            actions={[
                              { label: t('Sửa Chi Phí'), onSelect: () => handleOpenCostModal(po) },
                              { label: t('In Phiếu'), onSelect: () => printWorkOrder(po) }
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {!pos.length && (
                    <tr>
                      <td colSpan={11}>{t('Chưa có đơn hàng phù hợp.')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...costingPagination.paginationProps} />
          </div>
        </div>
      )}

      {/* CUSTOM GROSS PROFIT COST ADJUSTMENT MODAL */}
      {customCostModalPo && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>CẬP NHẬT CHI PHÍ SẢN XUẤT ĐƠN HÀNG</span>
              <button className="btn btn-sm btn-outline" onClick={() => setCustomCostModalPo(null)}>
                {t('Đóng')}
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px' }}>
                Điều chỉnh các cấu thành chi phí thực tế cho đơn hàng: <strong>{customCostModalPo.poCode}</strong>
              </p>
              <div className="form-group">
                <label>Chi phí vận chuyển thực tế (đ) *</label>
                <input
                  type="number"
                  value={tempTransportCost}
                  onChange={e => setTempTransportCost(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Chi phí nhân công sản xuất (đ) *</label>
                <input
                  type="number"
                  value={tempLaborCost}
                  onChange={e => setTempLaborCost(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Chi phí khác phát sinh (đ) *</label>
                <input
                  type="number"
                  value={tempOtherCost}
                  onChange={e => setTempOtherCost(Number(e.target.value))}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setCustomCostModalPo(null)}>
                {t('Hủy')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveCustomCost}>
                {t('Cập Nhật')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
