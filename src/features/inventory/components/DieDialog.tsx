import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mutateItemCatalog } from '@/features/catalog/api/itemCatalogService';
import {
  DIE_CORNERS,
  DIE_CYLINDER_TYPES,
  EMPTY_DIE,
  validateDieInput,
  type DieCorner,
  type DieCylinderType,
  type DieInput,
  type DieRecord
} from '@/features/catalog/model/dieCatalog';
import { showSuccessToast } from '@/shared/feedback/mutationFeedback';

interface Props {
  previous?: DieRecord;
  onClose: () => void;
  onSaved: () => void;
}
type NumericField =
  | 'cylinderSize'
  | 'labelWidth'
  | 'labelHeight'
  | 'cornerRadius'
  | 'labelsAcross'
  | 'labelsAround'
  | 'gapAcross'
  | 'gapAround';

/** The editable fields of a stored die, without its code, status and bookkeeping. */
const inputOf = (die: DieRecord) =>
  Object.fromEntries(Object.keys(EMPTY_DIE).map(key => [key, die[key as keyof DieInput]])) as unknown as DieInput;

/** Create or edit one die; the server issues the DAO code and checks every measure again. */
export function DieDialog({ previous, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  const [die, setDie] = useState<DieInput>(() => (previous ? inputOf(previous) : EMPTY_DIE));
  const [active, setActive] = useState(previous?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const update = (patch: Partial<DieInput>) => setDie(current => ({ ...current, ...patch }));
  const numberField = (field: NumericField, label: string, options: { integer?: boolean; unit?: string } = {}) => (
    <label>
      {label}
      {options.unit ? ` (${options.unit})` : ''} *
      <input
        type="number"
        min="0"
        step={options.integer ? 1 : 'any'}
        required
        value={String(die[field])}
        onChange={event => update({ [field]: event.target.value === '' ? 0 : Number(event.target.value) })}
      />
    </label>
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    try {
      const validated = validateDieInput(die as unknown as Record<string, unknown>);
      const body = {
        action: previous ? 'die_update' : 'die_create',
        die: validated,
        ...(previous ? { id: previous.id, expectedRevision: previous.revision, active } : {})
      };
      const payload = JSON.stringify(body);
      // A lost response is retried with the same request id so the server never creates a second die.
      if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      pending.current = true;
      setBusy(true);
      setError('');
      await mutateItemCatalog({ ...body, requestId: request.current.id });
      showSuccessToast(previous ? 'Đã lưu thông tin dao' : 'Đã thêm dao vào danh mục');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được dao. Kiểm tra kết nối và thử lại.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog die-dialog"
      aria-labelledby="die-dialog-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="die-dialog-title">{previous ? `Cập nhật dao ${previous.code}` : 'Thêm dao mới'}</h2>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>
        {error && (
          <p className="warehouse-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <h3 className="die-dialog-group">Thông tin dao</h3>
          <div className="warehouse-fields">
            <label>
              Tên dao *
              <input
                required
                maxLength={200}
                value={die.name}
                placeholder="VD: Dao tem 40×30 bo góc"
                onChange={event => update({ name: event.target.value })}
              />
            </label>
            <label>
              Loại dao *
              <select
                value={die.cylinderType}
                onChange={event => update({ cylinderType: event.target.value as DieCylinderType })}
              >
                {Object.entries(DIE_CYLINDER_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {numberField('cylinderSize', 'Cỡ trục dao (số trên dao, VD R100 → 100)')}
            <label>
              Vị trí cất dao
              <input
                maxLength={200}
                value={die.storageLocation}
                placeholder="VD: Tủ dao A – ngăn 3"
                onChange={event => update({ storageLocation: event.target.value })}
              />
            </label>
          </div>
          <h3 className="die-dialog-group">Con tem</h3>
          <div className="warehouse-fields">
            {numberField('labelWidth', 'Chiều rộng tem', { unit: 'mm' })}
            {numberField('labelHeight', 'Chiều cao tem', { unit: 'mm' })}
            <label>
              Góc tem *
              <select value={die.corner} onChange={event => update({ corner: event.target.value as DieCorner })}>
                {Object.entries(DIE_CORNERS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {die.corner === 'rounded' && numberField('cornerRadius', 'Bán kính bo góc R', { unit: 'mm' })}
            <label>
              Răng cưa *
              <select
                value={die.perforated ? 'yes' : 'no'}
                onChange={event => update({ perforated: event.target.value === 'yes' })}
              >
                <option value="no">Không răng cưa</option>
                <option value="yes">Có răng cưa</option>
              </select>
            </label>
          </div>
          <h3 className="die-dialog-group">Bố cục trên dao</h3>
          <div className="warehouse-fields">
            {numberField('labelsAcross', 'Số tem trên 1 hàng ngang', { integer: true })}
            {numberField('labelsAround', 'Số tem trên 1 hàng dọc', { integer: true })}
            {numberField('gapAcross', 'Khoảng cách giữa các tem ngang', { unit: 'mm' })}
            {numberField('gapAround', 'Khoảng cách giữa các tem dọc', { unit: 'mm' })}
          </div>
          <label className="die-dialog-notes">
            Mô tả đặc thù khác
            <textarea
              maxLength={2000}
              rows={3}
              value={die.notes}
              placeholder="Đặc điểm riêng của dao, lưu ý khi chạy máy…"
              onChange={event => update({ notes: event.target.value })}
            />
          </label>
          {previous && (
            <label className="warehouse-check">
              <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
              Đang sử dụng
            </label>
          )}
        </fieldset>
        <footer>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu dao'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
