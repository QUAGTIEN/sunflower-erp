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
const compactMoney = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ đ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu đ`;
  return money(value);
};
const date = (value: Date | null) => value ? value.toLocaleDateString('vi-VN') : 'Chưa rõ ngày';

function ValueBars({ rows, value, color, onOpenCustomer }: {
  rows: CustomerOverviewRow[];
  value: (row: CustomerOverviewRow) => number;
  color: 'blue' | 'amber';
  onOpenCustomer: Props['onOpenCustomer'];
}) {
  if (!rows.length) return <p className="customer-overview__empty">Chưa có dữ liệu phù hợp.</p>;
  const max = Math.max(1, ...rows.map(value));
  return <div className="customer-overview__value-bars">{rows.map(row =>
    <button type="button" key={row.customer.id} onClick={() => onOpenCustomer(row.customer)} aria-label={`Mở hồ sơ ${row.customer.companyName}, ${money(value(row))}`}>
      <span className="customer-overview__customer-name" title={row.customer.companyName}>{row.customer.companyName}</span>
      <span className="customer-overview__bar-track"><span className={`customer-overview__bar-fill customer-overview__bar-fill--${color}`} style={{ width: `${value(row) / max * 100}%` }} /></span>
      <strong title={money(value(row))}>{compactMoney(value(row))}</strong>
    </button>
  )}</div>;
}

export function CustomerOverview({ customers, orders, invoices, onOpenCustomer }: Props) {
  const [valueMode, setValueMode] = useState<'highest' | 'lowest'>('highest');
  const [showAllInactive, setShowAllInactive] = useState(false);
  const data = buildCustomerOverview(customers, orders, invoices);
  const metrics = [
    ['Tổng khách hàng', number(data.customerCount), 'Hồ sơ đang quản lý'],
    ['Đã phát sinh PO', number(data.purchasedCount), `${number(data.neverOrderedCount)} khách chưa có PO`],
    ['Tổng giá trị PO', compactMoney(data.totalOrderValue), 'Từ trước đến nay'],
    ['Mua trong 90 ngày', number(data.activeCount), 'Theo PO gần nhất'],
    ['Lâu không mua', number(data.inactiveCount), 'Trên 90 ngày từ PO cuối'],
    ['Công nợ phải thu', compactMoney(data.totalDebt), `${number(data.debtCount)} khách còn công nợ`]
  ];
  const trendMax = Math.max(4, Math.ceil(Math.max(...data.months.map(month => month.orderCount), 0) / 4) * 4);
  const trendX = (index: number) => 45 + index * 137;
  const trendY = (count: number) => 215 - count / trendMax * 180;
  const points = (key: 'orderCount' | 'customerCount') => data.months.map((month, index) => `${trendX(index)},${trendY(month[key])}`).join(' ');
  const total = Math.max(1, data.customerCount);
  const frequentPercent = data.frequentCount / total * 100;
  const occasionalPercent = data.occasionalCount / total * 100;
  const donutBackground = data.customerCount
    ? `conic-gradient(#3157c8 0 ${frequentPercent}%, #319e9b ${frequentPercent}% ${frequentPercent + occasionalPercent}%, #e8a145 ${frequentPercent + occasionalPercent}% 100%)`
    : '#e8edf5';
  const bucketLabels = ['0–30 ngày', '31–60 ngày', '61–90 ngày', 'Trên 90 ngày'];
  const bucketMax = Math.max(1, ...data.purchaseAgeBuckets);

  return <div className="customer-overview">
    <div className="customer-overview__metrics">{metrics.map(([label, value, note], index) =>
      <div key={label} className={index === 4 ? 'customer-overview__metric--attention' : ''}>
        <span>{label}</span><strong title={index === 2 ? money(data.totalOrderValue) : index === 5 ? money(data.totalDebt) : value}>{value}</strong><small>{note}</small>
      </div>
    )}</div>

    <div className="customer-overview__grid">
      <section className="customer-overview__panel customer-overview__panel--chart">
        <header><div><h2>Xu hướng đặt hàng</h2><p>Số PO và số khách đặt PO theo tháng</p></div><div className="customer-overview__key"><span><i className="customer-overview__key-blue" />Số PO</span><span><i className="customer-overview__key-teal" />Khách đặt PO</span></div></header>
        {data.months.some(month => month.orderCount > 0) ? <div className="customer-overview__trend-scroll"><svg className="customer-overview__trend" viewBox="0 0 760 255" role="img" aria-label="Xu hướng số PO và số khách đặt PO trong sáu tháng gần đây">
          {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="45" x2="730" y1={35 + index * 45} y2={35 + index * 45} /><text x="35" y={39 + index * 45} textAnchor="end">{number(trendMax * (4 - index) / 4)}</text></g>)}
          <polyline className="customer-overview__line--orders" points={points('orderCount')} />
          <polyline className="customer-overview__line--customers" points={points('customerCount')} />
          {data.months.map((month, index) => <g key={month.key}>
            <circle className="customer-overview__dot--orders" cx={trendX(index)} cy={trendY(month.orderCount)} r="4.5"><title>{month.label}: {number(month.orderCount)} PO</title></circle>
            <circle className="customer-overview__dot--customers" cx={trendX(index)} cy={trendY(month.customerCount)} r="4.5"><title>{month.label}: {number(month.customerCount)} khách</title></circle>
            <text x={trendX(index)} y="248" textAnchor="middle">{month.label}</text>
          </g>)}
        </svg></div> : <p className="customer-overview__empty">Chưa có PO trong sáu tháng gần đây.</p>}
        {data.months.some(month => month.orderCount > 0) && <p className="customer-overview__scroll-hint">Cuộn ngang biểu đồ để xem đủ sáu tháng.</p>}
      </section>

      <section className="customer-overview__panel customer-overview__panel--chart">
        <header><div><h2>Nhịp mua trong 12 tháng</h2><p>Phân loại theo số PO của từng khách hàng</p></div></header>
        <div className="customer-overview__donut-layout">
          <div className="customer-overview__donut" style={{ background: donutBackground }} role="img" aria-label={`${data.frequentCount} khách mua thường xuyên, ${data.occasionalCount} khách mua thỉnh thoảng, ${data.noRecentOrdersCount} khách chưa có PO trong kỳ`}><span><strong>{number(data.customerCount)}</strong><small>khách hàng</small></span></div>
          <div className="customer-overview__legend">
            <div><i className="customer-overview__key-blue" /><span>Thường xuyên · từ 3 PO</span><strong>{number(data.frequentCount)}</strong></div>
            <div><i className="customer-overview__key-teal" /><span>Thỉnh thoảng · 1–2 PO</span><strong>{number(data.occasionalCount)}</strong></div>
            <div><i className="customer-overview__key-amber" /><span>Chưa có PO trong kỳ</span><strong>{number(data.noRecentOrdersCount)}</strong></div>
          </div>
        </div>
      </section>

      <section className="customer-overview__panel customer-overview__panel--chart">
        <header><div><h2>Khách hàng mang lại giá trị PO {valueMode === 'highest' ? 'cao' : 'thấp'}</h2><p>Top 5 theo tổng giá trị PO · chọn khách để mở hồ sơ</p></div><div className="customer-overview__segmented" role="group" aria-label="Chọn nhóm giá trị PO"><button type="button" aria-pressed={valueMode === 'highest'} onClick={() => setValueMode('highest')}>Cao nhất</button><button type="button" aria-pressed={valueMode === 'lowest'} onClick={() => setValueMode('lowest')}>Thấp nhất</button></div></header>
        <ValueBars rows={valueMode === 'highest' ? data.highestValue : data.lowestValue} value={row => row.orderValue} color="blue" onOpenCustomer={onOpenCustomer} />
        <p className="customer-overview__note">Giá trị PO thể hiện đơn hàng, chưa phải số tiền đã thu. Nhóm thấp chỉ gồm khách từng có PO.</p>
      </section>

      <section className="customer-overview__panel customer-overview__panel--chart">
        <header><div><h2>Thời gian từ PO gần nhất</h2><p>Số khách theo khoảng ngày chưa đặt lại</p></div></header>
        {data.purchaseAgeBuckets.some(count => count > 0) ? <div className="customer-overview__age-chart">{data.purchaseAgeBuckets.map((count, index) =>
          <div key={bucketLabels[index]} className="customer-overview__age-column"><strong>{number(count)}</strong><span className={`customer-overview__age-bar ${index === 3 ? 'is-attention' : ''}`} style={{ height: `${count / bucketMax * 174}px` }} /><small>{bucketLabels[index]}</small></div>
        )}</div> : <p className="customer-overview__empty">Chưa có ngày PO để đánh giá thời gian mua gần nhất.</p>}
        {data.unknownLastOrderCount > 0 && <p className="customer-overview__note">{number(data.unknownLastOrderCount)} khách có PO nhưng thiếu ngày đặt; chưa xếp vào biểu đồ.</p>}
      </section>

      <section className="customer-overview__panel customer-overview__panel--short">
        <header><div><h2>Khách lâu không mua</h2><p>Ưu tiên xem lại lịch sử và kế hoạch chăm sóc</p></div>{data.inactive.length > 3 && <button type="button" className="customer-overview__text-action" onClick={() => setShowAllInactive(value => !value)}>{showAllInactive ? 'Thu gọn' : `Xem tất cả ${number(data.inactive.length)} khách`}</button>}</header>
        {data.inactive.length ? <div className={`customer-overview__inactive-list ${showAllInactive ? 'is-expanded' : ''}`}>{(showAllInactive ? data.inactive : data.inactive.slice(0, 3)).map(row =>
          <button type="button" key={row.customer.id} onClick={() => onOpenCustomer(row.customer)} aria-label={`Mở hồ sơ ${row.customer.companyName}, ${row.daysSinceLastOrder} ngày chưa mua`}><span title={row.customer.companyName}>{row.customer.companyName}</span><small>PO cuối: {date(row.lastOrderAt)}</small><strong>{number(row.daysSinceLastOrder || 0)} ngày</strong></button>
        )}</div> : <p className="customer-overview__empty">Chưa có khách nào quá 90 ngày chưa mua lại.</p>}
      </section>

      <section className="customer-overview__panel customer-overview__panel--short">
        <header><div><h2>Công nợ theo khách hàng</h2><p>Top khách còn số dư hóa đơn phải thu</p></div></header>
        <ValueBars rows={data.highestDebt} value={row => row.debt} color="amber" onOpenCustomer={onOpenCustomer} />
      </section>
    </div>
    {data.neverOrderedCount > 0 && <p className="customer-overview__footnote">{number(data.neverOrderedCount)} khách chưa có PO được tính riêng, không xếp vào nhóm “Lâu không mua”.</p>}
    <p className="customer-overview__footnote">Giá trị PO là giá trị đơn hàng, chưa phải số tiền đã thu. Công nợ lấy từ hóa đơn phải thu còn số dư.</p>
  </div>;
}
