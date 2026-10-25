/** Số phân hệ được giữ trong bộ nhớ; phân hệ dùng lâu nhất bị gỡ khi vượt giới hạn. */
export const KEEP_ALIVE_PAGE_LIMIT = 5;

/** Thời gian giữ kết nối dữ liệu realtime sau khi không còn trang nào cần. */
export const SUBSCRIPTION_LINGER_MS = 2 * 60 * 1000;

/** Đưa trang vừa mở lên cuối danh sách (mới dùng nhất) và bỏ trang cũ nhất khi vượt giới hạn. */
export const rememberPage = (pages: string[], pageId: string, limit = KEEP_ALIVE_PAGE_LIMIT): string[] => {
  if (pages[pages.length - 1] === pageId) return pages;
  const next = [...pages.filter(page => page !== pageId), pageId];
  return next.length > limit ? next.slice(next.length - limit) : next;
};
