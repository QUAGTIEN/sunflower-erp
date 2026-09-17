import { useEffect } from 'react';

const TEXT_CLASS = 'erp-adaptive-table-text';
const DIRECT_CLASS = 'erp-adaptive-table-direct';
const WRAPPED_CLASS = 'is-two-line';
const OVERFLOW_CLASS = 'is-over-two-lines';

const getTextTarget = (cell: HTMLTableCellElement): HTMLElement | null => {
  if (!cell.textContent?.trim() || cell.querySelector('input, select, textarea, svg, img, .badge')) return null;
  if (!cell.children.length) return cell;
  if (cell.children.length !== 1) return null;

  let target = cell.firstElementChild;
  if (!(target instanceof HTMLElement)) return null;
  if (target.classList.contains('erp-expandable-table-text')) {
    target = target.querySelector('.erp-table-cell-text');
  } else if (target.matches('button, a') && target.children.length === 1) {
    target = target.firstElementChild;
  }
  if (!(target instanceof HTMLElement) || !target.matches('span, strong, a, button, div')) return null;
  if (target.children.length || target.querySelector('button, input, select, textarea, svg, img')) return null;
  return target;
};

const countTextLines = (element: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  const lineTops = new Set<number>();
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width > 0 && rect.height > 0) lineTops.add(Math.round(rect.top));
  }
  return lineTops.size;
};

/** Keep the normal font on one-line values, including after a column is widened. */
export const useAdaptiveTableText = (pageId: string, userId: string) => {
  useEffect(() => {
    if (!userId) return;
    const root = document.querySelector<HTMLElement>('.app-main');
    if (!root) return;
    const measured = new WeakMap<HTMLElement, string>();
    let frame = 0;

    const updateText = () => {
      root.querySelectorAll<HTMLElement>('.erp-viewport-table-scroll').forEach(viewport => {
        if (viewport.offsetParent === null) return;
        viewport.querySelectorAll<HTMLTableCellElement>('table tbody td').forEach(cell => {
          const target = getTextTarget(cell);
          if (!target) return;
          const direct = target === cell;
          cell.classList.add('erp-adaptive-table-cell');
          target.classList.add(direct ? DIRECT_CLASS : TEXT_CLASS);
          const key = `${target.clientWidth}:${target.textContent}`;
          if (measured.get(target) === key) return;

          target.classList.remove(WRAPPED_CLASS, OVERFLOW_CLASS);
          const normalLines = countTextLines(target);
          if (normalLines > 1) target.classList.add(WRAPPED_CLASS);
          if (direct && countTextLines(target) > 2) {
            target.classList.remove(WRAPPED_CLASS);
            target.classList.add(OVERFLOW_CLASS);
          }
          if (normalLines > 1 && !target.title && !cell.title) {
            target.title = target.textContent?.trim() || '';
          }
          measured.set(target, key);
        });
      });
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateText);
    };
    scheduleUpdate();
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(root);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('pointerup', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('pointerup', scheduleUpdate);
    };
  }, [pageId, userId]);
};
