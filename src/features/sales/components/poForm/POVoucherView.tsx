import { formatDate } from '@/shared/utils/dateFormatting';

interface POVoucherInfoProps {
  customerName: string;
  customerRank: string;
  customerPoCode: string;
  expectedDeliveryDate: string;
  createdAt?: string;
  notes: string;
}

function VoucherField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`po-voucher-field${wide ? ' po-voucher-field--wide' : ''}`}>
      <span className="po-voucher-field__label">{label}</span>
      <span className="po-voucher-field__value" title={value}>
        {value || '—'}
      </span>
    </div>
  );
}

/** Header of the order voucher in view mode: the same fields the order form asks for, laid out like a MISA voucher. */
export function POVoucherInfo({
  customerName,
  customerRank,
  customerPoCode,
  expectedDeliveryDate,
  createdAt,
  notes
}: POVoucherInfoProps) {
  return (
    <section className="po-voucher-info" aria-label="Thông tin đơn hàng">
      <VoucherField label="Khách hàng" value={customerName} wide />
      <VoucherField label="Hạng khách hàng" value={customerRank ? `Hạng ${customerRank}` : ''} />
      <VoucherField label="Số PO khách" value={customerPoCode} />
      <VoucherField
        label="Ngày giao dự kiến"
        value={expectedDeliveryDate ? formatDate(expectedDeliveryDate, 'vi-VN') : ''}
      />
      <VoucherField label="Ngày tạo đơn" value={createdAt ? formatDate(createdAt, 'vi-VN') : ''} />
      <div className="po-voucher-field po-voucher-field--full">
        <span className="po-voucher-field__label">Ghi chú đơn hàng</span>
        <span className="po-voucher-field__value po-voucher-field__value--text">{notes || '—'}</span>
      </div>
    </section>
  );
}

interface POVoucherSummaryProps {
  quantitiesByUnit: Map<string, number>;
  totalBeforeVat: number;
  totalVat: number;
  totalAfterVat: number;
}

const formatMoney = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;

export function POVoucherSummary({ quantitiesByUnit, totalBeforeVat, totalVat, totalAfterVat }: POVoucherSummaryProps) {
  const quantities = [...quantitiesByUnit]
    .map(([unit, quantity]) => `${quantity.toLocaleString('vi-VN')} ${unit}`)
    .join(' · ');
  return (
    <dl className="po-voucher-summary">
      <dt>Số lượng theo ĐVT</dt>
      <dd>{quantities || '—'}</dd>
      <dt>Tổng tiền chưa VAT</dt>
      <dd>{formatMoney(totalBeforeVat)}</dd>
      <dt>Thuế GTGT (VAT)</dt>
      <dd>{formatMoney(totalVat)}</dd>
      <dt className="po-voucher-summary__total">Tổng cộng (gồm VAT)</dt>
      <dd className="po-voucher-summary__total">{formatMoney(totalAfterVat)}</dd>
    </dl>
  );
}
