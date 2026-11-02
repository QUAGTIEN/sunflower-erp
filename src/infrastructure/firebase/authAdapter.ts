import {
  EmailAuthProvider,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  reauthenticateWithCredential,
  signOut as signOutFirebase,
  type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_USERS } from '@/data/seeds/erpSeedData';
import { isUserRole, type UserProfile } from '@/shared/types';
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

/**
 * Only the server may create profiles. It does so for the bootstrap email solely while the system has no
 * administrator yet; otherwise it refuses and the login ends with "no profile".
 */
const bootstrapFirstAdmin = async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
  const response = await fetch('/api/users/manage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'bootstrap' })
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as { user?: UserProfile } | null;
  return payload?.user?.uid === firebaseUser.uid ? payload.user : null;
};

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
  return bootstrapFirstAdmin(firebaseUser);
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
    let user: UserProfile | null;

    if (firebaseAuthMode === 'email-password') {
      const firebaseEmail = searchIdentifier.includes('@')
        ? searchIdentifier
        : searchIdentifier === 'admin'
          ? FIREBASE_BOOTSTRAP_ADMIN_EMAIL
          : '';
      if (!firebaseEmail) {
        throw new Error('Tài khoản không tồn tại trên hệ thống.');
      }

      try {
        const firebaseUser = await authenticateFirebase(firebaseEmail, password);
        user = await getOrCreateFirebaseUserProfile(firebaseUser);
        if (!user) {
          await signOutFirebase(firebaseAuth!);
          throw Object.assign(new Error('Tài khoản Firebase chưa có hồ sơ phân quyền trong ERP.'), {
            code: 'auth/profile-not-found'
          });
        }
      } catch (error) {
        const code = getFirebaseErrorCode(error);
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          throw new Error('Mật khẩu hoặc tài khoản Firebase không đúng. Vui lòng thử lại.', { cause: error });
        }
        if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
          throw new Error('Firebase Authentication chưa được bật chế độ Email/Password.', { cause: error });
        }
        if (code === 'auth/user-disabled') {
          throw new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.', { cause: error });
        }
        if (code === 'auth/profile-not-found') {
          throw error;
        }
        throw new Error(`Không thể đăng nhập Firebase (${code}). Vui lòng kiểm tra cấu hình hệ thống.`, {
          cause: error
        });
      }
    } else {
      const dbUsers = await dbService.getCollection('users');
      user =
        dbUsers.find(
          (candidate: UserProfile) =>
            candidate.email.toLowerCase() === searchIdentifier ||
            candidate.email.toLowerCase().split('@')[0] === searchIdentifier
        ) || null;

      if (!user) {
        const defaultUser = DEFAULT_USERS.find(
          candidate =>
            candidate.email.toLowerCase() === searchIdentifier ||
            candidate.email.toLowerCase().split('@')[0] === searchIdentifier
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

    if (!isUserRole(user.role)) {
      throw new Error('Vai trò của tài khoản không còn được hỗ trợ. Vui lòng liên hệ Admin.');
    }

    // The local demo (development builds only, see client.ts) has no passwords; real accounts use Firebase.
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
      const unsubscribeFirebase = onFirebaseAuthStateChanged(firebaseAuth, async firebaseUser => {
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

          if (!active || !profile || profile.active === false || !isUserRole(profile.role)) {
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

  /**
   * Re-checks the current password with Firebase, then lets the server set the new one (so its sealed copy for
   * admins stays in step, D-BM2). The server ends every session of the account, so this tab signs straight back in.
   */
  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    const firebaseUser = firebaseAuth?.currentUser;
    if (!isFirebaseRuntimeEnabled || !firebaseUser?.email) {
      throw new Error('Đổi mật khẩu cần đăng nhập bằng tài khoản Firebase.');
    }
    try {
      await reauthenticateWithCredential(
        firebaseUser,
        EmailAuthProvider.credential(firebaseUser.email, currentPassword)
      );
    } catch (error) {
      const code = getFirebaseErrorCode(error);
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        throw new Error('Mật khẩu hiện tại không đúng.', { cause: error });
      }
      throw new Error('Không xác nhận được mật khẩu hiện tại. Vui lòng thử lại.', { cause: error });
    }
    const response = await fetch('/api/users/manage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await firebaseUser.getIdToken(true)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_own_password', password: newPassword })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Không đổi được mật khẩu. Vui lòng thử lại.');
    await authenticateFirebase(firebaseUser.email, newPassword);
  },

  async getIdToken(forceRefresh = false): Promise<string> {
    if (!isFirebaseRuntimeEnabled || !firebaseAuth?.currentUser) {
      throw new Error('Phiên đăng nhập Firebase không tồn tại. Vui lòng đăng nhập lại.');
    }
    return firebaseAuth.currentUser.getIdToken(forceRefresh);
  }
};
