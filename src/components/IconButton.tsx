import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Tên hành động: dùng cho aria-label và tooltip vì nút không có chữ. */
  label: string;
  icon: ReactNode;
  active?: boolean;
}

/** Nút công cụ chỉ có icon (tải lại, xuất, lọc, chọn cột...). Hành động chính và nguy hiểm vẫn dùng nút có chữ. */
export function IconButton({
  label,
  icon,
  active = false,
  className = '',
  title,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`erp-icon-button${active ? ' is-active' : ''} ${className}`.trim()}
      aria-label={label}
      title={title ?? label}
      {...rest}
    >
      {icon}
    </button>
  );
}
