import React from 'react';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { Building2, UserRoundSearch, ListPlus, CalendarClock, Paperclip } from 'lucide-react';
import { BusinessLocationFields } from '../BusinessLocationFields';
import { EntityCustomFieldsGrid, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
import { InlineEntityFieldManager } from '@/components/InlineEntityFieldManager';
import { CANDIDATE_SOURCES, type CandidateDetailTab, type CandidateFormState } from './leadCandidateWorkspaceConfig';
import type { LeadCandidateRecord, LeadCandidateFileRecord } from '@/features/crm/model/leadCandidateModels';
import type { EntityCustomFieldValues, EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

interface LeadCandidateProfileFieldsProps {
  candidateDetailTab: CandidateDetailTab;
  form: CandidateFormState;
  updateForm: <K extends keyof CandidateFormState>(field: K, value: CandidateFormState[K]) => void;
  editingCandidate: LeadCandidateRecord | null;
  setForm: React.Dispatch<React.SetStateAction<CandidateFormState>>;
  currentUser: UserProfile;
  candidateOwners: UserProfile[];
  customFields: {
    profileCustomFieldDefinitions: EntityFieldDefinition[];
    customFieldValues: EntityCustomFieldValues;
    setCustomFieldValues: React.Dispatch<React.SetStateAction<EntityCustomFieldValues>>;
    inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
    clearPurgedCustomField: (fieldId: string) => void;
    clearPurgedSystemField: (fieldKey: string) => void;
  };
  files: {
    handleCandidateFilesChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleCandidateFilesDrop: (event: React.DragEvent<HTMLLabelElement>) => Promise<void>;
    candidateLinkName: string;
    setCandidateLinkName: React.Dispatch<React.SetStateAction<string>>;
    candidateLinkUrl: string;
    setCandidateLinkUrl: React.Dispatch<React.SetStateAction<string>>;
    handleAddCandidateLink: () => void;
    candidateFiles: LeadCandidateFileRecord[];
    setCandidateFiles: React.Dispatch<React.SetStateAction<LeadCandidateFileRecord[]>>;
  };
}

/** Profile tab of the raw-data form: company, contact, address, sales sections and related files. */
export const LeadCandidateProfileFields: React.FC<LeadCandidateProfileFieldsProps> = ({
  candidateDetailTab,
  form,
  updateForm,
  editingCandidate,
  setForm,
  currentUser,
  candidateOwners,
  customFields: {
    profileCustomFieldDefinitions,
    customFieldValues,
    setCustomFieldValues,
    inlineSystemFieldConfiguration,
    clearPurgedCustomField,
    clearPurgedSystemField
  },
  files: {
    handleCandidateFilesChange,
    handleCandidateFilesDrop,
    candidateLinkName,
    setCandidateLinkName,
    candidateLinkUrl,
    setCandidateLinkUrl,
    handleAddCandidateLink,
    candidateFiles,
    setCandidateFiles
  }
}) => (
  <div className="lead-form-page__content lead-candidate-form-page__content lead-candidate-quick-form">
    <section className="lead-form-card">
      <div className="lead-form-card__heading">
        <Building2 size={18} />
        <div>
          <h2>Thông tin doanh nghiệp</h2>
        </div>
      </div>
      <div className="lead-form-grid">
        <div className="form-group lead-form-grid__wide">
          <label data-system-label="companyName">Tên doanh nghiệp *</label>
          <input
            autoFocus={candidateDetailTab === 'profile'}
            required
            value={form.companyName}
            onChange={event => updateForm('companyName', event.target.value)}
          />
        </div>
        <div className="form-group">
          <label data-system-label="taxCode">Mã số thuế</label>
          <input
            value={form.taxCode}
            readOnly={Boolean(editingCandidate?.taxCode)}
            onChange={event => updateForm('taxCode', event.target.value)}
          />
        </div>
        <div className="form-group">
          <label data-system-label="website">Website</label>
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
          <label data-system-label="address">Địa chỉ doanh nghiệp</label>
          <input value={form.address} onChange={event => updateForm('address', event.target.value)} />
        </div>
      </div>
      <EntityCustomFieldsGrid
        definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'company')}
        values={customFieldValues}
        role={currentUser.role}
        onChange={setCustomFieldValues}
      />
      <InlineEntityFieldManager
        table="lead_candidates"
        section="company"
        sectionLabel="Thông tin doanh nghiệp"
        definitions={profileCustomFieldDefinitions}
        currentUser={currentUser}
        systemConfiguration={inlineSystemFieldConfiguration}
        onCustomFieldPurged={clearPurgedCustomField}
        onSystemFieldPurged={clearPurgedSystemField}
        systemFields={[
          { key: 'taxCode', label: 'Mã số thuế' },
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
        <UserRoundSearch size={18} />
        <div>
          <h2>Liên hệ và nguồn dữ liệu</h2>
        </div>
      </div>
      <div className="lead-form-grid">
        <div className="form-group">
          <label data-system-label="contactPerson">Người liên hệ</label>
          <input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} />
        </div>
        <div className="form-group">
          <label data-system-label="contactPosition">Chức vụ</label>
          <input
            value={form.contactPosition}
            onChange={event => updateForm('contactPosition', event.target.value)}
            placeholder="Ví dụ: Thu mua, Giám đốc..."
          />
        </div>
        <div className="form-group">
          <label data-system-label="phone">Điện thoại</label>
          <input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} />
        </div>
        <div className="form-group">
          <label data-system-label="email">Email</label>
          <input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} />
        </div>
        <div className="form-group">
          <label data-system-label="source">Nguồn tìm kiếm</label>
          <select value={form.source} onChange={event => updateForm('source', event.target.value)}>
            {CANDIDATE_SOURCES.map(source => (
              <option key={source}>{source}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label data-system-label="sourceUrl">Đường dẫn nguồn</label>
          <input
            type="url"
            value={form.sourceUrl}
            onChange={event => updateForm('sourceUrl', event.target.value)}
            placeholder="Link Facebook, Google Maps..."
          />
        </div>
      </div>
      <EntityCustomFieldsGrid
        definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'contact')}
        values={customFieldValues}
        role={currentUser.role}
        onChange={setCustomFieldValues}
      />
      <InlineEntityFieldManager
        table="lead_candidates"
        section="contact"
        sectionLabel="Liên hệ và nguồn dữ liệu"
        definitions={profileCustomFieldDefinitions}
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
        <ListPlus size={18} />
        <div>
          <h2>Thông tin bổ sung</h2>
        </div>
      </div>
      <div className="lead-form-grid">
        <div className="form-group lead-form-grid__wide">
          <label data-system-label="note">Ghi chú</label>
          <textarea
            rows={5}
            value={form.note}
            onChange={event => updateForm('note', event.target.value)}
            placeholder="Thông tin cần lưu ý trước khi liên hệ..."
          />
        </div>
      </div>
      <EntityCustomFieldsGrid
        definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'needs')}
        values={customFieldValues}
        role={currentUser.role}
        onChange={setCustomFieldValues}
      />
      <InlineEntityFieldManager
        table="lead_candidates"
        section="needs"
        sectionLabel="Thông tin bổ sung"
        definitions={profileCustomFieldDefinitions}
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
          <h2>Phụ trách và lịch hẹn</h2>
        </div>
      </div>
      <div className="lead-form-grid">
        <div className="form-group">
          <label data-system-label="assignedSaleId">Người phụ trách *</label>
          <select
            required
            value={form.assignedSaleId}
            disabled={currentUser.role === 'sale'}
            onChange={event => updateForm('assignedSaleId', event.target.value)}
          >
            <option value="">Chưa phân công</option>
            {candidateOwners.map(user => (
              <option key={user.uid} value={user.uid}>
                {user.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Sale tìm được dữ liệu</label>
          <input value={editingCandidate?.discoveredByName || currentUser.displayName} readOnly />
        </div>
        <div className="form-group lead-form-grid__wide">
          <label data-system-label="nextContactAt">Lịch hẹn xử lý</label>
          <input
            type="datetime-local"
            value={form.nextContactAt}
            onChange={event => updateForm('nextContactAt', event.target.value)}
          />
        </div>
      </div>
      <EntityCustomFieldsGrid
        definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'assignment')}
        values={customFieldValues}
        role={currentUser.role}
        onChange={setCustomFieldValues}
      />
      <InlineEntityFieldManager
        table="lead_candidates"
        section="assignment"
        sectionLabel="Phụ trách và lịch hẹn"
        definitions={profileCustomFieldDefinitions}
        currentUser={currentUser}
        systemConfiguration={inlineSystemFieldConfiguration}
        onCustomFieldPurged={clearPurgedCustomField}
        onSystemFieldPurged={clearPurgedSystemField}
        systemFields={[{ key: 'nextContactAt', label: 'Lịch hẹn xử lý' }]}
      />
    </section>

    <EntityCustomFieldsSection
      definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'additional')}
      values={customFieldValues}
      role={currentUser.role}
      onChange={setCustomFieldValues}
    />

    <section className="lead-form-card lead-candidate-files-card">
      <div className="lead-form-card__heading">
        <Paperclip size={18} />
        <div>
          <h2>File liên quan</h2>
        </div>
      </div>
      <div className="lead-candidate-files-card__tools">
        <label className="btn btn-outline lead-candidate-files-card__upload">
          Tải tệp lên
          <input type="file" multiple onChange={event => void handleCandidateFilesChange(event)} />
        </label>
        <span>Tệp dưới 900 KB; tệp lớn dùng đường dẫn Drive hoặc OneDrive.</span>
        <label
          className="lead-candidate-files-card__dropzone"
          onDragOver={event => event.preventDefault()}
          onDrop={event => void handleCandidateFilesDrop(event)}
        >
          Kéo thả tệp vào đây hoặc chọn từ máy
          <input type="file" multiple onChange={event => void handleCandidateFilesChange(event)} />
        </label>
      </div>
      <details className="lead-candidate-files-card__link">
        <summary>Thêm đường dẫn Drive/OneDrive</summary>
        <div>
          <input
            value={candidateLinkName}
            onChange={event => setCandidateLinkName(event.target.value)}
            placeholder="Tên tài liệu"
          />
          <input
            type="url"
            value={candidateLinkUrl}
            onChange={event => setCandidateLinkUrl(event.target.value)}
            placeholder="https://..."
          />
          <button type="button" className="btn btn-outline" onClick={handleAddCandidateLink}>
            Thêm đường dẫn
          </button>
        </div>
      </details>
      <div className="lead-candidate-files-card__list">
        {candidateFiles.length === 0 ? (
          <p>Chưa có tệp liên quan.</p>
        ) : (
          candidateFiles.map(file => {
            const source = file.url || file.data;
            return (
              <div key={file.id} className="lead-candidate-files-card__row">
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <span>
                    {file.url
                      ? 'Đường dẫn'
                      : file.size
                        ? `${Math.ceil(file.size / 1024).toLocaleString('vi-VN')} KB`
                        : 'Tệp tài liệu'}{' '}
                    · {file.createdBy || 'Chưa rõ người tải'}
                  </span>
                </div>
                <div>
                  {source &&
                    (file.url ? (
                      <a className="btn btn-outline" href={source} target="_blank" rel="noreferrer">
                        Mở
                      </a>
                    ) : (
                      <a className="btn btn-outline" href={source} download={file.name}>
                        Tải xuống
                      </a>
                    ))}
                  <button
                    type="button"
                    className="btn btn-outline lead-candidate-files-card__delete"
                    onClick={() => setCandidateFiles(previous => previous.filter(item => item.id !== file.id))}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  </div>
);
