import React, { useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu, type RowActionMenuItem } from '@/components/RowActionMenu';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { getDefaultPagesForRole } from '@/app/navigation/accessControl';
import { adminUserService } from '@/services/adminUserService';
import { auditService } from '@/services/auditService';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { ROLE_PAGES, USER_ROLES, USER_ROLE_LABELS, isUserRole, type UserProfile } from '@/shared/types';
import {
  ACCOUNT_STATUS_LABELS,
  accountRoleLabel,
  accountStatus,
  filterAccounts,
  formatAccountDate,
  type AccountStatus
} from '../model/accountAdministration';
import { AccountActivityDialog } from '../components/AccountActivityDialog';
import { AccountFormDialog, type AccountFormValues } from '../components/AccountFormDialog';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import './UserManagement.css';

interface UserManagementProps {
  users: UserProfile[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

type AccountForm = { mode: 'create' } | { mode: 'edit'; account: UserProfile };

const ACCOUNT_COLUMNS: TableColumnOption[] = [
  { id: 'name', label: 'Họ và tên', required: true },
  { id: 'email', label: 'Email' },
  { id: 'role', label: 'Vai trò' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'createdAt', label: 'Ngày khởi tạo' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['name'];
const LOCKED_END = ['actions'];
const ROLE_FILTER_OPTIONS = USER_ROLES.map(role => ({ value: role, label: USER_ROLE_LABELS[role] }));
const STATUS_FILTER_OPTIONS = Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const NEW_ACCOUNT: AccountFormValues = {
  displayName: '',
  email: '',
  password: '',
  role: 'sale',
  active: true,
  allowedPages: getDefaultPagesForRole('sale')
};

const formValuesOf = (account: UserProfile): AccountFormValues => ({
  displayName: account.displayName,
  email: account.email,
  password: '',
  role: account.role,
  active: account.active,
  // Ticks saved before D-PQ1 may name pages outside the role; the server would reject them.
  allowedPages: (account.allowedPages || getDefaultPagesForRole(account.role)).filter(page =>
    ROLE_PAGES[account.role].includes(page)
  )
});

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export const UserManagement: React.FC<UserManagementProps> = ({ users, currentUser, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<AccountStatus[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState<AccountForm | null>(null);
  const [passwordAccount, setPasswordAccount] = useState<UserProfile | null>(null);
  const [activityAccount, setActivityAccount] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'account-list',
    columns: ACCOUNT_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });
  const visibleAccounts = filterAccounts(users, { keyword: search, roles: roleFilters, statuses: statusFilters });
  const pagination = useDataTablePagination(visibleAccounts);
  const activeFilterCount = roleFilters.length + statusFilters.length;
  const resetFilters = () => {
    setRoleFilters([]);
    setStatusFilters([]);
  };

  const recordAccountEvent = (action: string, summary: string, account: Pick<UserProfile, 'uid' | 'displayName'>) =>
    auditService.recordSafely(currentUser, {
      category: 'administration',
      module: 'account',
      action,
      summary,
      targetType: 'user',
      targetId: account.uid || undefined,
      targetLabel: account.displayName
    });

  /** One request at a time; the API message (already user-facing) is shown when the server refuses. */
  const runAccountAction = async (action: () => Promise<void>, fallbackError: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showErrorToast(errorMessage(error, fallbackError));
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = (values: AccountFormValues) => {
    if (!form) return;
    if (form.mode === 'create' && users.some(account => account.email.toLowerCase() === values.email)) {
      showErrorToast('Email này đã có tài khoản trên hệ thống.');
      return;
    }
    const fields = {
      displayName: values.displayName,
      role: values.role,
      active: values.active,
      allowedPages: values.allowedPages
    };
    return runAccountAction(async () => {
      if (form.mode === 'create') {
        const created = await adminUserService.create({ ...fields, email: values.email, password: values.password });
        recordAccountEvent('account_created', `Tạo tài khoản ${values.displayName}`, created);
        showSuccessToast('Đã thêm thành công');
      } else {
        await adminUserService.update({ ...fields, uid: form.account.uid });
        recordAccountEvent('account_updated', `Cập nhật tài khoản ${form.account.displayName}`, form.account);
        showSuccessToast('Đã lưu thành công');
      }
      setForm(null);
      onRefresh();
    }, 'Không thể lưu tài khoản.');
  };

  const resetPassword = (account: UserProfile, password: string) =>
    runAccountAction(async () => {
      await adminUserService.resetPassword(account.uid, password);
      recordAccountEvent('password_reset', `Đặt lại mật khẩu tài khoản ${account.displayName}`, account);
      setPasswordAccount(null);
      showSuccessToast('Đã đặt lại mật khẩu');
    }, 'Không thể đặt lại mật khẩu.');

  const toggleActive = async (account: UserProfile) => {
    const locking = account.active;
    if (
      locking &&
      !(await confirmDelete(`Khóa tài khoản ${account.displayName}? Nhân viên bị đăng xuất và không đăng nhập được.`, {
        title: 'Khóa tài khoản',
        confirmLabel: 'Khóa'
      }))
    )
      return;
    await runAccountAction(async () => {
      await adminUserService.setActive(account.uid, !locking);
      const verb = locking ? 'Khóa' : 'Mở khóa';
      recordAccountEvent(
        locking ? 'account_locked' : 'account_activated',
        `${verb} tài khoản ${account.displayName}`,
        account
      );
      showSuccessToast(locking ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản');
      onRefresh();
    }, 'Không thể đổi trạng thái tài khoản.');
  };

  const deleteAccount = async (account: UserProfile) => {
    if (!(await confirmDelete(`Xóa vĩnh viễn tài khoản ${account.displayName} (${account.email})?`))) return;
    await runAccountAction(async () => {
      await adminUserService.delete(account.uid);
      recordAccountEvent('account_deleted', `Xóa tài khoản ${account.displayName}`, account);
      showSuccessToast('Đã xóa thành công');
      onRefresh();
    }, 'Không thể xóa tài khoản.');
  };

  /** Accounts with a removed role can only be locked or deleted (D-PQ1); nobody acts on their own account here. */
  const rowActions = (account: UserProfile): RowActionMenuItem[] => {
    const isSelf = account.uid === currentUser.uid;
    const supported = isUserRole(account.role);
    return [
      { label: 'Lịch sử', onSelect: () => setActivityAccount(account) },
      ...(supported ? [{ label: 'Chỉnh sửa', onSelect: () => setForm({ mode: 'edit', account }) }] : []),
      ...(supported && !isSelf ? [{ label: 'Đặt lại mật khẩu', onSelect: () => setPasswordAccount(account) }] : []),
      ...(!isSelf
        ? [
            {
              label: account.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
              onSelect: () => void toggleActive(account)
            },
            { label: 'Xóa', onSelect: () => void deleteAccount(account), danger: true }
          ]
        : [])
    ].map(action => ({ ...action, disabled: busy }));
  };

  return (
    <div className="users-view account-page">
      <PageContextHeader section="Tài khoản" current="Danh sách người dùng" />
      <section className="card account-workspace" data-erp-table-text="single-line">
        <div className="account-toolbar">
          <input
            type="search"
            aria-label="Tìm tài khoản"
            placeholder="Tìm theo họ tên hoặc email…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
          {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
          <button type="button" className="btn btn-primary" onClick={() => setForm({ mode: 'create' })} disabled={busy}>
            Thêm người dùng
          </button>
        </div>
        <DataFilterChipBar
          chips={[
            ...roleFilters.map(value => ({
              id: `role:${value}`,
              label: accountRoleLabel(value),
              onRemove: () => setRoleFilters(roleFilters.filter(item => item !== value))
            })),
            ...statusFilters.map(value => ({
              id: `status:${value}`,
              label: ACCOUNT_STATUS_LABELS[value],
              onRemove: () => setStatusFilters(statusFilters.filter(item => item !== value))
            }))
          ]}
          onClear={resetFilters}
        />
        <div className="account-list-frame">
          <div className="table-container erp-primary-data-table">
            <table className="account-list has-dynamic-columns" data-resize-key="account-list">
              <thead>
                <tr>
                  <ReorderableTableCells
                    order={table.orderedColumnIds}
                    getHeaderProps={table.getHeaderProps}
                    labels={table.labels}
                  >
                    <th key="name">Họ và tên</th>
                    <th key="email">Email</th>
                    <th key="role">Vai trò</th>
                    <th key="status">Trạng thái</th>
                    <th key="createdAt">Ngày khởi tạo</th>
                    <th key="actions" aria-label="Thao tác" />
                  </ReorderableTableCells>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map(account => {
                  const status = accountStatus(account);
                  const name = account.uid === currentUser.uid ? `${account.displayName} (Bạn)` : account.displayName;
                  return (
                    <tr key={account.uid}>
                      <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                        <td key="name" title={name}>
                          <strong>{name}</strong>
                        </td>
                        <td key="email" title={account.email}>
                          {account.email}
                        </td>
                        <td key="role">
                          <span className={isUserRole(account.role) ? undefined : 'account-legacy-role'}>
                            {accountRoleLabel(account.role)}
                          </span>
                        </td>
                        <td key="status">
                          <span
                            className={`erp-status-text erp-status-text--${status === 'active' ? 'success' : 'danger'}`}
                          >
                            {ACCOUNT_STATUS_LABELS[status]}
                          </span>
                        </td>
                        <td key="createdAt">{formatAccountDate(account.createdAt)}</td>
                        <td key="actions">
                          <RowActionMenu label={`Thao tác ${account.displayName}`} actions={rowActions(account)} />
                        </td>
                      </ReorderableTableCells>
                    </tr>
                  );
                })}
                {!visibleAccounts.length && (
                  <tr>
                    <td className="account-table-empty" colSpan={table.orderedColumnIds.length}>
                      {users.length ? 'Không có tài khoản phù hợp từ khóa hoặc bộ lọc.' : 'Chưa có tài khoản nào.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...pagination.paginationProps} />
        </div>
      </section>
      <TableColumnCustomizer {...table.customizerProps} />
      <DataFilterPanel
        open={showFilters}
        title="Lọc tài khoản"
        description="Lọc theo vai trò và trạng thái."
        activeCount={activeFilterCount}
        onClose={() => setShowFilters(false)}
        onReset={resetFilters}
      >
        <DataFilterSection title="Vai trò" selectedCount={roleFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={ROLE_FILTER_OPTIONS}
            selectedValues={roleFilters}
            onChange={setRoleFilters}
          />
        </DataFilterSection>
        <DataFilterSection title="Trạng thái" selectedCount={statusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={STATUS_FILTER_OPTIONS}
            selectedValues={statusFilters}
            onChange={values => setStatusFilters(values as AccountStatus[])}
          />
        </DataFilterSection>
      </DataFilterPanel>

      {form && (
        <AccountFormDialog
          key={form.mode === 'edit' ? form.account.uid : 'new'}
          mode={form.mode}
          initialValues={form.mode === 'edit' ? formValuesOf(form.account) : NEW_ACCOUNT}
          isSelf={form.mode === 'edit' && form.account.uid === currentUser.uid}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={values => void saveAccount(values)}
        />
      )}
      {passwordAccount && (
        <ResetPasswordDialog
          account={passwordAccount}
          busy={busy}
          onCancel={() => setPasswordAccount(null)}
          onSubmit={password => void resetPassword(passwordAccount, password)}
        />
      )}
      {activityAccount && (
        <AccountActivityDialog
          key={activityAccount.uid}
          account={activityAccount}
          onClose={() => setActivityAccount(null)}
        />
      )}
    </div>
  );
};
