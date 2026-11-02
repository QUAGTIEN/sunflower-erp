import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import { LoadingStatus } from '@/components/LoadingStates';
import { TRIP_STATUS_LABELS, tripsForOrder, type DeliveryTripRecord } from '@/features/delivery/model/deliveryTrips';
import { formatDate } from '@/shared/utils/dateFormatting';

const QUERIES: LiveQuery<'trips'>[] = [{ name: 'trips', collection: 'deliveries' }];
const MESSAGES = {
  readError: 'Không tải được chuyến giao hàng. Vui lòng thử lại.',
  unavailable: 'Chuyến giao hàng chỉ xem được khi kết nối Firebase.'
};

/** Read-only list of the trips that carry this order (Sale included, D-PO1). */
export function OrderDeliveryPanel({ poId }: { poId: string }) {
  const live = useLiveCollections(QUERIES, MESSAGES);
  const trips = tripsForOrder((live.snapshots?.trips || []) as DeliveryTripRecord[], poId);

  return (
    <div className="order-panel-stack">
      <LoadingStatus loading={live.loading} hasData={Boolean(live.snapshots)} label="Đang tải chuyến giao hàng" />
      {live.error && !live.loading && <p className="order-error">{live.error}</p>}
      {live.snapshots && (
        <div className="table-container">
          <table className="order-plain-table">
            <thead>
              <tr>
                <th>Mã chuyến</th>
                <th>Ngày giao</th>
                <th>Trạng thái chuyến</th>
                <th>Tài xế / xe</th>
                <th className="order-number">SL đã giao</th>
              </tr>
            </thead>
            <tbody>
              {trips.map(({ trip, stop }) => (
                <tr key={trip.id}>
                  <td>
                    <strong>{trip.delCode || trip.id}</strong>
                  </td>
                  <td>{formatDate(trip.deliveryDate, 'vi-VN', '—')}</td>
                  <td>{TRIP_STATUS_LABELS[trip.status || ''] || 'Chưa rõ'}</td>
                  <td title={[trip.driverName, trip.vehicleName].filter(Boolean).join(' · ')}>
                    {[trip.driverName, trip.vehicleName].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="order-number">
                    {stop.deliveredQty === undefined ? '—' : Number(stop.deliveredQty).toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
              {!trips.length && (
                <tr>
                  <td className="order-empty" colSpan={5}>
                    Chưa có chuyến giao. Giao hàng bắt đầu khi lệnh sản xuất hoàn thành.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
