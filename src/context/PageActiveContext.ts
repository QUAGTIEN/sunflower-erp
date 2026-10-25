import { createContext, useContext } from 'react';

/**
 * Phân hệ đã mở được giữ trong DOM (ẩn đi) để quay lại tức thì.
 * Context này cho biết trang chứa component có đang hiển thị hay không.
 */
export const PageActiveContext = createContext(true);

export const useIsPageActive = () => useContext(PageActiveContext);
