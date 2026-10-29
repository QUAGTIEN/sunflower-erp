import { useEffect, useMemo, useState } from 'react';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import { sha256Hex } from '@/shared/utils/sha256Hex';
import { warehouseDate } from '@/features/inventory/model/warehouse';
import {
  buildAccountingReports,
  REPORT_COLLECTIONS,
  reportFingerprintInputs,
  type ReportSnapshots
} from '../model/accountingReportView';

type ReportName = keyof ReportSnapshots;
interface HashedSnapshots {
  snapshots: ReportSnapshots;
  digests: Map<string, string>;
  asOf: string;
  loadedAt: string;
}

export const REPORT_LIVE_QUERIES: LiveQuery<ReportName>[] = REPORT_COLLECTIONS.map(([name, collection]) => ({
  name,
  collection
}));
const NO_QUERIES: LiveQuery<ReportName>[] = [];
const MESSAGES = {
  readError: 'Không tải được báo cáo. Kiểm tra kết nối và thử lại.',
  unavailable: 'Báo cáo cần kết nối Firebase; chế độ dữ liệu local không hỗ trợ báo cáo.'
};
const HASH_ERROR = 'Trình duyệt không tính được dấu đối soát nguồn. Mở ERP qua HTTPS rồi thử lại.';

/**
 * Reads Báo cáo straight from Firestore. Fingerprints are hashed asynchronously with Web Crypto, so the report
 * keeps the previous figures until the newest snapshot is hashed instead of flashing back to a skeleton.
 */
export function useAccountingReportsLiveData(allowed: boolean) {
  const live = useLiveCollections(allowed ? REPORT_LIVE_QUERIES : NO_QUERIES, MESSAGES);
  const [hashed, setHashed] = useState<HashedSnapshots | null>(null);
  const [hashError, setHashError] = useState('');

  useEffect(() => {
    const snapshots = live.snapshots as ReportSnapshots | null;
    if (!snapshots || !allowed) return;
    let cancelled = false;
    const texts = [...new Set(reportFingerprintInputs(snapshots).map(input => JSON.stringify(input)))];
    Promise.all(texts.map(async text => [text, await sha256Hex(text)] as const))
      .then(pairs => {
        if (cancelled) return;
        setHashError('');
        setHashed({ snapshots, digests: new Map(pairs), asOf: warehouseDate(), loadedAt: new Date().toISOString() });
      })
      .catch(() => {
        if (!cancelled) setHashError(HASH_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [live.snapshots, allowed]);

  const data = useMemo(() => {
    if (!hashed || !allowed) return null;
    const fingerprint = (input: unknown) => hashed.digests.get(JSON.stringify(input)) || '';
    return buildAccountingReports(hashed.snapshots, fingerprint, hashed.asOf, hashed.loadedAt);
  }, [hashed, allowed]);
  const error = live.error || hashError;
  return { data, loading: !data && !error && allowed, error, reload: live.reload };
}
