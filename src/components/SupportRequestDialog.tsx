import React, { useEffect, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import {
  getNotificationDocumentId,
  NOTIFICATION_SCHEMA_VERSION,
  type NotificationModule
} from '@/domain/notificationModels';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './SupportRequestDialog.css';

export interface SupportRequestTarget {
  id: string;
  label: string;
  module: Extract<NotificationModule, 'customer_data' | 'leads' | 'crm'>;
}

interface SupportRequestDialogProps {
  currentUser: UserProfile;
  users: UserProfile[];
  target: SupportRequestTarget | null;
  onClose: () => void;
}

const MODULE_LABELS: Record<SupportRequestTarget['module'], string> = {
  customer_data: 'Dữ liệu thô',
  leads: 'Tiềm năng',
  crm: 'Khách hàng'
};

export const SupportRequestDialog: React.FC<SupportRequestDialogProps> = ({
  currentUser,
  users,
  target,
  onClose
}) => {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!target) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving, target]);

  if (!target) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = note.trim();
    if (!message) {
      setError('Vui lòng nhập nội dung cần hỗ trợ.');
      return;
    }
    const adminIds = users
      .filter(user => user.role === 'admin' && user.active !== false)
      .map(user => user.uid);
    if (adminIds.length === 0) {
      setError('Chưa có tài khoản Admin đang hoạt động để nhận yêu cầu.');
      return;
    }

    const now = new Date().toISOString();
    const requestKey = `support:${target.module}:${target.id}:${currentUser.uid}:${Date.now()}`;
    setSaving(true);
    setError('');
    try {
      await Promise.all(adminIds.map(recipientId => dbService.addDocument('notifications', {
        id: getNotificationDocumentId(recipientId, requestKey),
        schemaVersion: NOTIFICATION_SCHEMA_VERSION,
        recipientId,
        module: target.module,
        eventType: 'support_request',
        eventKey: requestKey,
        entityId: target.id,
        entityCode: target.label,
        title: `${currentUser.displayName} cần hỗ trợ`,
        message: `${target.label} · ${message}`,
        createdAt: now,
        createdById: currentUser.uid,
        source: 'manual',
        readAt: null
      })));
      setSent(true);
    } catch {
      setError('Không thể gửi yêu cầu hỗ trợ. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="support-request-dialog" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="support-request-title" onSubmit={submit}>
        <header>
          <div><LifeBuoy size={18} /><span><strong id="support-request-title">Yêu cầu hỗ trợ</strong><small>{MODULE_LABELS[target.module]}</small></span></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng"><X size={17} /></button>
        </header>
        {sent ? (
          <div className="support-request-dialog__sent">
            <LifeBuoy size={24} />
            <strong>Đã gửi tới Admin</strong>
            <span>Yêu cầu hỗ trợ cho {target.label} đã được chuyển tới chuông thông báo của cấp quản lý.</span>
          </div>
        ) : (
          <div className="support-request-dialog__body">
            <label>Khách hàng<strong>{target.label}</strong></label>
            <label>Nội dung cần hỗ trợ<textarea autoFocus value={note} onChange={event => setNote(event.target.value)} rows={4} maxLength={500} placeholder="Ví dụ: Nhờ sếp liên hệ lại giúp em khách hàng này" /></label>
            {error && <p>{error}</p>}
          </div>
        )}
        <footer>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>{sent ? 'Đóng' : 'Hủy'}</button>
          {!sent && <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi hỗ trợ'}</button>}
        </footer>
      </form>
    </div>
  );
};
