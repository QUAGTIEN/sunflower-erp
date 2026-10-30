import { useState } from 'react';
import type { CustomerRecord } from '@/features/crm/model/crmModels';
import {
  buildCustomerOverview,
  type CustomerOverviewInvoice,
  type CustomerOverviewOrder,
  type CustomerOverviewProvince,
  type CustomerOverviewRow
} from '@/features/crm/model/customerOverview';
import './CustomerOverview.css';

interface Props {
  customers: CustomerRecord[];
  orders: CustomerOverviewOrder[];
  invoices: CustomerOverviewInvoice[];
  debtByCustomerId?: ReadonlyMap<string, number>;
  debtReady?: boolean;
  provinceByCustomerId: ReadonlyMap<string, string>;
  onOpenCustomer: (customer: CustomerRecord) => void;
}

const number = (value: number) => value.toLocaleString('vi-VN');
const money = (value: number) => `${number(value)} đ`;
const compactMoney = (value: number) => {
  if (value >= 1_000_000_000)
    return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ đ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu đ`;
  return money(value);
};
const date = (value: Date | null) => (value ? value.toLocaleDateString('vi-VN') : 'Chưa rõ ngày');

function RankBars({
  rows,
  measure,
  display,
  exact,
  color,
  onOpenCustomer
}: {
  rows: CustomerOverviewRow[];
  measure: (row: CustomerOverviewRow) => number;
  display: (value: number) => string;
  exact: (value: number) => string;
  color: 'blue' | 'teal';
  onOpenCustomer: Props['onOpenCustomer'];
}) {
  if (!rows.length) return <p className="customer-overview__empty">Chưa có khách hàng phát sinh đơn hàng.</p>;
  const max = Math.max(1, ...rows.map(measure));
  return (
    <div className="customer-overview__ranking">
      {rows.map(row => {
        const value = measure(row);
        return (
          <button
            type="button"
            key={row.customer.id}
            onClick={() => onOpenCustomer(row.customer)}
            aria-label={`Mở hồ sơ ${row.customer.companyName}, ${exact(value)}`}
          >
            <span className="customer-overview__ranking-name" title={row.customer.companyName}>
              {row.customer.companyName}
            </span>
            <span className="customer-overview__ranking-track">
              <span
                className={`customer-overview__ranking-fill customer-overview__ranking-fill--${color}`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </span>
            <strong title={exact(value)}>{display(value)}</strong>
          </button>
        );
      })}
    </div>
  );
}

export function CustomerOverview({
  customers,
  orders,
  invoices,
  provinceByCustomerId,
  onOpenCustomer,
  debtByCustomerId,
  debtReady = true
}: Props) {
  const [showAllInactive, setShowAllInactive] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const data = buildCustomerOverview(customers, orders, invoices, new Date(), provinceByCustomerId, debtByCustomerId);
  const provinceColumns: CustomerOverviewProvince[] =
    data.provinces.length > 7
      ? [
          ...data.provinces.slice(0, 6),
          { label: 'Tỉnh khác', rows: data.provinces.slice(6).flatMap(province => province.rows) }
        ]
      : data.provinces;
  const openedProvince = provinceColumns.find(province => province.label === selectedProvince);
  const provinceMax = Math.max(1, ...provinceColumns.map(province => province.rows.length));
  const total = Math.max(1, data.customerCount);
  const activeEnd = (data.activeCount / total) * 100;
  const inactiveEnd = activeEnd + (data.inactiveCount / total) * 100;
  const neverEnd = inactiveEnd + (data.neverOrderedCount / total) * 100;
  const donutBackground = data.customerCount
    ? `conic-gradient(#3157c8 0 ${activeEnd}%, #319e9b ${activeEnd}% ${inactiveEnd}%, #e8a145 ${inactiveEnd}% ${neverEnd}%, #94a3b8 ${neverEnd}% 100%)`
    : '#e8edf5';
  const metrics = [
    ['Tổng khách hàng', data.customerCount],
    ['Đã có đơn hàng', data.purchasedCount],
    ['Chưa có đơn hàng', data.neverOrderedCount],
    ['Mua trong 90 ngày', data.activeCount],
    ['Lâu chưa đặt đơn', data.inactiveCount],
    ['Còn nợ sổ mới', debtReady ? data.debtCount : '—']
  ] as const;
  const ageLabels = ['91–180 ngày', '181–365 ngày', 'Trên 365 ngày'];

  return (
    <div className="customer-overview">
      <div className="customer-overview__top-grid">
        <section
          className="customer-overview__panel customer-overview__panel--top"
          aria-labelledby="customer-overview-general"
        >
          <header>
            <div>
              <h2 id="customer-overview-general">Tình hình chung</h2>
              <p>Nhìn nhanh số lượng và hoạt động mua hàng</p>
            </div>
          </header>
          <div className="customer-overview__metrics">
            {metrics.map(([label, value]) => (
              <div key={label} className={label === 'Lâu chưa đặt đơn' ? 'is-attention' : ''}>
                <strong>{typeof value === 'number' ? number(value) : value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="customer-overview__donut-layout">
            <div
              className="customer-overview__donut"
              role="img"
              aria-label={`${data.activeCount} khách mua trong 90 ngày, ${data.inactiveCount} khách lâu chưa đặt lại, ${data.neverOrderedCount} khách chưa từng có đơn hàng`}
              style={{ background: donutBackground }}
            >
              <span>
                <strong>{number(data.customerCount)}</strong>
                <small>khách hàng</small>
              </span>
            </div>
            <div className="customer-overview__legend">
              <div>
                <i className="is-blue" />
                <span>Đang mua · trong 90 ngày</span>
                <strong>{number(data.activeCount)}</strong>
              </div>
              <div>
                <i className="is-teal" />
                <span>Lâu chưa đặt lại · trên 90 ngày</span>
                <strong>{number(data.inactiveCount)}</strong>
              </div>
              <div>
                <i className="is-amber" />
                <span>Chưa từng có đơn hàng</span>
                <strong>{number(data.neverOrderedCount)}</strong>
              </div>
              {data.unknownLastOrderCount > 0 && (
                <div>
                  <i className="is-muted" />
                  <span>Có đơn hàng, chưa rõ ngày đặt</span>
                  <strong>{number(data.unknownLastOrderCount)}</strong>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="customer-overview__panel customer-overview__panel--top"
          aria-labelledby="customer-overview-inactive"
        >
          <header>
            <div>
              <h2 id="customer-overview-inactive">Khách lâu chưa đặt đơn</h2>
              <p>Khách đã có đơn hàng nhưng hơn 90 ngày chưa đặt lại</p>
            </div>
            {data.inactive.length > 5 && (
              <button
                type="button"
                className="customer-overview__text-action"
                onClick={() => setShowAllInactive(value => !value)}
              >
                {showAllInactive ? 'Thu gọn' : `Xem tất cả ${number(data.inactive.length)} khách`}
              </button>
            )}
          </header>
          <div className="customer-overview__age-summary">
            {ageLabels.map((label, index) => (
              <div key={label}>
                <strong>{number(data.inactiveAgeCounts[index])}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="customer-overview__list-heading">
            <span>Khách cần xem lại</span>
            <span>Đơn hàng gần nhất · Số ngày</span>
          </div>
          {data.inactive.length ? (
            <div className={`customer-overview__inactive-list ${showAllInactive ? 'is-expanded' : ''}`}>
              {(showAllInactive ? data.inactive : data.inactive.slice(0, 5)).map(row => (
                <button
                  type="button"
                  key={row.customer.id}
                  onClick={() => onOpenCustomer(row.customer)}
                  aria-label={`Mở hồ sơ ${row.customer.companyName}, ${number(row.daysSinceLastOrder || 0)} ngày chưa đặt đơn`}
                >
                  <span title={row.customer.companyName}>{row.customer.companyName}</span>
                  <small>{date(row.lastOrderAt)}</small>
                  <strong>{number(row.daysSinceLastOrder || 0)} ngày</strong>
                </button>
              ))}
            </div>
          ) : (
            <p className="customer-overview__empty">Chưa có khách nào quá 90 ngày chưa đặt lại.</p>
          )}
        </section>
      </div>

      <div className="customer-overview__bottom-grid">
        <section
          className="customer-overview__panel customer-overview__panel--bottom customer-overview__panel--province"
          aria-labelledby="customer-overview-province"
        >
          <header>
            <div>
              <h2 id="customer-overview-province">
                {openedProvince ? `Khách hàng tại ${openedProvince.label}` : 'Khách hàng theo tỉnh thành'}
              </h2>
              <p>
                {openedProvince
                  ? `${number(openedProvince.rows.length)} khách hàng · chọn tên để mở hồ sơ`
                  : 'Số khách theo địa bàn · chọn cột để xem danh sách'}
              </p>
            </div>
            {openedProvince && (
              <button
                type="button"
                className="customer-overview__text-action"
                onClick={() => setSelectedProvince(null)}
              >
                Quay lại biểu đồ
              </button>
            )}
          </header>
          {openedProvince ? (
            <div className="customer-overview__province-list">
              {openedProvince.rows.map(row => (
                <button
                  type="button"
                  key={row.customer.id}
                  onClick={() => onOpenCustomer(row.customer)}
                  title={row.customer.companyName}
                >
                  {row.customer.companyName}
                </button>
              ))}
            </div>
          ) : provinceColumns.length ? (
            <div className="customer-overview__province-chart">
              <div className="customer-overview__province-columns">
                {provinceColumns.map(province => (
                  <button
                    type="button"
                    key={province.label}
                    className="customer-overview__province-column"
                    onClick={() => setSelectedProvince(province.label)}
                    title={`${province.label}: ${number(province.rows.length)} khách`}
                    aria-label={`Xem ${number(province.rows.length)} khách tại ${province.label}`}
                  >
                    <strong>{number(province.rows.length)}</strong>
                    <span
                      className="customer-overview__province-bar"
                      style={{ height: `${Math.max(3, (province.rows.length / provinceMax) * 190)}px` }}
                    />
                    <small>{province.label}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="customer-overview__empty">Chưa có khách hàng để thống kê theo tỉnh thành.</p>
          )}
        </section>

        <section
          className="customer-overview__panel customer-overview__panel--bottom"
          aria-labelledby="customer-overview-value"
        >
          <header>
            <div>
              <h2 id="customer-overview-value">Khách mua nhiều</h2>
              <p>Top 5 theo tổng giá trị đơn hàng</p>
            </div>
          </header>
          <RankBars
            rows={data.highestValue}
            measure={row => row.orderValue}
            display={compactMoney}
            exact={money}
            color="blue"
            onOpenCustomer={onOpenCustomer}
          />
          <p className="customer-overview__panel-note">Giá trị đơn hàng, chưa phải tiền đã thu.</p>
        </section>

        <section
          className="customer-overview__panel customer-overview__panel--bottom"
          aria-labelledby="customer-overview-orders"
        >
          <header>
            <div>
              <h2 id="customer-overview-orders">Khách nhiều đơn hàng</h2>
              <p>Top 5 theo số đơn từ trước đến nay</p>
            </div>
          </header>
          <RankBars
            rows={data.mostOrders}
            measure={row => row.orderCount}
            display={value => `${number(value)} đơn hàng`}
            exact={value => `${number(value)} đơn hàng`}
            color="teal"
            onOpenCustomer={onOpenCustomer}
          />
          <p className="customer-overview__panel-note">Chọn tên khách để mở hồ sơ và lịch sử đơn hàng.</p>
        </section>
      </div>
    </div>
  );
}
