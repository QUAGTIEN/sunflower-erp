import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import React from 'react';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { Building2, AlertCircle, UserCheck, Search, CalendarClock, Paperclip, Tags } from 'lucide-react';
import { BusinessLocationFields } from '@/features/crm/components/BusinessLocationFields';
import { EntityCustomFieldsGrid, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
import { InlineEntityFieldManager } from '@/components/InlineEntityFieldManager';
import { formatDateTime, LEAD_STAGES, type LeadDetailTab, type LeadFormState } from './leadsPageConfig';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import type { LeadStage, LeadRecord, LeadFileRecord } from '@/features/crm/model/crmModels';
import type { TaxCodeConflictRecord } from '@/features/crm/model/taxCodeUniqueness';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import type { EntityCustomFieldValues } from '@/features/crm/model/entityFieldConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { useLanguage } from '@/context/LanguageContext';

interface LeadProfileFieldsProps {
  editingLead: LeadRecord | null;
  leadDetailTab: LeadDetailTab;
  form: LeadFormState;
  updateForm: <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<LeadFormState>>;
  currentUser: UserProfile;
  leadSourceOptions: string[];
  saleUsers: UserProfile[];
  taxCode: {
    isTaxCodeLocked: boolean;
    taxCodeConflict: TaxCodeConflictRecord | null;
    candidateTaxCodeConflict: LeadCandidateRecord | null;
    taxCodeSaveError: string;
    describeTaxCodeConflict: (conflict: TaxCodeConflictRecord) => string;
  };
  customFields: {
    profileFormCustomFieldDefinitions: EntityFieldDefinition[];
    customFieldValues: EntityCustomFieldValues;
    setCustomFieldValues: React.Dispatch<React.SetStateAction<EntityCustomFieldValues>>;
    inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
    clearPurgedCustomField: (fieldId: string) => void;
    clearPurgedSystemField: (fieldKey: string) => void;
  };
  attachments: {
    handleLeadFilesChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    attachmentLinkName: string;
    setAttachmentLinkName: React.Dispatch<React.SetStateAction<string>>;
    attachmentLinkUrl: string;
    setAttachmentLinkUrl: React.Dispatch<React.SetStateAction<string>>;
    handleAddAttachmentLink: () => void;
    uploadingFiles: LeadFileRecord[];
    setUploadingFiles: React.Dispatch<React.SetStateAction<LeadFileRecord[]>>;
  };
}

/** Profile tab of the lead form: company, contact, sales, attachments and extension sections. */
export const LeadProfileFields: React.FC<LeadProfileFieldsProps> = ({
  editingLead,
  leadDetailTab,
  form,
  updateForm,
  setForm,
  currentUser,
  leadSourceOptions,
  saleUsers,
  taxCode: { isTaxCodeLocked, taxCodeConflict, candidateTaxCodeConflict, taxCodeSaveError, describeTaxCodeConflict },
  customFields: {
    profileFormCustomFieldDefinitions,
    customFieldValues,
    setCustomFieldValues,
    inlineSystemFieldConfiguration,
    clearPurgedCustomField,
    clearPurgedSystemField
  },
  attachments: {
    handleLeadFilesChange,
    attachmentLinkName,
    setAttachmentLinkName,
    attachmentLinkUrl,
    setAttachmentLinkUrl,
    handleAddAttachmentLink,
    uploadingFiles,
    setUploadingFiles
  }
}) => {
  const { t } = useLanguage();
  return (
    <div className="lead-form-page__content lead-standardized-form">
      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <Building2 size={18} />
          <div>
            <h2>{t('Thông tin doanh nghiệp')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className="form-group lead-form-grid__wide">
            <label data-system-label="companyName">{t('Tên doanh nghiệp *')}</label>
            <input
              autoFocus={!editingLead || leadDetailTab === 'profile'}
              required
              value={form.companyName}
              onChange={event => updateForm('companyName', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label data-system-label="taxCode">{t('Mã số thuế *')}</label>
            <input
              required
              value={form.taxCode}
              onChange={event => updateForm('taxCode', event.target.value)}
              readOnly={isTaxCodeLocked}
              aria-invalid={Boolean(taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError)}
              aria-describedby="lead-tax-code-guidance"
            />
            <span
              id="lead-tax-code-guidance"
              className={
                taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError
                  ? 'lead-tax-code-message is-error'
                  : 'lead-tax-code-message'
              }
            >
              {(taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError) && <AlertCircle size={13} />}
              {taxCodeConflict
                ? describeTaxCodeConflict(taxCodeConflict)
                : candidateTaxCodeConflict
                  ? `Mã số thuế này đang nằm trong Dữ liệu thô của doanh nghiệp “${candidateTaxCodeConflict.companyName}”.`
                  : taxCodeSaveError ||
                    (isTaxCodeLocked
                      ? t('Mã số thuế là định danh duy nhất và không thể thay đổi sau khi tạo Lead.')
                      : t('Mã số thuế được kiểm tra trên toàn bộ Lead và khách hàng.'))}
            </span>
          </div>
          <div className="form-group">
            <label data-system-label="website">{t('Website')}</label>
            <input
              type="url"
              value={form.website}
              onChange={event => updateForm('website', event.target.value)}
              placeholder="https://..."
            />
          </div>
          <BusinessLocationFields
            className="lead-form-grid__wide"
            province={form.province}
            ward={form.ward}
            industrialPark={form.industrialPark}
            onChange={location => setForm(previous => ({ ...previous, ...location }))}
          />
          <div className="form-group lead-form-grid__wide">
            <label data-system-label="address">{t('Địa chỉ doanh nghiệp')}</label>
            <input value={form.address} onChange={event => updateForm('address', event.target.value)} />
          </div>
        </div>
        <EntityCustomFieldsGrid
          definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'company')}
          values={customFieldValues}
          role={currentUser.role}
          onChange={setCustomFieldValues}
        />
        <InlineEntityFieldManager
          table="leads"
          section="company"
          sectionLabel={t('Thông tin doanh nghiệp')}
          definitions={profileFormCustomFieldDefinitions}
          currentUser={currentUser}
          systemConfiguration={inlineSystemFieldConfiguration}
          onCustomFieldPurged={clearPurgedCustomField}
          onSystemFieldPurged={clearPurgedSystemField}
          systemFields={[
            { key: 'website', label: 'Website' },
            { key: 'province', label: 'Tỉnh / thành' },
            { key: 'ward', label: 'Phường / xã' },
            { key: 'industrialPark', label: 'Khu công nghiệp' },
            { key: 'address', label: 'Địa chỉ doanh nghiệp' }
          ]}
        />
      </section>

      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <UserCheck size={18} />
          <div>
            <h2>{t('Liên hệ và nguồn dữ liệu')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className="form-group">
            <label data-system-label="contactPerson">{t('Người liên hệ')}</label>
            <input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} />
          </div>
          <div className="form-group">
            <label data-system-label="contactPosition">{t('Chức vụ')}</label>
            <input
              value={form.contactPosition}
              onChange={event => updateForm('contactPosition', event.target.value)}
              placeholder={t('Ví dụ: Thu mua, Giám đốc...')}
            />
          </div>
          <div className="form-group">
            <label data-system-label="phone">{t('Điện thoại')}</label>
            <input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} />
          </div>
          <div className="form-group">
            <label data-system-label="email">Email</label>
            <input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} />
          </div>
          <div className="form-group">
            <label data-system-label="source">{t('Nguồn tìm kiếm')}</label>
            <select value={form.source} onChange={event => updateForm('source', event.target.value)}>
              <option value="">{t('Chưa chọn')}</option>
              {form.source && !leadSourceOptions.includes(form.source) && (
                <option value={form.source}>{form.source}</option>
              )}
              {leadSourceOptions.map(source => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label data-system-label="sourceUrl">{t('Đường dẫn nguồn')}</label>
            <input
              type="url"
              value={form.sourceUrl}
              onChange={event => updateForm('sourceUrl', event.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
        <EntityCustomFieldsGrid
          definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'contact')}
          values={customFieldValues}
          role={currentUser.role}
          onChange={setCustomFieldValues}
        />
        <InlineEntityFieldManager
          table="leads"
          section="contact"
          sectionLabel={t('Liên hệ và nguồn dữ liệu')}
          definitions={profileFormCustomFieldDefinitions}
          currentUser={currentUser}
          systemConfiguration={inlineSystemFieldConfiguration}
          onCustomFieldPurged={clearPurgedCustomField}
          onSystemFieldPurged={clearPurgedSystemField}
          systemFields={[
            { key: 'contactPerson', label: 'Người liên hệ' },
            { key: 'contactPosition', label: 'Chức vụ' },
            { key: 'phone', label: 'Điện thoại' },
            { key: 'email', label: 'Email' },
            { key: 'source', label: 'Nguồn tìm kiếm' },
            { key: 'sourceUrl', label: 'Đường dẫn nguồn' }
          ]}
        />
      </section>

      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <Search size={18} />
          <div>
            <h2>{t('Thông tin bổ sung')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className="form-group lead-form-grid__wide">
            <label data-system-label="note">{t('Ghi chú')}</label>
            <textarea
              rows={3}
              value={form.note}
              onChange={event => updateForm('note', event.target.value)}
              placeholder={t('Thông tin cần lưu ý khi làm việc với khách hàng...')}
            />
          </div>
        </div>
        <EntityCustomFieldsGrid
          definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'needs')}
          values={customFieldValues}
          role={currentUser.role}
          onChange={setCustomFieldValues}
        />
        <InlineEntityFieldManager
          table="leads"
          section="needs"
          sectionLabel={t('Thông tin bổ sung')}
          definitions={profileFormCustomFieldDefinitions}
          currentUser={currentUser}
          systemConfiguration={inlineSystemFieldConfiguration}
          onCustomFieldPurged={clearPurgedCustomField}
          onSystemFieldPurged={clearPurgedSystemField}
          systemFields={[{ key: 'note', label: 'Ghi chú' }]}
        />
      </section>

      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <CalendarClock size={18} />
          <div>
            <h2>{t('Phụ trách và lịch hẹn')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className={`form-group${currentUser.role === 'admin' ? '' : ' lead-form-grid__wide'}`}>
            <label data-system-label="assignedSaleId">{t('Người phụ trách *')}</label>
            <select
              value={form.assignedSaleId}
              onChange={event => updateForm('assignedSaleId', event.target.value)}
              disabled={currentUser.role === 'sale'}
            >
              <option value="">{t('-- Chưa phân công --')}</option>
              {saleUsers.map(user => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
          {currentUser.role === 'admin' && (
            <div className="form-group">
              <label data-system-label="discoveredById">{t('Sale tìm được Lead')}</label>
              <select value={form.discoveredById} onChange={event => updateForm('discoveredById', event.target.value)}>
                <option value="">{t('-- Chưa xác định --')}</option>
                {saleUsers.map(user => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group lead-form-grid__wide">
            <label data-system-label="nextFollowUpAt">{t('Lịch hẹn xử lý')}</label>
            <input
              type="datetime-local"
              value={form.nextFollowUpAt}
              onChange={event => updateForm('nextFollowUpAt', event.target.value)}
            />
          </div>
        </div>
        <EntityCustomFieldsGrid
          definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'assignment')}
          values={customFieldValues}
          role={currentUser.role}
          onChange={setCustomFieldValues}
        />
        <InlineEntityFieldManager
          table="leads"
          section="assignment"
          sectionLabel={t('Phụ trách và lịch hẹn')}
          definitions={profileFormCustomFieldDefinitions}
          currentUser={currentUser}
          systemConfiguration={inlineSystemFieldConfiguration}
          onCustomFieldPurged={clearPurgedCustomField}
          onSystemFieldPurged={clearPurgedSystemField}
          systemFields={[
            { key: 'discoveredById', label: 'Sale tìm được Lead' },
            { key: 'nextFollowUpAt', label: 'Lịch hẹn xử lý' }
          ]}
        />
      </section>

      <section className="lead-form-card lead-form-card--wide lead-attachments-card">
        <div className="lead-form-card__heading">
          <Paperclip size={18} />
          <div>
            <h2>{t('File liên quan')}</h2>
          </div>
        </div>
        <div className="lead-attachments-card__upload-row">
          <div className="lead-attachments-card__toolbar">
            <label className="btn btn-outline lead-attachments-card__upload">
              {t('Tải tệp lên')}
              <input type="file" multiple onChange={handleLeadFilesChange} />
            </label>
            <span>{t('Tệp dưới 900 KB; tệp lớn dùng đường dẫn Drive hoặc OneDrive.')}</span>
          </div>
          <label className="lead-attachments-card__dropzone">
            <span>{t('Kéo thả tệp vào đây hoặc chọn từ máy')}</span>
            <input type="file" multiple onChange={handleLeadFilesChange} />
          </label>
        </div>
        <details className="lead-attachments-card__link">
          <summary>{t('Thêm đường dẫn Drive/OneDrive')}</summary>
          <div>
            <input
              aria-label={t('Tên tài liệu')}
              placeholder={t('Tên tài liệu')}
              value={attachmentLinkName}
              onChange={event => setAttachmentLinkName(event.target.value)}
            />
            <input
              aria-label={t('Đường dẫn chia sẻ')}
              type="url"
              placeholder="https://..."
              value={attachmentLinkUrl}
              onChange={event => setAttachmentLinkUrl(event.target.value)}
            />
            <button type="button" className="btn btn-outline" onClick={handleAddAttachmentLink}>
              {t('Thêm liên kết')}
            </button>
          </div>
        </details>
        {uploadingFiles.length > 0 ? (
          <div className="lead-attachments-card__table">
            <table>
              <thead>
                <tr>
                  <th>{t('Tên tệp')}</th>
                  <th>{t('Loại')}</th>
                  <th>{t('Dung lượng')}</th>
                  <th>{t('Ngày cập nhật')}</th>
                  <th>{t('Người cập nhật')}</th>
                  <th>{t('Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {uploadingFiles.map(file => {
                  const source = file.data || file.url || '';
                  return (
                    <tr key={file.id}>
                      <td title={file.name}>{file.name}</td>
                      <td>
                        {file.url
                          ? t('Đường dẫn')
                          : source.startsWith('data:image/')
                            ? t('Hình ảnh')
                            : t('Tệp tài liệu')}
                      </td>
                      <td>
                        {file.size
                          ? `${(file.size / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} KB`
                          : '—'}
                      </td>
                      <td>{file.createdAt ? formatDateTime(file.createdAt) : '—'}</td>
                      <td>{file.createdBy || '—'}</td>
                      <td>
                        <div className="lead-attachments-card__actions">
                          {source &&
                            (file.url ? (
                              <a href={file.url} target="_blank" rel="noreferrer">
                                {t('Mở liên kết')}
                              </a>
                            ) : (
                              <a href={source} download={file.name}>
                                {t('Tải xuống')}
                              </a>
                            ))}
                          <button
                            type="button"
                            onClick={async () => {
                              if (await confirmDelete(t('Xóa tệp này khỏi hồ sơ?')))
                                setUploadingFiles(previous => previous.filter(item => item.id !== file.id));
                            }}
                          >
                            {t('Xóa')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lead-attachments-card__empty">{t('Chưa có tệp đính kèm.')}</div>
        )}
      </section>

      <div className="lead-form-page__extension-label">{t('THÔNG TIN BỔ SUNG CHO TIỀM NĂNG')}</div>

      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <Tags size={18} />
          <div>
            <h2>{t('Đánh giá tiềm năng')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className="form-group">
            <label data-system-label="stage">{t('Giai đoạn xử lý')}</label>
            <select value={form.stage} onChange={event => updateForm('stage', event.target.value as LeadStage)}>
              {LEAD_STAGES.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label data-system-label="potentialValue">{t('Giá trị tiềm năng (đ)')}</label>
            <input
              type="number"
              min="0"
              value={form.potentialValue}
              onChange={event => updateForm('potentialValue', Number(event.target.value))}
            />
          </div>
          <div className="form-group">
            <label data-system-label="closingProbability">{t('Khả năng chốt (%)')}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.closingProbability}
              onChange={event => updateForm('closingProbability', Number(event.target.value))}
            />
          </div>
          <div className="form-group">
            <label data-system-label="expectedCloseAt">{t('Dự kiến chốt')}</label>
            <input
              type="date"
              value={form.expectedCloseAt}
              onChange={event => updateForm('expectedCloseAt', event.target.value)}
            />
          </div>
        </div>
        <EntityCustomFieldsGrid
          definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'classification')}
          values={customFieldValues}
          role={currentUser.role}
          onChange={setCustomFieldValues}
        />
        <InlineEntityFieldManager
          table="leads"
          section="classification"
          sectionLabel={t('Đánh giá tiềm năng')}
          definitions={profileFormCustomFieldDefinitions}
          currentUser={currentUser}
          systemConfiguration={inlineSystemFieldConfiguration}
          onCustomFieldPurged={clearPurgedCustomField}
          onSystemFieldPurged={clearPurgedSystemField}
          systemFields={[
            { key: 'stage', label: 'Giai đoạn xử lý' },
            { key: 'potentialValue', label: 'Giá trị tiềm năng' }
          ]}
        />
      </section>

      <section className="lead-form-card">
        <div className="lead-form-card__heading">
          <CalendarClock size={18} />
          <div>
            <h2>{t('Kế hoạch chăm sóc')}</h2>
          </div>
        </div>
        <div className="lead-form-grid">
          <div className="form-group">
            <label data-system-label="lastContactResult">{t('Kết quả liên hệ gần nhất')}</label>
            <input
              value={form.lastContactResult}
              onChange={event => updateForm('lastContactResult', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label data-system-label="nextGoal">{t('Mục tiêu tiếp theo')}</label>
            <input value={form.nextGoal} onChange={event => updateForm('nextGoal', event.target.value)} />
          </div>
          <div className="form-group lead-form-grid__wide">
            <label data-system-label="careNote">{t('Ghi chú chăm sóc')}</label>
            <textarea rows={3} value={form.careNote} onChange={event => updateForm('careNote', event.target.value)} />
          </div>
        </div>
      </section>

      <EntityCustomFieldsSection
        definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'additional')}
        values={customFieldValues}
        role={currentUser.role}
        onChange={setCustomFieldValues}
      />
    </div>
  );
};
