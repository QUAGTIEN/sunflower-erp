import './LoadingStates.css';

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Thanh tiến trình mảnh ở đầu vùng nội dung khi đang chuyển phân hệ. */
export function PageProgressBar({ active }: { active: boolean }) {
  return (
    <div className={`erp-page-progress${active ? ' is-active' : ''}`} role="progressbar" aria-hidden={!active}>
      <span />
    </div>
  );
}

/** Khung xương bảng: giữ đúng chiều cao hàng để bố cục không nhảy khi dữ liệu về. */
export function TableSkeleton({
  columns = 6,
  rows = 8,
  label = 'Đang tải dữ liệu'
}: {
  columns?: number;
  rows?: number;
  label?: string;
}) {
  return (
    <div className="erp-skeleton-table" role="status" aria-label={label}>
      <div className="erp-skeleton-table__row is-header">
        {range(columns).map(column => (
          <span key={column} className="erp-skeleton-block" />
        ))}
      </div>
      {range(rows).map(row => (
        <div key={row} className="erp-skeleton-table__row">
          {range(columns).map(column => (
            <span key={column} className="erp-skeleton-block" style={{ width: `${55 + ((row + column) % 4) * 12}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Khung xương dải thẻ số liệu. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="erp-skeleton-stats" aria-hidden="true">
      {range(count).map(item => (
        <div key={item} className="erp-skeleton-stats__item">
          <span className="erp-skeleton-block is-short" />
          <span className="erp-skeleton-block is-value" />
        </div>
      ))}
    </div>
  );
}

/** Khung chờ cho một phân hệ đang tải mã nguồn lần đầu. */
export function PageLoadingFallback() {
  return (
    <div className="erp-page-skeleton" role="status" aria-label="Đang tải phân hệ">
      <span className="erp-skeleton-block is-title" />
      <StatSkeleton />
      <TableSkeleton rows={6} label="Đang tải phân hệ" />
    </div>
  );
}

/**
 * Trạng thái tải thống nhất: lần đầu (chưa có dữ liệu) hiện khung xương bảng;
 * đã có dữ liệu thì giữ nguyên nội dung và chỉ báo nhỏ "Đang cập nhật".
 */
export function LoadingStatus({
  loading,
  hasData,
  label = 'Đang tải dữ liệu',
  columns,
  rows = 5
}: {
  loading: boolean;
  hasData: boolean;
  label?: string;
  columns?: number;
  rows?: number;
}) {
  if (!loading) return null;
  if (hasData) return <RefreshingIndicator active />;
  return <TableSkeleton label={label} columns={columns} rows={rows} />;
}

/** Đã có số cũ: giữ nguyên nội dung, chỉ báo nhỏ là đang cập nhật. */
export function RefreshingIndicator({ active, label = 'Đang cập nhật' }: { active: boolean; label?: string }) {
  if (!active) return null;
  return (
    <span className="erp-refreshing" role="status">
      <span className="erp-refreshing__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
