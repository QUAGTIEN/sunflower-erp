export { authService } from './authAdapter';
export { dbService, isDocumentAlreadyExistsError } from './firestoreAdapter';
export { isFirebaseConfigured, isFirebaseRuntimeEnabled } from './client';

export type { UserProfile } from '@/shared/types';
