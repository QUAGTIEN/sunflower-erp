import type { ReactNode } from 'react';
import { PageContextSetterContext, type PageContextSetter } from './PageContextState';

interface PageContextProviderProps {
  onChange: PageContextSetter;
  children: ReactNode;
}

export function PageContextProvider({ onChange, children }: PageContextProviderProps) {
  return <PageContextSetterContext.Provider value={onChange}>{children}</PageContextSetterContext.Provider>;
}
