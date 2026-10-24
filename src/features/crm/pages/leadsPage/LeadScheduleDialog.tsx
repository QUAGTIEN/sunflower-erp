import React from 'react';
import { X, AlertCircle, CalendarClock } from 'lucide-react';
import type { LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadScheduleFormState } from './leadsPageConfig';
import { useLanguage } from '@/context/LanguageContext';

interface LeadScheduleDialogProps {
  handleSaveSchedule: (event: React.FormEvent<Element>) => Promise<void | undefined>;
  scheduleLead: LeadRecord;
  closeScheduleForm: () => void;
  scheduleForm: LeadScheduleFormState;
  setScheduleForm: React.Dispatch<React.SetStateAction<LeadScheduleFormState>>;
  scheduleError: string;
  savingSchedule: boolean;
}

/** Dialog that schedules the next follow-up for a lead. */
export const LeadScheduleDialog: React.FC<LeadScheduleDialogProps> = ({
  handleSaveSchedule,
  scheduleLead,
  closeScheduleForm,
  scheduleForm,
  setScheduleForm,
  scheduleError,
  savingSchedule
}) => {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay">
      <form className="modal-content lead-candidate-schedule-modal" onSubmit={handleSaveSchedule}>
        <div className="modal-header">
          <div>
            <strong>{t('ĐẶT LỊCH CHĂM SÓC TIẾP THEO')}</strong>
            <span>{scheduleLead.companyName}</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={closeScheduleForm}>
            <X size={14} /> {t('Đóng')}
          </button>
        </div>
        <div className="modal-body lead-candidate-schedule-form">
          <label>
            <span data-system-label="nextFollowUpAt">{t('Lịch chăm sóc tiếp theo *')}</span>
            <input
              required
              autoFocus
              type="datetime-local"
              value={scheduleForm.nextFollowUpAt}
              onChange={event => setScheduleForm(previous => ({ ...previous, nextFollowUpAt: event.target.value }))}
            />
          </label>
          <p>{t('Sau khi lưu, Lead sẽ được đưa lên đầu danh sách và Sale phụ trách sẽ nhận được thông báo.')}</p>
          {scheduleError && (
            <div className="lead-candidate-warning is-error">
              <AlertCircle size={14} />
              <span>{scheduleError}</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={closeScheduleForm}>
            {t('Hủy')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={savingSchedule}>
            <CalendarClock size={14} /> {savingSchedule ? t('Đang lưu...') : t('Lưu lịch hẹn')}
          </button>
        </div>
      </form>
    </div>
  );
};
