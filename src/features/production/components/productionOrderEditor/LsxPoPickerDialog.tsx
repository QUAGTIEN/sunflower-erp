import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { CommandRecord, ProductionPO } from '../../model/productionOrder';
import {
  EMPTY_PRINT_DETAILS,
  draftLineKey,
  pickerCustomers,
  plannableLines,
  type DraftLine,
  type PlannableLine
} from './draftLines';

interface Props {
  pos: ProductionPO[];
  commands: CommandRecord[];
  draftId: string;
  draftLines: DraftLine[];
  onClose: () => void;
  onConfirm: (lines: DraftLine[]) => void;
}

const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const matches = (value: string, search: string) =>
  value.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
const productLabel = (line: PlannableLine) =>
  `${String(line.item.productCode || 'Nhập tay')} · ${String(line.item.productName || '')}`;
const toggle = (values: string[], keys: string[], checked: boolean) =>
  checked ? [...new Set([...values, ...keys])] : values.filter(value => !keys.includes(value));

function PickerColumn({
  title,
  count,
  tools,
  children
}: {
  title: string;
  count: string;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="lsx-picker-column" aria-label={title}>
      <div className="lsx-picker-column-head">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {tools && <div className="lsx-picker-search">{tools}</div>}
      <div className="lsx-picker-list">{children}</div>
    </section>
  );
}

/**
 * Tick customers to list their orders, tick orders to list their product lines, then tick the lines to plan.
 * One order may mix customers (D-LSX2); unticking a customer or an order also drops what was chosen under it.
 */
