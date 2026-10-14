import type { PropsWithChildren } from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { MutationToast } from '@/components/MutationToast';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <LanguageProvider>{children}<MutationToast /><DeleteConfirmationDialog /></LanguageProvider>
);
