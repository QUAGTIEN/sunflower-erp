import { type ReactNode, useEffect } from 'react';
import { usePageContextSetter } from '@/context/PageContextState';

interface PageContextHeaderProps {
  section: string;
  current?: string;
  children?: ReactNode;
}

export function PageContextHeader({ section, current, children }: PageContextHeaderProps) {
  const setPageContext = usePageContextSetter();

  useEffect(() => {
    setPageContext?.({ section, current });
  }, [current, section, setPageContext]);

  if (!children) return null;

  return <div className="erp-page-context-actions">{children}</div>;
}

export default PageContextHeader;