export function LsxPoPickerDialog({ pos, commands, draftId, draftLines, onClose, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [customerKeys, setCustomerKeys] = useState<string[]>([]);
  const [poIds, setPoIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const taken = new Set(draftLines.map(draftLineKey));
  const available = plannableLines(pos, commands, draftId).lines.filter(line => !taken.has(line.key));
  const customers = pickerCustomers(available);
  const tickedCustomers = customers.filter(customer => customerKeys.includes(customer.key));
  const tickedOrders = tickedCustomers
    .flatMap(customer => customer.orders)
    .filter(order => poIds.includes(order.po.id));
  const chosen = available.filter(line => selected.includes(line.key));
  const chosenOrders = new Set(chosen.map(line => line.po.id));
  const chosenCustomers = tickedCustomers.filter(customer =>
    customer.orders.some(order => chosenOrders.has(order.po.id))
  );

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const tickCustomer = (key: string, checked: boolean) => {
    setCustomerKeys(current => toggle(current, [key], checked));
    if (checked) return;
    const orders = customers.find(customer => customer.key === key)?.orders || [];
    setPoIds(current =>
      toggle(
        current,
        orders.map(order => order.po.id),
        false
      )
    );
    setSelected(current =>
      toggle(
        current,
        orders.flatMap(order => order.lines.map(line => line.key)),
        false
      )
    );
  };
  const tickOrder = (poId: string, lineKeys: string[], checked: boolean) => {
    setPoIds(current => toggle(current, [poId], checked));
    if (!checked) setSelected(current => toggle(current, lineKeys, false));
  };
  const confirm = () =>
    onConfirm(
      chosen.map(line => ({
        poId: line.po.id,
        itemId: line.itemId,
        quantity: String(line.remaining),
        printDetails: EMPTY_PRINT_DETAILS
      }))
    );
  // Enter in a search box sits inside the order form and must not submit the draft.
  const stopEnter = (event: { key: string; preventDefault: () => void }) =>
    event.key === 'Enter' && event.preventDefault();

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
        <h2 id="lsx-picker-title">Chọn hàng cần sản xuất</h2>
        <p>Tick khách hàng để xem đơn hàng, tick đơn hàng để xem mã sản phẩm, rồi tick mã cần đưa vào lệnh.</p>
      </header>
      <div className="lsx-picker-columns">
        <PickerColumn
          title="1. Khách hàng"
          count={`Đã chọn ${tickedCustomers.length}/${customers.length}`}
          tools={
            <input
              type="search"
              aria-label="Tìm khách hàng"
              placeholder="Tìm khách hàng"
              value={customerSearch}
              onChange={event => setCustomerSearch(event.target.value)}
              onKeyDown={stopEnter}
            />
          }
        >
          {customers
            .filter(customer => matches(customer.label, customerSearch))
            .map(customer => (
              <label key={customer.key} className="lsx-picker-row">
                <input
                  type="checkbox"
                  aria-label={`Chọn khách hàng ${customer.label}`}
                  checked={customerKeys.includes(customer.key)}
                  onChange={event => tickCustomer(customer.key, event.target.checked)}
                />
                <span title={customer.label}>{customer.label}</span>
                <small>{customer.orders.length} đơn</small>
              </label>
            ))}
          {!customers.length && <p className="lsx-picker-empty">Không còn đơn hàng cần sản xuất.</p>}
        </PickerColumn>
        <PickerColumn
          title="2. Đơn hàng"
          count={`Đã chọn ${tickedOrders.length}/${tickedCustomers.flatMap(customer => customer.orders).length}`}
        >
          {tickedCustomers.map(customer => (
            <div key={customer.key} role="group" aria-label={customer.label}>
              <div className="lsx-picker-group">
                <span title={customer.label}>{customer.label}</span>
              </div>
              {customer.orders.map(({ po, lines }) => {
                const code = String(po.poCode || po.id);
                const deadline = po.expectedDeliveryDate ? formatDate(String(po.expectedDeliveryDate)) : '';
                return (
                  <label key={po.id} className="lsx-picker-row">
                    <input
                      type="checkbox"
                      aria-label={`Chọn đơn hàng ${code}`}
                      checked={poIds.includes(po.id)}
                      onChange={event =>
                        tickOrder(
                          po.id,
                          lines.map(line => line.key),
                          event.target.checked
                        )
                      }
                    />
                    <span title={code}>{code}</span>
                    <small>
                      {deadline && `Hạn ${deadline} · `}
                      {lines.length} mã
                    </small>
                  </label>
                );
              })}
            </div>
          ))}
          {!tickedCustomers.length && <p className="lsx-picker-empty">Tick khách hàng để xem đơn hàng.</p>}
        </PickerColumn>
        <PickerColumn
          title="3. Mã sản phẩm"
          count={`Đã chọn ${chosen.length}/${tickedOrders.flatMap(order => order.lines).length}`}
          tools={
            <input
              type="search"
              aria-label="Tìm mã hoặc tên sản phẩm"
              placeholder="Tìm mã / tên sản phẩm"
              value={productSearch}
              onChange={event => setProductSearch(event.target.value)}
              onKeyDown={stopEnter}
            />
          }
        >
          {tickedOrders.map(({ po, lines }) => {
            const visible = lines.filter(line => matches(productLabel(line), productSearch));
            if (!visible.length) return null;
            const keys = visible.map(line => line.key);
            const allChecked = keys.every(key => selected.includes(key));
            const someChecked = keys.some(key => selected.includes(key));
            const code = String(po.poCode || po.id);
            return (
              <div key={po.id} role="group" aria-label={code}>
                <label className="lsx-picker-group">
                  <input
                    type="checkbox"
                    aria-label={`Chọn cả ${code}`}
                    checked={allChecked}
                    ref={element => {
                      if (element) element.indeterminate = someChecked && !allChecked;
                    }}
                    onChange={event => setSelected(current => toggle(current, keys, event.target.checked))}
                  />
                  <span title={`${code} · ${String(po.customerName || '')}`}>
                    {code} · {String(po.customerName || 'Chưa có khách')}
                  </span>
                </label>
                {visible.map(line => (
                  <label key={line.key} className="lsx-picker-row">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${String(line.item.productName || line.itemId)} của ${code}`}
                      checked={selected.includes(line.key)}
                      onChange={event => setSelected(current => toggle(current, [line.key], event.target.checked))}
                    />
                    <span title={productLabel(line)}>{productLabel(line)}</span>
                    <small>
                      Còn {number(line.remaining)} {String(line.item.unit || '')}
                    </small>
                  </label>
                ))}
              </div>
            );
          })}
          {!tickedOrders.length && <p className="lsx-picker-empty">Tick đơn hàng để xem mã sản phẩm.</p>}
        </PickerColumn>
      </div>
      <footer className="lsx-picker-footer">
        <span>
          {chosen.length
            ? `Đã chọn ${chosen.length} mã sản phẩm từ ${chosenOrders.size} đơn hàng của ${chosenCustomers.length} khách hàng`
            : 'Chưa chọn mã sản phẩm nào'}
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
