import { Fragment, useEffect, useRef, useState } from 'react';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { CommandRecord, ProductionPO } from '../../model/productionOrder';
import {
  EMPTY_PRINT_DETAILS,
  customerKeyOf,
  draftLineKey,
  plannableLines,
  type DraftLine,
  type PlannableLine
} from './draftLines';

interface Props {
  customerKey: string;
  customerName: string;
  pos: ProductionPO[];
  commands: CommandRecord[];
  draftId: string;
  draftLines: DraftLine[];
  onClose: () => void;
  onConfirm: (lines: DraftLine[]) => void;
}

const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const matchesSearch = (line: PlannableLine, search: string) =>
  `${line.item.productCode || ''} ${line.item.productName || ''}`
    .toLocaleLowerCase('vi')
    .includes(search.trim().toLocaleLowerCase('vi'));

/** MISA-style "choose from orders": the customer's open PO lines grouped by PO; tick a whole PO or single lines. */
export function LsxPoPickerDialog({
  customerKey,
  customerName,
  pos,
  commands,
  draftId,
  draftLines,
  onClose,
  onConfirm
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [poFilter, setPoFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const taken = new Set(draftLines.map(draftLineKey));
  const available = plannableLines(
    pos.filter(po => customerKeyOf(po) === customerKey),
    commands,
    draftId
  ).lines.filter(line => !taken.has(line.key));
  const customerPOs = [...new Map(available.map(line => [line.po.id, line.po])).values()];
  const visible = available.filter(line => (!poFilter || line.po.id === poFilter) && matchesSearch(line, search));
  const groups = customerPOs
    .map(po => ({ po, lines: visible.filter(line => line.po.id === po.id) }))
    .filter(group => group.lines.length);
  const chosen = available.filter(line => selected.includes(line.key));
  const chosenPoCount = new Set(chosen.map(line => line.po.id)).size;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const setLines = (keys: string[], checked: boolean) =>
    setSelected(current =>
      checked ? [...new Set([...current, ...keys])] : current.filter(key => !keys.includes(key))
    );
  const confirm = () =>
    onConfirm(
      chosen.map(line => ({
        poId: line.po.id,
        itemId: line.itemId,
        quantity: String(line.remaining),
        printDetails: EMPTY_PRINT_DETAILS
      }))
    );

  return (
    <dialog
      ref={dialog}
      className="lsx-picker-dialog"
      aria-labelledby="lsx-picker-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="lsx-heading">
        <h2 id="lsx-picker-title">Chọn hàng từ đơn hàng — {customerName}</h2>
      </header>
      <div className="lsx-picker-filters">
        <select aria-label="Lọc theo đơn hàng" value={poFilter} onChange={event => setPoFilter(event.target.value)}>
          <option value="">Tất cả đơn hàng</option>
          {customerPOs.map(po => (
            <option key={po.id} value={po.id}>
              {String(po.poCode || po.id)}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Tìm mã hoặc tên sản phẩm"
          placeholder="Tìm mã / tên sản phẩm"
          value={search}
          onChange={event => setSearch(event.target.value)}
          // The dialog sits inside the order form; Enter here must not submit the draft.
          onKeyDown={event => event.key === 'Enter' && event.preventDefault()}
        />
      </div>
      <div className="table-container lsx-picker-table">
        <table className="lsx-candidates">
          <thead>
            <tr>
              <th aria-label="Chọn" />
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th>ĐVT</th>
              <th className="lsx-number">SL đơn hàng</th>
              <th className="lsx-number">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ po, lines }) => {
              const keys = lines.map(line => line.key);
              const allChecked = keys.every(key => selected.includes(key));
              const someChecked = keys.some(key => selected.includes(key));
              const deadline = po.expectedDeliveryDate ? formatDate(String(po.expectedDeliveryDate)) : '';
              return (
                <Fragment key={po.id}>
                  <tr className="lsx-picker-group">
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn cả ${po.poCode || po.id}`}
                        checked={allChecked}
                        ref={element => {
                          if (element) element.indeterminate = someChecked && !allChecked;
                        }}
                        onChange={event => setLines(keys, event.target.checked)}
                      />
                    </td>
                    <td colSpan={5}>
                      {String(po.poCode || po.id)}
                      {deadline && ` · ngày cần ${deadline}`} · {lines.length} dòng còn lại
                    </td>
                  </tr>
                  {lines.map(line => (
                    <tr key={line.key} className={selected.includes(line.key) ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${line.item.productName} của ${po.poCode}`}
                          checked={selected.includes(line.key)}
                          onChange={event => setLines([line.key], event.target.checked)}
                        />
                      </td>
                      <td title={String(line.item.productCode || '')}>{String(line.item.productCode || 'Nhập tay')}</td>
                      <td title={String(line.item.productName || '')}>{String(line.item.productName || '')}</td>
                      <td>{String(line.item.unit || '—')}</td>
                      <td className="lsx-number">{number(line.item.quantity)}</td>
                      <td className="lsx-number">{number(line.remaining)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {!groups.length && (
              <tr>
                <td colSpan={6}>
                  {available.length
                    ? 'Không có dòng phù hợp bộ lọc.'
                    : 'Khách hàng này không còn dòng đơn hàng cần sản xuất.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="lsx-picker-footer">
        <span>
          {chosen.length ? `Đã chọn ${chosen.length} dòng từ ${chosenPoCount} đơn hàng` : 'Chưa chọn dòng nào'}
        </span>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary" disabled={!chosen.length} onClick={confirm}>
          Đồng ý
        </button>
      </footer>
    </dialog>
  );
}
