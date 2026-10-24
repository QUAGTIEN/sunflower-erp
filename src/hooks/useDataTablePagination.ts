import { useState } from 'react';

export const useDataTablePagination = <T>(items: T[], initialPageSize = 25) => {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [page, setPageState] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  const paginationProps = {
    page: currentPage,
    pageSize,
    totalPages,
    totalItems: items.length,
    startItem: items.length === 0 ? 0 : startIndex + 1,
    endItem: Math.min(startIndex + pageSize, items.length),
    setPage: (nextPage: number) => setPageState(Math.max(1, Math.min(nextPage, totalPages))),
    setPageSize: (nextPageSize: number) => {
      setPageSizeState(nextPageSize);
      setPageState(1);
    }
  };

  return {
    rows: items.slice(startIndex, startIndex + pageSize),
    paginationProps
  };
};

export type DataTablePaginationProps = ReturnType<typeof useDataTablePagination<unknown>>['paginationProps'];
