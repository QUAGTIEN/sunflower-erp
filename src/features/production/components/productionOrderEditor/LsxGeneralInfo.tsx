import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { ProductionMachine } from '../../api/machineService';
import { PRODUCTION_PRINT_TEMPLATES, type ProductionPrintTemplate } from '../../model/productionOrder';

export interface GeneralInfoValues {
  deliveryDeadline: string;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: string;
  machineId: string;
  operatorId: string;
  shift: string;
  printTemplate: ProductionPrintTemplate;
  technicalNotes: string;
  notes: string;
}
interface Props {
  values: GeneralInfoValues;
  /** Labels of the customers whose lines are on the order (D-LSX2). */
  customers: string[];
  machines: ProductionMachine[];
  operators: { uid: string; displayName: string }[];
  onChange: (patch: Partial<GeneralInfoValues>) => void;
  onTemplateChange: (id: ProductionPrintTemplate['id']) => void;
}

const PRIORITIES = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Hơi gấp' },
  { value: 'urgent', label: 'Gấp' }
];
const VISIBLE_CUSTOMER_CHIPS = 2;

/**
 * The order header as a compact voucher form: labels beside their fields in three groups, so the item grid stays
 * on screen. It folds to one summary line once filled.
 */
export function LsxGeneralInfo({ values, customers, machines, operators, onChange, onTemplateChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const machine = machines.find(entry => entry.id === values.machineId);
  const priorityLabel = PRIORITIES.find(option => option.value === values.priority)?.label || 'Bình thường';
  const summary = [
    customers.length ? customers.join(', ') : 'Chưa chọn hàng',
    values.deliveryDeadline ? `Cần ${formatDate(values.deliveryDeadline)}` : 'Chưa có ngày cần',
    priorityLabel,
    machine ? `Máy ${machine.code}` : '',
    values.shift
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="lsx-section lsx-general" aria-labelledby="lsx-general-title">
      <div className="lsx-section-header">
        <h3 id="lsx-general-title">Thông tin chung</h3>
        {collapsed && (
          <span className="lsx-general-summary" title={summary}>
            {summary}
          </span>
        )}
        <IconButton
          label={collapsed ? 'Mở rộng thông tin chung' : 'Thu gọn thông tin chung'}
          icon={collapsed ? <ChevronDown /> : <ChevronUp />}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(value => !value)}
        />
      </div>
      {!collapsed && (
        <div className="lsx-general-groups">
          <fieldset className="lsx-general-group">
            <legend>Đơn hàng &amp; khách</legend>
            <div className="lsx-inline-field">
              <span>Khách hàng</span>
              <div className="lsx-customer-chips" title={customers.join('; ')}>
                {customers.length ? (
                  <>
                    {customers.slice(0, VISIBLE_CUSTOMER_CHIPS).map(customer => (
                      <span key={customer} className="lsx-customer-chip">
                        {customer}
                      </span>
                    ))}
                    {customers.length > VISIBLE_CUSTOMER_CHIPS && (
                      <span className="lsx-customer-chip is-more">+{customers.length - VISIBLE_CUSTOMER_CHIPS}</span>
                    )}
                  </>
                ) : (
                  <span className="lsx-muted">Chưa chọn hàng</span>
                )}
              </div>
            </div>
            <label className="lsx-inline-field is-required">
              <span>Ngày cần *</span>
              <input
                type="date"
                value={values.deliveryDeadline}
                onChange={event => onChange({ deliveryDeadline: event.target.value })}
              />
            </label>
            <div className="lsx-inline-field">
              <span id="lsx-priority-label">Ưu tiên</span>
              <div className="lsx-priority" role="radiogroup" aria-labelledby="lsx-priority-label">
                {PRIORITIES.map(option => (
                  <label key={option.value} className={`lsx-priority-option is-${option.value}`}>
                    <input
                      type="radio"
                      name="lsx-priority"
                      value={option.value}
                      checked={values.priority === option.value}
                      onChange={() => onChange({ priority: option.value })}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          <fieldset className="lsx-general-group">
            <legend>Kế hoạch sản xuất</legend>
            <div className="lsx-inline-field">
              <span>Dự kiến</span>
              <div className="lsx-date-range">
                <input
                  type="date"
                  aria-label="Bắt đầu dự kiến"
                  value={values.plannedStartDate}
                  onChange={event => onChange({ plannedStartDate: event.target.value })}
                />
                <span aria-hidden="true">→</span>
                <input
                  type="date"
                  aria-label="Hoàn thành dự kiến"
                  min={values.plannedStartDate || undefined}
                  value={values.plannedEndDate}
                  onChange={event => onChange({ plannedEndDate: event.target.value })}
                />
              </div>
            </div>
            <label className="lsx-inline-field">
              <span>Máy sản xuất</span>
              <select value={values.machineId} onChange={event => onChange({ machineId: event.target.value })}>
                <option value="">Chọn máy (bắt buộc khi phát hành)</option>
                {machines.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} — {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lsx-inline-field">
              <span>Người chạy máy</span>
              <select value={values.operatorId} onChange={event => onChange({ operatorId: event.target.value })}>
                <option value="">Chọn nhân sự</option>
                {operators.map(user => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="lsx-inline-field">
              <span>Ca / tổ</span>
              <input
                value={values.shift}
                maxLength={100}
                onChange={event => onChange({ shift: event.target.value })}
                placeholder="Ca sáng / Tổ in 01"
              />
            </label>
          </fieldset>
          <fieldset className="lsx-general-group">
            <legend>Phiếu &amp; ghi chú</legend>
            <label className="lsx-inline-field">
              <span>Mẫu phiếu</span>
              <select
                value={values.printTemplate.id}
                onChange={event => onTemplateChange(event.target.value as ProductionPrintTemplate['id'])}
              >
                {Object.entries(PRODUCTION_PRINT_TEMPLATES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="lsx-inline-field">
              <span>Yêu cầu kỹ thuật</span>
              <input
                value={values.technicalNotes}
                maxLength={3000}
                title={values.technicalNotes}
                onChange={event => onChange({ technicalNotes: event.target.value })}
                placeholder="Màu in, keo, kiểm tra trước khi chạy…"
              />
            </label>
            <label className="lsx-inline-field">
              <span>Ghi chú chung</span>
              <input
                value={values.notes}
                maxLength={3000}
                title={values.notes}
                onChange={event => onChange({ notes: event.target.value })}
                placeholder="Lưu ý QA, đóng gói…"
              />
            </label>
          </fieldset>
        </div>
      )}
    </section>
  );
}
