import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './firebaseAdmin';

export const USER_ROLES = [
  'admin',
  'sale',
  'designer',
  'purchaser',
  'producer',
  'accountant'
] as const;

export type UserRole = typeof USER_ROLES[number];

export const ERP_PAGE_IDS = [
  'dashboard',
  'chat',
  'crm',
  'leads',
  'sales',
  'design',
  'purchase',
  'suppliers',
  'inventory',
  'production',
  'delivery',
  'accounting',
  'users',
  'recycle_bin'
] as const;

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const readJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json() as unknown;
    if (!isRecord(body)) {
      throw new AdminApiError(400, 'Dữ liệu gửi lên không hợp lệ.', 'request/invalid-body');
    }
    return body;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(400, 'Không thể đọc dữ liệu yêu cầu.', 'request/invalid-json');
  }
};

const requiredString = (
  body: Record<string, unknown>,
  field: string,
  label: string,
  minimumLength = 1
): string => {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    throw new AdminApiError(400, `${label} không hợp lệ.`, `validation/${field}`);
  }
  return value.trim();
};

const requiredBoolean = (
  body: Record<string, unknown>,
  field: string,
  label: string
): boolean => {
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

const requiredAllowedPages = (body: Record<string, unknown>): string[] => {
  const value = body.allowedPages;
  if (!Array.isArray(value) || value.some(pageId => typeof pageId !== 'string')) {
    throw new AdminApiError(400, 'Danh sách quyền truy cập không hợp lệ.', 'validation/allowed-pages');
  }

  const uniquePages = [...new Set(value.map(pageId => pageId.trim()))];
  if (uniquePages.some(pageId => !ERP_PAGE_ID_SET.has(pageId))) {
    throw new AdminApiError(400, 'Danh sách có trang không được hệ thống hỗ trợ.', 'validation/allowed-pages');
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

export const validateCreateUserBody = (body: Record<string, unknown>) => ({
  email: requiredEmail(body),
  password: requiredString(body, 'password', 'Mật khẩu tạm', 8),
  displayName: requiredString(body, 'displayName', 'Họ và tên', 2),
  role: requiredRole(body),
  active: requiredBoolean(body, 'active', 'Trạng thái'),
  allowedPages: requiredAllowedPages(body)
});

export const validateUpdateUserBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID'),
  displayName: requiredString(body, 'displayName', 'Họ và tên', 2),
  role: requiredRole(body),
  active: requiredBoolean(body, 'active', 'Trạng thái'),
  allowedPages: requiredAllowedPages(body)
});

export const validateSetActiveBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID'),
  active: requiredBoolean(body, 'active', 'Trạng thái')
});

export const validateDeleteUserBody = (body: Record<string, unknown>) => ({
  uid: requiredString(body, 'uid', 'UID')
});

const bearerTokenFromRequest = (request: Request): string => {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new AdminApiError(401, 'Bạn chưa đăng nhập Firebase.', 'auth/missing-token');
  }
  return match[1];
};

const profileFromSnapshot = (
  snapshot: DocumentSnapshot<DocumentData>
): ErpUserProfile | null => {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data || typeof data.email !== 'string') return null;
  return data as ErpUserProfile;
};

const bootstrapAdminProfile = async (
  decodedToken: DecodedIdToken,
  authUser: UserRecord
): Promise<ErpUserProfile> => {
  const email = authUser.email?.toLowerCase();
  if (email !== BOOTSTRAP_ADMIN_EMAIL) {
    throw new AdminApiError(403, 'Tài khoản không có quyền quản trị.', 'auth/admin-required');
  }

  const { firestore } = getFirebaseAdminServices();
  const legacyProfiles = await firestore
    .collection('users')
    .where('email', '==', email)
    .limit(5)
    .get();
  const legacyAdmin = legacyProfiles.docs
    .map(document => document.data())
    .find(data => data.role === 'admin');

  const now = new Date().toISOString();
  const profile: ErpUserProfile = {
    uid: decodedToken.uid,
    email,
    displayName: typeof legacyAdmin?.displayName === 'string'
      ? legacyAdmin.displayName
      : authUser.displayName || 'Quản trị Sunflower',
    role: 'admin',
    active: true,
    allowedPages: Array.isArray(legacyAdmin?.allowedPages)
      ? legacyAdmin.allowedPages.filter((pageId): pageId is string => (
        typeof pageId === 'string' && ERP_PAGE_ID_SET.has(pageId)
      ))
      : [...ERP_PAGE_IDS],
    createdAt: typeof legacyAdmin?.createdAt === 'string' ? legacyAdmin.createdAt : now,
    createdBy: typeof legacyAdmin?.createdBy === 'string'
      ? legacyAdmin.createdBy
      : 'firebase-admin-bootstrap',
    updatedAt: now,
    updatedBy: 'firebase-admin-bootstrap'
  };

  await firestore.collection('users').doc(decodedToken.uid).set(profile);
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
  const profile = profileFromSnapshot(profileSnapshot)
    ?? await bootstrapAdminProfile(decodedToken, authUser);

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
      await firestore.collection('users').doc(authUser.uid).create(profile);
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
      await profileReference.update(updatedFields);
    } catch (firestoreError) {
      await auth.updateUser(input.uid, {
        displayName: previousAuthUser.displayName ?? undefined,
        disabled: previousAuthUser.disabled
      }).catch(() => undefined);
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
      await profileReference.update({
        active: input.active,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.email
      });
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
    await profileReference.delete();
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

export const jsonResponse = (payload: unknown, status = 200): Response => Response.json(
  payload,
  {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  }
);

export const apiErrorResponse = (error: unknown): Response => {
  const apiError = error instanceof AdminApiError
    ? error
    : new AdminApiError(500, 'Máy chủ không thể hoàn thành yêu cầu.', 'admin-api/internal');

  if (apiError.status >= 500) {
    console.error('[Admin API]', error);
  }

  return jsonResponse({ error: apiError.message, code: apiError.code }, apiError.status);
};

export const rejectNonPostRequest = (request: Request): Response | null => (
  request.method === 'POST'
    ? null
    : jsonResponse({ error: 'Phương thức không được hỗ trợ.', code: 'request/method-not-allowed' }, 405)
);
