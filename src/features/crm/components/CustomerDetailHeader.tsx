import React from 'react';
import { Trash2 } from 'lucide-react';
import { PageBackButton } from '@/components/PageBackButton';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { customerCallHistoryKeys, customerCallSubjectKey } from '@/features/crm/model/callHistory';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { CustomerHistoryTab } from '@/features/crm/model/customerWorkspace';
import type { ErpDocument } from '@/shared/types';

interface CustomerDetailHeaderProps {
  selectedCustomer: ErpDocument;
  currentUser: ErpDocument;
  leads: LeadRecord[];
  callPhone: string;
  activeTab: CustomerHistoryTab;
  onTabChange: (tab: CustomerHistoryTab) => void;
  isCompanyInfoExpanded: boolean;
  onCompanyInfoExpandedChange: React.Dispatch<React.SetStateAction<boolean>>;
  onBack: () => void;
  onEditCustomer: (customer: CustomerRecord) => void;
  onDeleteCustomer: (customerId: string) => unknown;
}

/** Header of the customer detail: back button, name, call cell and edit/delete actions. */
export const CustomerDetailHeader: React.FC<CustomerDetailHeaderProps> = ({
  selectedCustomer,
  currentUser,
  leads,
  callPhone: detailCallPhone,
  activeTab: customerHistoryTab,
  onTabChange: setCustomerHistoryTab,
  isCompanyInfoExpanded,
  onCompanyInfoExpandedChange: setIsCompanyInfoExpanded,
  onBack: closeCustomerDetail,
  onEditCustomer: openEditModal,
  onDeleteCustomer: handleDeleteCustomer
}) => {
  return (
    <div className="customer-detail-header">
      <PageBackButton
        onClick={() => {
          if (customerHistoryTab !== 'overview') {
            setCustomerHistoryTab('overview');
            return;
          }
          closeCustomerDetail();
        }}
      />
      <div className="customer-detail-heading">
        <div className="customer-detail-heading__title">
          <h1 title={selectedCustomer.companyName}>{selectedCustomer.companyName}</h1>
        </div>
      </div>
      <div className="crm-detail-actions">
        <button
          type="button"
          className="btn btn-outline"
          aria-expanded={isCompanyInfoExpanded}
          aria-controls="customer-company-information"
          onClick={() => setIsCompanyInfoExpanded(value => !value)}
        >
          Thông tin doanh nghiệp
        </button>
        {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
          <>
            <PhoneCallCell
              toolbar
              phone={detailCallPhone || selectedCustomer.phone}
              companyName={selectedCustomer.companyName}
              subjectKey={customerCallSubjectKey(selectedCustomer)}
              historyKeys={customerCallHistoryKeys(selectedCustomer, leads)}
              auditModule="crm"
              targetType="customer"
              targetId={selectedCustomer.id}
              currentUser={currentUser}
              canRecord={
                currentUser.role === 'admin' ||
                (currentUser.role === 'sale' &&
                  (!selectedCustomer.assignedSaleId || selectedCustomer.assignedSaleId === currentUser.uid))
              }
            />
            <button type="button" className="btn btn-primary" onClick={() => openEditModal(selectedCustomer)}>
              Chỉnh sửa hồ sơ
            </button>
            <button
              type="button"
              className="btn btn-outline btn-symbol-sm crm-detail-delete"
              onClick={() => handleDeleteCustomer(selectedCustomer.id)}
              title="Xóa khách hàng"
              aria-label="Xóa khách hàng"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
