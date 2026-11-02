import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';

/**
 * D-BM2 (02/11/2026): the owner chose to let admins read staff passwords. Firebase keeps only a hash, so every
 * password the ERP sets (admin create/reset, self change) is also sealed here with AES-256-GCM. The key lives only
 * in the server environment (ACCOUNT_PASSWORD_KEY, 32 bytes base64, never VITE_*), the documents are unreadable to
 * browsers (firestore.rules), and every reveal is audited.
 */
export const ACCOUNT_SECRETS = 'account_secrets';
export type PasswordSource = 'admin_create' | 'admin_reset' | 'self_change';

const vaultKey = (): Buffer | null => {
  const encoded = process.env.ACCOUNT_PASSWORD_KEY;
  if (!encoded) return null;
  const key = Buffer.from(encoded, 'base64');
  return key.length === 32 ? key : null;
};

export const isPasswordVaultConfigured = () => vaultKey() !== null;

export interface SealedPassword {
  iv: string;
  tag: string;
  ciphertext: string;
}

export const sealPasswordText = (password: string, key: Buffer, uid: string): SealedPassword => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // Binding the account id stops a sealed password from being replayed onto another account's document.
  cipher.setAAD(Buffer.from(uid));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
};

export const openPasswordText = (sealed: SealedPassword, key: Buffer, uid: string): string => {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(Buffer.from(uid));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

/** Without a configured key nothing is stored; the password change itself still succeeds. */
export async function storeAccountPassword(uid: string, password: string, source: PasswordSource, actorName: string) {
  const key = vaultKey();
  if (!key) return false;
  const { firestore } = getFirebaseAdminServices();
  await firestore
    .collection(ACCOUNT_SECRETS)
    .doc(uid)
    .set({
      ...sealPasswordText(password, key, uid),
      source,
      updatedAt: new Date().toISOString(),
      updatedBy: actorName
    });
  return true;
}

export async function deleteAccountPassword(uid: string) {
  const { firestore } = getFirebaseAdminServices();
  await firestore.collection(ACCOUNT_SECRETS).doc(uid).delete();
}

export async function revealAccountPassword(
  caller: { uid: string; profile: { displayName: string; role: string } },
  uid: string
) {
  const key = vaultKey();
  if (!key)
    throw new AdminApiError(503, 'Chưa cấu hình khóa lưu mật khẩu trên máy chủ.', 'password-vault/not-configured');
  const { firestore } = getFirebaseAdminServices();
  const snapshot = await firestore.collection(ACCOUNT_SECRETS).doc(uid).get();
  const sealed = snapshot.data() as (SealedPassword & { source: PasswordSource; updatedAt: string }) | undefined;
  if (!snapshot.exists || !sealed)
    throw new AdminApiError(
      404,
      'Chưa lưu mật khẩu của tài khoản này. Hãy đặt lại mật khẩu một lần để xem được.',
      'password-vault/missing'
    );
  let password: string;
  try {
    password = openPasswordText(sealed, key, uid);
  } catch {
    throw new AdminApiError(
      409,
      'Không giải mã được mật khẩu đã lưu. Hãy đặt lại mật khẩu.',
      'password-vault/unreadable'
    );
  }
  const now = new Date().toISOString();
  await firestore.collection('audit_events').doc().set({
    actorId: caller.uid,
    actorName: caller.profile.displayName,
    actorRole: caller.profile.role,
    category: 'administration',
    module: 'account',
    action: 'password_revealed',
    summary: 'Xem mật khẩu tài khoản',
    targetType: 'user',
    targetId: uid,
    createdAt: now,
    occurredAt: now,
    sessionId: 'account-api'
  });
  return { uid, password, source: sealed.source, updatedAt: sealed.updatedAt };
}
