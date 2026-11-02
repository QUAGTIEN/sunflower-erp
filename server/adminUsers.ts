import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  ERP_PAGE_IDS,
  ROLE_PAGES,
  USER_DIRECTORY_COLLECTION,
  USER_ROLES,
  isUserRole,
  toUserDirectoryEntry,
  type UserRole
} from '../src/shared/types/user.js';

const ERP_PAGE_ID_SET = new Set<string>(ERP_PAGE_IDS);
const USER_ROLE_SET = new Set<string>(USER_ROLES);
const BOOTSTRAP_ADMIN_EMAIL = 'admin@sunflower.com';

export interface ErpUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  allowedPages: string[];
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'admin-api/error'
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      throw new AdminApiError(400, 'Dữ liệu gửi lên không hợp lệ.', 'request/invalid-body');
    }
    return body;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(400, 'Không thể đọc dữ liệu yêu cầu.', 'request/invalid-json');
  }
};

const requiredString = (body: Record<string, unknown>, field: string, label: string, minimumLength = 1): string => {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    throw new AdminApiError(400, `${label} không hợp lệ.`, `validation/${field}`);
  }
  return value.trim();
};

const requiredBoolean = (body: Record<string, unknown>, field: string, label: string): boolean => {
  const value = body[field];
  if (typeof value !== 'boolean') {
    throw new AdminApiError(400, `${label} không hợp lệ.`, `validation/${field}`);
  }
  return value;
};

const requiredRole = (body: Record<string, unknown>): UserRole => {
  const role = requiredString(body, 'role', 'Vai trò');
  if (!USER_ROLE_SET.has(role)) {
    throw new AdminApiError(400, 'Vai trò không được hỗ trợ.', 'validation/role');
  }
  return role as UserRole;
};

const requiredAllowedPages = (body: Record<string, unknown>, role: UserRole): string[] => {
  const value = body.allowedPages;
  if (!Array.isArray(value) || value.some(pageId => typeof pageId !== 'string')) {
    throw new AdminApiError(400, 'Danh sách quyền truy cập không hợp lệ.', 'validation/allowed-pages');
  }

  const uniquePages = [...new Set(value.map(pageId => pageId.trim()))];
  if (uniquePages.some(pageId => !ERP_PAGE_ID_SET.has(pageId))) {
    throw new AdminApiError(400, 'Danh sách có trang không được hệ thống hỗ trợ.', 'validation/allowed-pages');
  }
  // D-PQ1: an account can only be given pages of its own role.
  if (uniquePages.some(pageId => !ROLE_PAGES[role].includes(pageId))) {
    throw new AdminApiError(400, 'Có trang không thuộc chức năng của vai trò này.', 'validation/allowed-pages');
  }
  return uniquePages;
};

const requiredEmail = (body: Record<string, unknown>): string => {
  const email = requiredString(body, 'email', 'Email').toLowerCase();
  const simpleEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!simpleEmailPattern.test(email)) {
    throw new AdminApiError(400, 'Địa chỉ email không hợp lệ.', 'validation/email');
  }
  return email;
};

export const validateCreateUserBody = (body: Record<string, unknown>) => {
  const role = requiredRole(body);
  return {
    email: requiredEmail(body),
    password: requiredString(body, 'password', 'Mật khẩu tạm', 8),
    displayName: requiredString(body, 'displayName', 'Họ và tên', 2),
    role,
    active: requiredBoolean(body, 'active', 'Trạng thái'),
    allowedPages: requiredAllowedPages(body, role)
  };
};

export const validateUpdateUserBody = (body: Record<string, unknown>) => {
  const role = requiredRole(body);
  return {
    uid: requiredString(body, 'uid', 'UID'),
    displayName: requiredString(body, 'displayName', 'Họ và tên', 2),
    role,
    active: requiredBoolean(body, 'active', 'Trạng thái'),
    allowedPages: requiredAllowedPages(body, role)
  };
};

export const validateSetActiveBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID'),
  active: requiredBoolean(body, 'active', 'Trạng thái')
});

export const validateDeleteUserBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID')
});

export const validateOwnPasswordBody = (body: Record<string, unknown>) => ({
  password: requiredString(body, 'password', 'Mật khẩu mới', 8)
});

export const validateResetPasswordBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID'),
  password: requiredString(body, 'password', 'Mật khẩu mới', 8)
});

