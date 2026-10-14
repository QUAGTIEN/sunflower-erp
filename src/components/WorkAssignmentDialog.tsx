import { showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useState } from 'react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import type { WorkSchedulePriority, WorkScheduleReferenceType } from '@/features/work-schedule/model/workScheduleModels';
import './WorkAssignmentDialog.css';

export interface WorkAssignmentTarget {
  id: string;
  label: string;
  module: 'customer_data' | 'leads' | 'crm';
}

interface WorkAssignmentDialogProps {
  currentUser: UserProfile;
  users: UserProfile[];
  target: WorkAssignmentTarget | null;
  onClose: () => void;
}

const referenceTypes: Record<WorkAssignmentTarget['module'], WorkScheduleReferenceType> = {
  customer_data: 'lead_candidate', leads: 'lead', crm: 'customer'
};

const tomorrowValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const WorkAssignmentDialog: React.FC<WorkAssignmentDialogProps> = ({ currentUser, users, target, onClose }) => {
  const [assigneeId, setAssigneeId] = useState('');
  const [title, setTitle] = useState(() => target ? `Chăm sóc ${target.label}` : '');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkSchedulePriority>('normal');
  const [dueAt, setDueAt] = useState(tomorrowValue);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!target) return null;
  const saleUsers = users.filter(user => user.role === 'sale' && user.active !== false);

  const submit = async (event: React.FormEvent) => {
    return runMutationAction("WorkAssignmentDialog.tsx:submit", async () => {
      event.preventDefault();
      const assignee = saleUsers.find(user => user.uid === assigneeId);
      const dueDate = new Date(dueAt);
      if (!assignee || !title.trim() || !description.trim() || Number.isNaN(dueDate.getTime())) {
        setError('Vui lòng chọn Sale và nhập đầy đủ nội dung, thời hạn công việc.');
        return;
      }
      const now = new Date();
      const start = new Date(Math.min(now.getTime(), dueDate.getTime() - 60 * 60 * 1000));
      const id = `schedule-${now.getTime()}-${currentUser.uid}-${target.id}`;
      setSaving(true);
      setError('');
      try {
        await dbService.addDocument('work_schedule_items', {
          id, title: title.trim(), description: description.trim(), stage: '',
          assigneeId: assignee.uid, assigneeName: assignee.displayName, department: 'Sale',
          assignedById: currentUser.uid, assignedByName: currentUser.displayName,
          requestedById: '', requestedByName: '', taskType: 'assigned_task', priority,
          groupId: 'boss_to_staff', groupName: 'Sếp giao cho nhân sự', workType: 'business',
          startAt: start.toISOString(), endAt: dueDate.toISOString(), status: 'not_started', progress: 0,
          referenceType: referenceTypes[target.module], referenceId: target.id, referenceLabel: target.label,
          notes: '', createdAt: now.toISOString(), updatedAt: now.toISOString(), deleted: false
        });
        await dbService.addDocument('notifications', {
          id: `task-${id}-${assignee.uid}`, schemaVersion: 1, recipientId: assignee.uid,
          module: 'system', eventType: 'work_schedule_assigned', eventKey: `work_schedule:${id}:assigned`,
          entityId: id, entityCode: target.label, title: 'Bạn được giao công việc',
          message: `${title.trim()} · ${target.label}`, createdAt: now.toISOString(),
          createdById: currentUser.uid, source: 'manual', readAt: null
        });
        auditService.recordSafely(currentUser, {
          category: 'business', module: 'system', action: 'work_schedule_created',
          summary: `Giao công việc “${title.trim()}” cho ${assignee.displayName}`,
          targetType: 'work_schedule', targetId: id, targetLabel: title.trim(), pageId: target.module
        });
        onClose();

        showSuccessToast("Đã thêm thành công");
      } catch {
        showErrorToast();
        setError('Không thể giao việc. Vui lòng kiểm tra kết nối và thử lại.');
      } finally {
        setSaving(false);
      }
    }, event);
  };

  return <div className="work-assignment-dialog" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="work-assignment-title" onSubmit={submit}>
      <header><div><strong id="work-assignment-title">Giao việc cho Sale</strong><span>{target.label}</span></div><button type="button" onClick={onClose} disabled={saving}>Đóng</button></header>
      <div className="work-assignment-dialog__body">
        <label>Sale đảm nhận *<select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} autoFocus><option value="">Chọn Sale</option>{saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></label>
        <label>Tiêu đề công việc *<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>Thời hạn *<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
        <label>Mức độ ưu tiên<select value={priority} onChange={event => setPriority(event.target.value as WorkSchedulePriority)}><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
        <label className="is-wide">Nội dung giao việc *<textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Nêu rõ kết quả cần hoàn thành..." /></label>
        {error && <p>{error}</p>}
      </div>
      <footer><button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Hủy</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang giao...' : 'Giao việc'}</button></footer>
    </form>
  </div>;
};
