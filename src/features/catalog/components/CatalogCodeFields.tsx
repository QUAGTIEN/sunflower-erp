import { useEffect, useState } from 'react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import {
  CUSTOMER_SHORT_CODE,
  MATERIAL_GROUPS,
  catalogCodeSeries,
  validateCatalogCodeRequest,
  type CatalogCodeChoice,
  type CatalogKind
} from '../model/itemCatalog';
import './CatalogCodeFields.css';

interface CustomerOption {
  id: string;
  name: string;
  shortCode: string;
}
interface Props {
  kind: CatalogKind;
  value: CatalogCodeChoice;
  onChange: (value: CatalogCodeChoice) => void;
}

/** The code the server will issue, with the number left open, e.g. `TP-AQUA-___`. */
function codePreview(kind: CatalogKind, choice: CatalogCodeChoice, customer?: CustomerOption) {
  try {
    const shortCode = customer?.shortCode || choice.shortCode.toUpperCase();
    const series = catalogCodeSeries(validateCatalogCodeRequest(kind, { ...choice, shortCode }), shortCode);
    if (series.key === 'TP-') return '';
    return `${series.key}-${'_'.repeat(series.width)}`;
  } catch {
    return '';
  }
}

/** Replaces the free code box for new items: the user picks how the code is built and the server numbers it. */
export function CatalogCodeFields({ kind, value, onChange }: Props) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadError, setLoadError] = useState('');
  const needsCustomers = kind === 'finished_good' && value.scheme === 'customer';

  useEffect(() => {
    if (!needsCustomers) return;
    let cancelled = false;
    dbService
      .getCollection('customers')
      .then(rows => {
        if (cancelled) return;
        setCustomers(
          (rows as Record<string, unknown>[])
            .filter(row => !row.deleted)
            .map(row => ({
              id: String(row.id),
              name: String(row.companyName || row.customerName || row.id),
              shortCode: String(row.shortCode || '')
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không tải được danh sách khách hàng. Kiểm tra kết nối và thử lại.');
      });
    return () => {
      cancelled = true;
    };
  }, [needsCustomers]);

  const customer = customers.find(option => option.id === value.customerId);
  const preview = codePreview(kind, value, customer);
  const update = (patch: Partial<CatalogCodeChoice>) => onChange({ ...value, ...patch });

  return (
    <>
      {kind === 'finished_good' && (
        <label>
          Cách cấp mã *
          <select
            value={value.scheme}
            onChange={event => update({ scheme: event.target.value as CatalogCodeChoice['scheme'] })}
          >
            <option value="customer">Thành phẩm theo khách (TP-MÃKH-NNN)</option>
            <option value="standard">Hàng chuẩn / tem trắng (TC-NNNN)</option>
          </select>
        </label>
      )}
      {needsCustomers && (
        <>
          <label>
            Khách hàng *
            <select
              required
              value={value.customerId}
              onChange={event => update({ customerId: event.target.value, shortCode: '' })}
            >
              <option value="">{loadError || 'Chọn khách hàng'}</option>
              {customers.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.shortCode ? ` (${option.shortCode})` : ''}
                </option>
              ))}
            </select>
          </label>
          {customer && !customer.shortCode && (
            <label title="3–5 chữ in hoa hoặc số, bắt đầu bằng chữ. Đặt một lần, không sửa được.">
              Mã khách viết tắt *
              <input
                required
                maxLength={5}
                pattern={CUSTOMER_SHORT_CODE.source}
                value={value.shortCode}
                placeholder="VD: AQUA"
                onChange={event => update({ shortCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              />
            </label>
          )}
        </>
      )}
      {kind === 'raw_material' && (
        <label>
          Nhóm NVL *
          <select required value={value.group} onChange={event => update({ group: event.target.value })}>
            <option value="">Chọn nhóm NVL</option>
            {Object.entries(MATERIAL_GROUPS).map(([group, label]) => (
              <option key={group} value={group}>
                {group} — {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="catalog-code-preview" role="status">
        <span>Mã sẽ cấp</span>
        <strong>{preview || 'Chọn đủ thông tin để xem mã'}</strong>
      </div>
    </>
  );
}