const bearerTokenFromRequest = (request: Request): string => {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new AdminApiError(401, 'Bạn chưa đăng nhập Firebase.', 'auth/missing-token');
  }
  return match[1];
};

const profileFromSnapshot = (snapshot: DocumentSnapshot<DocumentData>): ErpUserProfile | null => {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data || typeof data.email !== 'string') return null;
  return data as ErpUserProfile;
};

/** An admin profile counts only when it is the canonical users/{uid} document of a Firebase Auth account. */
const hasCanonicalAdmin = async (): Promise<boolean> => {
  const { auth, firestore } = getFirebaseAdminServices();
  const admins = await firestore.collection('users').where('role', '==', 'admin').get();
  for (const document of admins.docs) {
    const uid = document.data().uid;
    if (typeof uid !== 'string' || uid !== document.id) continue;
    if (
      await auth.getUser(uid).then(
        () => true,
        () => false
      )
    )
      return true;
  }
  return false;
};

/**
 * One-time setup of the very first administrator. Once any real admin profile exists the bootstrap email is an
 * ordinary account: it needs its own active admin profile like everyone else, so recreating that email elsewhere
 * never grants admin rights.
 */
const bootstrapAdminProfile = async (decodedToken: DecodedIdToken, authUser: UserRecord): Promise<ErpUserProfile> => {
  const email = authUser.email?.toLowerCase();
  if (email !== BOOTSTRAP_ADMIN_EMAIL || (await hasCanonicalAdmin())) {
    throw new AdminApiError(403, 'Tài khoản không có quyền quản trị.', 'auth/admin-required');
  }

  const { firestore } = getFirebaseAdminServices();
  const legacyProfiles = await firestore.collection('users').where('email', '==', email).limit(5).get();
  const legacyAdmin = legacyProfiles.docs.map(document => document.data()).find(data => data.role === 'admin');

  const now = new Date().toISOString();
  const profile: ErpUserProfile = {
    uid: decodedToken.uid,
    email,
    displayName:
      typeof legacyAdmin?.displayName === 'string'
        ? legacyAdmin.displayName
        : authUser.displayName || 'Quản trị Sunflower',
    role: 'admin',
    active: true,
    allowedPages: Array.isArray(legacyAdmin?.allowedPages)
      ? legacyAdmin.allowedPages.filter(
          (pageId): pageId is string => typeof pageId === 'string' && ERP_PAGE_ID_SET.has(pageId)
        )
      : [...ERP_PAGE_IDS],
    createdAt: typeof legacyAdmin?.createdAt === 'string' ? legacyAdmin.createdAt : now,
    createdBy: typeof legacyAdmin?.createdBy === 'string' ? legacyAdmin.createdBy : 'firebase-admin-bootstrap',
    updatedAt: now,
    updatedBy: 'firebase-admin-bootstrap'
  };

  const batch = firestore.batch();
  batch.set(firestore.collection('users').doc(decodedToken.uid), profile);
  batch.set(firestore.collection(USER_DIRECTORY_COLLECTION).doc(decodedToken.uid), toUserDirectoryEntry(profile, now));
  await batch.commit();
  return profile;
};

export interface AdminCaller {
  uid: string;
  email: string;
  profile: ErpUserProfile;
}

export const requireAdmin = async (request: Request): Promise<AdminCaller> => {
  const { auth, firestore } = getFirebaseAdminServices();
  let decodedToken: DecodedIdToken;

  try {
    decodedToken = await auth.verifyIdToken(bearerTokenFromRequest(request), true);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'auth/invalid-token');
  }

  let authUser: UserRecord;
  try {
    authUser = await auth.getUser(decodedToken.uid);
  } catch {
    throw new AdminApiError(401, 'Không tìm thấy tài khoản Firebase.', 'auth/user-not-found');
  }

  if (authUser.disabled) {
    throw new AdminApiError(403, 'Tài khoản quản trị đang bị khóa.', 'auth/user-disabled');
  }

  const profileSnapshot = await firestore.collection('users').doc(decodedToken.uid).get();
  const profile = profileFromSnapshot(profileSnapshot) ?? (await bootstrapAdminProfile(decodedToken, authUser));

  if (!profile.active || profile.role !== 'admin') {
    throw new AdminApiError(403, 'Tài khoản không có quyền quản trị.', 'auth/admin-required');
  }

  const authenticatedEmail = authUser.email?.toLowerCase();
  if (profile.uid !== decodedToken.uid || profile.email.toLowerCase() !== authenticatedEmail) {
    throw new AdminApiError(403, 'Hồ sơ phân quyền không khớp tài khoản Firebase.', 'auth/profile-mismatch');
  }

  return {
    uid: decodedToken.uid,
    email: authUser.email?.toLowerCase() ?? decodedToken.uid,
    profile
  };
};

