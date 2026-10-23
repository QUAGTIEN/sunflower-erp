import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { AdminApiError } from './adminUsers.js';

export async function assertPhysicalSourceUnbilled(tx: Transaction, firestore: Firestore, voucherId: string) {
  const states = await Promise.all(['ar', 'ap'].map(side => tx.get(firestore.collection('finance_source_state').doc(`${side}_${voucherId}`))));
  if (states.some(doc => Object.values(doc.data()?.lines || {}).some(line => Number((line as { used?: number }).used) > 0))) {
    throw new AdminApiError(409, 'Phiếu hàng đã được ghi công nợ/điều chỉnh tiền. Đảo chứng từ kế toán liên quan trước khi đảo phiếu hàng.');
  }
}
