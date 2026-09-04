import {
  onAuthStateChanged as onFirebaseAuthStateChanged,
  signOut as signOutFirebase,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { DEFAULT_USERS } from '@/data/seeds/erpSeedData';
import type { UserProfile } from '@/shared/types';
import {
  authenticateFirebase,
  firebaseAuth,
  firebaseAuthMode,
  getFirebaseDatabase,
  getFirebaseErrorCode,
  isFirebaseRuntimeEnabled,
  reportFirebaseFailure,
  setFirebaseBackendState,
  setFirebaseSessionUnavailableHandler
} from './client';
import { dbService } from './firestoreAdapter';

const FIREBASE_BOOTSTRAP_ADMIN_EMAIL = 'admin@sunflower.com';

const getOrCreateFirebaseUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
  if (!firebaseUser.email) return null;

  const database = await getFirebaseDatabase('loading authenticated user profile');
  if (!database) return null;

  const normalizedEmail = firebaseUser.email.toLowerCase();
  const canonicalProfileSnapshot = await getDoc(doc(database, 'users', firebaseUser.uid));
  if (canonicalProfileSnapshot.exists()) {
    const profile = canonicalProfileSnapshot.data() as UserProfile;
    return profile.email?.toLowerCase() === normalizedEmail ? profile : null;
  }

  if (normalizedEmail !== FIREBASE_BOOTSTRAP_ADMIN_EMAIL) return null;

  // The first real Auth administrator may still have an older Firestore-only
  // profile such as users/u-admin. Copy only its harmless presentation fields
  // into the canonical users/{firebaseAuthUid} document.
  const usersSnapshot = await getDocs(collection(database, 'users'));
  const legacyAdmin = usersSnapshot.docs
    .map(userDocument => userDocument.data() as UserProfile)
    .find(profile => profile.email?.toLowerCase() === normalizedEmail && profile.role === 'admin');
  const adminTemplate = legacyAdmin ?? DEFAULT_USERS.find(user => user.role === 'admin');
  if (!adminTemplate) return null;

  const adminProfile: UserProfile = {
    ...adminTemplate,
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    createdAt: new Date().toISOString(),
    createdBy: 'firebase-bootstrap'
  };

  await setDoc(doc(database, 'users', firebaseUser.uid), adminProfile);
  return adminProfile;
};

// ----------------------------------------------------
// AUTH SERVICE WRAPPER (Client-side bypass + Firestore sync)
// ----------------------------------------------------
let authStateListener: ((user: UserProfile | null) => void) | null = null;
let currentUser: UserProfile | null = (() => {
  if (firebaseAuthMode === 'email-password') return null;
  const stored = localStorage.getItem('erp_current_user');
  return stored ? JSON.parse(stored) : null;
})();

setFirebaseSessionUnavailableHandler(() => {
  setFirebaseBackendState('idle');
  currentUser = null;
  localStorage.removeItem('erp_current_user');
  authStateListener?.(null);
});

