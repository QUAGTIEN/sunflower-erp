import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Search, Settings2 } from 'lucide-react';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { DataTablePagination } from '@/components/DataTablePagination';
import { ImagePreviewDialog } from '@/components/ImagePreviewDialog';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import {
  buildApprovedTemplates,
  cleanSpecText,
  filterApprovedTemplates,
  templateApprovedAt,
  type ApprovedDesignOrder,
  type ApprovedTemplate
} from '@/features/design/model/approvedDesigns';
import type { DesignRecord } from '@/features/design/model/designWorkflow';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import { formatDate } from '@/shared/utils/dateFormatting';

interface ApprovedDesignLibraryProps {
  designs: DesignRecord[];
  pos: ApprovedDesignOrder[];
  currentUser?: { role?: string };
}

const LIBRARY_LAYOUT_ID = 'design-library';

const LIBRARY_COLUMNS: TableColumnOption[] = [
  { id: 'preview', label: 'Ảnh mẫu', required: true, group: 'Thông tin mẫu' },
  { id: 'customer', label: 'Khách hàng', defaultVisible: true, group: 'Thông tin mẫu' },
  { id: 'product', label: 'Mặt hàng', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'productCode', label: 'Mã hàng', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'order', label: 'Đơn hàng', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'size', label: 'Quy cách', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'material', label: 'Chất liệu', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'version', label: 'Phiên bản', defaultVisible: true, group: 'Phiên bản' },
  { id: 'approvedAt', label: 'Ngày duyệt', defaultVisible: true, group: 'Phiên bản' },
  { id: 'files', label: 'File gốc', defaultVisible: true, group: 'Phiên bản' },
  { id: 'note', label: 'Ghi chú', defaultVisible: false, group: 'Phiên bản' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];
const COLUMN_LABELS = Object.fromEntries(LIBRARY_COLUMNS.map(column => [column.id, column.label]));
const REQUIRED_COLUMN_IDS = ['preview', 'actions'];
const DEFAULT_COLUMN_IDS = LIBRARY_COLUMNS.filter(column => column.required || column.defaultVisible).map(
  column => column.id
);

const uniqueCustomers = (templates: ApprovedTemplate[]) =>
  Array.from(
    new Map(templates.map(template => [template.customerKey, template.customerLabel])).entries(),
    ([value, label]) => ({ value, label })
  ).filter(customer => customer.value);

const openFileLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export const ApprovedDesignLibrary: React.FC<ApprovedDesignLibraryProps> = ({ designs, pos, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilters, setCustomerFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  const templates = useMemo(
    () => buildApprovedTemplates(designs, pos, currentUser?.role),
    [currentUser?.role, designs, pos]
  );
  const customers = useMemo(() => uniqueCustomers(templates), [templates]);
  const filteredTemplates = useMemo(
    () => filterApprovedTemplates(templates, searchTerm, customerFilters),
    [customerFilters, searchTerm, templates]
  );
  const pagination = useDataTablePagination(filteredTemplates);

  const {
    selectedIds: sharedColumns,
    setSelectedIds: setSharedColumns,
    canEditColumns
  } = useSharedTableColumns({ layoutId: LIBRARY_LAYOUT_ID });
  const visibleColumns = Array.from(new Set([...REQUIRED_COLUMN_IDS, ...(sharedColumns || DEFAULT_COLUMN_IDS)]));
  const visibleColumnSet = new Set(visibleColumns);
  const saveVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    setSharedColumns(Array.from(new Set([...REQUIRED_COLUMN_IDS, ...selectedIds])));
    setShowColumnCustomizer(false);
  };
  const { orderedColumnIds, getHeaderProps } = useReorderableTableColumns({
    columns: LIBRARY_COLUMNS,
    selectedIds: visibleColumns,
    onOrderChange: saveVisibleColumns,
    layoutId: LIBRARY_LAYOUT_ID,
    lockedStartIds: ['preview'],
    lockedEndIds: ['actions']
  });

  return (
    <div className="card design-request-list-card">
      <div className="design-request-toolbar">
        <div className="design-request-search">
          <Search size={16} />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Tìm khách hàng, mã hàng, tên sản phẩm hoặc đơn hàng..."
          />
        </div>
        <DataFilterButton
          activeCount={customerFilters.length}
          open={showFilters}
          onClick={() => setShowFilters(true)}
        />
        {canEditColumns && (
          <button
            type="button"
            className="data-filter-button"
            onClick={() => setShowColumnCustomizer(true)}
            title="Tùy chỉnh cột"
            aria-label="Tùy chỉnh cột"
          >
            <Settings2 size={16} />
          </button>
        )}
      </div>

      <DataFilterChipBar
        chips={customerFilters.map(value => ({
          id: `customer:${value}`,
          label: customers.find(customer => customer.value === value)?.label || value,
          onRemove: () => setCustomerFilters(current => current.filter(item => item !== value))
        }))}
        onClear={() => setCustomerFilters([])}
      />

      <div className="table-container design-request-table design-library-table erp-primary-data-table">
        <table data-resize-key={LIBRARY_LAYOUT_ID}>
          <thead>
            <tr>
              <ReorderableTableCells order={orderedColumnIds} getHeaderProps={getHeaderProps} labels={COLUMN_LABELS}>
                <th key="preview">Ảnh mẫu</th>
                {visibleColumnSet.has('customer') && <th key="customer">Khách hàng</th>}
                {visibleColumnSet.has('product') && <th key="product">Mặt hàng</th>}
                {visibleColumnSet.has('productCode') && <th key="productCode">Mã hàng</th>}
                {visibleColumnSet.has('order') && <th key="order">Đơn hàng</th>}
                {visibleColumnSet.has('size') && <th key="size">Quy cách</th>}
                {visibleColumnSet.has('material') && <th key="material">Chất liệu</th>}
                {visibleColumnSet.has('version') && <th key="version">Phiên bản</th>}
                {visibleColumnSet.has('approvedAt') && <th key="approvedAt">Ngày duyệt</th>}
                {visibleColumnSet.has('files') && <th key="files">File gốc</th>}
                {visibleColumnSet.has('note') && <th key="note">Ghi chú</th>}
                <th key="actions">Thao tác</th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map(template => {
              const { design, po, item, version, customerLabel } = template;
              const productName = item.productName || 'Chưa đặt tên';
              const size = cleanSpecText(item.size);
              const material = cleanSpecText(item.material);
              return (
                <tr key={design.id}>
                  <ReorderableTableCells order={orderedColumnIds} expandOverflowText={false}>
                    <td key="preview">
                      {version.previewImage ? (
                        <button
                          type="button"
                          className="design-library-thumb"
                          aria-label={`Xem ảnh mẫu ${productName}`}
                          title="Xem ảnh mẫu"
                          onClick={() => setPreviewImage(version.previewImage || '')}
                        >
                          <img src={version.previewImage} alt="" />
                        </button>
                      ) : (
                        <span className="design-library-thumb is-empty" title="Chưa có ảnh xem trước">
                          <ImageIcon size={16} />
                        </span>
                      )}
                    </td>
                    {visibleColumnSet.has('customer') && (
                      <td key="customer" title={customerLabel}>
                        {customerLabel}
                      </td>
                    )}
                    {visibleColumnSet.has('product') && (
                      <td key="product" title={productName}>
                        {productName}
                      </td>
                    )}
                    {visibleColumnSet.has('productCode') && (
                      <td key="productCode" title={item.productCode}>
                        {item.productCode || '—'}
                      </td>
                    )}
                    {visibleColumnSet.has('order') && (
                      <td key="order" title={po.poCode}>
                        {po.poCode || '—'}
                      </td>
                    )}
                    {visibleColumnSet.has('size') && (
                      <td key="size" title={size}>
                        {size || '—'}
                      </td>
                    )}
                    {visibleColumnSet.has('material') && (
                      <td key="material" title={material}>
                        {material || '—'}
                      </td>
                    )}
                    {visibleColumnSet.has('version') && (
                      <td key="version">v{version.versionNumber || design.currentVersion || 1}</td>
                    )}
                    {visibleColumnSet.has('approvedAt') && (
                      <td key="approvedAt">{formatDate(templateApprovedAt(template), 'vi-VN', '—')}</td>
                    )}
                    {visibleColumnSet.has('files') && (
                      <td key="files">
                        {version.aiLink && (
                          <a href={version.aiLink} target="_blank" rel="noopener noreferrer">
                            AI
                          </a>
                        )}
                        {version.aiLink && version.corelLink && ' · '}
                        {version.corelLink && (
                          <a href={version.corelLink} target="_blank" rel="noopener noreferrer">
                            Corel
                          </a>
                        )}
                        {!version.aiLink && !version.corelLink && '—'}
                      </td>
                    )}
                    {visibleColumnSet.has('note') && (
                      <td key="note" title={version.comment}>
                        {version.comment || '—'}
                      </td>
                    )}
                    <td key="actions">
                      <RowActionMenu
                        label={`Thao tác ${productName}`}
                        actions={[
                          {
                            label: 'Xem ảnh mẫu',
                            disabled: !version.previewImage,
                            onSelect: () => setPreviewImage(version.previewImage || '')
                          },
                          ...(version.aiLink
                            ? [{ label: 'Mở file AI', onSelect: () => openFileLink(version.aiLink as string) }]
                            : []),
                          ...(version.corelLink
                            ? [{ label: 'Mở file Corel', onSelect: () => openFileLink(version.corelLink as string) }]
                            : [])
                        ]}
                      />
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {filteredTemplates.length === 0 && (
              <tr>
                <td className="design-empty-row" colSpan={visibleColumns.length}>
                  {templates.length === 0 ? 'Chưa có mẫu thiết kế đã duyệt.' : 'Không tìm thấy mẫu phù hợp.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataTablePagination {...pagination.paginationProps} />

      <TableColumnCustomizer
        open={showColumnCustomizer}
        columns={LIBRARY_COLUMNS}
        selectedIds={visibleColumns}
        onClose={() => setShowColumnCustomizer(false)}
        onSave={saveVisibleColumns}
      />
      <DataFilterPanel
        open={showFilters}
        title="Lọc kho mẫu"
        description="Lọc mẫu đã duyệt theo khách hàng."
        activeCount={customerFilters.length}
        onClose={() => setShowFilters(false)}
        onReset={() => setCustomerFilters([])}
      >
        <DataFilterSection title="Khách hàng" selectedCount={customerFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={customers}
            selectedValues={customerFilters}
            onChange={setCustomerFilters}
            searchable
          />
        </DataFilterSection>
      </DataFilterPanel>
      {previewImage && (
        <ImagePreviewDialog src={previewImage} downloadPrefix="Mau_thiet_ke" onClose={() => setPreviewImage('')} />
      )}
    </div>
  );
};
