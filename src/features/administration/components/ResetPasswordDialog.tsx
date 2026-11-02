import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import type { UserProfile } from '@/shared/types';

export const MINIMUM_PASSWORD_LENGTH = 8;

interface ResetPasswordDialogProps {
  account: UserProfile;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}

/** The admin types the new password and hands it over; the old one cannot be read back from Firebase. */
export function ResetPasswordDialog({ account, busy, onCancel, onSubmit }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const tooShort = password.trim().length < MINIMUM_PASSWORD_LENGTH;

  return (
    <div className="modal-overlay">
      <div className="modal-content reset-password-dialog" role="dialog" aria-label="Đặt lại mật khẩu">
        <div className="modal-header">
          <span className="reset-password-dialog__title">Đặt lại mật khẩu</span>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (!tooShort && !busy) onSubmit(password.trim());
          }}
        >
          <div className="modal-body">
            <p className="reset-password-dialog__account" title={account.email}>
              {account.displayName} · {account.email}
            </p>
            <div className="form-group">
              <label htmlFor="reset-password-input">Mật khẩu mới *</label>
              <div className="reset-password-dialog__field">
                <input
                  id="reset-password-input"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={`Tối thiểu ${MINIMUM_PASSWORD_LENGTH} ký tự`}
                  minLength={MINIMUM_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  disabled={busy}
                  required
                />
                <IconButton
                  label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  icon={visible ? <EyeOff size={15} /> : <Eye size={15} />}
                  onClick={() => setVisible(current => !current)}
                />
              </div>
              <small>Nhân viên bị đăng xuất khỏi mọi thiết bị và đăng nhập lại bằng mật khẩu mới.</small>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || tooShort}>
              {busy ? 'Đang lưu...' : 'Lưu mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
