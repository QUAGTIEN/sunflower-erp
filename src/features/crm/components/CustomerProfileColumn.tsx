import React from 'react';
import { EntityCustomFieldsReadOnly } from '@/components/EntityCustomFields';
import { useLanguage } from '@/context/LanguageContext';
import { CustomerNoteEditor } from '@/features/crm/components/CustomerNoteEditor';
import type { CustomerContactRecord, CustomerRecord } from '@/features/crm/model/crmModels';
import { plainTextToNoteHtml, sanitizeCustomerNoteHtml } from '@/features/crm/model/customerNote';
import { CONTACT_ROLE_LABELS, type CustomerHistoryTab } from '@/features/crm/model/customerWorkspace';
import type { CustomerListFilterInputs } from '@/features/crm/hooks/useCustomerListFilters';
import type { ErpDocument } from '@/shared/types';
import { formatDateTime } from '@/shared/utils/dateFormatting';

/** Note draft and save state owned by CrmPage (closing the detail checks for unsaved notes). */
export interface CustomerNoteState {
  customerNoteDraft: string;
  setCustomerNoteDraft: React.Dispatch<React.SetStateAction<string>>;
  customerNoteFeedback: string;
  setCustomerNoteFeedback: React.Dispatch<React.SetStateAction<string>>;
  isSavingCustomerNote: boolean;
  handleSaveCustomerNote: () => unknown;
}

interface CustomerProfileColumnProps {
  selectedCustomer: ErpDocument;
  currentUser: ErpDocument;
  users: ErpDocument[];
  customFieldDefinitions: CustomerListFilterInputs['customFieldDefinitions'];
  activeTab: CustomerHistoryTab;
  isCompanyInfoExpanded: boolean;
  onCompanyInfoExpandedChange: React.Dispatch<React.SetStateAction<boolean>>;
  calculateFrequency: (customerId: string) => string;
  onCopyCustomerInformation: (customer: CustomerRecord) => unknown;
  note: CustomerNoteState;
}

