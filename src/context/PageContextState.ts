import { createContext, useContext } from 'react';

export interface AppPageContext {
  section: string;
  current?: string;
}

export type PageContextSetter = (context: AppPageContext) => void;

export const PageContextSetterContext = createContext<PageContextSetter | null>(null);

export function usePageContextSetter() {
  return useContext(PageContextSetterContext);
}
