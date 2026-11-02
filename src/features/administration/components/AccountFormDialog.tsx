import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { getDefaultPagesForRole } from '@/app/navigation/accessControl';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@/shared/types';
import { pageGroupsForRole } from '../model/accountAdministration';
import { MINIMUM_PASSWORD_LENGTH } from './ResetPasswordDialog';

export interface AccountFormValues {
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
  allowedPages: string[];
}

interface AccountFormDialogProps {
  mode: 'create' | 'edit';
  initialValues: AccountFormValues;
  /** Admins cannot lock themselves out or drop their own Admin role. */
  isSelf: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: AccountFormValues) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISCARD_MESSAGE = 'Thông tin tài khoản chưa lưu sẽ mất. Vẫn đóng?';

const validate = (values: AccountFormValues, mode: AccountFormDialogProps['mode']) => ({
  displayName: values.displayName.trim().length < 2 ? 'Nhập họ và tên (tối thiểu 2 ký tự).' : '',
  email: EMAIL_PATTERN.test(values.email.trim()) ? '' : 'Email không hợp lệ.',
  password:
    mode === 'create' && values.password.trim().length < MINIMUM_PASSWORD_LENGTH
      ? `Mật khẩu tạm tối thiểu ${MINIMUM_PASSWORD_LENGTH} ký tự.`
      : ''
});

export function AccountFormDialog({ mode, initialValues, isSelf, busy, onCancel, onSubmit }: AccountFormDialogProps) {
  const [values, setValues] = useState(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const errors = validate(values, mode);
  const pageGroups = pageGroupsForRole(values.role);

  useEffect(() => {
    if (!dirty && !busy) return;
    const unregister = registerNavigationGuard(() => !busy && window.confirm(DISCARD_MESSAGE));
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, busy]);

  const update = (fields: Partial<AccountFormValues>) => setValues(current => ({ ...current, ...fields }));
  const changeRole = (role: UserRole) => update({ role, allowedPages: getDefaultPagesForRole(role) });
  const togglePage = (pageId: string, checked: boolean) =>
    update({
      allowedPages: checked
        ? [...values.allowedPages, pageId]
        : values.allowedPages.filter(allowedPage => allowedPage !== pageId)
    });
  const close = () => {
    if (busy || (dirty && !window.confirm(DISCARD_MESSAGE))) return;
    onCancel();
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (busy || Object.values(errors).some(Boolean)) return;
    onSubmit({ ...values, displayName: values.displayName.trim(), email: values.email.trim().toLowerCase() });
  };
  const fieldError = (message: string) =>
    submitted && message ? <small className="account-field-error">{message}</small> : null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content account-form-dialog"
        role="dialog"
        aria-label={mode === 'create' ? 'Thêm người dùng' : 'Chỉnh sửa tài khoản'}
      >
        <div className="modal-header">
          <span className="account-dialog-title">{mode === 'create' ? 'Thêm người dùng' : 'Chỉnh sửa tài khoản'}</span>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="modal-body account-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="account-display-name">Họ và tên *</label>
                <input
                  id="account-display-name"
                  value={values.displayName}
                  onChange={event => update({ displayName: event.target.value })}
                  placeholder="Nhập họ và tên đầy đủ"
                  disabled={busy}
                />
                {fieldError(errors.displayName)}
              </div>
              <div className="form-group">
                <label htmlFor="account-email">Email đăng nhập *</label>
                <input
                  id="account-email"
                  type="email"
                  value={values.email}
                  onChange={event => update({ email: event.target.value })}
                  placeholder="vd: ten@sunflower.com"
                  readOnly={mode === 'edit'}
                  title={mode === 'edit' ? 'Email đăng nhập không đổi được sau khi tạo' : undefined}
                  disabled={busy}
                />
                {fieldError(errors.email)}
              </div>
            </div>
            {mode === 'create' && (
              <div className="form-group">
                <label htmlFor="account-password">Mật khẩu tạm *</label>
                <div className="account-password-field">
                  <input
                    id="account-password"
                    type={passwordVisible ? 'text' : 'password'}
                    value={values.password}
                    onChange={event => update({ password: event.target.value })}
                    placeholder={`Tối thiểu ${MINIMUM_PASSWORD_LENGTH} ký tự`}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                  <IconButton
                    label={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    icon={passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    onClick={() => setPasswordVisible(current => !current)}
                  />
                </div>
                {fieldError(errors.password)}
              </div>
            )}
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="account-role">Vai trò *</label>
                <select
                  id="account-role"
                  value={values.role}
                  onChange={event => changeRole(event.target.value as UserRole)}
                  disabled={busy || isSelf}
                  title={isSelf ? 'Không thể tự đổi vai trò của chính mình' : undefined}
                >
                  {USER_ROLES.map(role => (
                    <option key={role} value={role}>
                      {USER_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-status">Trạng thái</label>
                <select
                  id="account-status"
                  value={values.active ? 'active' : 'locked'}
                  onChange={event => update({ active: event.target.value === 'active' })}
                  disabled={busy || isSelf}
                  title={isSelf ? 'Không thể tự khóa tài khoản của chính mình' : undefined}
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="locked">Đã khóa</option>
                </select>
              </div>
            </div>
            <fieldset className="account-pages" disabled={busy}>
              <legend>Trang được phép truy cập</legend>
              {pageGroups.map(group => (
                <div key={group.label} className="account-pages__group">
                  <span className="account-pages__group-label">{group.label}</span>
                  <div className="account-pages__options">
                    {group.pages.map(page => (
                      <label key={page.id} className="account-pages__option">
                        <input
                          type="checkbox"
                          checked={values.role === 'admin' || values.allowedPages.includes(page.id)}
                          disabled={values.role === 'admin'}
                          onChange={event => togglePage(page.id, event.target.checked)}
                        />
                        <span>{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {values.role === 'admin' && <small>Admin luôn truy cập toàn bộ các trang.</small>}
            </fieldset>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
