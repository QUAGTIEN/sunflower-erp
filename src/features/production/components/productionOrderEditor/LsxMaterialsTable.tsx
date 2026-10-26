import { Trash2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import type { ProductionDraftCatalog } from '../../api/productionOrderService';
import type { PlannedMaterial } from '../../model/productionOrder';

interface Props {
  materials: PlannedMaterial[];
  catalogMaterials: ProductionDraftCatalog['materials'];
  onChange: (materials: PlannedMaterial[]) => void;
}
type EditableField = 'code' | 'name' | 'width' | 'unit' | 'quantity' | 'allowancePercent';

const NUMERIC_FIELDS: EditableField[] = ['quantity', 'allowancePercent'];
const newMaterial = (): PlannedMaterial => ({
  id: crypto.randomUUID(),
  code: '',
  name: '',
  width: '',
  unit: '',
  quantity: 0,
  allowancePercent: 0
});

/** Planned materials entered row by row, MISA-style: pick the internal code and name/unit follow it. */
export function LsxMaterialsTable({ materials, catalogMaterials, onChange }: Props) {
  const updateRow = (index: number, patch: Partial<PlannedMaterial>) =>
    onChange(materials.map((material, position) => (position === index ? { ...material, ...patch } : material)));
  const updateField = (index: number, field: EditableField, value: string) =>
    updateRow(index, { [field]: NUMERIC_FIELDS.includes(field) ? Number(value) : value });
  const chooseCatalogItem = (index: number, catalogItemId: string) => {
    const item = catalogMaterials.find(entry => entry.id === catalogItemId);
    const current = materials[index];
    updateRow(index, {
      catalogItemId: item?.id || '',
      code: item?.code || current.code,
      name: item?.name || current.name,
      unit: item?.baseUnit || current.unit
    });
  };

  return (
    <section className="lsx-section">
      <div className="lsx-section-header">
        <h3>Vật tư dự kiến sử dụng</h3>
        <span className="lsx-section-summary">Có thể bổ sung khi lưu nháp; bắt buộc trước khi phát hành.</span>
      </div>
      <div className="table-container">
        <table className="lsx-materials">
          <thead>
            <tr>
              <th>Mã NVL</th>
              <th>Tên vật tư</th>
              <th className="lsx-number">Khổ (mm)</th>
              <th>ĐVT</th>
              <th className="lsx-number">Số lượng</th>
              <th className="lsx-number">Hao hụt (%)</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {materials.map((material, index) => {
              const linked = !!material.catalogItemId;
              const missingFromCatalog = linked && !catalogMaterials.some(item => item.id === material.catalogItemId);
              const row = index + 1;
              return (
                <tr key={material.id}>
                  <td>
                    <select
                      aria-label={`Mã NVL dòng ${row}`}
                      value={material.catalogItemId || ''}
                      onChange={event => chooseCatalogItem(index, event.target.value)}
                    >
                      <option value="">Nhập tay (chưa liên kết)</option>
                      {missingFromCatalog && (
                        <option value={material.catalogItemId}>{material.code} — cần đối chiếu danh mục</option>
                      )}
                      {catalogMaterials.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name} ({item.baseUnit})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {linked ? (
                      <span title={`${material.code} — ${material.name}`}>{material.name}</span>
                    ) : (
                      <div className="lsx-manual-material">
                        <input
                          aria-label={`Mã vật tư nhập tay dòng ${row}`}
                          placeholder="Mã"
                          required
                          value={material.code}
                          onChange={event => updateField(index, 'code', event.target.value)}
                        />
                        <input
                          aria-label={`Tên vật tư dòng ${row}`}
                          placeholder="Tên vật tư"
                          required
                          value={material.name}
                          onChange={event => updateField(index, 'name', event.target.value)}
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Khổ vật tư dòng ${row}`}
                      className="lsx-number"
                      value={material.width}
                      onChange={event => updateField(index, 'width', event.target.value)}
                    />
                  </td>
                  <td>
                    {linked ? (
                      material.unit
                    ) : (
                      <input
                        aria-label={`ĐVT vật tư dòng ${row}`}
                        required
                        value={material.unit}
                        onChange={event => updateField(index, 'unit', event.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Số lượng vật tư dòng ${row}`}
                      className="lsx-number"
                      type="number"
                      min="0.000001"
                      step="any"
                      required
                      value={material.quantity}
                      onChange={event => updateField(index, 'quantity', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Hao hụt vật tư dòng ${row}`}
                      className="lsx-number"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      value={material.allowancePercent}
                      onChange={event => updateField(index, 'allowancePercent', event.target.value)}
                    />
                  </td>
                  <td>
                    <IconButton
                      label={`Bỏ vật tư dòng ${row}`}
                      icon={<Trash2 />}
                      onClick={() => onChange(materials.filter((_, position) => position !== index))}
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="lsx-add-row">
              <td colSpan={7}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onChange([...materials, newMaterial()])}
                >
                  Thêm dòng vật tư
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
