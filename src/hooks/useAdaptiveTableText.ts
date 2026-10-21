import { useEffect } from 'react';

const TEXT_CLASS = 'erp-adaptive-table-text';
const DIRECT_CLASS = 'erp-adaptive-table-direct';
const WRAPPED_CLASS = 'is-two-line';
const OVERFLOW_CLASS = 'is-over-two-lines';
const EXPLICIT_TEXT_CLASS = 'erp-adaptive-table-value';

const getTextTarget = (cell: HTMLTableCellElement): HTMLElement | null => {
  const explicitText = cell.querySelector<HTMLElement>(`.${EXPLICIT_TEXT_CLASS}`);
  if (explicitText) return explicitText;
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

const isWiderThanOneLine = (element: HTMLElement, context: CanvasRenderingContext2D) => {
  const style = window.getComputedStyle(element);
  const availableWidth = element.clientWidth
    - Number.parseFloat(style.paddingLeft || '0')
    - Number.parseFloat(style.paddingRight || '0');
  if (availableWidth <= 0) return false;
  context.font = style.font;
  const label = element.textContent?.replace(/\s+/g, ' ').trim() || '';
  const letterSpacing = Number.parseFloat(style.letterSpacing);
  const spacingWidth = Number.isFinite(letterSpacing) ? letterSpacing * Math.max(0, label.length - 1) : 0;
  return context.measureText(label).width + spacingWidth > availableWidth + 1;
};

const countTextLines = (element: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set(Array.from(range.getClientRects())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => Math.round(rect.top))).size;
};

/** Keep the normal font on one-line values, including after a column is widened. */
export const useAdaptiveTableText = (pageId: string, userId: string) => {
  useEffect(() => {
    if (!userId) return;
    const root = document.querySelector<HTMLElement>('.app-main');
    if (!root) return;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const measured = new WeakMap<HTMLElement, string>();
    let frame = 0;

    const updateText = () => {
      root.querySelectorAll<HTMLElement>('.erp-viewport-table-scroll').forEach(viewport => {
        if (viewport.offsetParent === null) return;
        const singleLine = Boolean(viewport.closest('[data-erp-table-text="single-line"]'));
        viewport.querySelectorAll<HTMLTableCellElement>('table tbody td').forEach(cell => {
          if (singleLine) {
            // These operational grids deliberately keep one line. Preserve authored titles.
            if (!cell.title || cell.dataset.erpAutoTitle === cell.title) {
              const title = cell.textContent?.replace(/\s+/g, ' ').trim() || '';
              cell.title = title;
              cell.dataset.erpAutoTitle = title;
            }
            return;
          }
          const target = getTextTarget(cell);
          if (!target) return;
          const direct = target === cell;
          cell.classList.add('erp-adaptive-table-cell');
          target.classList.add(direct ? DIRECT_CLASS : TEXT_CLASS);
          const key = `${cell.clientWidth}:${target.textContent}`;
          if (measured.get(target) === key) return;

          target.classList.remove(WRAPPED_CLASS, OVERFLOW_CLASS);
          const needsTwoLines = isWiderThanOneLine(target, context);
          if (needsTwoLines) target.classList.add(WRAPPED_CLASS);
          if (direct && countTextLines(target) > 2) {
            target.classList.remove(WRAPPED_CLASS);
            target.classList.add(OVERFLOW_CLASS);
          }
          if (needsTwoLines && !target.title && !cell.title) {
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
    const containsTableContent = (node: Node) => node instanceof Element && (
      node.matches('table, thead, tbody, tr, th, td')
      || Boolean(node.querySelector('table, th, td'))
    );
    const mutationObserver = new MutationObserver(records => {
      const tableChanged = records.some(record => {
        const targetElement = record.target instanceof Element
          ? record.target
          : record.target.parentElement;
        return (
          Boolean(targetElement?.closest('table'))
          || Array.from(record.addedNodes).some(containsTableContent)
          || Array.from(record.removedNodes).some(containsTableContent)
        );
      });
      if (tableChanged) scheduleUpdate();
    });
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
