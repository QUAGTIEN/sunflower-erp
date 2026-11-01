import { requireConfirmedMutation, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useMemo, useState } from 'react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { DataTablePagination } from '@/components/DataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import {
  getMachineCommands,
  getMachineRuntimeStatus,
  getMachineStatusLabel,
  isActiveProductionCommand,
  MachineRuntimeStatus,
  MachineStatus,
  ProductionCommandLike,
  ProductionMachine
} from '@/features/production/api/machineService';

interface MachineManagementProps {
  machines: ProductionMachine[];
  productionCommands: ProductionCommandLike[];
  canManage: boolean;
}

interface MachineFormState {
  code: string;
  name: string;
  type: string;
  colorCount: number;
  maxWidthMm: number;
  capacityPerHour: number;
  supportedMaterials: string;
  status: MachineStatus;
  notes: string;
}

const EMPTY_FORM: MachineFormState = {
  code: '',
  name: '',
  type: 'Flexo',
  colorCount: 4,
  maxWidthMm: 330,
  capacityPerHour: 10000,
  supportedMaterials: '',
  status: 'available',
  notes: ''
};

const MACHINE_COLUMNS: TableColumnOption[] = [
  { id: 'code', label: 'Mã máy', required: true },
  { id: 'name', label: 'Tên máy', required: true },
  { id: 'type', label: 'Loại máy' },
  { id: 'colorCount', label: 'Số màu' },
  { id: 'maxWidth', label: 'Khổ tối đa' },
  { id: 'capacity', label: 'Năng suất tham khảo' },
  { id: 'materials', label: 'Vật liệu phù hợp' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'commands', label: 'LSX đang phân công' },
  { id: 'operators', label: 'Ca / người vận hành' },
  { id: 'deadlines', label: 'Hạn giao' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['code'];
const LOCKED_END = ['actions'];
const statusClassName = (status: string): string => `machine-status machine-status--${status}`;

const formatDate = (value: unknown): string => {
  if (!value) return 'Chưa đặt';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 'Chưa đặt' : date.toLocaleDateString('vi-VN');
};

export const MachineManagement: React.FC<MachineManagementProps> = ({ machines, productionCommands, canManage }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<ProductionMachine | null>(null);
  const [form, setForm] = useState<MachineFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<MachineRuntimeStatus[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'production-machine-catalog',
    columns: MACHINE_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });

  const activeCommands = useMemo(() => productionCommands.filter(isActiveProductionCommand), [productionCommands]);

  const machineRows = useMemo(
    () =>
      machines.map(machine => {
        const commands = getMachineCommands(machine, activeCommands);
        return {
          machine,
          commands,
          runtimeStatus: getMachineRuntimeStatus(machine, activeCommands)
        };
      }),
    [machines, activeCommands]
  );
  const keyword = search.trim().toLocaleLowerCase('vi');
  const filteredRows = machineRows
    .filter(row => !statusFilters.length || statusFilters.includes(row.runtimeStatus))
    .filter(row => !typeFilters.length || typeFilters.includes(row.machine.type))
    .filter(({ machine, commands }) =>
      [
        machine.code,
        machine.name,
        machine.type,
        machine.supportedMaterials.join(' '),
        ...commands.map(command => command.lsxCode)
      ]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(keyword)
    );
  const machinePagination = useDataTablePagination(filteredRows);
  const statusOptions = [...new Set(machineRows.map(row => row.runtimeStatus))].map(value => ({
    value,
    label: getMachineStatusLabel(value)
  }));
  const typeOptions = [...new Set(machines.map(machine => machine.type).filter(Boolean))].map(value => ({
    value,
    label: value
  }));
  const activeFilterCount = statusFilters.length + typeFilters.length;
  const resetFilters = () => {
    setStatusFilters([]);
    setTypeFilters([]);
  };

  const openCreateModal = () => {
    setEditingMachine(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (machine: ProductionMachine) => {
    setEditingMachine(machine);
    setForm({
      code: machine.code,
      name: machine.name,
      type: machine.type,
      colorCount: machine.colorCount,
      maxWidthMm: machine.maxWidthMm,
      capacityPerHour: machine.capacityPerHour,
      supportedMaterials: machine.supportedMaterials.join(', '),
      status: machine.status,
      notes: machine.notes
    });
    setShowModal(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    return runMutationAction(
      'MachineManagement.tsx:handleSave',
      async () => {
        event.preventDefault();
        if (saving) return;

        const normalizedCode = form.code.trim().toLocaleLowerCase('vi');
        const normalizedName = form.name.trim().toLocaleLowerCase('vi');
        const duplicate = machines.find(
          machine =>
            machine.id !== editingMachine?.id &&
            (machine.code.trim().toLocaleLowerCase('vi') === normalizedCode ||
              machine.name.trim().toLocaleLowerCase('vi') === normalizedName)
        );
        if (duplicate) {
          window.alert(`Mã máy hoặc tên máy đã tồn tại (${duplicate.code} - ${duplicate.name}).`);
          return;
        }

        const payload = {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          type: form.type.trim(),
          colorCount: Math.max(0, Number(form.colorCount) || 0),
          maxWidthMm: Math.max(0, Number(form.maxWidthMm) || 0),
          capacityPerHour: Math.max(0, Number(form.capacityPerHour) || 0),
          supportedMaterials: form.supportedMaterials
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
          status: form.status,
          notes: form.notes.trim()
        };

        setSaving(true);
        try {
          if (editingMachine) {
            await requireConfirmedMutation(dbService.updateDocument('machines', editingMachine.id, payload));
          } else {
            await dbService.addDocument('machines', payload);
          }
          setShowModal(false);
          setEditingMachine(null);
          setForm(EMPTY_FORM);

          showSuccessToast('Đã lưu thành công');
        } finally {
          setSaving(false);
        }
      },
      event
    );
  };

  const handleDeactivate = async (machine: ProductionMachine) => {
    return runMutationAction(
      'MachineManagement.tsx:handleDeactivate',
      async () => {
        const runningCommands = getMachineCommands(machine, activeCommands);
        if (runningCommands.length > 0) {
          window.alert(`Không thể ngừng ${machine.name} vì đang có ${runningCommands.length} LSX hoạt động.`);
          return;
        }
        if (!window.confirm(`Ngừng sử dụng ${machine.code} - ${machine.name}? Dữ liệu LSX cũ vẫn được giữ nguyên.`))
          return;
        await requireConfirmedMutation(dbService.updateDocument('machines', machine.id, { status: 'inactive' }));

        showSuccessToast('Đã lưu thành công');
      },
      machine
    );
  };

  const runningCount = machineRows.filter(row => row.runtimeStatus === 'running').length;
  const availableCount = machineRows.filter(row => row.runtimeStatus === 'available').length;
  const unavailableCount = machineRows.filter(row => ['maintenance', 'fault'].includes(row.runtimeStatus)).length;

  return (
    <div className="machine-workspace" data-erp-table-text="single-line">
      <div className="machine-summary-grid">
        <div className="machine-summary-card">
          <div>
            <strong>{machines.length}</strong>
            <span>Tổng số máy</span>
          </div>
        </div>
        <div className="machine-summary-card machine-summary-card--running">
          <div>
            <strong>{runningCount}</strong>
            <span>Máy đang chạy</span>
          </div>
        </div>
        <div className="machine-summary-card machine-summary-card--available">
          <div>
            <strong>{availableCount}</strong>
            <span>Máy sẵn sàng</span>
          </div>
        </div>
        <div className="machine-summary-card machine-summary-card--warning">
          <div>
            <strong>{unavailableCount}</strong>
            <span>Bảo trì / lỗi</span>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="machine-section-heading">
          <div>
            <span className="card-title">Danh sách máy</span>
            <p>Quản lý thông số, trạng thái, lệnh sản xuất và người vận hành của từng máy.</p>
          </div>
          {canManage && (
            <button className="btn btn-primary" onClick={openCreateModal}>
              Thêm máy
            </button>
          )}
        </div>
        <div className="machine-toolbar">
          <input
            type="search"
            aria-label="Tìm máy"
            placeholder="Tìm mã máy, tên máy, loại máy, vật liệu, số LSX…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
          {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
        </div>
        <DataFilterChipBar
          chips={[
            ...statusFilters.map(value => ({
              id: `status:${value}`,
              label: getMachineStatusLabel(value),
              onRemove: () => setStatusFilters(statusFilters.filter(item => item !== value))
            })),
            ...typeFilters.map(value => ({
              id: `type:${value}`,
              label: value,
              onRemove: () => setTypeFilters(typeFilters.filter(item => item !== value))
            }))
          ]}
          onClear={resetFilters}
        />
        <div className="table-container erp-primary-data-table">
          <table className="has-dynamic-columns" data-resize-key="production-machine-catalog">
            <thead>
              <tr>
                <ReorderableTableCells
                  order={table.orderedColumnIds}
                  getHeaderProps={table.getHeaderProps}
                  labels={table.labels}
                >
                  <th key="code">Mã máy</th>
                  <th key="name">Tên máy</th>
                  <th key="type">Loại máy</th>
                  <th key="colorCount" className="machine-number">
                    Số màu
                  </th>
                  <th key="maxWidth" className="machine-number">
                    Khổ tối đa
                  </th>
                  <th key="capacity" className="machine-number">
                    Năng suất tham khảo
                  </th>
                  <th key="materials">Vật liệu phù hợp</th>
                  <th key="status">Trạng thái</th>
                  <th key="commands">LSX đang phân công</th>
                  <th key="operators">Ca / người vận hành</th>
                  <th key="deadlines">Hạn giao</th>
                  <th key="actions" aria-label="Thao tác" />
                </ReorderableTableCells>
              </tr>
            </thead>
            <tbody>
              {machinePagination.rows.map(({ machine, commands, runtimeStatus }) => (
                <tr key={machine.id}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="code">
                      <strong>{machine.code}</strong>
                    </td>
                    <td key="name" title={[machine.name, machine.notes].filter(Boolean).join(' · ')}>
                      <strong>{machine.name}</strong>
                    </td>
                    <td key="type">{machine.type}</td>
                    <td key="colorCount" className="machine-number">
                      {machine.colorCount || '—'}
                    </td>
                    <td key="maxWidth" className="machine-number">
                      {machine.maxWidthMm ? `${machine.maxWidthMm} mm` : '—'}
                    </td>
                    <td key="capacity" className="machine-number">
                      {machine.capacityPerHour ? `${machine.capacityPerHour.toLocaleString('vi-VN')} sp/giờ` : '—'}
                    </td>
                    <td key="materials">{machine.supportedMaterials.join(', ') || 'Chưa khai báo'}</td>
                    <td key="status">
                      <span className={statusClassName(runtimeStatus)}>{getMachineStatusLabel(runtimeStatus)}</span>
                    </td>
                    <td
                      key="commands"
                      title={commands
                        .map(command =>
                          [command.lsxCode, command.poCode, command.productNameToBeCut || command.productName]
                            .filter(Boolean)
                            .join(' · ')
                        )
                        .join('; ')}
                    >
                      {commands.map(command => command.lsxCode).join(', ') || 'Chưa có lệnh'}
                    </td>
                    <td
                      key="operators"
                      title={commands
                        .map(command =>
                          [command.shift || 'Chưa đặt ca', command.operatorName || 'Chưa phân công'].join(' / ')
                        )
                        .join('; ')}
                    >
                      {commands
                        .map(command =>
                          [command.shift || 'Chưa đặt ca', command.operatorName || 'Chưa phân công'].join(' / ')
                        )
                        .join('; ') || '—'}
                    </td>
                    <td
                      key="deadlines"
                      title={commands.map(command => formatDate(command.deliveryDeadline)).join('; ')}
                    >
                      {commands.map(command => formatDate(command.deliveryDeadline)).join('; ') || '—'}
                    </td>
                    <td key="actions">
                      {canManage && (
                        <RowActionMenu
                          label={`Thao tác ${machine.name}`}
                          actions={[
                            { label: 'Chỉnh sửa máy', onSelect: () => openEditModal(machine) },
                            ...(machine.status !== 'inactive'
                              ? [{ label: 'Ngừng sử dụng', onSelect: () => handleDeactivate(machine), danger: true }]
                              : [])
                          ]}
                        />
                      )}
                    </td>
                  </ReorderableTableCells>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td className="machine-table-empty" colSpan={table.orderedColumnIds.length}>
                    {machineRows.length
                      ? 'Không có máy phù hợp từ khóa hoặc bộ lọc.'
                      : 'Chưa có máy sản xuất. Thêm máy để bắt đầu phân công LSX.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination {...machinePagination.paginationProps} />
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
      <DataFilterPanel
        open={showFilters}
        title="Lọc danh sách máy"
        description="Lọc theo trạng thái và loại máy."
        activeCount={activeFilterCount}
        onClose={() => setShowFilters(false)}
        onReset={resetFilters}
      >
        <DataFilterSection title="Trạng thái" selectedCount={statusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={statusOptions}
            selectedValues={statusFilters}
            onChange={values => setStatusFilters(values as MachineRuntimeStatus[])}
          />
        </DataFilterSection>
        <DataFilterSection title="Loại máy" selectedCount={typeFilters.length}>
          <DataFilterCheckboxGroup options={typeOptions} selectedValues={typeFilters} onChange={setTypeFilters} />
        </DataFilterSection>
      </DataFilterPanel>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content machine-modal">
            <div className="modal-header">
              <div>
                <strong>{editingMachine ? 'Cập nhật máy sản xuất' : 'Thêm máy sản xuất'}</strong>
                <span>Khai báo thông số vừa đủ để điều phối LSX.</span>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowModal(false)} title="Đóng">
                Đóng
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body machine-form">
                <div className="form-grid machine-form-grid">
                  <div className="form-group">
                    <label>Mã máy *</label>
                    <input
                      value={form.code}
                      onChange={event => setForm(current => ({ ...current, code: event.target.value }))}
                      placeholder="VD: M-05"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Tên máy *</label>
                    <input
                      value={form.name}
                      onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                      placeholder="VD: Máy in Flexo 6 màu"
                      required
                    />
                  </div>
                </div>
                <div className="form-grid machine-form-grid machine-form-grid--three">
                  <div className="form-group">
                    <label>Loại máy *</label>
                    <select
                      value={form.type}
                      onChange={event => setForm(current => ({ ...current, type: event.target.value }))}
                    >
                      <option value="Flexo">Flexo</option>
                      <option value="Offset">Offset</option>
                      <option value="Kỹ thuật số">Kỹ thuật số</option>
                      <option value="Bế">Bế</option>
                      <option value="Gia công">Gia công</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Số màu</label>
                    <input
                      type="number"
                      min="0"
                      value={form.colorCount}
                      onChange={event => setForm(current => ({ ...current, colorCount: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Khổ tối đa (mm)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.maxWidthMm}
                      onChange={event => setForm(current => ({ ...current, maxWidthMm: Number(event.target.value) }))}
                    />
                  </div>
                </div>
                <div className="form-grid machine-form-grid">
                  <div className="form-group">
                    <label>Năng suất tham khảo (sp/giờ)</label>
                    <div className="machine-input-with-icon">
                      <input
                        type="number"
                        min="0"
                        value={form.capacityPerHour}
                        onChange={event =>
                          setForm(current => ({ ...current, capacityPerHour: Number(event.target.value) }))
                        }
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Trạng thái quản lý</label>
                    <select
                      value={form.status}
                      onChange={event =>
                        setForm(current => ({ ...current, status: event.target.value as MachineStatus }))
                      }
                    >
                      <option value="available">Sẵn sàng</option>
                      <option value="maintenance">Bảo trì</option>
                      <option value="fault">Đang lỗi</option>
                      <option value="inactive">Ngừng sử dụng</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Vật liệu phù hợp (phân cách bằng dấu phẩy)</label>
                  <input
                    value={form.supportedMaterials}
                    onChange={event => setForm(current => ({ ...current, supportedMaterials: event.target.value }))}
                    placeholder="Decal giấy, decal nhựa, màng PET"
                  />
                </div>
                <div className="form-group">
                  <label>Ghi chú vận hành</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
                    placeholder="Điểm mạnh, hạn chế hoặc lưu ý khi chọn máy..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu máy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
