import { useEffect, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { loadFinishedGoods } from '../api/finishedGoodsService';
import { canPostGoods, canReadGoods, GOODS_KINDS, type GoodsVoucher } from '../model/finishedGoods';
import { stockNumber } from '../model/warehouse';
import { GoodsVoucherDialog } from './GoodsVoucherDialog';
export function ProductionGoodsLedger({
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
  const [vouchers, setVouchers] = useState<GoodsVoucher[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [creating, setCreating] = useState(false);
  const permitted = canReadGoods(currentUser);
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void loadFinishedGoods()
      .then(data => {
        if (!cancelled) {
          setVouchers(data.vouchers.filter(row => row.sourceType === 'production' && row.sourceId === orderId));
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được phiếu thành phẩm.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, refresh, permitted]);
  if (!permitted) return null;
  return (
    <section className="lsx-section">
      <div className="lsx-heading">
        <h3>Nhập thành phẩm thực tế</h3>
        <div className="lsx-actions">
          <button
            className="btn btn-outline"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRefresh(value => value + 1);
            }}
          >
            Tải lại
          </button>
          {status === 'completed' && canPostGoods(currentUser) && (
            <button className="btn btn-outline" disabled={loading || !!error} onClick={() => setCreating(true)}>
              Nhập thành phẩm từ QC
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Đang tải…</p>}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Phiếu</th>
              <th>Ngày</th>
              <th>Nghiệp vụ</th>
              <th>Mã / số lượng cơ sở</th>
              <th>Người ghi</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map(voucher => (
              <tr key={voucher.id}>
                <td>
                  {voucher.code}
                  {voucher.reversedBy ? ' · Đã đảo' : ''}
                </td>
                <td>{voucher.postingDate}</td>
                <td>{GOODS_KINDS[voucher.kind]}</td>
                <td
                  title={voucher.lines
                    .map(line => `${line.code}: ${stockNumber(line.delta)} ${line.baseUnit}`)
                    .join('; ')}
                >
                  {voucher.lines.map(line => `${line.code}: ${stockNumber(line.delta)} ${line.baseUnit}`).join('; ')}
                </td>
                <td>{voucher.actorName}</td>
              </tr>
            ))}
            {!loading && !vouchers.length && (
              <tr>
                <td colSpan={5}>Chưa nhập thành phẩm thực tế.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {creating && (
        <GoodsVoucherDialog
          currentUser={currentUser}
          options={{ kind: 'production_receipt', sourceId: orderId }}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setLoading(true);
            setRefresh(value => value + 1);
            onRefresh();
          }}
        />
      )}
    </section>
  );
}
