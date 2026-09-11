import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DataTablePaginationProps } from '@/hooks/useDataTablePagination';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const DataTablePagination = ({
  page,
  pageSize,
  totalPages,
  totalItems,
  startItem,
  endItem,
  setPage,
  setPageSize
}: DataTablePaginationProps) => (
  <footer className="erp-data-table-pagination">
    <label>
      <span>Hiển thị</span>
      <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
        {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} dòng</option>)}
      </select>
    </label>
    <span>{startItem}–{endItem} / {totalItems}</span>
    <div>
      <button type="button" className="btn btn-outline btn-symbol-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={15} /></button>
      <strong>{page} / {totalPages}</strong>
      <button type="button" className="btn btn-outline btn-symbol-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={15} /></button>
    </div>
  </footer>
);
