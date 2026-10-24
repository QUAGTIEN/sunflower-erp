import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';

/** Verify the token and the current server-side account, never a client-supplied role. */
export async function requireActiveErpCaller(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new AdminApiError(401, 'Vui lòng đăng nhập lại.');
  const { auth, firestore } = getFirebaseAdminServices();
  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await auth.verifyIdToken(token, true);
    const user = await auth.getUser(decoded.uid);
    if (user.disabled) throw new Error('disabled');
    uid = decoded.uid;
    email = user.email;
  } catch {
    throw new AdminApiError(401, 'Phiên đăng nhập không hợp lệ.');
  }
  const profile = (await firestore.collection('users').doc(uid).get()).data();
  if (profile?.active !== true || profile.uid !== uid || String(profile.email).toLowerCase() !== email?.toLowerCase())
    throw new AdminApiError(403, 'Hồ sơ tài khoản không hợp lệ hoặc đã khóa.');
  return {
    uid,
    displayName: String(profile.displayName || email),
    role: String(profile.role),
    active: true,
    allowedPages: Array.isArray(profile.allowedPages) ? (profile.allowedPages as string[]) : []
  };
}
