import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { adminUserService } from '@/services/adminUserService';
import { showErrorToast } from '@/shared/feedback/mutationFeedback';

/** A revealed password disappears again on its own so it does not stay on screen. */
export const PASSWORD_VISIBLE_MS = 30_000;
const MASK = '••••••••';

/**
 * D-BM2: admins see a staff password only on request. The server decrypts it and records every reveal in the
 * account history; nothing is loaded until the eye is pressed.
 */
export function AccountPasswordCell({ uid, displayName }: { uid: string; displayName: string }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!password) return;
    const timer = window.setTimeout(() => setPassword(''), PASSWORD_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [password]);

  const toggle = async () => {
    if (password) return setPassword('');
    setLoading(true);
    try {
      setPassword((await adminUserService.revealPassword(uid)).password);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Không xem được mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="account-password-cell">
      <span className="account-password-cell__value" title={password || undefined}>
        {password || MASK}
      </span>
      <IconButton
        label={password ? `Ẩn mật khẩu ${displayName}` : `Xem mật khẩu ${displayName}`}
        icon={password ? <EyeOff size={14} /> : <Eye size={14} />}
        onClick={() => void toggle()}
        disabled={loading}
      />
    </span>
  );
}
