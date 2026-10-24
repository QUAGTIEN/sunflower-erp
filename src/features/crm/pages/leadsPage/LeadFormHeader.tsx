import React from 'react';
import { PageBackButton } from '@/components/PageBackButton';
import {
  CrmRecordHeaderIdentity,
  CrmRecordHeaderTabs,
  CrmRecordHeaderFacts
} from '@/features/crm/components/CrmRecordHeader';
import { CUSTOMER_INSIGHT_ITEMS } from '@/features/crm/model/customerInsightCatalog';
import { RowActionMenu } from '@/components/RowActionMenu';
import { CalendarClock, ClipboardCheck, LifeBuoy, Undo2, UserCheck, Building2, Trash2 } from 'lucide-react';
import { getStageLabel, formatDateTime, type LeadFormState, type LeadDetailTab } from './leadsPageConfig';
import type { LeadRecord } from '@/features/crm/model/crmModels';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import type { SupportRequestTarget } from '@/components/SupportRequestDialog';
import { useLanguage } from '@/context/LanguageContext';

interface LeadFormHeaderProps {
  editingLead: LeadRecord | null;
  closeLeadForm: () => void;
  form: LeadFormState;
  leadDetailTab: LeadDetailTab;
  setLeadDetailTab: React.Dispatch<React.SetStateAction<LeadDetailTab>>;
  currentUser: UserProfile;
  convertingCandidateId: string;
  actions: {
    openScheduleForm: (lead: LeadRecord) => void;
    setAssignmentTarget: React.Dispatch<React.SetStateAction<WorkAssignmentTarget | null>>;
    setSupportTarget: React.Dispatch<React.SetStateAction<SupportRequestTarget | null>>;
    returningLeadId: string;
    handleReturnLeadToRawData: (lead: LeadRecord) => Promise<void | undefined>;
    canManageEditingLead: boolean;
    handleConvertLead: (lead: LeadRecord) => void;
    onNavigateToCrm: () => void;
    handleDeleteLead: (lead: LeadRecord) => Promise<void | undefined>;
  };
  facts: {
    assignedSaleName: string;
    completedProfileFields: number;
    profileFields: (string | number)[];
  };
}

/** Lead form header: back button, record identity, tabs and key facts. */
export const LeadFormHeader: React.FC<LeadFormHeaderProps> = ({
  editingLead,
  closeLeadForm,
  form,
  leadDetailTab,
  setLeadDetailTab,
  currentUser,
  convertingCandidateId,
  actions: {
    openScheduleForm,
    setAssignmentTarget,
    setSupportTarget,
    returningLeadId,
    handleReturnLeadToRawData,
    canManageEditingLead,
    handleConvertLead,
    onNavigateToCrm,
    handleDeleteLead
  },
  facts: { assignedSaleName, completedProfileFields, profileFields }
}) => {
  const { t } = useLanguage();
  return (
    <header className={`lead-form-page__header${editingLead ? ' lead-record-header crm-record-header' : ''}`}>
      <PageBackButton iconOnly title={t('Quay lại danh sách khách hàng tiềm năng')} onClick={closeLeadForm} />
      {editingLead ? (
        <>
          <div className="lead-record-header__identity">
            <CrmRecordHeaderIdentity title={form.companyName || editingLead.companyName} />
          </div>
          <div className="lead-record-header__actions">
            <CrmRecordHeaderTabs
              activeTab={leadDetailTab}
              classificationCount={form.customerInsightValues.length}
              classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
              classificationLabel={t('Phân loại khách hàng')}
              profileLabel={t('Thông tin hồ sơ')}
              ariaLabel={t('Nội dung hồ sơ khách hàng tiềm năng')}
              onTabChange={setLeadDetailTab}
            />
            <RowActionMenu
              label={t('Thao tác hồ sơ')}
              actions={[
                {
                  label: t('Hẹn lịch'),
                  icon: <CalendarClock size={14} />,
                  onSelect: () => openScheduleForm(editingLead)
                },
                ...(currentUser.role === 'admin'
                  ? [
                      {
                        label: t('Giao việc'),
                        icon: <ClipboardCheck size={14} />,
                        onSelect: () =>
                          setAssignmentTarget({
                            id: editingLead.id,
                            label: editingLead.companyName,
                            module: 'leads'
                          })
                      }
                    ]
                  : []),
                ...(currentUser.role === 'sale'
                  ? [
                      {
                        label: t('Yêu cầu hỗ trợ'),
                        icon: <LifeBuoy size={14} />,
                        onSelect: () =>
                          setSupportTarget({ id: editingLead.id, label: editingLead.companyName, module: 'leads' })
                      }
                    ]
                  : []),
                ...(!['converted'].includes(editingLead.stage) && !editingLead.convertedCustomerId
                  ? [
                      {
                        label: returningLeadId === editingLead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô'),
                        icon: <Undo2 size={14} />,
                        onSelect: () => void handleReturnLeadToRawData(editingLead),
                        disabled: returningLeadId === editingLead.id || !canManageEditingLead
                      }
                    ]
                  : []),
                ...(!['converted', 'lost'].includes(editingLead.stage)
                  ? [
                      {
                        label: t('Chuyển thành khách hàng'),
                        icon: <UserCheck size={14} />,
                        onSelect: () => handleConvertLead(editingLead),
                        disabled: !canManageEditingLead
                      }
                    ]
                  : []),
                ...(editingLead.stage === 'converted'
                  ? [{ label: t('Mở CRM'), icon: <Building2 size={14} />, onSelect: onNavigateToCrm }]
                  : []),
                {
                  label: t('Xóa Lead'),
                  icon: <Trash2 size={14} />,
                  onSelect: () => void handleDeleteLead(editingLead),
                  danger: true,
                  disabled: !canManageEditingLead
                }
              ]}
            />
          </div>
          <CrmRecordHeaderFacts
            taxCode={form.taxCode || 'Chưa cập nhật'}
            saleName={assignedSaleName}
            classificationCount={form.customerInsightValues.length}
            classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
            profileCompleted={completedProfileFields}
            profileTotal={profileFields.length}
            stageLabel={getStageLabel(form.stage)}
            nextCareLabel={form.nextFollowUpAt ? formatDateTime(form.nextFollowUpAt) : 'Chưa đặt lịch'}
          />
        </>
      ) : (
        <div>
          <span>{convertingCandidateId ? t('CHUYỂN TỪ DỮ LIỆU KHÁCH HÀNG') : t('HỒ SƠ MỚI')}</span>
          <h1>{convertingCandidateId ? t('Tiếp nhận khách hàng thành Lead') : t('Thêm khách hàng tiềm năng')}</h1>
        </div>
      )}
    </header>
  );
};
