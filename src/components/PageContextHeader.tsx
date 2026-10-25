import { type ReactNode, useEffect } from 'react';
import { usePageContextSetter } from '@/context/PageContextState';
import { useIsPageActive } from '@/context/PageActiveContext';

interface PageContextHeaderProps {
  section: string;
  current?: string;
  children?: ReactNode;
}

export function PageContextHeader({ section, current, children }: PageContextHeaderProps) {
  const setPageContext = usePageContextSetter();
  const isPageActive = useIsPageActive();

  // Pages kept alive in the background must not overwrite the visible page's breadcrumb.
  useEffect(() => {
    if (isPageActive) setPageContext?.({ section, current });
  }, [current, isPageActive, section, setPageContext]);

  if (!children) return null;

  return <div className="erp-page-context-actions">{children}</div>;
}

export default PageContextHeader;