const firebaseErrorCode = (error: unknown): string => {
  if (typeof error === 'object' && error && 'code' in error) {
    return String(error.code);
  }
  return 'unknown';
};

const mapFirebaseError = (error: unknown): AdminApiError => {
  if (error instanceof AdminApiError) return error;
  const code = firebaseErrorCode(error);
  if (code === 'auth/email-already-exists') {
    return new AdminApiError(409, 'Email đã tồn tại trong Firebase Authentication.', code);
  }
  if (code === 'auth/user-not-found') {
    return new AdminApiError(404, 'Tài khoản chưa tồn tại trong Firebase Authentication.', code);
  }
  if (code === 'auth/invalid-password') {
    return new AdminApiError(400, 'Mật khẩu tạm không đáp ứng yêu cầu của Firebase.', code);
  }
  if (code === 'auth/invalid-uid') {
    return new AdminApiError(400, 'UID tài khoản không hợp lệ.', code);
  }
  return new AdminApiError(500, 'Firebase không thể hoàn thành thao tác quản trị.', code);
};

export const createManagedUser = async (
  caller: AdminCaller,
  input: ReturnType<typeof validateCreateUserBody>
): Promise<ErpUserProfile> => {
  const { auth, firestore } = getFirebaseAdminServices();

  try {
    const authUser = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      disabled: !input.active,
      emailVerified: false
    });

    const profile: ErpUserProfile = {
      uid: authUser.uid,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      active: input.active,
      allowedPages: input.allowedPages,
      createdAt: new Date().toISOString(),
      createdBy: caller.email
    };

    try {
      const batch = firestore.batch();
      batch.create(firestore.collection('users').doc(authUser.uid), profile);
      batch.set(
        firestore.collection(USER_DIRECTORY_COLLECTION).doc(authUser.uid),
        toUserDirectoryEntry(profile, profile.createdAt)
      );
      await batch.commit();
    } catch (firestoreError) {
      await auth.deleteUser(authUser.uid).catch(() => undefined);
      throw firestoreError;
    }

    return profile;
  } catch (error) {
    throw mapFirebaseError(error);
  }
};

export const updateManagedUser = async (
  caller: AdminCaller,
  input: ReturnType<typeof validateUpdateUserBody>
): Promise<ErpUserProfile> => {
  if (input.uid === caller.uid && (!input.active || input.role !== 'admin')) {
    throw new AdminApiError(400, 'Bạn không thể tự khóa hoặc hạ quyền quản trị của mình.', 'user/self-protection');
  }

  const { auth, firestore } = getFirebaseAdminServices();
  try {
    const previousAuthUser = await auth.getUser(input.uid);
    const profileReference = firestore.collection('users').doc(input.uid);
    const previousProfileSnapshot = await profileReference.get();
    if (!previousProfileSnapshot.exists) {
      throw new AdminApiError(404, 'Không tìm thấy hồ sơ phân quyền của tài khoản.', 'user/profile-not-found');
    }

    await auth.updateUser(input.uid, {
      displayName: input.displayName,
      disabled: !input.active
    });

    const updatedFields = {
      displayName: input.displayName,
      role: input.role,
      active: input.active,
      allowedPages: input.allowedPages,
      updatedAt: new Date().toISOString(),
      updatedBy: caller.email
    };

    try {
      const batch = firestore.batch();
      batch.update(profileReference, updatedFields);
      batch.set(
        firestore.collection(USER_DIRECTORY_COLLECTION).doc(input.uid),
        toUserDirectoryEntry({ ...input }, updatedFields.updatedAt)
      );
      await batch.commit();
    } catch (firestoreError) {
      await auth
        .updateUser(input.uid, {
          displayName: previousAuthUser.displayName ?? undefined,
          disabled: previousAuthUser.disabled
        })
        .catch(() => undefined);
      throw firestoreError;
    }

    if (!input.active) {
      await auth.revokeRefreshTokens(input.uid);
    }

    return {
      ...(previousProfileSnapshot.data() as ErpUserProfile),
      ...updatedFields
    };
  } catch (error) {
    throw mapFirebaseError(error);
  }
};

