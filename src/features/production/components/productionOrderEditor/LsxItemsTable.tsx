import { Fragment, useState } from 'react';
import { RowActionMenu } from '@/components/RowActionMenu';
import type { ProductionDraftCatalog } from '../../api/productionOrderService';
import { itemIdentity, type CommandRecord, type ProductionPO } from '../../model/productionOrder';
import {
  EMPTY_PRINT_DETAILS,
  draftLineKey,
  poAllocations,
  remainingQuantity,
  type DraftLine,
  type LinePrintDetails
} from './draftLines';

interface Props {
  lines: DraftLine[];
  pos: ProductionPO[];
  commands: CommandRecord[];
  draftId: string;
  catalogLines: ProductionDraftCatalog['lines'];
  stockBalances?: Record<string, number>;
  catalogLoading: boolean;
  catalogError: string;
  onReloadCatalog: () => void;
  onChange: (lines: DraftLine[]) => void;
}

const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
// Specifications saved by an old product-code bug read "undefinedxundefinedmm"; flag them instead of showing them.
const isBrokenSpecification = (value: string) => !value.trim() || /undefined|null|NaN/.test(value);

/** Lines of the order being drafted, one row each; every line keeps its own order and that order's customer. */
export function LsxItemsTable({
  lines,
  pos,
  commands,
  draftId,
  catalogLines,
  stockBalances,
  catalogLoading,
  catalogError,
  onReloadCatalog,
  onChange
}: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map(line => (draftLineKey(line) === key ? { ...line, ...patch } : line)));
  const updateDetails = (line: DraftLine, patch: Partial<LinePrintDetails>) =>
    update(draftLineKey(line), { printDetails: { ...(line.printDetails || EMPTY_PRINT_DETAILS), ...patch } });
  const orderCount = new Set(lines.map(line => line.poId)).size;
  const customerCount = new Set(lines.map(line => String(pos.find(po => po.id === line.poId)?.customerId || line.poId)))
    .size;
  const summary = `${lines.length} dòng · ${orderCount} đơn hàng · ${customerCount} khách hàng`;
  const toggleExpanded = (key: string) =>
    setExpanded(current => (current.includes(key) ? current.filter(value => value !== key) : [...current, key]));

  return (
    <section className="lsx-section">
      <div className="lsx-section-header">
        <h3>Mặt hàng</h3>
        {lines.length > 0 && <span className="lsx-section-summary">{summary}</span>}
      </div>
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
              <th className="lsx-number">#</th>
              <th>Khách hàng</th>
              <th>Đơn hàng</th>
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th>Quy cách</th>
              <th>ĐVT</th>
              <th className="lsx-number">Còn lại</th>
              <th className="lsx-number" title="Tồn kho thành phẩm của mã nội bộ đã liên kết">
                Tồn TP
              </th>
              <th className="lsx-number">SL lệnh *</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, position) => {
              const key = draftLineKey(line);
              const po = pos.find(candidate => candidate.id === line.poId);
              const index = (po?.items || []).findIndex((item, row) => itemIdentity(item, row) === line.itemId);
              const item = po?.items?.[index];
              const allocated = poAllocations(commands, line.poId, draftId)?.get(key) || 0;
              const remaining = item ? remainingQuantity(item, allocated) : 0;
              const overRemaining = line.quantity !== '' && Number(line.quantity) > remaining;
              const isExpanded = expanded.includes(key);
              const productName = String(item?.productName || line.itemId);
              const specification = [item?.size, item?.material].filter(Boolean).map(String).join(' · ');
              const mapped = catalogLines[key];
              const finishedStock = mapped?.catalog?.id ? Number(stockBalances?.[mapped.catalog.id] || 0) : null;
              const customerName = String(po?.customerName || 'Chưa có khách');
              return (
                <Fragment key={key}>
                  <tr>
                    <td className="lsx-number">{position + 1}</td>
                    <td title={customerName}>{customerName}</td>
                    <td title={String(po?.poCode || line.poId)}>{String(po?.poCode || line.poId)}</td>
                    <td title={String(item?.productCode || '')}>{String(item?.productCode || 'Nhập tay')}</td>
                    <td title={productName}>{productName}</td>
                    {isBrokenSpecification(specification) ? (
                      <td className="lsx-text-danger">Chưa có quy cách</td>
                    ) : (
                      <td title={specification}>{specification}</td>
                    )}
                    <td>{String(item?.unit || '—')}</td>
                    <td className="lsx-number">{number(remaining)}</td>
                    <td
                      className="lsx-number"
                      title={
                        finishedStock === null
                          ? 'Chưa liên kết mã nội bộ nên chưa xem được tồn'
                          : `${number(finishedStock)} ${mapped?.catalog?.baseUnit || ''}`
                      }
                    >
                      {finishedStock === null ? '—' : number(finishedStock)}
                    </td>
                    <td>
                      <input
                        aria-label={`Số lượng ${productName} của ${po?.poCode || line.poId}`}
                        aria-invalid={overRemaining || undefined}
                        title={overRemaining ? `Vượt số lượng còn lại (${number(remaining)})` : undefined}
                        className={overRemaining ? 'lsx-number is-invalid' : 'lsx-number'}
                        type="number"
                        min="0"
                        step="any"
                        max={remaining}
                        required
                        value={line.quantity}
                        onChange={event => update(key, { quantity: event.target.value })}
                      />
                    </td>
                    <td>
                      <RowActionMenu
                        label={`Thao tác ${productName}`}
                        actions={[
                          {
                            label: isExpanded ? 'Ẩn mã nội bộ, khổ NVL, ưu tiên' : 'Mã nội bộ, khổ NVL, ưu tiên',
                            onSelect: () => toggleExpanded(key)
                          },
                          {
                            label: 'Bỏ dòng khỏi lệnh',
                            onSelect: () => onChange(lines.filter(candidate => draftLineKey(candidate) !== key))
                          }
                        ]}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="lsx-line-details">
                      <td />
                      <td colSpan={10}>
                        <div className="lsx-line-details-grid">
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
                          <label title="Khổ vật liệu đầu vào, không phải chiều rộng con tem">
                            Khổ NVL (mm)
                            <input
                              aria-label={`Khổ NVL ${productName}`}
                              type="number"
                              min="0.001"
                              step="any"
                              value={line.printDetails.materialWidth}
                              onChange={event => updateDetails(line, { materialWidth: event.target.value })}
                            />
                          </label>
                          <label>
                            Ưu tiên dòng
                            <select
                              aria-label={`Ưu tiên ${productName}`}
                              value={line.printDetails.priority}
                              onChange={event => updateDetails(line, { priority: event.target.value })}
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
            {!lines.length && (
              <tr>
                <td colSpan={11}>
                  Chưa có mặt hàng. Bấm “Chọn hàng” ở đầu trang để tick khách hàng, đơn hàng và mã sản phẩm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
