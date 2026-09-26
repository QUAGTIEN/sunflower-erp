import React, { useMemo, useState } from 'react';
import {
  CUSTOMER_INSIGHT_GROUPS,
  CUSTOMER_INSIGHT_ITEMS,
  normalizeCustomerInsightValues
} from '../model/customerInsightCatalog';

type ClassificationFilter = 'all' | 'selected' | 'unselected';

interface CustomerInsightClassificationProps {
  companyName: string;
  values: string[];
  canEdit: boolean;
  onSave: (values: string[]) => Promise<void>;
}

const FILTER_OPTIONS: Array<{ value: ClassificationFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'selected', label: 'Đã chọn' },
  { value: 'unselected', label: 'Chưa chọn' }
];

export const CustomerInsightClassification: React.FC<CustomerInsightClassificationProps> = ({
  companyName,
  values,
  canEdit,
  onSave
}) => {
  const [draft, setDraft] = useState(() => normalizeCustomerInsightValues(values));
  const [savedValues, setSavedValues] = useState(() => normalizeCustomerInsightValues(values));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClassificationFilter>('all');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selected = useMemo(() => new Set(draft), [draft]);
  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
  const hasChanges = useMemo(() => {
    return savedValues.length !== draft.length || savedValues.some(value => !selected.has(value));
  }, [draft.length, savedValues, selected]);

  const toggle = (itemId: string, checked: boolean) => {
    setDraft(current => checked
      ? Array.from(new Set([...current, itemId]))
      : current.filter(value => value !== itemId));
    setMessage('');
  };

  const save = async () => {
    if (!canEdit || !hasChanges || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await onSave(draft);
      setSavedValues(draft);
      setMessage('Đã lưu phân loại khách hàng.');
    } catch {
      setMessage('Không thể lưu phân loại. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(savedValues);
    setSearch('');
    setFilter('all');
    setMessage('');
  };

  return <main className="customer-classification" aria-label={`Phân loại ${companyName}`}>
    <header className="customer-classification__header">
      <div>
        <h2>Phân loại thông tin khách hàng</h2>
        <div className="customer-classification__progress">
          <strong>{draft.length}/{CUSTOMER_INSIGHT_ITEMS.length} mục đã xác nhận</strong>
          <span role="progressbar" aria-label="Tiến độ phân loại" aria-valuemin={0} aria-valuemax={CUSTOMER_INSIGHT_ITEMS.length} aria-valuenow={draft.length}>
            <i style={{ width: `${draft.length / CUSTOMER_INSIGHT_ITEMS.length * 100}%` }} />
          </span>
        </div>
      </div>
      <div className="customer-classification__tools">
        <label>
          <span className="sr-only">Tìm trong {CUSTOMER_INSIGHT_ITEMS.length} mục</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Tìm trong ${CUSTOMER_INSIGHT_ITEMS.length} mục...`} />
        </label>
        <div className="customer-classification__filters" role="group" aria-label="Lọc mục phân loại">
          {FILTER_OPTIONS.map(option => <button key={option.value} type="button" className={filter === option.value ? 'is-active' : ''} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
        <button type="button" className="btn btn-outline" disabled={!hasChanges || saving} onClick={reset}>Đặt lại</button>
        <button type="button" className="btn btn-primary" disabled={!canEdit || !hasChanges || saving} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu phân loại'}</button>
      </div>
    </header>

    {message && <p className={`customer-classification__message ${message.startsWith('Không thể') ? 'is-error' : ''}`} role="status">{message}</p>}
    {!canEdit && <p className="customer-classification__message">Bạn chỉ có quyền xem phân loại của hồ sơ này.</p>}

    <div className="customer-classification__groups">
      {CUSTOMER_INSIGHT_GROUPS.map((group, groupIndex) => {
        const visibleItems = group.items.filter(item => {
          if (normalizedSearch && !item.label.toLocaleLowerCase('vi-VN').includes(normalizedSearch)) return false;
          if (filter === 'selected') return selected.has(item.id);
          if (filter === 'unselected') return !selected.has(item.id);
          return true;
        });
        const selectedCount = group.items.filter(item => selected.has(item.id)).length;
        return <section key={group.id} className="customer-classification__group">
          <header><h3><span>{groupIndex + 1}</span>{group.label}</h3><strong>{selectedCount}/{group.items.length}</strong></header>
          {visibleItems.length > 0 ? <div className="customer-classification__options">
            {visibleItems.map(item => <label key={item.id}>
              <input type="checkbox" checked={selected.has(item.id)} disabled={!canEdit || saving} onChange={event => toggle(item.id, event.target.checked)} />
              <span>{item.label}</span>
            </label>)}
          </div> : <p className="customer-classification__empty">Không có mục phù hợp bộ lọc.</p>}
        </section>;
      })}
    </div>
  </main>;
};
