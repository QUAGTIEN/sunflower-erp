import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

// Firebase Configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if we should use Real Firebase
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.apiKey !== 'YOUR_API_KEY'
  && firebaseConfig.projectId
  && firebaseConfig.authDomain
);
export const firebaseAuthMode = import.meta.env.VITE_FIREBASE_AUTH_MODE === 'email-password' ? 'email-password' : 'local';
export const isFirebaseRuntimeEnabled = isFirebaseConfigured && firebaseAuthMode === 'email-password';

let firebaseDatabase: ReturnType<typeof getFirestore> | null = null;
export let firebaseAuth: ReturnType<typeof getAuth> | null = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      firebaseDatabase = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
    } catch {
      // Reuse an existing Firestore instance during hot reload or duplicate initialization.
      firebaseDatabase = getFirestore(app);
    }
    firebaseAuth = getAuth(app);
  } catch (error) {
    console.error("Failed to initialize Firebase", error);
  }
}

type FirebaseBackendState = 'idle' | 'connecting' | 'ready' | 'failed';

let firebaseBackendState: FirebaseBackendState = 'idle';
let firebaseReadyPromise: Promise<boolean> | null = null;
const reportedFirebaseFailures = new Set<string>();
let handleFirebaseSessionUnavailable: (() => void) | null = null;

export const getFirebaseErrorCode = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'unknown';
  return String((error as { code?: unknown }).code || 'unknown');
};

export const reportFirebaseFailure = (context: string, error: unknown, disableForSession = false) => {
  const code = getFirebaseErrorCode(error);
  const key = code === 'auth/session-expired'
    ? code
    : disableForSession ? `firebase-disabled:${code}` : `${context}:${code}`;

  if (!reportedFirebaseFailures.has(key)) {
    reportedFirebaseFailures.add(key);
    console.error(`[Firebase] ${context} failed (${code}). Local data fallback is disabled.`, error);
  }

  // Permission errors may be isolated to one collection or action. They must
  // not disable every subsequent database request in the same session.
  if (disableForSession) {
    firebaseBackendState = 'failed';
  }
};

/**
 * Firestore Security Rules evaluate the Firebase Auth identity, not the ERP
 * profile stored in localStorage. Wait for Firebase Auth to restore an existing
 * email/password session before allowing any Firestore request.
 */
const ensureFirebaseReady = async (): Promise<boolean> => {
  if (!isFirebaseRuntimeEnabled || !firebaseDatabase || !firebaseAuth) return false;
  if (firebaseBackendState === 'ready' && firebaseAuth.currentUser) return true;
  if (firebaseBackendState === 'ready' && !firebaseAuth.currentUser) {
    firebaseBackendState = 'idle';
  }
  if (firebaseBackendState === 'failed') return false;
  if (firebaseReadyPromise) return firebaseReadyPromise;

  firebaseBackendState = 'connecting';
  firebaseReadyPromise = firebaseAuth.authStateReady().then(() => {
    const authenticated = Boolean(firebaseAuth?.currentUser);
    firebaseBackendState = authenticated ? 'ready' : 'idle';
    return authenticated;
  }).finally(() => {
    firebaseReadyPromise = null;
  });

  return firebaseReadyPromise;
};

export const getFirebaseDatabase = async (context: string) => {
  if (!isFirebaseRuntimeEnabled) return null;
  if ((await ensureFirebaseReady()) && firebaseDatabase) return firebaseDatabase;

  const error = Object.assign(
    new Error('Phiên đăng nhập Firebase đã hết hạn. Vui lòng đăng nhập lại.'),
    { code: 'auth/session-expired' }
  );
  handleFirebaseSessionUnavailable?.();
  reportFirebaseFailure(context, error);
  throw error;
};

export const authenticateFirebase = async (email: string, password: string): Promise<FirebaseUser> => {
  if (!isFirebaseRuntimeEnabled || !firebaseAuth) {
    const configurationError = new Error('Firebase email/password authentication is not configured.') as Error & { code: string };
    configurationError.code = 'auth/configuration-not-found';
    throw configurationError;
  }

  try {
    firebaseBackendState = 'connecting';
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    firebaseBackendState = 'ready';
    return credential.user;
  } catch (error) {
    reportFirebaseFailure('email/password authentication', error, true);
    throw error;
  }
};

export const setFirebaseBackendState = (state: FirebaseBackendState): void => {
  firebaseBackendState = state;
};

export const setFirebaseSessionUnavailableHandler = (handler: (() => void) | null): void => {
  handleFirebaseSessionUnavailable = handler;
};