export const authService = {
  async login(identifier: string, password: string): Promise<UserProfile> {
    const searchIdentifier = identifier.toLowerCase().trim();
    let user: UserProfile | null = null;

    if (firebaseAuthMode === 'email-password') {
      const firebaseEmail = searchIdentifier.includes('@')
        ? searchIdentifier
        : searchIdentifier === 'admin' ? FIREBASE_BOOTSTRAP_ADMIN_EMAIL : '';
      if (!firebaseEmail) {
        throw new Error('Tài khoản không tồn tại trên hệ thống.');
      }

      try {
        const firebaseUser = await authenticateFirebase(firebaseEmail, password);
        user = await getOrCreateFirebaseUserProfile(firebaseUser);
        if (!user) {
          await signOutFirebase(firebaseAuth!);
          throw Object.assign(
            new Error('Tài khoản Firebase chưa có hồ sơ phân quyền trong ERP.'),
            { code: 'auth/profile-not-found' }
          );
        }
      } catch (error) {
        const code = getFirebaseErrorCode(error);
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          throw new Error('Mật khẩu hoặc tài khoản Firebase không đúng. Vui lòng thử lại.');
        }
        if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
          throw new Error('Firebase Authentication chưa được bật chế độ Email/Password.');
        }
        if (code === 'auth/user-disabled') {
          throw new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
        }
        if (code === 'auth/profile-not-found') {
          throw error;
        }
        throw new Error(`Không thể đăng nhập Firebase (${code}). Vui lòng kiểm tra cấu hình hệ thống.`);
      }
    } else {
      const dbUsers = await dbService.getCollection('users');
      user = dbUsers.find((candidate: UserProfile) =>
        candidate.email.toLowerCase() === searchIdentifier
        || candidate.email.toLowerCase().split('@')[0] === searchIdentifier
      ) || null;

      if (!user) {
        const defaultUser = DEFAULT_USERS.find(candidate =>
          candidate.email.toLowerCase() === searchIdentifier
          || candidate.email.toLowerCase().split('@')[0] === searchIdentifier
        );
        if (defaultUser) {
          user = await dbService.addDocument('users', defaultUser);
        }
      }
    }

    if (!user) {
      throw new Error('Tài khoản không tồn tại trên hệ thống.');
    }

    if (user.active === false) {
      throw new Error('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ Giám đốc.');
    }

    if (firebaseAuthMode === 'local') {
      const expectedPassword = user.role === 'admin' ? 'admin123' :
                               user.role === 'sale' ? 'sale123' :
                               user.role === 'designer' ? 'design123' :
                               user.role === 'purchaser' ? 'purchase123' :
                               user.role === 'producer' ? 'produce123' : 'account123';

      if (password !== expectedPassword && password !== '123456') {
        throw new Error('Mật khẩu không đúng. Vui lòng thử lại.');
      }
    }

    currentUser = user;
    localStorage.setItem('erp_current_user', JSON.stringify(user));
    if (authStateListener) authStateListener(user);
    return user;
  },

  async logout(): Promise<void> {
    if (isFirebaseRuntimeEnabled && firebaseAuth?.currentUser) {
      try {
        await signOutFirebase(firebaseAuth);
      } catch (error) {
        reportFirebaseFailure('signing out', error);
      }
    }
    setFirebaseBackendState('idle');
    currentUser = null;
    localStorage.removeItem('erp_current_user');
    if (authStateListener) authStateListener(null);
  },

  onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    authStateListener = callback;

    if (firebaseAuthMode === 'email-password' && firebaseAuth) {
      let active = true;
      const unsubscribeFirebase = onFirebaseAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        if (!active) return;

        if (!firebaseUser?.email) {
          currentUser = null;
          localStorage.removeItem('erp_current_user');
          callback(null);
          return;
        }

        try {
          setFirebaseBackendState('ready');
          const profile = await getOrCreateFirebaseUserProfile(firebaseUser);

          if (!active || !profile || profile.active === false) {
            currentUser = null;
            localStorage.removeItem('erp_current_user');
            callback(null);
            return;
          }

          currentUser = profile;
          localStorage.setItem('erp_current_user', JSON.stringify(profile));
          callback(profile);
        } catch (error) {
          reportFirebaseFailure('restoring authenticated user profile', error);
          currentUser = null;
          localStorage.removeItem('erp_current_user');
          callback(null);
        }
      });

      return () => {
        active = false;
        unsubscribeFirebase();
        authStateListener = null;
      };
    }

    callback(currentUser);
    return () => {
      authStateListener = null;
    };
  },

  getCurrentUser(): UserProfile | null {
    return currentUser;
  },

  async getIdToken(forceRefresh = false): Promise<string> {
    if (!isFirebaseRuntimeEnabled || !firebaseAuth?.currentUser) {
      throw new Error('Phiên đăng nhập Firebase không tồn tại. Vui lòng đăng nhập lại.');
    }
    return firebaseAuth.currentUser.getIdToken(forceRefresh);
  }
};
