import React, { useEffect, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import {
  getNotificationDocumentId,
  NOTIFICATION_SCHEMA_VERSION,
  type NotificationModule
} from '@/domain/notificationModels';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { WorkSchedulePriority, WorkScheduleReferenceType } from '@/features/work-schedule/model/workScheduleModels';
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
const REFERENCE_TYPES: Record<SupportRequestTarget['module'], WorkScheduleReferenceType> = {
  customer_data: 'lead_candidate', leads: 'lead', crm: 'customer'
};
const tomorrowValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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
  const [priority, setPriority] = useState<WorkSchedulePriority>('high');
  const [dueAt, setDueAt] = useState(tomorrowValue);

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
    const admins = users.filter(user => user.role === 'admin' && user.active !== false);
    if (admins.length === 0) {
      setError('Chưa có tài khoản Admin đang hoạt động để nhận yêu cầu.');
      return;
    }

    const now = new Date().toISOString();
    const requestKey = `support:${target.module}:${target.id}:${currentUser.uid}:${Date.now()}`;
    setSaving(true);
    setError('');
    try {
      const taskId = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const deadline = new Date(dueAt);
      if (!Number.isFinite(deadline.getTime())) throw new Error('Invalid deadline');
      await dbService.addDocument('work_schedule_items', {
        id: taskId, title: `Hỗ trợ ${target.label}`, description: message, stage: '',
        assigneeId: admins[0].uid, assigneeName: admins[0].displayName, department: 'Ban giám đốc',
        assignedById: currentUser.uid, assignedByName: currentUser.displayName,
        requestedById: currentUser.uid, requestedByName: currentUser.displayName,
        groupId: 'staff_to_company', groupName: 'Nhân sự giao việc lại cho công ty', workType: 'business',
        startAt: now, endAt: deadline.toISOString(), status: 'support_requested', progress: 0,
        referenceType: REFERENCE_TYPES[target.module], referenceId: target.id, referenceLabel: target.label,
        notes: '', priority, taskType: 'support_request', createdAt: now, updatedAt: now, deleted: false
      });
      await Promise.all(admins.map(admin => dbService.addDocument('notifications', {
        id: getNotificationDocumentId(admin.uid, requestKey),
        schemaVersion: NOTIFICATION_SCHEMA_VERSION,
        recipientId: admin.uid,
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
            <span>Yêu cầu cho {target.label} đã được đưa vào Công việc và gửi tới cấp quản lý.</span>
          </div>
        ) : (
          <div className="support-request-dialog__body">
            <label>Khách hàng<strong>{target.label}</strong></label>
            <label>Nội dung cần hỗ trợ<textarea autoFocus value={note} onChange={event => setNote(event.target.value)} rows={4} maxLength={500} placeholder="Ví dụ: Nhờ sếp liên hệ lại giúp em khách hàng này" /></label>
            <label>Thời hạn xử lý<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
            <label>Mức độ ưu tiên<select value={priority} onChange={event => setPriority(event.target.value as WorkSchedulePriority)}><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
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
