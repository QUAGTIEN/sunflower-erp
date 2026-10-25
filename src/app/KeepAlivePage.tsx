import { memo, Suspense, type ReactNode } from 'react';
import { PageActiveContext } from '@/context/PageActiveContext';
import { PageLoadingFallback } from '@/components/LoadingStates';

interface KeepAlivePageProps {
  pageId: string;
  active: boolean;
  render: (pageId: string) => ReactNode;
}

function KeepAlivePageView({ pageId, active, render }: KeepAlivePageProps) {
  return (
    <div className="app-page" data-page-id={pageId} hidden={!active}>
      <PageActiveContext.Provider value={active}>
        <Suspense fallback={<PageLoadingFallback />}>{render(pageId)}</Suspense>
      </PageActiveContext.Provider>
    </div>
  );
}

// A hidden page skips re-rendering on shell updates; it renders with the latest data when shown again.
export const KeepAlivePage = memo(KeepAlivePageView, (previous, next) => !previous.active && !next.active);
