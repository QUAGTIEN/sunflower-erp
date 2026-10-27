import { useState } from 'react';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { CommandRecord, ProductionPO } from '../../model/productionOrder';
import { EMPTY_PRINT_DETAILS, plannableLines, type DraftLine, type PlannableLine } from './draftLines';

interface Props {
  pos: ProductionPO[];
  commands: CommandRecord[];
  draftId: string;
  draftLines: DraftLine[];
  /** Once the order has lines, only POs of that customer can be added. */
  lockedCustomerId: string;
  /** A PO without a customer cannot be combined, so an order started from one stays on that PO. */
  lockedPoId: string;
  onAdd: (lines: DraftLine[]) => void;
}

const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const customerOf = (po: ProductionPO) => String(po.customerId || '');
const matchesSearch = (line: PlannableLine, search: string) =>
  `${line.item.productCode || ''} ${line.item.productName || ''}`
    .toLocaleLowerCase('vi')
    .includes(search.trim().toLocaleLowerCase('vi'));

/** Customer, PO and product filters work independently; one order only takes lines of one customer. */
export function LsxLinePicker({ pos, commands, draftId, draftLines, lockedCustomerId, lockedPoId, onAdd }: Props) {
  const [customerFilter, setCustomerFilter] = useState('');
  const [poFilter, setPoFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const customerId = lockedCustomerId || customerFilter;
  const taken = new Set(draftLines.map(line => `${line.poId}::${line.itemId}`));
  const { lines, blockedPoCodes } = plannableLines(pos, commands, draftId);
  const available = lines.filter(line => !taken.has(line.key) && (!lockedPoId || line.po.id === lockedPoId));
  const customers = [
    ...new Map(available.map(line => [customerOf(line.po), String(line.po.customerName || 'Chưa có khách')])).entries()
  ].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const customerPOs = [...new Map(available.map(line => [line.po.id, line.po])).values()].filter(
    po => !customerId || customerOf(po) === customerId
  );
  const visible = available.filter(
    line =>
      (!customerId || customerOf(line.po) === customerId) &&
      (!poFilter || line.po.id === poFilter) &&
      matchesSearch(line, search)
  );
  const chosen = visible.filter(line => selected.includes(line.key));
  const chosenCustomers = new Set(chosen.map(line => customerOf(line.po)));
  // A PO without a customer can only stand alone, as the server cannot prove two such POs share a customer.
  const mixedCustomers =
    chosenCustomers.size > 1 ||
    (chosen.length > 0 && chosenCustomers.has('') && new Set(chosen.map(line => line.po.id)).size > 1) ||
    (!!lockedCustomerId && chosen.some(line => customerOf(line.po) !== lockedCustomerId));
  const allSelected = visible.length > 0 && visible.every(line => selected.includes(line.key));

  const toggle = (key: string, checked: boolean) =>
    setSelected(current => (checked ? [...current, key] : current.filter(value => value !== key)));
  const toggleAll = (checked: boolean) =>
    setSelected(current =>
      checked
        ? [...new Set([...current, ...visible.map(line => line.key)])]
        : current.filter(key => !visible.some(line => line.key === key))
    );
  const add = () => {
    onAdd(
      chosen.map(line => ({
        poId: line.po.id,
        itemId: line.itemId,
        quantity: String(line.remaining),
        printDetails: EMPTY_PRINT_DETAILS
      }))
    );
    setSelected([]);
  };

  return (
    <section className="lsx-section">
      <div className="lsx-section-header">
        <h3>Chọn mặt hàng</h3>
        <span className="lsx-section-summary">
          {lockedCustomerId ? 'Chỉ thêm được PO của khách đang có trong lệnh.' : 'Lọc theo khách, PO hoặc mã sản phẩm.'}
        </span>
      </div>
      <div className="lsx-picker-filters">
        <select
          aria-label="Khách hàng"
          value={customerId}
          disabled={!!lockedCustomerId}
          onChange={event => {
            setCustomerFilter(event.target.value);
            setPoFilter('');
          }}
        >
          <option value="">Tất cả khách hàng</option>
          {customers.map(([id, name]) => (
            <option key={id || 'none'} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="PO" value={poFilter} onChange={event => setPoFilter(event.target.value)}>
          <option value="">Tất cả PO</option>
          {customerPOs.map(po => (
            <option key={po.id} value={po.id}>
              {po.poCode || po.id} — {po.customerName}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Tìm mã hoặc tên sản phẩm"
          placeholder="Tìm mã / tên sản phẩm"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={!chosen.length || mixedCustomers} onClick={add}>
          Thêm vào lệnh{chosen.length ? ` (${chosen.length} dòng)` : ''}
        </button>
      </div>
      {mixedCustomers && <p className="lsx-error">Một lệnh chỉ gồm các PO của cùng một khách hàng.</p>}
      {blockedPoCodes.length > 0 && (
        <p className="lsx-hint" title={blockedPoCodes.join(', ')}>
          {blockedPoCodes.length} PO có LSX cũ chưa phân bổ theo dòng nên chưa lập thêm được; cần đối soát lệnh cũ.
        </p>
      )}
      <div className="table-container lsx-picker-table">
        <table className="lsx-candidates">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả dòng đang hiện"
                  checked={allSelected}
                  disabled={!visible.length}
                  onChange={event => toggleAll(event.target.checked)}
                />
              </th>
              <th>Mã sản phẩm</th>
              <th>Tên sản phẩm</th>
              <th>Khách hàng</th>
              <th>PO</th>
              <th>Ngày cần PO</th>
              <th>ĐVT</th>
              <th className="lsx-number">SL PO</th>
              <th className="lsx-number">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(line => (
              <tr key={line.key} className={selected.includes(line.key) ? 'is-selected' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${line.item.productName} của ${line.po.poCode}`}
                    checked={selected.includes(line.key)}
                    onChange={event => toggle(line.key, event.target.checked)}
                  />
                </td>
                <td title={String(line.item.productCode || '')}>{String(line.item.productCode || 'Nhập tay')}</td>
                <td title={String(line.item.productName || '')}>{String(line.item.productName || '')}</td>
                <td title={String(line.po.customerName || '')}>{String(line.po.customerName || '—')}</td>
                <td>{String(line.po.poCode || line.po.id)}</td>
                <td>{line.po.expectedDeliveryDate ? formatDate(String(line.po.expectedDeliveryDate)) : '—'}</td>
                <td>{String(line.item.unit || '—')}</td>
                <td className="lsx-number">{number(line.item.quantity)}</td>
                <td className="lsx-number">{number(line.remaining)}</td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={9}>
                  {available.length ? 'Không có dòng phù hợp bộ lọc.' : 'Không còn dòng PO nào cần lập lệnh sản xuất.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
