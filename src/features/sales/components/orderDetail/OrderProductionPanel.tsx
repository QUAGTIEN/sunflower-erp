import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import { LoadingStatus } from '@/components/LoadingStates';
import {
  PRODUCTION_STATUSES,
  productionQuantityLabel,
  type CommandRecord,
  type ProductionStatus
} from '@/features/production/model/productionOrder';
import { formatDate } from '@/shared/utils/dateFormatting';

const QUERIES: LiveQuery<'commands'>[] = [{ name: 'commands', collection: 'production_commands' }];
const MESSAGES = {
  readError: 'Không tải được lệnh sản xuất. Vui lòng thử lại.',
  unavailable: 'Lệnh sản xuất chỉ xem được khi kết nối Firebase.'
};

/** Current orders list every PO they draw from in poIds; orders from the old flow keep a single poId. */
const belongsToOrder = (command: CommandRecord, poId: string) =>
  command.poId === poId || (Array.isArray(command.poIds) && command.poIds.includes(poId));

const statusLabel = (command: CommandRecord) =>
  command.productionOrderVersion === 2
    ? PRODUCTION_STATUSES[command.status as ProductionStatus] || 'Chưa rõ'
    : 'Lệnh theo luồng cũ';

/** Read-only list of the order's production orders (Sale included, D-PO1); opening one stays in Sản xuất. */
export function OrderProductionPanel({ poId }: { poId: string }) {
  const live = useLiveCollections(QUERIES, MESSAGES);
  const commands = (live.snapshots?.commands || [])
    .map(command => command as CommandRecord)
    .filter(command => !command.deleted && belongsToOrder(command, poId));

  return (
    <div className="order-panel-stack">
      <LoadingStatus loading={live.loading} hasData={Boolean(live.snapshots)} label="Đang tải lệnh sản xuất" />
      {live.error && !live.loading && <p className="order-error">{live.error}</p>}
      {live.snapshots && (
        <div className="table-container">
          <table className="order-plain-table">
            <thead>
              <tr>
                <th>Số LSX</th>
                <th>Trạng thái</th>
                <th>Số lượng</th>
                <th>Ngày cần</th>
                <th>Người chạy máy</th>
              </tr>
            </thead>
            <tbody>
              {commands.map(command => (
                <tr key={String(command.id)}>
                  <td>
                    <strong>{String(command.lsxCode || command.cmdCode || command.id)}</strong>
                  </td>
                  <td>{statusLabel(command)}</td>
                  <td>{productionQuantityLabel(command)}</td>
                  <td>{formatDate(command.deliveryDeadline, 'vi-VN', '—')}</td>
                  <td>{String(command.operatorName || '—')}</td>
                </tr>
              ))}
              {!commands.length && (
                <tr>
                  <td className="order-empty" colSpan={5}>
                    Chưa có lệnh sản xuất. Kế toán lập lệnh sau khi khách duyệt mẫu thiết kế.
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
