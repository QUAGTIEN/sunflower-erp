import { useState } from 'react';
import type { CustomerRecord } from '@/features/crm/model/crmModels';
import { buildCustomerOverview, type CustomerOverviewInvoice, type CustomerOverviewOrder, type CustomerOverviewRow } from '@/features/crm/model/customerOverview';
import './CustomerOverview.css';

interface Props {
  customers: CustomerRecord[];
  orders: CustomerOverviewOrder[];
  invoices: CustomerOverviewInvoice[];
  onOpenCustomer: (customer: CustomerRecord) => void;
}

const number = (value: number) => value.toLocaleString('vi-VN');
const money = (value: number) => `${number(value)} đ`;
const date = (value: Date | null) => value ? value.toLocaleDateString('vi-VN') : 'Chưa rõ ngày';

function CustomerRows({ rows, value, onOpenCustomer }: {
  rows: CustomerOverviewRow[];
  value: (row: CustomerOverviewRow) => string;
  onOpenCustomer: Props['onOpenCustomer'];
}) {
  if (!rows.length) return <p className="customer-overview__empty">Chưa có dữ liệu phù hợp.</p>;
  return <div className="customer-overview__rows">{rows.map(row =>
    <button type="button" key={row.customer.id} onClick={() => onOpenCustomer(row.customer)}>
      <span title={row.customer.companyName}>{row.customer.companyName}</span><strong>{value(row)}</strong>
    </button>
  )}</div>;
}

export function CustomerOverview({ customers, orders, invoices, onOpenCustomer }: Props) {
  const [showAllInactive, setShowAllInactive] = useState(false);
  const [showAllFrequency, setShowAllFrequency] = useState(false);
  const data = buildCustomerOverview(customers, orders, invoices);
  const metrics = [
    ['Tổng khách hàng', number(data.customerCount), 'Hồ sơ đang quản lý'],
    ['Đã phát sinh PO', number(data.purchasedCount), `${number(data.neverOrderedCount)} khách chưa có PO`],
    ['Tổng giá trị PO', money(data.totalOrderValue), 'Cộng giá trị PO từ trước đến nay'],
    ['Mua trong 90 ngày', number(data.activeCount), 'Theo ngày PO gần nhất'],
    ['Lâu không mua', number(data.inactiveCount), 'Từ 90 ngày sau PO gần nhất'],
    ['Công nợ phải thu', money(data.totalDebt), `${number(data.debtCount)} khách còn công nợ`]
  ];
  return <div className="customer-overview">
    <div className="customer-overview__metrics">{metrics.map(([label, value, note]) =>
      <div key={label}><span>{label}</span><strong title={value}>{value}</strong><small>{note}</small></div>
    )}</div>
    <div className="customer-overview__grid">
      <section className="customer-overview__panel">
        <h2>Khách hàng mang lại giá trị PO cao</h2>
        <p>5 khách có tổng giá trị PO lớn nhất. Chọn tên để mở hồ sơ.</p>
        <CustomerRows rows={data.highestValue} value={row => money(row.orderValue)} onOpenCustomer={onOpenCustomer} />
      </section>
      <section className="customer-overview__panel">
        <h2>Khách hàng có giá trị PO thấp</h2>
        <p>5 khách đã mua có tổng giá trị PO thấp nhất.</p>
        <CustomerRows rows={data.lowestValue} value={row => money(row.orderValue)} onOpenCustomer={onOpenCustomer} />
      </section>
      <section className="customer-overview__panel">
        <h2>Tần suất mua trong 12 tháng</h2>
        <p>Phân nhóm theo số PO trong 12 tháng gần nhất.</p>
        <div className="customer-overview__frequency-summary">
          <span>Thường xuyên (từ 3 PO): <strong>{number(data.frequentCount)}</strong></span>
          <span>Thỉnh thoảng (1–2 PO): <strong>{number(data.occasionalCount)}</strong></span>
          <span>Chưa có PO trong kỳ: <strong>{number(data.noRecentOrdersCount)}</strong></span>
        </div>
        <CustomerRows rows={showAllFrequency ? data.frequent : data.frequent.slice(0, 5)} value={row => `${number(row.ordersLast12Months)} PO`} onOpenCustomer={onOpenCustomer} />
        {data.frequent.length > 5 && <button type="button" className="customer-overview__more" onClick={() => setShowAllFrequency(value => !value)}>{showAllFrequency ? 'Thu gọn' : `Xem tất cả ${number(data.frequent.length)} khách`}</button>}
      </section>
      <section className="customer-overview__panel">
        <h2>Lâu không mua</h2>
        <p>Khách đã có PO nhưng chưa mua lại từ 90 ngày.</p>
        <CustomerRows rows={showAllInactive ? data.inactive : data.inactive.slice(0, 8)} value={row => `${number(row.daysSinceLastOrder || 0)} ngày · ${date(row.lastOrderAt)}`} onOpenCustomer={onOpenCustomer} />
        {data.inactive.length > 8 && <button type="button" className="customer-overview__more" onClick={() => setShowAllInactive(value => !value)}>{showAllInactive ? 'Thu gọn' : `Xem tất cả ${number(data.inactive.length)} khách`}</button>}
      </section>
    </div>
    {data.neverOrderedCount > 0 && <p className="customer-overview__footnote">{number(data.neverOrderedCount)} khách chưa có PO được tính riêng, không xếp vào nhóm “Lâu không mua”.</p>}
    <p className="customer-overview__footnote">Giá trị PO là giá trị đơn hàng, chưa phải số tiền đã thu. Công nợ lấy từ hóa đơn phải thu còn số dư.</p>
  </div>;
}
