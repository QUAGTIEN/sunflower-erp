import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { codeCounterKey, codeMonth, formatDocumentCode } from '../src/shared/utils/documentCodes.js';

/**
 * Issues D-MA1 codes of one prefix inside a server transaction. The counter is read when the issuer is created, so
 * create it with the other reads; call `commit` with the writes so the month's counter moves past every code issued.
 */
export async function documentCodeIssuer(tx: Transaction, firestore: Firestore, prefix: string, date: Date) {
  const month = codeMonth(date);
  const ref = firestore.collection('code_counters').doc(codeCounterKey(prefix, month));
  let sequence = Number((await tx.get(ref)).data()?.sequence || 0);
  return {
    next: () => formatDocumentCode(prefix, month, ++sequence),
    commit: () => tx.set(ref, { sequence, updatedAt: date.toISOString() })
  };
}
