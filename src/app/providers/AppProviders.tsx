import type { PropsWithChildren } from 'react';
import { MutationToast } from '@/components/MutationToast';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <>
    {children}
    <MutationToast />
    <DeleteConfirmationDialog />
  </>
);