export const setManagedUserActive = async (
  caller: AdminCaller,
  input: ReturnType<typeof validateSetActiveBody>
): Promise<{ uid: string; active: boolean }> => {
  if (input.uid === caller.uid) {
    throw new AdminApiError(400, 'Bạn không thể tự khóa tài khoản của mình.', 'user/self-protection');
  }

  const { auth, firestore } = getFirebaseAdminServices();
  try {
    const previousAuthUser = await auth.getUser(input.uid);
    const profileReference = firestore.collection('users').doc(input.uid);
    const profileSnapshot = await profileReference.get();
    if (!profileSnapshot.exists) {
      throw new AdminApiError(404, 'Không tìm thấy hồ sơ phân quyền của tài khoản.', 'user/profile-not-found');
    }

    await auth.updateUser(input.uid, { disabled: !input.active });
    try {
      const updatedAt = new Date().toISOString();
      const batch = firestore.batch();
      batch.update(profileReference, { active: input.active, updatedAt, updatedBy: caller.email });
      batch.set(
        firestore.collection(USER_DIRECTORY_COLLECTION).doc(input.uid),
        toUserDirectoryEntry({ ...(profileSnapshot.data() as ErpUserProfile), active: input.active }, updatedAt)
      );
      await batch.commit();
    } catch (firestoreError) {
      await auth.updateUser(input.uid, { disabled: previousAuthUser.disabled }).catch(() => undefined);
      throw firestoreError;
    }

    if (!input.active) {
      await auth.revokeRefreshTokens(input.uid);
    }

    return input;
  } catch (error) {
    throw mapFirebaseError(error);
  }
};

/**
 * Admins hand staff a new password instead of reading the old one: Firebase keeps only a hash, and the ERP never
 * stores passwords in Firestore or logs. Every open session of the account ends so the old password stops working.
 */
export const resetManagedUserPassword = async (
  caller: AdminCaller,
  input: ReturnType<typeof validateResetPasswordBody>
): Promise<{ uid: string }> => {
  if (input.uid === caller.uid) {
    throw new AdminApiError(400, 'Bạn không thể tự đặt lại mật khẩu của mình tại đây.', 'user/self-protection');
  }

  const { auth, firestore } = getFirebaseAdminServices();
  try {
    const profileReference = firestore.collection('users').doc(input.uid);
    const profileSnapshot = await profileReference.get();
    if (!profileSnapshot.exists) {
      throw new AdminApiError(404, 'Không tìm thấy hồ sơ phân quyền của tài khoản.', 'user/profile-not-found');
    }

    await auth.updateUser(input.uid, { password: input.password });
    await auth.revokeRefreshTokens(input.uid);
    await profileReference.update({ updatedAt: new Date().toISOString(), updatedBy: caller.email });
    return { uid: input.uid };
  } catch (error) {
    throw mapFirebaseError(error);
  }
};

/**
 * Rebuilds the public directory from the private profiles: fills entries for accounts created before the directory
 * existed and removes entries whose profile is gone. Idempotent, so an admin screen may call it whenever they differ.
 */
export const syncUserDirectory = async (): Promise<{ synced: number; removed: number }> => {
  const { firestore } = getFirebaseAdminServices();
  const [profiles, entries] = await Promise.all([
    firestore.collection('users').get(),
    firestore.collection(USER_DIRECTORY_COLLECTION).get()
  ]);
  const now = new Date().toISOString();
  const profileIds = new Set(profiles.docs.map(document => document.id));
  const stale = entries.docs.filter(document => !profileIds.has(document.id));
  const writes = [
    ...profiles.docs.map(
      document => (batch: ReturnType<typeof firestore.batch>) =>
        batch.set(
          firestore.collection(USER_DIRECTORY_COLLECTION).doc(document.id),
          toUserDirectoryEntry({ ...(document.data() as ErpUserProfile), uid: document.id }, now)
        )
    ),
    ...stale.map(document => (batch: ReturnType<typeof firestore.batch>) => batch.delete(document.ref))
  ];
  // Firestore batches hold at most 500 writes.
  for (let start = 0; start < writes.length; start += 400) {
    const batch = firestore.batch();
    writes.slice(start, start + 400).forEach(write => write(batch));
    await batch.commit();
  }
  return { synced: profiles.size, removed: stale.length };
};

