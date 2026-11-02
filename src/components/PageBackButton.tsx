import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageBackButtonProps {
  onClick: () => void;
  /** Mô tả đích quay lại, hiển thị ở tooltip và aria-label. */
  label?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
}

/** Nút quay lại chuẩn: chỉ có icon, đặt đầu header, cùng một kiểu ở mọi phân hệ. */
export const PageBackButton: React.FC<PageBackButtonProps> = ({ onClick, label, title, className = '', disabled }) => {
  const buttonLabel = title || label || 'Quay lại';

  return (
    <button
      type="button"
      className={`app-back-button ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={buttonLabel}
      aria-label={buttonLabel}
    >
      <ArrowLeft size={16} aria-hidden="true" />
    </button>
  );
};
