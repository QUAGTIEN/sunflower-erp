import React, { useMemo, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { adminUserService } from '@/services/adminUserService';
import { useLanguage } from '@/context/LanguageContext';
import { Activity, Clock3, History, Search, Trash2, Pencil, X } from 'lucide-react';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { auditService, type AuditEvent, type UserPresence } from '@/services/auditService';
import './UserManagement.css';

interface UserManagementProps {
  users: UserProfile[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ users, currentUser, onRefresh }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'sale' | 'designer' | 'purchaser' | 'producer' | 'accountant'>('sale');
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activityUser, setActivityUser] = useState<UserProfile | null>(null);
  const [activityEvents, setActivityEvents] = useState<AuditEvent[]>([]);
  const [activityPresence, setActivityPresence] = useState<UserPresence | null>(null);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [activityPeriod, setActivityPeriod] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('7d');
  const [activityFrom, setActivityFrom] = useState('');
  const [activityTo, setActivityTo] = useState('');

  // Map roles to Vietnamese text
  const getRoleLabel = (r: string) => {
    switch (r) {
      case 'admin': return t('Giám Đốc');
      case 'sale': return t('Nhân Viên Sale');
      case 'designer': return t('Thiết Kế');
      case 'purchaser': return t('Mua Vật Tư');
      case 'producer': return t('Sản Xuất');
      case 'accountant': return t('Kế Toán');
      default: return r;
    }
  };

  const [allowedPages, setAllowedPages] = useState<string[]>([]);

  const ALL_PAGES = [
    { id: 'dashboard', label: t('Bảng Điều Khiển') },
    { id: 'chat', label: t('Kênh Trao Đổi') },
    { id: 'crm', label: t('Khách Hàng Hợp Tác') },
    { id: 'leads', label: t('Khách Hàng Tiềm Năng') },
    { id: 'customer_data', label: t('Dữ Liệu Khách Hàng') },
    { id: 'commercial_map', label: t('Bản Đồ Thương Mại') },
    { id: 'sales', label: t('Tạo đơn hàng') },
    { id: 'design', label: t('Quản Lý Thiết Kế') },
    { id: 'purchase', label: t('Mua Hàng NCC') },
    { id: 'suppliers', label: t('Danh Sách Nhà Cung Cấp') },
    { id: 'inventory', label: t('Quản Lý Kho') },
    { id: 'production', label: t('Lệnh Sản Xuất') },
    { id: 'delivery', label: t('Phiếu Giao Hàng') },
    { id: 'accounting', label: t('Quản Lý Kế Toán') },
    { id: 'users', label: t('Quản Lý Tài Khoản') },
    { id: 'recycle_bin', label: t('Kho Rác Hệ Thống') },
  ];

  const getDefaultPagesForRole = (r: string): string[] => {
    switch (r) {
      case 'admin':
        return ['dashboard', 'chat', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales', 'design', 'purchase', 'suppliers', 'inventory', 'production', 'delivery', 'accounting', 'users', 'recycle_bin'];
      case 'sale':
        return ['dashboard', 'chat', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'];
      case 'designer':
        return ['dashboard', 'chat', 'design'];
      case 'purchaser':
        return ['dashboard', 'chat', 'purchase', 'suppliers', 'inventory'];
      case 'producer':
        return ['dashboard', 'chat', 'production'];
      case 'accountant':
        return ['dashboard', 'chat', 'accounting'];
      default:
        return ['dashboard', 'chat'];
    }
  };

  const openAddModal = () => {
    setDisplayName('');
    setEmail('');
    setTemporaryPassword('');
    setRole('sale');
    setActive(true);
    setAllowedPages(getDefaultPagesForRole('sale'));
    setShowAddModal(true);
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setDisplayName(user.displayName);
    setRole(user.role);
    setActive(user.active);
    setAllowedPages(user.allowedPages || getDefaultPagesForRole(user.role));
    setShowEditModal(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !email || temporaryPassword.length < 8) return;

    const emailTrim = email.trim().toLowerCase();

    // Check if email already exists
    const exists = users.some(u => u.email.toLowerCase() === emailTrim);
    if (exists) {
      alert(t('Email này đã được đăng ký trên hệ thống.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUserService.create({
        displayName: displayName.trim(),
        email: emailTrim,
        password: temporaryPassword,
        role,
        active,
        allowedPages
      });
      auditService.recordSafely(currentUser, {
        category: 'administration',
        module: 'account',
        action: 'account_created',
        summary: `Tạo tài khoản ${displayName.trim()}`,
        targetType: 'user',
        targetLabel: displayName.trim()
      });
      setShowAddModal(false);
      onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : t('Không thể tạo tài khoản.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    // Prevent deactivating oneself
    if (selectedUser.uid === currentUser.uid && !active) {
      alert(t('Bạn không thể tự vô hiệu hóa tài khoản của chính mình.'));
      return;
    }

    // Prevent changing ones own role
    if (selectedUser.uid === currentUser.uid && role !== 'admin') {
      alert(t('Bạn không thể tự thay đổi vai trò Admin của chính mình.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUserService.update({
        uid: selectedUser.uid,
        displayName: displayName.trim(),
        role,
        active,
        allowedPages
      });
      auditService.recordSafely(currentUser, {
        category: 'administration',
        module: 'account',
        action: 'account_updated',
        summary: `Cập nhật tài khoản ${selectedUser.displayName}`,
        targetType: 'user',
        targetId: selectedUser.uid,
        targetLabel: selectedUser.displayName
      });
      setShowEditModal(false);
      setSelectedUser(null);
      onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : t('Không thể cập nhật tài khoản.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    if (user.uid === currentUser.uid) {
      alert(t('Bạn không thể tự khóa tài khoản của chính mình.'));
      return;
    }

    if (window.confirm(t(`Bạn có chắc chắn muốn thay đổi trạng thái tài khoản ${user.displayName}?`))) {
      setIsSubmitting(true);
      try {
        await adminUserService.setActive(user.uid, !user.active);
        auditService.recordSafely(currentUser, {
          category: 'administration',
          module: 'account',
          action: user.active ? 'account_locked' : 'account_activated',
          summary: `${user.active ? 'Khóa' : 'Kích hoạt'} tài khoản ${user.displayName}`,
          targetType: 'user',
          targetId: user.uid,
          targetLabel: user.displayName
        });
        onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : t('Không thể thay đổi trạng thái tài khoản.'));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    if (userToDelete.uid === currentUser.uid) {
      alert(t('Bạn không thể tự xóa tài khoản của chính mình.'));
      return;
    }

    if (window.confirm(t('Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản người dùng này?'))) {
      setIsSubmitting(true);
      try {
        await adminUserService.delete(userToDelete.uid);
        auditService.recordSafely(currentUser, {
          category: 'administration',
          module: 'account',
          action: 'account_deleted',
          summary: `Xóa tài khoản ${userToDelete.displayName}`,
          targetType: 'user',
          targetId: userToDelete.uid,
          targetLabel: userToDelete.displayName
        });
        onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : t('Không thể xóa tài khoản.'));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Search and filter logic
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const openActivityHistory = async (account: UserProfile) => {
    setActivityUser(account);
    setActivityEvents([]);
    setActivityPresence(null);
    setActivityQuery('');
    setActivityPeriod('7d');
    setActivityFrom('');
    setActivityTo('');
    setActivityError('');
    setIsLoadingActivity(true);
    try {
      const [events, presence] = await Promise.all([
        auditService.getUserEvents(account.uid),
        dbService.getDocument('user_presence', account.uid) as Promise<UserPresence | null>
      ]);
      setActivityEvents(events);
      setActivityPresence(presence);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Không thể tải lịch sử hoạt động.');
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const visibleActivityEvents = useMemo(() => {
    const now = new Date();
    const startByPeriod: Record<string, Date | undefined> = {
      today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      all: undefined,
      custom: activityFrom ? new Date(`${activityFrom}T00:00:00`) : undefined
    };
    const start = startByPeriod[activityPeriod];
    const end = activityPeriod === 'custom' && activityTo
      ? new Date(`${activityTo}T23:59:59.999`)
      : undefined;
    const keyword = activityQuery.trim().toLocaleLowerCase('vi-VN');
    return activityEvents.filter(event => {
      const occurredAt = new Date(event.occurredAt);
      if (start && occurredAt < start) return false;
      if (end && occurredAt > end) return false;
      if (!keyword) return true;
      return [event.summary, event.action, event.module, event.targetLabel, ...(event.changes || []).map(change => `${change.label} ${change.before || ''} ${change.after || ''}`)]
        .join(' ')
        .toLocaleLowerCase('vi-VN')
        .includes(keyword);
    });
  }, [activityEvents, activityFrom, activityPeriod, activityQuery, activityTo]);

  const groupedActivityEvents = useMemo(() => visibleActivityEvents.reduce<Record<string, AuditEvent[]>>((groups, event) => {
    const key = new Date(event.occurredAt).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    (groups[key] ||= []).push(event);
    return groups;
  }, {}), [visibleActivityEvents]);

  return (
    <div className="users-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageContextHeader section={t('Tài khoản')} current={t('Danh sách người dùng')} />

      <div className="card">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder={t('Tìm theo tên hoặc email...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="all">{t('Tất Cả Vai Trò')}</option>
              <option value="admin">{t('Giám Đốc')}</option>
              <option value="sale">{t('Nhân Viên Sale')}</option>
              <option value="designer">{t('Thiết Kế')}</option>
              <option value="purchaser">{t('Mua Vật Tư')}</option>
              <option value="producer">{t('Sản Xuất')}</option>
              <option value="accountant">{t('Kế Toán')}</option>
            </select>
            <button className="btn btn-outline" onClick={() => { setSearchTerm(''); setRoleFilter('all'); }}>{t('Đặt Lại')}</button>
          </div>
          <button className="btn btn-primary" onClick={openAddModal}>{t('Thêm người dùng')}</button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('Họ Và Tên')}</th>
                <th>{t('Địa Chỉ Email')}</th>
                <th>{t('Vai Trò Phòng Ban')}</th>
                <th>{t('Trạng Thái')}</th>
                <th>{t('Ngày Khởi Tạo')}</th>
                <th>{t('Thao Tác')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isSelf = u.uid === currentUser.uid;
                return (
                  <tr key={u.uid}>
                    <td style={{ fontWeight: 600 }}>
                      {u.displayName} {isSelf && <span style={{ color: 'var(--color-primary)', fontSize: '11px' }}>(Bạn)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge badge-outline">{getRoleLabel(u.role)}</span>
                    </td>
                    <td>
                      {u.active ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 'bold', fontSize: '13px' }}>{t('Đang hoạt động')}</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 'bold', fontSize: '13px' }}>{t('Bị vô hiệu hóa')}</span>
                      )}
                    </td>
                    <td>{u.createdAt || 'N/A'}</td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-sm btn-outline btn-symbol-sm" onClick={() => void openActivityHistory(u)} title="Lịch sử hoạt động">
                          <History size={14} />
                        </button>
                        <button className="btn btn-sm btn-outline btn-symbol-sm" onClick={() => openEditModal(u)} title={t('Sửa')}>
                          <Pencil size={14} />
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-outline'}`}
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSubmitting}
                            >
                              {u.active ? t('Khóa Tài Khoản') : t('Kích Hoạt')}
                            </button>
                            <button className="btn btn-sm btn-danger btn-symbol-sm" onClick={() => handleDeleteUser(u)} title={t('Xóa')} disabled={isSubmitting}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>{t('Không tìm thấy tài khoản người dùng nào.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('THÊM NGƯỜI DÙNG MỚI')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t('Họ Và Tên Nhân Sự *')}</label>
                  <input
                    type="text"
                    placeholder={t('Nhập họ và tên đầy đủ...')}
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('Địa Chỉ Email Văn Phòng *')}</label>
                  <input
                    type="email"
                    placeholder={t('ví dụ: user@sunflower.com')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('Mật Khẩu Tạm Thời *')}</label>
                  <input
                    type="password"
                    placeholder={t('Tối thiểu 8 ký tự')}
                    value={temporaryPassword}
                    onChange={e => setTemporaryPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                  <small style={{ color: 'var(--color-text-muted)' }}>
                    {t('Mật khẩu chỉ dùng để tạo tài khoản Firebase Authentication và không được lưu trong Firestore.')}
                  </small>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>{t('Vai Trò Phòng Ban *')}</label>
                    <select
                      value={role}
                      onChange={e => {
                        const newRole = e.target.value as UserProfile['role'];
                        setRole(newRole);
                        setAllowedPages(getDefaultPagesForRole(newRole));
                      }}
                    >
                      <option value="admin">{t('Giám Đốc')}</option>
                      <option value="sale">{t('Nhân Viên Sale')}</option>
                      <option value="designer">{t('Thiết Kế')}</option>
                      <option value="purchaser">{t('Mua Vật Tư')}</option>
                      <option value="producer">{t('Sản Xuất')}</option>
                      <option value="accountant">{t('Kế Toán')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('Trạng Thái Ban Đầu')}</label>
                    <select
                      value={active ? 'true' : 'false'}
                      onChange={e => setActive(e.target.value === 'true')}
                    >
                      <option value="true">{t('Đang hoạt động')}</option>
                      <option value="false">{t('Tạm khóa')}</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>{t('Trang Được Phép Truy Cập')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', backgroundColor: 'var(--color-bg-light)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                    {ALL_PAGES.map(page => (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={allowedPages.includes(page.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedPages([...allowedPages, page.id]);
                            } else {
                              setAllowedPages(allowedPages.filter(id => id !== page.id));
                            }
                          }}
                        />
                        {page.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--color-bg-light)', padding: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', marginTop: '8px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{t('Tài khoản thật trên Firebase:')}</span>
                  <div style={{ marginTop: '6px', fontSize: '12px' }}>
                    {t('Khi lưu, hệ thống sẽ đồng thời tạo người dùng trong Firebase Authentication và hồ sơ phân quyền trong Firestore.')}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)} disabled={isSubmitting}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? t('Đang tạo...') : t('Lưu Tài Khoản')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('CHỈNH SỬA THÔNG TIN TÀI KHOẢN')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowEditModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleEditUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t('Địa Chỉ Email (Không thể thay đổi)')}</label>
                  <input type="text" value={selectedUser.email} disabled style={{ backgroundColor: 'var(--color-bg-light)' }} />
                </div>
                <div className="form-group">
                  <label>{t('Họ Và Tên Nhân Sự *')}</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>{t('Vai Trò Phòng Ban *')}</label>
                    <select
                      value={role}
                      onChange={e => {
                        const newRole = e.target.value as UserProfile['role'];
                        setRole(newRole);
                        setAllowedPages(getDefaultPagesForRole(newRole));
                      }}
                      disabled={selectedUser.uid === currentUser.uid} // Admin can't change their own role
                    >
                      <option value="admin">{t('Giám Đốc')}</option>
                      <option value="sale">{t('Nhân Viên Sale')}</option>
                      <option value="designer">{t('Thiết Kế')}</option>
                      <option value="purchaser">{t('Mua Vật Tư')}</option>
                      <option value="producer">{t('Sản Xuất')}</option>
                      <option value="accountant">{t('Kế Toán')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('Trạng Thái Hoạt Động')}</label>
                    <select
                      value={active ? 'true' : 'false'}
                      onChange={e => setActive(e.target.value === 'true')}
                      disabled={selectedUser.uid === currentUser.uid} // Admin can't lock themselves
                    >
                      <option value="true">{t('Đang hoạt động')}</option>
                      <option value="false">{t('Vô hiệu hóa (Khóa)')}</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>{t('Trang Được Phép Truy Cập')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', backgroundColor: 'var(--color-bg-light)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                    {ALL_PAGES.map(page => (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={allowedPages.includes(page.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedPages([...allowedPages, page.id]);
                            } else {
                              setAllowedPages(allowedPages.filter(id => id !== page.id));
                            }
                          }}
                        />
                        {page.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--color-bg-light)', padding: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', marginTop: '8px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{t('Thông tin bảo mật:')}</span>
                  <div style={{ marginTop: '6px', fontSize: '12px' }}>
                    {t('Thay đổi vai trò, quyền truy cập hoặc trạng thái sẽ được đồng bộ qua API quản trị. Mật khẩu Firebase của nhân sự không bị thay đổi tại màn hình này.')}
                  </div>
                </div>

                {/* Audit trail */}
                <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border-light)', paddingTop: '8px' }}>
                  <div>{t('Tạo bởi:')} {selectedUser.createdBy || t('Không xác định')} {selectedUser.createdAt && `(${selectedUser.createdAt})`}</div>
                  {selectedUser.updatedBy && (
                    <div>{t('Cập nhật bởi:')} {selectedUser.updatedBy} ({formatDateTime(selectedUser.updatedAt, t('vi-VN'), '')})</div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)} disabled={isSubmitting}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? t('Đang lưu...') : t('Lưu Thay Đổi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityUser && (
        <div className="modal-overlay">
          <div className="modal-content user-activity-modal">
            <div className="modal-header">
              <div>
                <div className="user-activity-modal__title"><Activity size={19} /> Giám sát hoạt động</div>
                <div className="user-activity-modal__subtitle">{activityUser.displayName} · {activityUser.email}</div>
              </div>
              <button className="btn btn-sm btn-outline btn-symbol-sm" onClick={() => setActivityUser(null)} title="Đóng"><X size={16} /></button>
            </div>
            <div className="modal-body user-activity-modal__body">
              <section className="user-activity-summary">
                <div>
                  <span className={`user-activity-status user-activity-status--${activityPresence?.status === 'online' ? 'online' : 'offline'}`}>
                    {activityPresence?.status === 'online' ? 'Đang hoạt động' : 'Không trực tuyến'}
                  </span>
                  <p>{activityPresence?.lastSeenAt ? `Hoạt động gần nhất: ${formatDateTime(activityPresence.lastSeenAt, 'vi-VN', 'Chưa có dữ liệu')}` : 'Chưa ghi nhận phiên hoạt động.'}</p>
                </div>
                <div><strong>{visibleActivityEvents.length}</strong><span> hoạt động phù hợp</span></div>
              </section>

              <section className="user-activity-filters">
                <div className="user-activity-search"><Search size={16} /><input value={activityQuery} onChange={event => setActivityQuery(event.target.value)} placeholder="Tìm thao tác, khách hàng, Lead..." /></div>
                <select value={activityPeriod} onChange={event => setActivityPeriod(event.target.value as typeof activityPeriod)}>
                  <option value="today">Hôm nay</option><option value="7d">7 ngày gần đây</option><option value="30d">30 ngày gần đây</option><option value="all">Tất cả (tối đa 250)</option><option value="custom">Tùy chọn khoảng thời gian</option>
                </select>
                {activityPeriod === 'custom' && <><input type="date" value={activityFrom} onChange={event => setActivityFrom(event.target.value)} /><input type="date" value={activityTo} onChange={event => setActivityTo(event.target.value)} /></>}
              </section>

              {isLoadingActivity ? <div className="user-activity-empty">Đang tải lịch sử hoạt động...</div>
                : activityError ? <div className="user-activity-empty user-activity-empty--error">{activityError}</div>
                : Object.keys(groupedActivityEvents).length === 0 ? <div className="user-activity-empty"><Clock3 size={20} /> Chưa có hoạt động phù hợp trong khoảng thời gian này.</div>
                : <div className="user-activity-timeline">
                  {Object.entries(groupedActivityEvents).map(([dateLabel, events]) => (
                    <section key={dateLabel} className="user-activity-day">
                      <h3>{dateLabel}</h3>
                      {events.map(event => (
                        <article key={event.id} className="user-activity-event">
                          <time>{new Date(event.occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                          <div><strong>{event.summary}</strong>{event.targetLabel && <span className="user-activity-event__target">{event.targetLabel}</span>}
                            {(event.changes || []).map(change => <p key={change.field}>{change.label}: <b>{change.before || '—'}</b> → <b>{change.after || '—'}</b></p>)}</div>
                        </article>
                      ))}
                    </section>
                  ))}
                </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
