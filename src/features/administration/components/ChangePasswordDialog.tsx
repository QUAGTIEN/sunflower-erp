import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { authService } from '@/infrastructure/firebase/erpDataGateway';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { MINIMUM_PASSWORD_LENGTH } from './ResetPasswordDialog';
import '../pages/UserManagement.css';

interface ChangePasswordDialogProps {
  onClose: () => void;
}

const validate = (current: string, next: string, confirmation: string) => ({
  current: current ? '' : 'Nhập mật khẩu hiện tại.',
  next:
    next.trim().length < MINIMUM_PASSWORD_LENGTH
      ? `Mật khẩu mới tối thiểu ${MINIMUM_PASSWORD_LENGTH} ký tự.`
      : next === current
        ? 'Mật khẩu mới phải khác mật khẩu hiện tại.'
        : '',
  confirmation: confirmation === next ? '' : 'Mật khẩu nhập lại không khớp.'
});

/** Every account changes its own password here; the old one must be re-entered first. */
export function ChangePasswordDialog({ onClose }: ChangePasswordDialogProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = validate(current, next, confirmation);
  const dirty = Boolean(current || next || confirmation);

  useEffect(() => {
    if (!dirty && !busy) return;
    return registerNavigationGuard(() => !busy && window.confirm('Mật khẩu chưa đổi xong. Vẫn rời trang?'));
  }, [dirty, busy]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (busy || Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await authService.changeOwnPassword(current, next.trim());
      showSuccessToast('Đã đổi mật khẩu', 'Các thiết bị khác đã bị đăng xuất.');
      onClose();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Không đổi được mật khẩu.');
    } finally {
      setBusy(false);
    }
  };
  const fieldError = (message: string) =>
    submitted && message ? <small className="account-field-error">{message}</small> : null;
  const passwordInput = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    autoComplete: string
  ) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={busy}
      />
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content reset-password-dialog" role="dialog" aria-label="Đổi mật khẩu">
        <div className="modal-header">
          <span className="account-dialog-title">Đổi mật khẩu</span>
          <IconButton
            label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            icon={visible ? <EyeOff size={15} /> : <Eye size={15} />}
            onClick={() => setVisible(value => !value)}
          />
        </div>
        <form onSubmit={submit} noValidate>
          <div className="modal-body">
            {passwordInput('own-current-password', 'Mật khẩu hiện tại *', current, setCurrent, 'current-password')}
            {fieldError(errors.current)}
            {passwordInput('own-new-password', 'Mật khẩu mới *', next, setNext, 'new-password')}
            {fieldError(errors.next)}
            {passwordInput(
              'own-confirm-password',
              'Nhập lại mật khẩu mới *',
              confirmation,
              setConfirmation,
              'new-password'
            )}
            {fieldError(errors.confirmation)}
            <small>Sau khi đổi, các thiết bị khác đang đăng nhập tài khoản này sẽ bị đăng xuất.</small>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => (!dirty || window.confirm('Bỏ đổi mật khẩu?')) && onClose()}
              disabled={busy}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
