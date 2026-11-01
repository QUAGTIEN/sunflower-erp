import { Trash2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { conversionFactor } from '@/features/catalog/model/itemCatalog';
import type { ProductionDraftCatalog } from '../../api/productionOrderService';
import { materialShortage, type PlannedMaterial } from '../../model/productionOrder';

interface Props {
  materials: PlannedMaterial[];
  catalogMaterials: ProductionDraftCatalog['materials'];
  /** NVL stock in each catalog item's base unit; absent until the catalog has loaded. */
  materialBalances?: Record<string, number>;
  onChange: (materials: PlannedMaterial[]) => void;
}
type EditableField = 'code' | 'name' | 'width' | 'unit' | 'quantity' | 'allowancePercent';

const MATERIAL_COLUMNS: TableColumnOption[] = [
  { id: 'code', label: 'Mã NVL', required: true },
  { id: 'name', label: 'Tên vật tư', required: true },
  { id: 'width', label: 'Khổ (mm)' },
  { id: 'unit', label: 'ĐVT', required: true },
  { id: 'quantity', label: 'Số lượng', required: true },
  { id: 'allowance', label: 'Hao hụt (%)' },
  { id: 'needed', label: 'Cần dùng' },
  { id: 'stock', label: 'Tồn kho' },
  { id: 'shortage', label: 'Thiếu' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_END = ['actions'];
const NUMERIC_FIELDS: EditableField[] = ['quantity', 'allowancePercent'];
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
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
export function LsxMaterialsTable({ materials, catalogMaterials, materialBalances, onChange }: Props) {
  const table = useStandardTableColumns({
    layoutId: 'production-draft-materials',
    columns: MATERIAL_COLUMNS,
    lockedEndIds: LOCKED_END
  });
  // Units convert only through the factor declared on the catalog item; an undeclared unit shows no stock.
  const factorOf = (material: PlannedMaterial) => {
    const item = catalogMaterials.find(entry => entry.id === material.catalogItemId);
    if (!item || !materialBalances) return null;
    try {
      return conversionFactor(item, material.unit);
    } catch {
      return null;
    }
  };
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
        <span className="lsx-section-summary">Có thể bổ sung sau khi lưu; bắt buộc trước khi bắt đầu sản xuất.</span>
        {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
        <button type="button" className="btn btn-outline" onClick={() => onChange([...materials, newMaterial()])}>
          Thêm vật tư
        </button>
      </div>
      <div className="table-container">
        <table className="lsx-materials has-dynamic-columns" data-resize-key="production-draft-materials">
          <thead>
            <tr>
              <ReorderableTableCells
                order={table.orderedColumnIds}
                getHeaderProps={table.getHeaderProps}
                labels={table.labels}
              >
                <th key="code">Mã NVL</th>
                <th key="name">Tên vật tư</th>
                <th key="width" className="lsx-number">
                  Khổ (mm)
                </th>
                <th key="unit">ĐVT</th>
                <th key="quantity" className="lsx-number">
                  Số lượng
                </th>
                <th key="allowance" className="lsx-number">
                  Hao hụt (%)
                </th>
                <th key="needed" className="lsx-number" title="Số lượng × (1 + hao hụt)">
                  Cần dùng
                </th>
                <th
                  key="stock"
                  className="lsx-number"
                  title="Tồn sổ kho NVL quy về ĐVT của dòng; chỉ để xem, không tự trừ kho"
                >
                  Tồn kho
                </th>
                <th key="shortage" className="lsx-number">
                  Thiếu
                </th>
                <th key="actions" aria-label="Thao tác" />
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {materials.map((material, index) => {
              const linked = !!material.catalogItemId;
              const missingFromCatalog = linked && !catalogMaterials.some(item => item.id === material.catalogItemId);
              const row = index + 1;
              const factor = factorOf(material);
              const balance = materialShortage(
                material,
                factor,
                factor === null ? 0 : materialBalances?.[material.catalogItemId || ''] || 0
              );
              return (
                <tr key={material.id}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="code">
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
                    <td key="name">
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
                    <td key="width">
                      <input
                        aria-label={`Khổ vật tư dòng ${row}`}
                        className="lsx-number"
                        value={material.width}
                        onChange={event => updateField(index, 'width', event.target.value)}
                      />
                    </td>
                    <td key="unit">
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
                    <td key="quantity">
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
                    <td key="allowance">
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
                    <td key="needed" className="lsx-number">
                      {number(balance.needed)}
                    </td>
                    <td
                      key="stock"
                      className="lsx-number"
                      title={balance.stock === null ? 'Chọn mã NVL có quy đổi ĐVT đã khai báo để xem tồn' : undefined}
                    >
                      {balance.stock === null ? '—' : number(balance.stock)}
                    </td>
                    <td key="shortage" className={balance.shortage ? 'lsx-number lsx-text-danger' : 'lsx-number'}>
                      {balance.shortage === null ? '—' : number(balance.shortage)}
                    </td>
                    <td key="actions">
                      <IconButton
                        label={`Bỏ vật tư dòng ${row}`}
                        icon={<Trash2 />}
                        onClick={() => onChange(materials.filter((_, position) => position !== index))}
                      />
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {!materials.length && (
              <tr>
                <td colSpan={table.orderedColumnIds.length}>
                  Chưa có vật tư. Bấm “Thêm vật tư” để khai báo vật tư dự kiến.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </section>
  );
}
