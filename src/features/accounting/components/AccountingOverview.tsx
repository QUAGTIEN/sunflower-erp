import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { useEffect, useState } from 'react';
import { loadAccountingReports, type AccountingReportData } from '../api/accountingReportsService';
import { buildDebtReport } from '../model/accountingReports';
import { canUseLedger, formatMoney } from '../model/accountingLedger';
import { deadlineAlert, goodsReportAlert } from '../model/operationalReports';
import type { WarehouseActor } from '@/features/inventory/model/warehouse';
export function AccountingOverview({ actor, onOpen }: { actor: WarehouseActor; onOpen: () => void }) {
  const [data, setData] = useState<AccountingReportData | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const allowed = canUseLedger(actor);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void loadAccountingReports()
      .then(d => {
        if (!cancelled) {
          setData(d);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError('Không tải được tổng hợp kế toán.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, actor.uid, refresh]);
  if (!allowed) return null;
  let report: ReturnType<typeof buildDebtReport> | null = null,
    reportError = '';
  try {
    if (data)
      report = buildDebtReport(data.documents, data.funds, data.entries, `${data.asOf.slice(0, 7)}-01`, data.asOf);
  } catch {
    reportError = 'Sổ tiền cần đối soát trước khi tổng hợp.';
  }
  return (
    <section className="card" aria-label="Tổng hợp kế toán">
      <div className="card-header">
        <span className="card-title">Công nợ & cảnh báo</span>
        <IconButton
          label="Tải lại"
          icon={<RefreshCw />}
          onClick={() => {
            setData(null);
            setRefresh(v => v + 1);
          }}
        />
        <button className="btn btn-outline" onClick={onOpen}>
          Xem Kế toán
        </button>
      </div>
      {error || reportError ? (
        <p role="alert">{error || reportError}</p>
      ) : !data || !report ? (
        <p role="status">Đang tải…</p>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Loại nợ · sổ mới</th>
                  <th>Còn nợ</th>
                  <th>Ứng trước riêng</th>
                  <th>Quá hạn</th>
                  <th>Sắp đến hạn (3 ngày)</th>
                </tr>
              </thead>
              <tbody>
                {(['ar', 'ap'] as const).map(side => {
                  const partners = report!.partners.filter(p => p.side === side),
                    lines = report!.lines.filter(l => l.document.side === side && l.closing > 0);
                  return (
                    <tr key={side}>
                      <td>{side === 'ar' ? 'Khách hàng' : 'Nhà cung cấp'}</td>
                      <td>{formatMoney(partners.reduce((n, p) => n + p.closing, 0))}</td>
                      <td>{formatMoney(partners.reduce((n, p) => n + p.advanceClosing, 0))}</td>
                      <td>
                        {formatMoney(
                          lines
                            .filter(l => deadlineAlert(l.document.dueDate, data.asOf, 3, l.closing) === 'Quá hạn')
                            .reduce((n, l) => n + l.closing, 0)
                        )}
                      </td>
                      <td>
                        {formatMoney(
                          lines
                            .filter(l =>
                              ['Sắp đến hạn', 'Đến hạn hôm nay'].includes(
                                deadlineAlert(l.document.dueDate, data.asOf, 3, l.closing)
                              )
                            )
                            .reduce((n, l) => n + l.closing, 0)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Kho: {data.stock.filter(s => s.alert === 'Tồn âm').length} mã tồn âm ·{' '}
            {data.stock.filter(s => s.alert === 'Cần nhập hàng').length} mã dưới ngưỡng ·{' '}
            {data.stock.filter(s => s.alert === 'Chưa thiết lập ngưỡng').length} mã chưa thiết lập. Hàng quá hạn:{' '}
            {data.goods.filter(g => goodsReportAlert(g, data.asOf, 3) === 'Quá hạn').length} dòng. Dữ liệu cũ chưa
            chuyển đổi được xem riêng tại Kế toán.
          </p>
        </>
      )}
    </section>
  );
}
