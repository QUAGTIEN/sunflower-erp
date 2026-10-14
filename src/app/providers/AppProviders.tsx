import type { PropsWithChildren } from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { MutationToast } from '@/components/MutationToast';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <LanguageProvider>{children}<MutationToast /></LanguageProvider>
);
