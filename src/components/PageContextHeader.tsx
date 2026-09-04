import type { ReactNode } from 'react';

interface PageContextHeaderProps {
  section: string;
  current?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Shared compact page context row used by ERP list screens.
 * The page title stays stable while the active view is shown as a breadcrumb.
 */
export function PageContextHeader({ section, current, children, className = '' }: PageContextHeaderProps) {
  return (
    <header className={`page-header erp-page-context ${className}`.trim()}>
      <div className="erp-page-context__path">
        <h1 className="page-title">{section}</h1>
        {current && (
          <>
            <span className="erp-page-context__separator" aria-hidden="true">›</span>
            <span className="erp-page-context__current">{current}</span>
          </>
        )}
      </div>
      {children && <div className="erp-page-context__actions">{children}</div>}
    </header>
  );
}

export default PageContextHeader;