/** The browser re-enters the current password right before asking, so the token proves a fresh sign-in. */
const RECENT_SIGN_IN_SECONDS = 5 * 60;

/**
 * Any active account changes its own password. Every other session of the account ends; the caller signs in again
 * with the new password. The plain password is returned only to the API handler, which seals it (D-BM2).
 */
export const changeOwnPassword = async (
  request: Request,
  input: ReturnType<typeof validateOwnPasswordBody>
): Promise<{ uid: string; displayName: string; password: string }> => {
  const { auth, firestore } = getFirebaseAdminServices();
  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await auth.verifyIdToken(bearerTokenFromRequest(request), true);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'auth/invalid-token');
  }
  if (Date.now() / 1000 - decodedToken.auth_time > RECENT_SIGN_IN_SECONDS) {
    throw new AdminApiError(401, 'Vui lòng nhập lại mật khẩu hiện tại rồi thử lại.', 'auth/requires-recent-login');
  }

  const profileReference = firestore.collection('users').doc(decodedToken.uid);
  const profile = profileFromSnapshot(await profileReference.get());
  if (!profile || !profile.active || !isUserRole(profile.role)) {
    throw new AdminApiError(403, 'Hồ sơ tài khoản không hợp lệ hoặc đã khóa.', 'auth/profile-invalid');
  }

  try {
    await auth.updateUser(decodedToken.uid, { password: input.password });
    await auth.revokeRefreshTokens(decodedToken.uid);
    await profileReference.update({ updatedAt: new Date().toISOString(), updatedBy: profile.email });
  } catch (error) {
    throw mapFirebaseError(error);
  }
  return { uid: decodedToken.uid, displayName: profile.displayName, password: input.password };
};

export const deleteManagedUser = async (
  caller: AdminCaller,
  input: ReturnType<typeof validateDeleteUserBody>
): Promise<{ uid: string; deletedAuthentication: boolean; deletedProfile: boolean }> => {
  if (input.uid === caller.uid) {
    throw new AdminApiError(400, 'Bạn không thể tự xóa tài khoản của mình.', 'user/self-protection');
  }

  const { auth, firestore } = getFirebaseAdminServices();
  const profileReference = firestore.collection('users').doc(input.uid);
  const profileSnapshot = await profileReference.get();

  let authenticationExists = true;
  try {
    await auth.getUser(input.uid);
  } catch (error) {
    if (firebaseErrorCode(error) === 'auth/user-not-found') {
      authenticationExists = false;
    } else {
      throw mapFirebaseError(error);
    }
  }

  if (!authenticationExists && !profileSnapshot.exists) {
    throw new AdminApiError(404, 'Không tìm thấy tài khoản cần xóa.', 'user/not-found');
  }

  if (profileSnapshot.exists) {
    const batch = firestore.batch();
    batch.delete(profileReference);
    batch.delete(firestore.collection(USER_DIRECTORY_COLLECTION).doc(input.uid));
    await batch.commit();
  }

  if (authenticationExists) {
    try {
      await auth.deleteUser(input.uid);
    } catch (error) {
      if (profileSnapshot.exists) {
        await profileReference.set(profileSnapshot.data() as DocumentData).catch(() => undefined);
      }
      throw mapFirebaseError(error);
    }
  }

  return {
    uid: input.uid,
    deletedAuthentication: authenticationExists,
    deletedProfile: profileSnapshot.exists
  };
};

export const jsonResponse = (payload: unknown, status = 200): Response =>
  Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

export const apiErrorResponse = (error: unknown): Response => {
  const apiError =
    error instanceof AdminApiError
      ? error
      : new AdminApiError(500, 'Máy chủ không thể hoàn thành yêu cầu.', 'admin-api/internal');

  if (apiError.status >= 500) {
    console.error('[Admin API]', error);
  }

  return jsonResponse({ error: apiError.message, code: apiError.code }, apiError.status);
};

export const rejectNonPostRequest = (request: Request): Response | null =>
  request.method === 'POST'
    ? null
    : jsonResponse({ error: 'Phương thức không được hỗ trợ.', code: 'request/method-not-allowed' }, 405);
