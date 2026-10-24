import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { loadWarehouse } from '../api/warehouseService';
import {
  canPostWarehouse,
  canReadWarehouse,
  stockNumber,
  WAREHOUSE_KINDS,
  type WarehouseData,
  type WarehouseKind
} from '../model/warehouse';
import { WarehouseVoucherDialog } from './WarehouseVoucherDialog';

export function ProductionMaterialLedger({
  orderId,
  status,
  currentUser,
  onRefresh
}: {
  orderId: string;
  status: string;
  currentUser: UserProfile;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<WarehouseData | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [kind, setKind] = useState<Exclude<WarehouseKind, 'reversal'> | null>(null);
  const permitted = canReadWarehouse(currentUser);
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void loadWarehouse()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử NVL.');
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, permitted, refresh]);
  if (!permitted) return null;
  const vouchers =
    data?.vouchers
      .filter(voucher => voucher.sourceType === 'production' && voucher.sourceId === orderId)
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt)) || [];
  return (
    <section className="lsx-section">
      <div className="lsx-heading">
        <h3>Cấp / hoàn NVL thực tế</h3>
        <div className="lsx-actions">
          <IconButton
            label="Tải lại"
            icon={<RefreshCw />}
            onClick={() => {
              setData(null);
              setRefresh(value => value + 1);
            }}
          />
          {canPostWarehouse(currentUser) && (
            <>
              {['released', 'producing'].includes(status) && (
                <button className="btn btn-outline" disabled={!data} onClick={() => setKind('production_issue')}>
                  Cấp NVL
                </button>
              )}
              {['released', 'producing', 'completed'].includes(status) && (
                <button className="btn btn-outline" disabled={!data} onClick={() => setKind('production_return')}>
                  Hoàn NVL
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Đang tải phiếu kho…</p>}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Phiếu kho</th>
              <th>Ngày</th>
              <th>Loại</th>
              <th>Mã / số lượng cơ sở</th>
              <th>Người ghi sổ</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map(voucher => (
              <tr key={voucher.id}>
                <td>{voucher.code}</td>
                <td>{voucher.postingDate}</td>
                <td>{WAREHOUSE_KINDS[voucher.kind]}</td>
                <td
                  title={voucher.lines
                    .map(line => `${line.code}: ${stockNumber(line.delta)} ${line.baseUnit}`)
                    .join('; ')}
                >
                  {voucher.lines.map(line => `${line.code}: ${stockNumber(line.delta)} ${line.baseUnit}`).join('; ')}
                </td>
                <td>{voucher.actorName}</td>
                <td>{voucher.reversedBy ? 'Đã đảo' : 'Đã ghi sổ'}</td>
              </tr>
            ))}
            {data && !vouchers.length && (
              <tr>
                <td colSpan={6}>Chưa ghi nhận cấp / hoàn thực tế.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {kind && (
        <WarehouseVoucherDialog
          currentUser={currentUser}
          initialSourceId={orderId}
          initialKind={kind}
          onClose={() => setKind(null)}
          onSaved={() => {
            setKind(null);
            setData(null);
            setRefresh(value => value + 1);
            onRefresh();
          }}
        />
      )}
    </section>
  );
}