/** Left column of the customer detail: expandable company profile and the customer note editor. */
export const CustomerProfileColumn: React.FC<CustomerProfileColumnProps> = ({
  selectedCustomer,
  currentUser,
  users,
  customFieldDefinitions,
  activeTab: customerHistoryTab,
  isCompanyInfoExpanded,
  onCompanyInfoExpandedChange: setIsCompanyInfoExpanded,
  calculateFrequency,
  onCopyCustomerInformation: handleCopyCustomerInformation,
  note: {
    customerNoteDraft,
    setCustomerNoteDraft,
    customerNoteFeedback,
    setCustomerNoteFeedback,
    isSavingCustomerNote,
    handleSaveCustomerNote
  }
}) => {
  const { t } = useLanguage();

  return (
    <div className="customer-profile-column">
      <section id="customer-company-information" className="card customer-company-card" hidden={!isCompanyInfoExpanded}>
        <div className="crm-company-accordion-row">
          <button
            type="button"
            className="crm-company-accordion-trigger"
            aria-expanded={isCompanyInfoExpanded}
            onClick={() => setIsCompanyInfoExpanded(value => !value)}
          >
            <span className="card-title">{t('Thông tin doanh nghiệp')}</span>
            <span
              className="customer-company-summary-inline"
              title={[selectedCustomer.contactPerson, selectedCustomer.phone, selectedCustomer.email]
                .filter(Boolean)
                .join(' · ')}
            >
              {selectedCustomer.contactPerson || t('Chưa có liên hệ')} ·{' '}
              {selectedCustomer.phone || t('Chưa có điện thoại')} ·{' '}
              {users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}
            </span>
            <span className="crm-company-accordion-action">
              {isCompanyInfoExpanded ? t('Thu gọn') : t('Xem đầy đủ')}
            </span>
          </button>
          {isCompanyInfoExpanded && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => void handleCopyCustomerInformation(selectedCustomer)}
              title={t('Sao chép thông tin doanh nghiệp')}
            >
              {t('Sao chép')}
            </button>
          )}
        </div>

        {isCompanyInfoExpanded && (
          <div className="customer-company-expanded">
            <div className="customer-company-detail-grid">
              <span>{t('Liên hệ chính')}</span>
              <strong>{selectedCustomer.contactPerson || t('Chưa cập nhật')}</strong>
              <span>{t('Chức vụ')}</span>
              <strong>{selectedCustomer.contactPosition || t('Chưa cập nhật')}</strong>
              <span>{t('Điện thoại')}</span>
              <strong>{selectedCustomer.phone || t('Chưa cập nhật')}</strong>
              <span>{t('Email')}</span>
              <strong>{selectedCustomer.email || t('Chưa cập nhật')}</strong>
              <span>{t('Sale phụ trách')}</span>
              <strong>
                {users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}
              </strong>
              <span>{t('Mã số thuế')}</span>
              <strong>{selectedCustomer.taxCode || t('Chưa cung cấp')}</strong>
              <span>{t('Website')}</span>
              <strong>{selectedCustomer.website || t('Chưa cập nhật')}</strong>
              <span>{t('Lĩnh vực hoạt động')}</span>
              <strong>{selectedCustomer.businessSector || t('Chưa cập nhật')}</strong>
              <span>{t('Địa chỉ giao hàng')}</span>
              <strong>{selectedCustomer.address || t('Chưa cập nhật')}</strong>
              <span>{t('Nguồn dữ liệu')}</span>
              <strong>{selectedCustomer.source || t('Chưa cập nhật')}</strong>
              <span>{t('Đường dẫn nguồn')}</span>
              <strong>{selectedCustomer.sourceUrl || t('Chưa cập nhật')}</strong>
              <span>{t('Sale tìm được khách hàng')}</span>
              <strong>
                {users.find(u => u.uid === selectedCustomer.discoveredById)?.displayName ||
                  selectedCustomer.discoveredByName ||
                  t('Chưa xác định')}
              </strong>
              <span>{t('Sản phẩm / nhu cầu quan tâm')}</span>
              <strong>{selectedCustomer.expectedProducts || t('Chưa cập nhật')}</strong>
              {(
                selectedCustomer.customFields || [
                  {
                    id: 'discount',
                    name: t('Chiết khấu mặc định'),
                    value:
                      selectedCustomer.discountType === 'amount'
                        ? `${Number(selectedCustomer.discountAmount || 0).toLocaleString('vi-VN')} đ`
                        : `${Number(selectedCustomer.discountRate || 0)}%`
                  },
                  { id: 'debtLimit', name: t('Hạn mức công nợ (đ)'), value: selectedCustomer.debtLimit },
                  { id: 'paymentTerms', name: t('Điều khoản thanh toán'), value: selectedCustomer.paymentTerms }
                ]
              )
                .filter((field: any) => field.id !== 'note')
                .map((field: any) => (
                  <React.Fragment key={field.id}>
                    <span>{field.name}</span>
                    <strong>
                      {field.id === 'debtLimit'
                        ? `${Number(field.value || 0).toLocaleString('vi-VN')} đ`
                        : field.value || t('Không có')}
                    </strong>
                  </React.Fragment>
                ))}
              <span>{t('Tần suất đặt hàng')}</span>
              <strong>{calculateFrequency(selectedCustomer.id)}</strong>
              <span>{t('Tạo bởi')}</span>
              <strong>
                {selectedCustomer.createdBy || t('Không xác định')}{' '}
                {selectedCustomer.createdAt && `(${formatDateTime(selectedCustomer.createdAt, t('vi-VN'))})`}
              </strong>
              <span>{t('Cập nhật bởi')}</span>
              <strong>
                {selectedCustomer.updatedBy || t('Chưa cập nhật')}{' '}
                {selectedCustomer.updatedAt && `(${formatDateTime(selectedCustomer.updatedAt, t('vi-VN'))})`}
              </strong>
            </div>

            <EntityCustomFieldsReadOnly
              definitions={customFieldDefinitions}
              values={selectedCustomer.customFieldValues}
            />

            <div className="customer-contact-panel">
              <div className="customer-contact-panel__heading">
                <strong>{t('Đầu mối liên hệ')}</strong>
              </div>
              <div className="customer-contact-list">
                {(selectedCustomer.contacts || []).map((contact: CustomerContactRecord) => (
                  <div key={contact.id} className="customer-contact-item">
                    <span className="customer-contact-item__role">{CONTACT_ROLE_LABELS[contact.role]}</span>
                    <strong>{contact.name || t('Chưa cập nhật tên')}</strong>
                    <span>
                      {[contact.phone, contact.email].filter(Boolean).join(' · ') || t('Chưa có thông tin liên hệ')}
                    </span>
                  </div>
                ))}
                {(selectedCustomer.contacts || []).length === 0 && (
                  <span className="text-muted">{t('Chưa có đầu mối liên hệ.')}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section
        className="card customer-note-card"
        hidden={customerHistoryTab !== 'overview' && customerHistoryTab !== 'notes'}
      >
        <div className="card-header customer-note-card__header">
          <div>
            <span className="card-title">{t('Ghi chú khách hàng')}</span>
          </div>
        </div>
        <CustomerNoteEditor
          value={customerNoteDraft}
          disabled={currentUser.role !== 'admin' && currentUser.role !== 'sale'}
          placeholder={t('Nhập ghi chú về nhu cầu, thỏa thuận hoặc lưu ý khi làm việc với khách hàng...')}
          onChange={value => {
            setCustomerNoteDraft(value);
            setCustomerNoteFeedback('');
          }}
        />
        <div className="customer-note-card__footer">
          <span role="status">{customerNoteFeedback}</span>
          {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSaveCustomerNote()}
              disabled={
                isSavingCustomerNote ||
                sanitizeCustomerNoteHtml(customerNoteDraft).trim() ===
                  sanitizeCustomerNoteHtml(
                    selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))
                  ).trim()
              }
            >
              {isSavingCustomerNote ? t('Đang lưu...') : t('Lưu ghi chú')}
            </button>
          )}
        </div>
        <small className="customer-note-card__meta">
          {selectedCustomer.updatedAt
            ? `${t('Cập nhật gần nhất')}: ${formatDateTime(selectedCustomer.updatedAt, t('vi-VN'))}${selectedCustomer.updatedBy ? ` · ${selectedCustomer.updatedBy}` : ''}`
            : t('Chưa có lịch sử cập nhật')}
        </small>
      </section>
    </div>
  );
};
