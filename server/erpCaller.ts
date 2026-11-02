import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { isUserRole } from '../src/shared/types/user.js';

/** Verify the token and the current server-side account, never a client-supplied role. */
export async function requireActiveErpCaller(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new AdminApiError(401, 'Vui lòng đăng nhập lại.');
  const { auth, firestore } = getFirebaseAdminServices();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    throw new AdminApiError(401, 'Phiên đăng nhập không hợp lệ.');
  }
  // The Auth account and the ERP profile are independent reads; fetching both at once saves a round trip.
  const [user, profileSnapshot] = await Promise.all([
    auth.getUser(uid).catch(() => null),
    firestore.collection('users').doc(uid).get()
  ]);
  if (!user || user.disabled) throw new AdminApiError(401, 'Phiên đăng nhập không hợp lệ.');
  const email = user.email;
  const profile = profileSnapshot.data();
  if (profile?.active !== true || profile.uid !== uid || String(profile.email).toLowerCase() !== email?.toLowerCase())
    throw new AdminApiError(403, 'Hồ sơ tài khoản không hợp lệ hoặc đã khóa.');
  if (!isUserRole(profile.role))
    throw new AdminApiError(403, 'Vai trò của tài khoản không còn được hỗ trợ. Vui lòng liên hệ Admin.');
  return {
    uid,
    displayName: String(profile.displayName || email),
    role: String(profile.role),
    active: true,
    allowedPages: Array.isArray(profile.allowedPages) ? (profile.allowedPages as string[]) : []
  };
}
