import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface RowActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface RowActionMenuProps {
  actions: RowActionMenuItem[];
  label?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

const MENU_WIDTH = 196;
const VIEWPORT_MARGIN = 8;

export function RowActionMenu({ actions, label = 'Mở danh sách thao tác' }: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0, width: MENU_WIDTH });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(menuRef.current?.offsetHeight ?? actions.length * 38 + 12, window.innerHeight - VIEWPORT_MARGIN * 2);
    const width = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(
      window.innerWidth - width - VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, rect.right - width)
    );
    const belowTop = rect.bottom + 6;
    const top = belowTop + menuHeight <= window.innerHeight - VIEWPORT_MARGIN
      ? belowTop
      : Math.max(VIEWPORT_MARGIN, rect.top - menuHeight - 6);

    setPosition({ top, left, width });
  }, [actions.length]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [closeMenu, open]);

  return (
    <span className="row-action-menu" onClick={event => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="row-action-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen(previous => !previous)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="row-action-menu__popover"
          role="menu"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          onClick={event => event.stopPropagation()}
        >
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'is-danger' : undefined}
              disabled={action.disabled}
              onClick={() => {
                if (action.disabled) return;
                closeMenu();
                action.onSelect();
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}
