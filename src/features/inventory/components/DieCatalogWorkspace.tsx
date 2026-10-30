import { useState } from 'react';
import { DataTablePagination } from '@/components/DataTablePagination';
import { LoadingStatus } from '@/components/LoadingStates';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import {
  dieCornerLabel,
  dieCylinderLabel,
  dieGapLabel,
  dieLabelSize,
  dieLayoutLabel,
  type DieRecord
} from '@/features/catalog/model/dieCatalog';
import { DieDialog } from './DieDialog';

interface Props {
  canManage: boolean;
}

const DIE_QUERIES: LiveQuery<'dies'>[] = [{ name: 'dies', collection: 'die_catalog' }];
const MESSAGES = {
  readError: 'Không tải được danh mục dao. Kiểm tra kết nối và thử lại.',
  unavailable: 'Danh mục dao cần kết nối Firebase.'
};
const searchText = (die: DieRecord) =>
  [die.code, die.name, dieCylinderLabel(die), dieLabelSize(die), die.storageLocation, die.notes]
    .join(' ')
    .toLocaleLowerCase('vi-VN');

/** Danh mục dao (D-DAO1): every cutting die with its size, corners, perforation and layout. */
export function DieCatalogWorkspace({ canManage }: Props) {
  const live = useLiveCollections(DIE_QUERIES, MESSAGES);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DieRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const needle = search.trim().toLocaleLowerCase('vi-VN');
  const dies = ((live.snapshots?.dies || []) as unknown as DieRecord[])
    .filter(die => !needle || searchText(die).includes(needle))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  const pagination = useDataTablePagination(dies);

  return (
    <>
      <div className="warehouse-toolbar">
        <input
          type="search"
          aria-label="Tìm dao"
          placeholder="Tìm mã dao, tên, cỡ trục, kích thước tem…"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        {canManage && (
          <div className="warehouse-toolbar-end">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              + Thêm dao
            </button>
          </div>
        )}
      </div>
      {live.error && (
        <p className="warehouse-error" role="alert">
          {live.error}
        </p>
      )}
      <LoadingStatus loading={live.loading} hasData={Boolean(live.snapshots)} label="Đang tải danh mục dao" />
      {!live.loading && (
        <div className="warehouse-list-frame">
          <div className="table-container erp-primary-data-table">
            <table className="die-catalog-table">
              <thead>
                <tr>
                  <th>Mã dao</th>
                  <th>Tên dao</th>
                  <th>Trục dao</th>
                  <th>Kích thước tem</th>
                  <th>Góc</th>
                  <th>Răng cưa</th>
                  <th>Bố cục tem</th>
                  <th title="Khoảng cách giữa các tem ngang / dọc">Khoảng cách</th>
                  <th>Vị trí cất</th>
                  <th>Trạng thái</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map(die => (
                  <tr key={die.id} className={die.active ? undefined : 'is-muted'}>
                    <td title={die.code}>
                      <strong>{die.code}</strong>
                    </td>
                    <td title={[die.name, die.notes].filter(Boolean).join(' — ')}>{die.name}</td>
                    <td>{dieCylinderLabel(die)}</td>
                    <td>{dieLabelSize(die)}</td>
                    <td>{dieCornerLabel(die)}</td>
                    <td>{die.perforated ? 'Có' : 'Không'}</td>
                    <td>{dieLayoutLabel(die)}</td>
                    <td title="Ngang / dọc">{dieGapLabel(die)}</td>
                    <td title={die.storageLocation}>{die.storageLocation || '—'}</td>
                    <td>{die.active ? 'Đang dùng' : 'Ngừng dùng'}</td>
                    <td>
                      {canManage && (
                        <RowActionMenu
                          label={`Thao tác ${die.code}`}
                          actions={[{ label: 'Sửa thông tin dao', onSelect: () => setEditing(die) }]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {!dies.length && (
                  <tr>
                    <td colSpan={11}>
                      {needle
                        ? 'Không có dao phù hợp từ khóa tìm kiếm.'
                        : 'Chưa có dao trong danh mục. Bấm "+ Thêm dao" để khai báo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...pagination.paginationProps} />
        </div>
      )}
      {(creating || editing) && (
        <DieDialog
          previous={editing || undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
