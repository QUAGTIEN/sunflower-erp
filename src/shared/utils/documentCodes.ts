/**
 * Document codes of decision D-MA1: `PREFIX-YYMM-NNNN`, numbered per month in Vietnamese business time.
 * Shared by the browser and the server so both issue the same shape.
 */
export const DOCUMENT_CODE_PREFIXES = { order: 'DH', productionOrder: 'LSX' } as const;

/** YYMM of the date in Asia/Ho_Chi_Minh, the month a document's sequence restarts in. */
export function codeMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: '2-digit',
    month: '2-digit'
  }).formatToParts(date);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value || '';
  return `${part('year')}${part('month')}`;
}

/** Key of the counter that numbers one prefix in one month, e.g. `DH-2610`. */
export const codeCounterKey = (prefix: string, month: string) => `${prefix}-${month}`;

export const formatDocumentCode = (prefix: string, month: string, sequence: number, width = 4) =>
  `${codeCounterKey(prefix, month)}-${String(sequence).padStart(width, '0')}`;
