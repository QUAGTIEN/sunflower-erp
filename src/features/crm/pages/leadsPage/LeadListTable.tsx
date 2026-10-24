import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import type { CustomerInsightItem } from '@/features/crm/model/customerInsightCatalog';
import type { HeaderInteractionProps } from '@/hooks/useReorderableTableColumns';
import React from 'react';
import { ConfiguredSystemTable } from '@/components/ConfiguredSystemFields';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { COMPANY_SIZE_LABELS, getStageLabel, type LeadDetailTab } from './leadsPageConfig';
import { LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import { formatEntityCustomFieldValue } from '@/features/crm/model/entityFieldConfig';
import { RowActionMenu } from '@/components/RowActionMenu';
import { CalendarClock, ClipboardCheck, LifeBuoy, Undo2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeadRecord } from '@/features/crm/model/crmModels';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import type { SupportRequestTarget } from '@/components/SupportRequestDialog';
import { useLanguage } from '@/context/LanguageContext';

interface LeadListTableProps {
  filteredLeads: LeadRecord[];
  accessibleLeads: LeadRecord[];
  displayedLeads: LeadRecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  columns: {
    visibleLeadColumnCount: number;
    orderedLeadColumnIds: string[];
    getLeadHeaderProps: (
      columnId: string,
      label: string,
      currentClassName?: string,
      currentStyle?: React.CSSProperties
    ) => HeaderInteractionProps;
    leadColumnLabels: { [k: string]: string };
    visibleLeadColumnIds: Set<string>;
    visibleLeadInsightItems: CustomerInsightItem[];
    visibleLeadCustomFields: EntityFieldDefinition[];
  };
  cells: {
    renderLeadText: (value?: string | undefined) => React.JSX.Element;
    getClassificationLabel: (lead: LeadRecord, fieldId: string, fallback?: string) => string;
    renderFollowUp: (lead: LeadRecord) => React.JSX.Element;
  };
  actions: {
    openEditForm: (lead: LeadRecord, initialTab?: LeadDetailTab) => void;
    openScheduleForm: (lead: LeadRecord) => void;
    setAssignmentTarget: React.Dispatch<React.SetStateAction<WorkAssignmentTarget | null>>;
    setSupportTarget: React.Dispatch<React.SetStateAction<SupportRequestTarget | null>>;
    returningLeadId: string;
    handleReturnLeadToRawData: (lead: LeadRecord) => Promise<void | undefined>;
    handleDeleteLead: (lead: LeadRecord) => Promise<void | undefined>;
  };
  paging: {
    safeLeadCurrentPage: number;
    leadPageSize: number;
    setLeadPageSize: React.Dispatch<React.SetStateAction<number>>;
    setLeadCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    leadTotalPages: number;
  };
}

/** Paginated lead table with row actions, follow-up status and column layout. */
export const LeadListTable: React.FC<LeadListTableProps> = ({
  filteredLeads,
  accessibleLeads,
  displayedLeads,
  users,
  currentUser,
  columns: {
    visibleLeadColumnCount,
    orderedLeadColumnIds,
    getLeadHeaderProps,
    leadColumnLabels,
    visibleLeadColumnIds,
    visibleLeadInsightItems,
    visibleLeadCustomFields
  },
  cells: { renderLeadText, getClassificationLabel, renderFollowUp },
  actions: {
    openEditForm,
    openScheduleForm,
    setAssignmentTarget,
    setSupportTarget,
    returningLeadId,
    handleReturnLeadToRawData,
    handleDeleteLead
  },
  paging: { safeLeadCurrentPage, leadPageSize, setLeadPageSize, setLeadCurrentPage, leadTotalPages }
}) => {
  const { t } = useLanguage();
  return (
    <section className="lead-table-card">
      <div className="lead-table-result">
        Hiển thị <strong>{filteredLeads.length}</strong> / {accessibleLeads.length} Lead
      </div>
      <div className="table-container">
        <ConfiguredSystemTable
          table="leads"
          className="lead-table lead-table--classified has-dynamic-columns"
          style={{ minWidth: `${Math.max(1180, visibleLeadColumnCount * 150 + 130)}px` }}
        >
          <thead>
            <tr>
              <ReorderableTableCells
                order={orderedLeadColumnIds}
                getHeaderProps={getLeadHeaderProps}
                labels={leadColumnLabels}
              >
                <th key="index" className="erp-table-index-column">
                  STT
                </th>
                <th key="company" data-system-field="companyName">
                  {t('Doanh nghiệp')}
                </th>
                {visibleLeadColumnIds.has('taxCode') && (
                  <th key="taxCode" data-system-field="taxCode">
                    {t('Mã số thuế')}
                  </th>
                )}
                {visibleLeadColumnIds.has('website') && (
                  <th key="website" data-system-field="website">
                    Website
                  </th>
                )}
                {visibleLeadColumnIds.has('businessSector') && (
                  <th key="businessSector" data-system-field="businessSector">
                    {t('Lĩnh vực hoạt động')}
                  </th>
                )}
                {visibleLeadColumnIds.has('address') && (
                  <th key="address" data-system-field="address">
                    {t('Địa chỉ doanh nghiệp')}
                  </th>
                )}
                {visibleLeadColumnIds.has('companySize') && (
                  <th key="companySize" data-system-field="companySize">
                    {t('Quy mô')}
                  </th>
                )}
                {visibleLeadColumnIds.has('source') && (
                  <th key="source" data-system-field="source">
                    {t('Khu vực')}
                  </th>
                )}
                {visibleLeadColumnIds.has('sourceValue') && (
                  <th key="sourceValue" data-system-field="sourceValue">
                    {t('Nguồn tìm kiếm')}
                  </th>
                )}
                {visibleLeadColumnIds.has('province') && (
                  <th key="province" data-system-field="province">
                    {t('Tỉnh/thành')}
                  </th>
                )}
                {visibleLeadColumnIds.has('ward') && (
                  <th key="ward" data-system-field="ward">
                    {t('Phường/xã')}
                  </th>
                )}
                {visibleLeadColumnIds.has('industrialPark') && (
                  <th key="industrialPark" data-system-field="industrialPark">
                    {t('Khu công nghiệp')}
                  </th>
                )}
                {visibleLeadColumnIds.has('contact') && (
                  <th key="contact" data-system-field="contact">
                    {t('Liên hệ')}
                  </th>
                )}
                {visibleLeadColumnIds.has('contactPerson') && (
                  <th key="contactPerson" data-system-field="contactPerson">
                    {t('Người liên hệ')}
                  </th>
                )}
                {visibleLeadColumnIds.has('contactPosition') && (
                  <th key="contactPosition" data-system-field="contactPosition">
                    {t('Chức vụ')}
                  </th>
                )}
                {visibleLeadColumnIds.has('phone') && (
                  <th key="phone" data-system-field="phone">
                    {t('Điện thoại')}
                  </th>
                )}
                {visibleLeadColumnIds.has('email') && (
                  <th key="email" data-system-field="email">
                    Email
                  </th>
                )}
                {visibleLeadColumnIds.has('expectedProducts') && (
                  <th key="expectedProducts" data-system-field="expectedProducts">
                    {t('Sản phẩm / nhu cầu quan tâm')}
                  </th>
                )}
                {visibleLeadColumnIds.has('potentialValue') && (
                  <th key="potentialValue" data-system-field="potentialValue">
                    {t('Giá trị tiềm năng')}
                  </th>
                )}
                {visibleLeadColumnIds.has('stage') && (
                  <th key="stage" data-system-field="stage">
                    {t('Giai đoạn xử lý')}
                  </th>
                )}
                {visibleLeadColumnIds.has('note') && (
                  <th key="note" data-system-field="note">
                    {t('Ghi chú')}
                  </th>
                )}
                {visibleLeadColumnIds.has('assignedSale') && (
                  <th key="assignedSale" data-system-field="assignedSaleId">
                    {t('Sale phụ trách')}
                  </th>
                )}
                {visibleLeadColumnIds.has('discoveredBy') && (
                  <th key="discoveredBy" data-system-field="discoveredById">
                    {t('Sale tìm được Lead')}
                  </th>
                )}
                {visibleLeadColumnIds.has('nextFollowUpAt') && (
                  <th key="nextFollowUpAt" data-system-field="nextFollowUpAt">
                    {t('Chăm sóc tiếp')}
                  </th>
                )}
                {visibleLeadInsightItems.map(entry => (
                  <th key={`insight:${entry.id}`}>{entry.label}</th>
                ))}
                {visibleLeadCustomFields.map(definition => (
                  <th key={`custom:${definition.id}`}>{definition.name}</th>
                ))}
                <th key="actions">{t('Thao tác')}</th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {displayedLeads.map((lead, leadIndex) => (
              <tr key={lead.id} onClick={() => openEditForm(lead)}>
                <ReorderableTableCells order={orderedLeadColumnIds}>
                  <td key="index" className="erp-table-index-column">
                    {(safeLeadCurrentPage - 1) * leadPageSize + leadIndex + 1}
                  </td>
                  <td key="company">
                    <strong className="erp-company-name" title={lead.companyName}>
                      {lead.companyName}
                    </strong>
                  </td>
                  {visibleLeadColumnIds.has('taxCode') && <td key="taxCode">{renderLeadText(lead.taxCode)}</td>}
                  {visibleLeadColumnIds.has('website') && <td key="website">{renderLeadText(lead.website)}</td>}
                  {visibleLeadColumnIds.has('businessSector') && (
                    <td key="businessSector">{renderLeadText(lead.businessSector)}</td>
                  )}
                  {visibleLeadColumnIds.has('address') && <td key="address">{renderLeadText(lead.address)}</td>}
                  {visibleLeadColumnIds.has('companySize') && (
                    <td key="companySize">{renderLeadText(COMPANY_SIZE_LABELS[lead.companySize])}</td>
                  )}
                  {visibleLeadColumnIds.has('source') && (
                    <td key="source">
                      {renderLeadText([lead.province, lead.ward, lead.industrialPark].filter(Boolean).join(' · '))}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('sourceValue') && (
                    <td key="sourceValue">
                      {renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.source, lead.source || ''))}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('province') && (
                    <td key="province">
                      {renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.province, lead.province || ''))}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('ward') && <td key="ward">{renderLeadText(lead.ward)}</td>}
                  {visibleLeadColumnIds.has('industrialPark') && (
                    <td key="industrialPark">
                      {renderLeadText(
                        getClassificationLabel(lead, LEAD_FILTER_IDS.industrialPark, lead.industrialPark || '')
                      )}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('contact') && <td key="contact">{renderLeadText(lead.contactPerson)}</td>}
                  {visibleLeadColumnIds.has('contactPerson') && (
                    <td key="contactPerson">{renderLeadText(lead.contactPerson)}</td>
                  )}
                  {visibleLeadColumnIds.has('contactPosition') && (
                    <td key="contactPosition">{renderLeadText(lead.contactPosition)}</td>
                  )}
                  {visibleLeadColumnIds.has('phone') && (
                    <td key="phone">
                      {lead.phone ? (
                        <button
                          type="button"
                          className="lead-candidate-phone-link"
                          onClick={event => {
                            event.stopPropagation();
                            openEditForm(lead, 'profile');
                          }}
                        >
                          {lead.phone}
                        </button>
                      ) : (
                        renderLeadText(lead.phone)
                      )}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('email') && <td key="email">{renderLeadText(lead.email)}</td>}
                  {visibleLeadColumnIds.has('expectedProducts') && (
                    <td key="expectedProducts">{renderLeadText(lead.expectedProducts)}</td>
                  )}
                  {visibleLeadColumnIds.has('potentialValue') && (
                    <td key="potentialValue">
                      <strong>{lead.potentialValue.toLocaleString('vi-VN')} đ</strong>
                    </td>
                  )}
                  {visibleLeadColumnIds.has('stage') && (
                    <td key="stage">{renderLeadText(getStageLabel(lead.stage))}</td>
                  )}
                  {visibleLeadColumnIds.has('note') && <td key="note">{renderLeadText(lead.note)}</td>}
                  {visibleLeadColumnIds.has('assignedSale') && (
                    <td key="assignedSale">
                      {users.find(user => user.uid === lead.assignedSaleId)?.displayName ||
                        lead.assignedSaleName ||
                        'Chưa phân công'}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('discoveredBy') && (
                    <td key="discoveredBy">
                      {renderLeadText(
                        users.find(user => user.uid === lead.discoveredById)?.displayName || lead.discoveredByName
                      )}
                    </td>
                  )}
                  {visibleLeadColumnIds.has('nextFollowUpAt') && <td key="nextFollowUpAt">{renderFollowUp(lead)}</td>}
                  {visibleLeadInsightItems.map(entry => (
                    <td key={`insight:${entry.id}`}>
                      <span
                        className={`lead-candidate-insight-value ${(lead.customerInsightValues || []).includes(entry.id) ? 'is-selected' : ''}`}
                      >
                        {(lead.customerInsightValues || []).includes(entry.id) ? 'Đã chọn' : 'Chưa chọn'}
                      </span>
                    </td>
                  ))}
                  {visibleLeadCustomFields.map(definition => (
                    <td key={`custom:${definition.id}`}>
                      {formatEntityCustomFieldValue(definition, lead.customFieldValues?.[definition.id])}
                    </td>
                  ))}
                  <td key="actions">
                    <RowActionMenu
                      label={`${t('Thao tác')} ${lead.companyName}`}
                      actions={[
                        {
                          label: t('Hẹn lịch'),
                          icon: <CalendarClock size={14} />,
                          onSelect: () => openScheduleForm(lead)
                        },
                        ...(currentUser.role === 'admin'
                          ? [
                              {
                                label: t('Giao việc'),
                                icon: <ClipboardCheck size={14} />,
                                onSelect: () =>
                                  setAssignmentTarget({ id: lead.id, label: lead.companyName, module: 'leads' })
                              }
                            ]
                          : []),
                        ...(currentUser.role === 'sale'
                          ? [
                              {
                                label: t('Yêu cầu hỗ trợ'),
                                icon: <LifeBuoy size={14} />,
                                onSelect: () =>
                                  setSupportTarget({ id: lead.id, label: lead.companyName, module: 'leads' })
                              }
                            ]
                          : []),
                        {
                          label: returningLeadId === lead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô'),
                          icon: <Undo2 size={14} />,
                          onSelect: () => void handleReturnLeadToRawData(lead),
                          disabled:
                            returningLeadId === lead.id ||
                            lead.stage === 'converted' ||
                            Boolean(lead.convertedCustomerId) ||
                            (currentUser.role !== 'admin' && lead.assignedSaleId !== currentUser.uid)
                        },
                        {
                          label: t('Xóa Lead'),
                          icon: <Trash2 size={14} />,
                          onSelect: () => void handleDeleteLead(lead),
                          danger: true,
                          disabled: currentUser.role !== 'admin' && lead.assignedSaleId !== currentUser.uid
                        }
                      ]}
                    />
                  </td>
                </ReorderableTableCells>
              </tr>
            ))}
          </tbody>
        </ConfiguredSystemTable>
      </div>
      {filteredLeads.length > 0 && (
        <footer className="lead-candidate-pagination lead-table-pagination">
          <span>
            Tổng số: <strong>{filteredLeads.length}</strong> bản ghi
          </span>
          <label>
            Hiển thị
            <select
              value={leadPageSize}
              onChange={event => {
                setLeadPageSize(Number(event.target.value));
                setLeadCurrentPage(1);
              }}
            >
              <option value={25}>25 dòng</option>
              <option value={50}>50 dòng</option>
              <option value={100}>100 dòng</option>
            </select>
          </label>
          <div>
            <button
              type="button"
              onClick={() => setLeadCurrentPage(page => Math.max(1, page - 1))}
              disabled={safeLeadCurrentPage === 1}
              aria-label="Trang trước"
            >
              <ChevronLeft size={15} />
            </button>
            <strong>
              {safeLeadCurrentPage} / {leadTotalPages}
            </strong>
            <button
              type="button"
              onClick={() => setLeadCurrentPage(page => Math.min(leadTotalPages, page + 1))}
              disabled={safeLeadCurrentPage === leadTotalPages}
              aria-label="Trang sau"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      )}
    </section>
  );
};
