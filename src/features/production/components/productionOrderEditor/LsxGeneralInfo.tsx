import type { ProductionMachine } from '../../api/machineService';
import { PRODUCTION_PRIORITIES } from '../../model/productionOrder';

export interface GeneralInfoValues {
  deliveryDeadline: string;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: string;
  machineId: string;
  operatorId: string;
  shift: string;
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
  onPickLines: () => void;
}

const VISIBLE_CUSTOMER_CHIPS = 2;

/** The order header as a compact voucher form: labels beside their fields in three groups. */
export function LsxGeneralInfo({ values, customers, machines, operators, onChange, onPickLines }: Props) {
  return (
    <section className="lsx-section lsx-general" aria-labelledby="lsx-general-title">
      <div className="lsx-section-header">
        <h3 id="lsx-general-title">Thông tin chung</h3>
      </div>
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
            {/* Lines are picked customer by customer, so the picker opens from the customer field. */}
            <button type="button" className="btn btn-outline lsx-pick-button" onClick={onPickLines}>
              Chọn hàng
            </button>
          </div>
          <label className="lsx-inline-field is-required">
            <span>Ngày cần *</span>
            <input
              type="date"
              value={values.deliveryDeadline}
              onChange={event => onChange({ deliveryDeadline: event.target.value })}
            />
          </label>
          <label className="lsx-inline-field">
            <span>Ưu tiên</span>
            <select value={values.priority} onChange={event => onChange({ priority: event.target.value })}>
              {Object.entries(PRODUCTION_PRIORITIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
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
              <option value="">Chọn máy (bắt buộc khi bắt đầu)</option>
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
          <legend>Ghi chú</legend>
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
    </section>
  );
}
