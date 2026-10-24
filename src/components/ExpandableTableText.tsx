import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ExpandableTableTextProps {
  children: React.ReactNode;
  className?: string;
  fullText?: string;
}

export const ExpandableTableText: React.FC<ExpandableTableTextProps> = ({ children, className = '', fullText }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;
    const measure = () =>
      setIsOverflowing(
        element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <span className={`erp-expandable-table-text ${className}`.trim()}>
      <span ref={textRef} className="erp-table-cell-text" title={fullText}>
        {children}
      </span>
      {isOverflowing && (
        <button
          type="button"
          className="erp-table-more-button"
          onClick={event => {
            event.stopPropagation();
            setIsOpen(true);
          }}
          aria-label="Xem đầy đủ nội dung"
          title="Xem đầy đủ"
        >
          ...
        </button>
      )}
      {isOpen &&
        createPortal(
          <div
            className="erp-table-text-dialog"
            role="presentation"
            onMouseDown={event => {
              event.stopPropagation();
              setIsOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Nội dung đầy đủ"
              onMouseDown={event => event.stopPropagation()}
            >
              <header>
                <strong>Nội dung đầy đủ</strong>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    setIsOpen(false);
                  }}
                  aria-label="Đóng"
                >
                  <X size={16} />
                </button>
              </header>
              <p>{fullText || children}</p>
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};
