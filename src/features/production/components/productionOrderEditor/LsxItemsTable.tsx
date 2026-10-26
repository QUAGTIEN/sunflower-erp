import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import type { ProductionDraftCatalog } from '../../api/productionOrderService';
import { itemIdentity, type ProductionPO } from '../../model/productionOrder';
import { fillRemainingQuantities, remainingQuantity } from './lineQuantities';

export interface LinePrintDetails {
  materialWidth: string;
  priority: string;
}
export interface LsxItemsSelection {
  requiredItemIds: string[];
  quantities: Record<string, string>;
  printDetails: Record<string, LinePrintDetails>;
}
interface Props extends LsxItemsSelection {
  po?: ProductionPO;
  allocations: Map<string, number>;
  allocationError: string;
  catalogLines: ProductionDraftCatalog['lines'];
  catalogLoading: boolean;
  catalogError: string;
  onReloadCatalog: () => void;
  onChange: (patch: Partial<LsxItemsSelection>) => void;
}

const EMPTY_DETAILS: LinePrintDetails = { materialWidth: '', priority: '' };
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
// Specifications saved by an old product-code bug read "undefinedxundefinedmm"; flag them instead of showing them.
const isBrokenSpecification = (value: string) => !value.trim() || /undefined|null|NaN/.test(value);

