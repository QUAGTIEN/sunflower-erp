import React from 'react';
import { X, AlertCircle, Check } from 'lucide-react';
import { type LeadCandidateRecord, type LeadCandidateContactResult } from '@/features/crm/model/leadCandidateModels';
import { type ScheduleFormState } from './leadCandidateWorkspaceConfig';

interface LeadCandidateScheduleDialogProps {
  handleSaveSchedule: (event: React.FormEvent<Element>) => Promise<void | undefined>;
  scheduleCandidate: LeadCandidateRecord;
  setScheduleCandidateId: React.Dispatch<React.SetStateAction<string>>;
  setScheduleContactResult: React.Dispatch<React.SetStateAction<'' | LeadCandidateContactResult>>;
  scheduleForm: ScheduleFormState;
  setScheduleForm: React.Dispatch<React.SetStateAction<ScheduleFormState>>;
  scheduleContactResult: '' | LeadCandidateContactResult;
  scheduleError: string;
  savingSchedule: boolean;
}

/** Dialog that schedules the next contact for a raw-data candidate. */
export const LeadCandidateScheduleDialog: React.FC<LeadCandidateScheduleDialogProps> = ({
  handleSaveSchedule,
  scheduleCandidate,
  setScheduleCandidateId,
  setScheduleContactResult,
  scheduleForm,
  setScheduleForm,
  scheduleContactResult,
  scheduleError,
  savingSchedule
}) => (
  <div className="modal-overlay">
    <form className="modal-content lead-candidate-schedule-modal" onSubmit={handleSaveSchedule}>
      <div className="modal-header">
        <div>
          <strong>ĐẶT LỊCH LÀM VIỆC TIẾP THEO</strong>
          <span>{scheduleCandidate.companyName}</span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => {
            setScheduleCandidateId('');
            setScheduleContactResult('');
          }}
        >
          <X size={14} /> Đóng
        </button>
      </div>
      <div className="modal-body lead-candidate-schedule-form">
        <label>
          <span>Ngày giờ xử lý *</span>
          <input
            required
            autoFocus
            type="datetime-local"
            value={scheduleForm.nextContactAt}
            onChange={event => setScheduleForm(previous => ({ ...previous, nextContactAt: event.target.value }))}
          />
        </label>
        <label>
          <span data-system-label="note">Ghi chú</span>
          <textarea
            rows={5}
            value={scheduleForm.note}
            onChange={event => setScheduleForm(previous => ({ ...previous, note: event.target.value }))}
            placeholder="Thông tin Sale cần lưu ý khi xử lý công việc..."
          />
        </label>
        <p>
          {scheduleContactResult === 'callback' ? (
            <>
              Lưu lịch sẽ cập nhật trạng thái thành <strong>Hẹn gọi lại</strong> và ghi vào lịch sử.
            </>
          ) : (
            <>Công việc sẽ được đưa trở lại danh sách xử lý nếu trước đó đã tắt.</>
          )}
        </p>
        {scheduleError && (
          <div className="lead-candidate-warning is-error">
            <AlertCircle size={14} />
            <span>{scheduleError}</span>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setScheduleCandidateId('');
            setScheduleContactResult('');
          }}
        >
          Hủy
        </button>
        <button type="submit" className="btn btn-primary" disabled={savingSchedule}>
          <Check size={14} /> {savingSchedule ? 'Đang lưu...' : 'Lưu lịch hẹn'}
        </button>
      </div>
    </form>
  </div>
);
