import type { PropsWithChildren } from 'react';
import { LanguageProvider } from '@/context/LanguageContext';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <LanguageProvider>{children}</LanguageProvider>
);