export function LsxItemsTable({
  po,
  allocations,
  allocationError,
  requiredItemIds,
  quantities,
  printDetails,
  catalogLines,
  catalogLoading,
  catalogError,
  onReloadCatalog,
  onChange
}: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const items = po?.items || [];
  // The production plan is fixed for the whole PO by its first order; later orders only pick quantities.
  const planLocked = !!po?.productionPlanRequiredItemIds?.length;
  const includedCount = Object.values(quantities).filter(value => value !== '' && Number(value) !== 0).length;

  const toggleRequired = (id: string, remaining: number, checked: boolean) => {
    const nextQuantities = { ...quantities };
    if (checked && remaining > 0) nextQuantities[id] = String(remaining);
    else delete nextQuantities[id];
    onChange({
      requiredItemIds: checked ? [...requiredItemIds, id] : requiredItemIds.filter(key => key !== id),
      quantities: nextQuantities
    });
  };
  const updateDetails = (id: string, patch: Partial<LinePrintDetails>) =>
    onChange({ printDetails: { ...printDetails, [id]: { ...(printDetails[id] || EMPTY_DETAILS), ...patch } } });
  const toggleExpanded = (id: string) =>
    setExpanded(current => (current.includes(id) ? current.filter(key => key !== id) : [...current, id]));

  return (
    <section className="lsx-section">
      <div className="lsx-section-header">
        <h3>Mặt hàng sản xuất</h3>
        {po && (
          <>
            <span className="lsx-section-summary">Đưa vào lệnh: {includedCount} dòng</span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!!allocationError}
              onClick={() => onChange({ quantities: fillRemainingQuantities(po, requiredItemIds, allocations) })}
            >
              Điền toàn bộ SL còn lại
            </button>
          </>
        )}
      </div>
      <p className="lsx-hint">
        “Cần SX” được chốt cho cả PO từ lệnh đầu tiên. Số lượng tự điền phần còn lại; giảm bớt nếu chia nhiều lệnh.
      </p>
      {allocationError && <p className="lsx-error">{allocationError}</p>}
      {catalogLoading && (
        <p role="status" className="lsx-hint">
          Đang tải mã nội bộ và danh mục NVL…
        </p>
      )}
      {catalogError && (
        <div role="alert" className="lsx-hint">
          {catalogError} Không tự ghép mã theo tên; thông tin được máy chủ kiểm tra lại khi lưu.{' '}
          <button type="button" className="btn btn-outline" disabled={catalogLoading} onClick={onReloadCatalog}>
            Tải lại danh mục
          </button>
        </div>
      )}
      <div className="table-container">
        <table className="lsx-items">
          <thead>
            <tr>
              <th>Cần SX</th>
              <th>Mã / tên sản phẩm</th>
              <th>ĐVT</th>
              <th className="lsx-number">SL PO</th>
              <th className="lsx-number">Còn lại</th>
              <th className="lsx-number">SL lệnh này</th>
              <th aria-label="Chi tiết dòng" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const id = itemIdentity(item, index);
              const remaining = remainingQuantity(item, allocations.get(id) || 0);
              const required = requiredItemIds.includes(id);
              const quantity = quantities[id] || '';
              const overRemaining = quantity !== '' && Number(quantity) > remaining;
              const isExpanded = required && expanded.includes(id);
              const name = `${item.productCode || 'Nhập tay'} — ${item.productName || ''}`;
              const specification = [item.size, item.material].filter(Boolean).map(String).join(' · ');
              const mapped = catalogLines[id];
              const details = printDetails[id] || EMPTY_DETAILS;
              return (
                <Fragment key={id}>
                  <tr className={required ? undefined : 'is-muted'}>
                    <td>
                      <input
                        aria-label={`Cần sản xuất ${item.productName}`}
                        type="checkbox"
                        checked={required}
                        disabled={planLocked}
                        onChange={event => toggleRequired(id, remaining, event.target.checked)}
                      />
                    </td>
                    <td title={name}>
                      <strong>{String(item.productCode || 'Nhập tay')}</strong> {String(item.productName || '')}
                    </td>
                    <td>{String(item.unit || '—')}</td>
                    <td className="lsx-number">{number(item.quantity)}</td>
                    <td className="lsx-number">{required ? number(remaining) : '—'}</td>
                    <td>
                      {required ? (
                        <input
                          aria-label={`Số lượng ${item.productName}`}
                          aria-invalid={overRemaining || undefined}
                          title={overRemaining ? `Vượt số lượng còn lại (${number(remaining)})` : undefined}
                          className={overRemaining ? 'lsx-number is-invalid' : 'lsx-number'}
                          type="number"
                          min="0"
                          step="any"
                          max={remaining}
                          disabled={!!allocationError}
                          value={quantity}
                          onChange={event => onChange({ quantities: { ...quantities, [id]: event.target.value } })}
                        />
                      ) : (
                        <span className="lsx-muted-note">Không SX</span>
                      )}
                    </td>
                    <td>
                      {required && (
                        <IconButton
                          label={isExpanded ? 'Thu gọn chi tiết dòng' : 'Mã nội bộ, khổ NVL, ưu tiên dòng'}
                          icon={isExpanded ? <ChevronUp /> : <ChevronDown />}
                          active={isExpanded}
                          onClick={() => toggleExpanded(id)}
                        />
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="lsx-line-details">
                      <td />
                      <td colSpan={6}>
                        <div className="lsx-line-details-grid">
                          <div>
                            <span>Quy cách / chất liệu</span>
                            {isBrokenSpecification(specification) ? (
                              <strong className="lsx-text-danger">Chưa có quy cách đúng trên PO</strong>
                            ) : (
                              <strong title={specification}>{specification}</strong>
                            )}
                          </div>
                          <div>
                            <span>Mã nội bộ</span>
                            {mapped?.catalog?.code ? (
                              <strong>{mapped.catalog.code}</strong>
                            ) : (
                              <span className="lsx-tag lsx-tag--warning" title={mapped?.error}>
                                {mapped?.error ? 'Cần đối soát' : 'Chưa liên kết'}
                              </span>
                            )}
                          </div>
                          <label>
                            Khổ NVL (mm)
                            <input
                              aria-label={`Khổ NVL ${item.productName}`}
                              type="number"
                              min="0.001"
                              step="any"
                              value={details.materialWidth}
                              onChange={event => updateDetails(id, { materialWidth: event.target.value })}
                            />
                          </label>
                          <label>
                            Ưu tiên dòng
                            <select
                              aria-label={`Ưu tiên ${item.productName}`}
                              value={details.priority}
                              onChange={event => updateDetails(id, { priority: event.target.value })}
                            >
                              <option value="">Theo ưu tiên lệnh</option>
                              <option value="urgent">Gấp</option>
                              <option value="high">Hơi gấp</option>
                              <option value="normal">Bình thường</option>
                            </select>
                          </label>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!po && (
              <tr>
                <td colSpan={7}>Chọn PO để hiển thị danh mục mặt hàng.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
