import React, { useCallback, useEffect, useRef, useState } from 'react';

interface StickyTableScrollbarProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

interface ScrollbarMetrics {
  left: number;
  width: number;
  scrollWidth: number;
  visible: boolean;
}

const EMPTY_METRICS: ScrollbarMetrics = {
  left: 0,
  width: 0,
  scrollWidth: 0,
  visible: false
};

/**
 * Keeps a synchronized horizontal scrollbar at the bottom of the viewport while
 * a wide table is visible. The table itself remains in the normal document flow.
 */
export const StickyTableScrollbar: React.FC<StickyTableScrollbarProps> = ({
  children,
  className = '',
  ariaLabel = 'Cuộn ngang bảng dữ liệu'
}) => {
  const regionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [metrics, setMetrics] = useState<ScrollbarMetrics>(EMPTY_METRICS);

  const updateMetrics = useCallback(() => {
    const region = regionRef.current;
    const viewport = viewportRef.current;
    if (!region || !viewport) return;

    const rect = region.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - left);
    const hasHorizontalOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
    const intersectsViewport = rect.top < window.innerHeight && rect.bottom > 0;

    setMetrics({
      left,
      width,
      scrollWidth: viewport.scrollWidth,
      visible: hasHorizontalOverflow && intersectsViewport && width > 0
    });

    if (proxyRef.current && proxyRef.current.scrollLeft !== viewport.scrollLeft) {
      proxyRef.current.scrollLeft = viewport.scrollLeft;
    }
  }, []);

  useEffect(() => {
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    window.addEventListener('scroll', updateMetrics, true);

    const resizeObserver = new ResizeObserver(updateMetrics);
    const mutationObserver = new MutationObserver(updateMetrics);
    if (regionRef.current) resizeObserver.observe(regionRef.current);
    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
      mutationObserver.observe(viewportRef.current, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('scroll', updateMetrics, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateMetrics]);

  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (syncingRef.current || !target) return;
    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  return (
    <div ref={regionRef} className="sticky-table-scroll-region">
      <div
        ref={viewportRef}
        className={className}
        onScroll={event => syncScroll(event.currentTarget, proxyRef.current)}
      >
        {children}
      </div>
      {metrics.visible && (
        <div
          ref={proxyRef}
          className="sticky-table-scrollbar"
          style={{ left: metrics.left, width: metrics.width }}
          onScroll={event => syncScroll(event.currentTarget, viewportRef.current)}
          role="region"
          aria-label={ariaLabel}
          tabIndex={0}
        >
          <div style={{ width: metrics.scrollWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
};

