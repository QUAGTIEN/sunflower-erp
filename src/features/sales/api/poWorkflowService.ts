/** Financial transitions require an explicit Accounting document, never a queue click. */
export function assertManualFinancialTransition(status: string) {
  if (['waiting_receivable', 'waiting_discount', 'invoiced', 'debt_collected'].includes(status)) throw new Error('Ghi nhận công nợ và thanh toán tại Kế toán → Công nợ & thu chi.');
}
