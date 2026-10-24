import type { DebtDocument, DebtLine, DebtSide, LedgerEntry, MoneyFund } from './accountingLedger.js';

export interface PeriodValues {
  opening: number;
  increase: number;
  decrease: number;
  allocated: number;
  closing: number;
}
export interface DebtReportLine extends PeriodValues {
  document: DebtDocument;
  line: DebtLine;
  age: string;
  daysOverdue: number;
}
export interface PartnerReport extends PeriodValues {
  side: DebtSide;
  partnerId: string;
  partnerName: string;
  advanceOpening: number;
  advanceClosing: number;
  cashIn: number;
  cashOut: number;
}
export const AGE_BUCKETS = [
  'Chưa đến hạn',
  'Đến hạn',
  '1–30 ngày',
  '31–60 ngày',
  '61–90 ngày',
  'Trên 90 ngày',
  'Chưa có hạn'
] as const;
export function validReportDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function overdueDays(due: string, at: string): number | null {
  return validReportDate(due) && validReportDate(at)
    ? Math.round((Date.parse(`${at}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000)
    : null;
}
export function ageBucket(days: number | null) {
  return days === null
    ? AGE_BUCKETS[6]
    : days < 0
      ? AGE_BUCKETS[0]
      : days === 0
        ? AGE_BUCKETS[1]
        : days <= 30
          ? AGE_BUCKETS[2]
          : days <= 60
            ? AGE_BUCKETS[3]
            : days <= 90
              ? AGE_BUCKETS[4]
              : AGE_BUCKETS[5];
}
const emptyValues = (): PeriodValues => ({ opening: 0, increase: 0, decrease: 0, allocated: 0, closing: 0 });
const add = (a: number, b: number) => {
  const value = a + b;
  if (!Number.isSafeInteger(value)) throw new Error('Tổng báo cáo vượt giới hạn số nguyên an toàn.');
  return value;
};

/** Replay dated events, including reversals on their own dates. Never use mutable settled/voided for history. */
export function buildDebtReport(
  documents: DebtDocument[],
  funds: MoneyFund[],
  entries: LedgerEntry[],
  from: string,
  to: string
) {
  if (!validReportDate(from) || !validReportDate(to) || from > to) throw new Error('Chọn khoảng ngày báo cáo hợp lệ.');
  const lines = new Map<string, DebtReportLine>();
  const partners = new Map<string, PartnerReport>();
  const partner = (side: DebtSide, partnerId: string, partnerName: string) => {
    const key = `${side}:${partnerId}`;
    if (!partners.has(key))
      partners.set(key, {
        ...emptyValues(),
        side,
        partnerId,
        partnerName,
        advanceOpening: 0,
        advanceClosing: 0,
        cashIn: 0,
        cashOut: 0
      });
    return partners.get(key)!;
  };
  for (const document of documents) {
    if (document.postingDate > to) continue;
    if (!entries.some(e => e.documentId === document.id && e.kind === document.kind))
      throw new Error('Chứng từ thiếu phiếu ghi sổ gốc; cần đối soát.');
    for (const line of document.lines) {
      const days = overdueDays(document.dueDate, to);
      lines.set(`${document.id}:${line.id}`, {
        ...emptyValues(),
        document,
        line,
        age: ageBucket(days),
        daysOverdue: days ?? 0
      });
    }
  }
  for (const fund of funds)
    if (
      fund.postingDate <= to &&
      !entries.some(e => e.fundId === fund.id && ['payment', 'opening_advance'].includes(e.kind))
    )
      throw new Error('Khoản tiền thiếu phiếu ghi sổ gốc; cần đối soát.');
  const applyDebt = (key: string, date: string, delta: number, allocation = false) => {
    const row = lines.get(key);
    if (!row) throw new Error('Thiếu dòng chứng từ để đối soát lịch sử công nợ.');
    if (date < from) row.opening = add(row.opening, delta);
    else if (allocation) row.allocated = add(row.allocated, -delta);
    else if (delta >= 0) row.increase = add(row.increase, delta);
    else row.decrease = add(row.decrease, -delta);
    row.closing = add(row.closing, delta);
  };
  for (const entry of entries) {
    if (entry.postingDate > to) continue;
    const reversal = entry.kind === 'reversal',
      kind = reversal ? entry.originalKind : entry.kind,
      sign = reversal ? -1 : 1;
    const p = partner(entry.side, entry.partnerId, entry.partnerName);
    if (kind === 'charge' || kind === 'opening') {
      const doc = documents.find(d => d.id === entry.documentId);
      if (!doc) throw new Error('Thiếu chứng từ gốc để lập báo cáo.');
      for (const line of doc.lines) applyDebt(`${doc.id}:${line.id}`, entry.postingDate, line.gross * sign);
    }
    if (kind === 'allocation')
      for (const a of entry.allocations)
        applyDebt(`${a.documentId}:${a.lineId}`, entry.postingDate, -a.amount * sign, true);
    if (kind === 'adjustment')
      for (const a of entry.adjustments) applyDebt(`${a.documentId}:${a.lineId}`, entry.postingDate, a.amount * sign);
    // Entry.amount is already signed on reversals; allocation/adjustment arrays retain original signs.
    const advanceDelta =
      kind === 'payment' || kind === 'opening_advance'
        ? entry.amount
        : kind === 'allocation' || kind === 'refund'
          ? -entry.amount
          : 0;
    if (entry.fundId && !funds.some(f => f.id === entry.fundId))
      throw new Error('Thiếu khoản tiền để đối soát lịch sử.');
    if (entry.postingDate < from) p.advanceOpening = add(p.advanceOpening, advanceDelta);
    p.advanceClosing = add(p.advanceClosing, advanceDelta);
    if (entry.postingDate >= from) {
      if (entry.cashDelta >= 0) p.cashIn = add(p.cashIn, entry.cashDelta);
      else p.cashOut = add(p.cashOut, -entry.cashDelta);
    }
  }
  for (const row of lines.values()) {
    const p = partner(row.document.side, row.document.partnerId, row.document.partnerName);
    for (const key of ['opening', 'increase', 'decrease', 'allocated', 'closing'] as const)
      p[key] = add(p[key], row[key]);
  }
  return { lines: [...lines.values()], partners: [...partners.values()] };
}

/** Exact current ledger balance, kept separate from unverified legacy invoices and advances. */
export function currentPartnerBalances(documents: DebtDocument[], funds: MoneyFund[]) {
  const result = new Map<string, { side: DebtSide; partnerId: string; debt: number; advance: number }>();
  const row = (side: DebtSide, partnerId: string) => {
    const key = `${side}:${partnerId}`;
    if (!result.has(key)) result.set(key, { side, partnerId, debt: 0, advance: 0 });
    return result.get(key)!;
  };
  for (const d of documents.filter(d => !d.voided))
    for (const l of d.lines) {
      const r = row(d.side, d.partnerId);
      r.debt = add(r.debt, l.gross + l.adjustment - l.settled);
    }
  for (const f of funds.filter(f => !f.voided)) {
    const r = row(f.side, f.partnerId);
    r.advance = add(r.advance, f.amount - f.used - f.refunded);
  }
  return [...result.values()];
}

export function reportCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    // Neutralize spreadsheet formulas in external names/references, retain numeric cells.
    const raw = value === null ? '' : String(value),
      safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
