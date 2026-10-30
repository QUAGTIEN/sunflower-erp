import React from 'react';
import type { HeaderInteractionProps } from '@/hooks/useReorderableTableColumns';
import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import type { CustomerInsightItem } from '@/features/crm/model/customerInsightCatalog';
import { ConfiguredSystemTable } from '@/components/ConfiguredSystemFields';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { formatShortDateTime, type CandidateDetailTab } from './leadCandidateWorkspaceConfig';
import { formatEntityCustomFieldValue } from '@/features/crm/model/entityFieldConfig';
import { RowActionMenu } from '@/components/RowActionMenu';
import { ClipboardCheck, LifeBuoy, CalendarClock, BarChart3, Pencil, CheckCircle2, Trash2 } from 'lucide-react';
import type { LeadCandidateRecord, LeadCandidateContactResult } from '@/features/crm/model/leadCandidateModels';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import type { SupportRequestTarget } from '@/components/SupportRequestDialog';

interface LeadCandidateDataTableProps {
  displayedCandidates: LeadCandidateRecord[];
  safeCurrentPage: number;
  pageSize: number;
  referenceTime: number;
  currentUser: UserProfile;
  columns: {
    candidateTableStyle: React.CSSProperties;
    orderedColumnIds: string[];
    getHeaderProps: (
      columnId: string,
      label: string,
      currentClassName?: string,
      currentStyle?: React.CSSProperties
    ) => HeaderInteractionProps;
    candidateColumnLabels: { [k: string]: string };
    visibleColumnSet: Set<string>;
    customFieldDefinitions: EntityFieldDefinition[];
    visibleCandidateInsightItems: CustomerInsightItem[];
  };
  cells: {
    renderCandidateField: (value?: string | undefined) => React.JSX.Element;
    renderCompactValue: (value: string, title?: string, className?: string) => React.JSX.Element;
    getContactSummary: (candidate: LeadCandidateRecord) => string;
    renderPhoneLink: (candidate: LeadCandidateRecord) => React.JSX.Element;
    renderPotentialLevel: (candidate: LeadCandidateRecord) => React.JSX.Element;
    renderCompactLatestActivity: (candidate: LeadCandidateRecord) => React.JSX.Element;
    renderInsightValue: (candidate: LeadCandidateRecord, itemId: string) => React.JSX.Element;
  };
  actions: {
    openEditForm: (candidate: LeadCandidateRecord, initialTab?: CandidateDetailTab) => void;
    openScheduleForm: (candidate: LeadCandidateRecord, contactResult?: '' | LeadCandidateContactResult) => void;
    setScoringCandidateId: React.Dispatch<React.SetStateAction<string>>;
    setAssignmentTarget: React.Dispatch<React.SetStateAction<WorkAssignmentTarget | null>>;
    setSupportTarget: React.Dispatch<React.SetStateAction<SupportRequestTarget | null>>;
    onStartConversion: (candidate: LeadCandidateRecord) => void;
    archiveCandidate: (candidate: LeadCandidateRecord) => Promise<void | undefined>;
    canManageCandidate: (candidate: LeadCandidateRecord) => boolean;
  };
  selection: {
    allDisplayedQueueCandidatesSelected: boolean;
    queueSelectableDisplayedCandidates: LeadCandidateRecord[];
    toggleDisplayedQueueCandidates: () => void;
    selectedQueueCandidateSet: Set<string>;
    toggleQueueCandidateSelection: (candidateId: string) => void;
  };
}

/** Raw-data table for the management and all-data views, with row selection and row actions. */
export const LeadCandidateDataTable: React.FC<LeadCandidateDataTableProps> = ({
  displayedCandidates,
  safeCurrentPage,
  pageSize,
  referenceTime,
  currentUser,
  columns: {
    candidateTableStyle,
    orderedColumnIds,
    getHeaderProps,
    candidateColumnLabels,
    visibleColumnSet,
    customFieldDefinitions,
    visibleCandidateInsightItems
  },
  cells: {
    renderCandidateField,
    renderCompactValue,
    getContactSummary,
    renderPhoneLink,
    renderPotentialLevel,
    renderCompactLatestActivity,
    renderInsightValue
  },
  actions: {
    openEditForm,
    openScheduleForm,
    setScoringCandidateId,
    setAssignmentTarget,
    setSupportTarget,
    onStartConversion,
    archiveCandidate,
    canManageCandidate
  },
  selection: {
    allDisplayedQueueCandidatesSelected,
    queueSelectableDisplayedCandidates,
    toggleDisplayedQueueCandidates,
    selectedQueueCandidateSet,
    toggleQueueCandidateSelection
  }
}) => (
  <ConfiguredSystemTable
    table="lead_candidates"
    className="lead-candidate-table is-compact has-dynamic-columns"
    style={candidateTableStyle}
  >
    <thead>
      <tr>
        <ReorderableTableCells order={orderedColumnIds} getHeaderProps={getHeaderProps} labels={candidateColumnLabels}>
          {visibleColumnSet.has('select') && (
            <th key="select" className="lead-candidate-select-column">
              <input
                type="checkbox"
                checked={allDisplayedQueueCandidatesSelected}
                disabled={queueSelectableDisplayedCandidates.length === 0}
                onChange={toggleDisplayedQueueCandidates}
                aria-label="Chọn dữ liệu có thể đưa vào công việc trên trang này"
              />
            </th>
          )}
          {visibleColumnSet.has('index') && (
            <th key="index" className="erp-table-index-column">
              STT
            </th>
          )}
          {visibleColumnSet.has('company') && (
            <th key="company" data-system-field="companyName">
              Doanh nghiệp
            </th>
          )}
          {visibleColumnSet.has('taxCode') && (
            <th key="taxCode" data-system-field="taxCode">
              Mã số thuế
            </th>
          )}
          {visibleColumnSet.has('website') && (
            <th key="website" data-system-field="website">
              Website
            </th>
          )}
          {visibleColumnSet.has('businessSector') && (
            <th key="businessSector" data-system-field="businessSector">
              Lĩnh vực hoạt động
            </th>
          )}
          {visibleColumnSet.has('province') && (
            <th key="province" data-system-field="province">
              Tỉnh/thành
            </th>
          )}
          {visibleColumnSet.has('ward') && (
            <th key="ward" data-system-field="ward">
              Phường/xã
            </th>
          )}
          {visibleColumnSet.has('industrialPark') && (
            <th key="industrialPark" data-system-field="industrialPark">
              Khu công nghiệp
            </th>
          )}
          {visibleColumnSet.has('address') && (
            <th key="address" data-system-field="address">
              Địa chỉ doanh nghiệp
            </th>
          )}
          {visibleColumnSet.has('contact') && (
            <th key="contact" data-system-field="contact">
              Thông tin liên hệ (tóm tắt)
            </th>
          )}
          {visibleColumnSet.has('contactPerson') && (
            <th key="contactPerson" data-system-field="contactPerson">
              Người liên hệ
            </th>
          )}
          {visibleColumnSet.has('contactPosition') && (
            <th key="contactPosition" data-system-field="contactPosition">
              Chức vụ
            </th>
          )}
          {visibleColumnSet.has('phone') && (
            <th key="phone" data-system-field="phone">
              Điện thoại
            </th>
          )}
          {visibleColumnSet.has('email') && (
            <th key="email" data-system-field="email">
              Email
            </th>
          )}
          {visibleColumnSet.has('source') && (
            <th key="source" data-system-field="source">
              Nguồn tìm kiếm
            </th>
          )}
          {visibleColumnSet.has('sourceUrl') && (
            <th key="sourceUrl" data-system-field="sourceUrl">
              Đường dẫn nguồn
            </th>
          )}
          {visibleColumnSet.has('expectedProducts') && (
            <th key="expectedProducts" data-system-field="expectedProducts">
              Sản phẩm / nhu cầu quan tâm
            </th>
          )}
          {visibleColumnSet.has('note') && (
            <th key="note" data-system-field="note">
              Ghi chú
            </th>
          )}
          {visibleColumnSet.has('assignee') && (
            <th key="assignee" data-system-field="assignedSaleId">
              Sale phụ trách
            </th>
          )}
          {visibleColumnSet.has('processing') && (
            <th key="processing" data-system-field="processing">
              Sale đang xử lý
            </th>
          )}
          {visibleColumnSet.has('potential') && (
            <th key="potential" data-system-field="potentialLevel">
              Mức độ tiềm năng
            </th>
          )}
          {visibleColumnSet.has('schedule') && (
            <th key="schedule" data-system-field="nextContactAt">
              Lịch tiếp theo
            </th>
          )}
          {visibleColumnSet.has('latest') && (
            <th key="latest" data-system-field="latest">
              Cập nhật gần nhất
            </th>
          )}
          {customFieldDefinitions
            .filter(definition => visibleColumnSet.has(`custom:${definition.id}`))
            .map(definition => (
              <th key={`custom:${definition.id}`}>{definition.name}</th>
            ))}
          {visibleCandidateInsightItems.map(entry => (
            <th key={`insight:${entry.id}`}>{entry.label}</th>
          ))}
          {visibleColumnSet.has('actions') && (
            <th key="actions" className="lead-candidate-actions-column">
              Thao tác
            </th>
          )}
        </ReorderableTableCells>
      </tr>
    </thead>
    <tbody>
      {displayedCandidates.map((candidate, candidateIndex) => {
        const isActive = candidate.status === 'new' || candidate.status === 'retry';
        const canSelectForQueue = isActive && canManageCandidate(candidate);
        const isAlreadyInQueue = !candidate.workQueueHidden && isActive;
        const isSelectedForQueue = selectedQueueCandidateSet.has(candidate.id);
        return (
          <tr
            key={candidate.id}
            className={`is-clickable${isSelectedForQueue ? ' is-selected' : ''}`}
            onClick={event => {
              // Checkboxes, links and the row menu keep their own action instead of opening the detail.
              if ((event.target as HTMLElement).closest('a, button, input, select, label, [role="menu"]')) return;
              openEditForm(candidate);
            }}
          >
            <ReorderableTableCells order={orderedColumnIds} expandOverflowText={false}>
              {visibleColumnSet.has('select') && (
                <td key="select" className="lead-candidate-select-column">
                  <input
                    type="checkbox"
                    checked={isSelectedForQueue}
                    disabled={!canSelectForQueue}
                    onChange={() => toggleQueueCandidateSelection(candidate.id)}
                    title={
                      isAlreadyInQueue
                        ? 'Đã có trong Công việc cần xử lý; có thể chọn để giao lại'
                        : !isActive
                          ? 'Dữ liệu đã kết thúc hoặc đã chuyển đổi'
                          : canSelectForQueue
                            ? 'Chọn để đưa vào Công việc cần xử lý'
                            : 'Bạn không phải Sale phụ trách dữ liệu này'
                    }
                    aria-label={`Chọn ${candidate.companyName}${isAlreadyInQueue ? ' (đã có trong Công việc cần xử lý)' : ''}`}
                  />
                </td>
              )}
              {visibleColumnSet.has('index') && (
                <td key="index" className="erp-table-index-column">
                  {(safeCurrentPage - 1) * pageSize + candidateIndex + 1}
                </td>
              )}
              {visibleColumnSet.has('company') && (
                <td key="company">
                  <button
                    type="button"
                    className="lead-candidate-company-button"
                    onClick={() => openEditForm(candidate)}
                    title={`${candidate.companyName} · ${candidate.source || 'Chưa rõ nguồn'}${candidate.taxCode ? ` · MST ${candidate.taxCode}` : ''}`}
                  >
                    <strong className="erp-company-name">{candidate.companyName}</strong>
                  </button>
                </td>
              )}
              {visibleColumnSet.has('taxCode') && <td key="taxCode">{renderCandidateField(candidate.taxCode)}</td>}
              {visibleColumnSet.has('website') && <td key="website">{renderCandidateField(candidate.website)}</td>}
              {visibleColumnSet.has('businessSector') && (
                <td key="businessSector">{renderCandidateField(candidate.businessSector)}</td>
              )}
              {visibleColumnSet.has('province') && (
                <td key="province">
                  {renderCompactValue(
                    candidate.province || 'Chưa cập nhật',
                    [candidate.province, candidate.address].filter(Boolean).join(' · ') || 'Chưa cập nhật'
                  )}
                </td>
              )}
              {visibleColumnSet.has('ward') && <td key="ward">{renderCandidateField(candidate.ward)}</td>}
              {visibleColumnSet.has('industrialPark') && (
                <td key="industrialPark">{renderCandidateField(candidate.industrialPark)}</td>
              )}
              {visibleColumnSet.has('address') && <td key="address">{renderCandidateField(candidate.address)}</td>}
              {visibleColumnSet.has('contact') && (
                <td key="contact">
                  {renderCompactValue(
                    getContactSummary(candidate),
                    [candidate.contactPerson, candidate.phone, candidate.email].filter(Boolean).join(' · ') ||
                      'Chưa có thông tin liên hệ'
                  )}
                </td>
              )}
              {visibleColumnSet.has('contactPerson') && (
                <td key="contactPerson">{renderCandidateField(candidate.contactPerson)}</td>
              )}
              {visibleColumnSet.has('contactPosition') && (
                <td key="contactPosition">{renderCandidateField(candidate.contactPosition)}</td>
              )}
              {visibleColumnSet.has('phone') && <td key="phone">{renderPhoneLink(candidate)}</td>}
              {visibleColumnSet.has('email') && <td key="email">{renderCandidateField(candidate.email)}</td>}
              {visibleColumnSet.has('source') && <td key="source">{renderCandidateField(candidate.source)}</td>}
              {visibleColumnSet.has('sourceUrl') && (
                <td key="sourceUrl">{renderCandidateField(candidate.sourceUrl)}</td>
              )}
              {visibleColumnSet.has('expectedProducts') && (
                <td key="expectedProducts">{renderCandidateField(candidate.expectedProducts)}</td>
              )}
              {visibleColumnSet.has('note') && <td key="note">{renderCandidateField(candidate.note)}</td>}
              {visibleColumnSet.has('assignee') && (
                <td key="assignee">
                  {renderCompactValue(
                    candidate.assignedSaleName || 'Chưa phân công',
                    candidate.discoveredByName
                      ? `${candidate.assignedSaleName || 'Chưa phân công'} · Tìm bởi ${candidate.discoveredByName}`
                      : candidate.assignedSaleName || 'Chưa phân công'
                  )}
                </td>
              )}
              {visibleColumnSet.has('processing') && (
                <td key="processing">
                  {isAlreadyInQueue
                    ? renderCompactValue(candidate.assignedSaleName || 'Chờ phân công')
                    : renderCompactValue('—', 'Chưa đưa vào xử lý', 'is-muted')}
                </td>
              )}
              {visibleColumnSet.has('potential') && <td key="potential">{renderPotentialLevel(candidate)}</td>}
              {visibleColumnSet.has('schedule') && (
                <td key="schedule">
                  {candidate.nextContactAt
                    ? renderCompactValue(
                        formatShortDateTime(candidate.nextContactAt),
                        `${formatShortDateTime(candidate.nextContactAt)} · ${new Date(candidate.nextContactAt).getTime() < referenceTime ? 'Quá hạn' : 'Đã lên lịch'}`,
                        new Date(candidate.nextContactAt).getTime() < referenceTime ? 'lead-date-overdue' : ''
                      )
                    : renderCompactValue('Chưa đặt lịch', 'Chưa đặt lịch', 'is-muted')}
                </td>
              )}
              {visibleColumnSet.has('latest') && <td key="latest">{renderCompactLatestActivity(candidate)}</td>}
              {customFieldDefinitions
                .filter(definition => visibleColumnSet.has(`custom:${definition.id}`))
                .map(definition => (
                  <td key={`custom:${definition.id}`}>
                    {renderCompactValue(
                      formatEntityCustomFieldValue(definition, candidate.customFieldValues?.[definition.id])
                    )}
                  </td>
                ))}
              {visibleCandidateInsightItems.map(entry => (
                <td key={`insight:${entry.id}`}>{renderInsightValue(candidate, entry.id)}</td>
              ))}
              {visibleColumnSet.has('actions') && (
                <td key="actions" className="lead-candidate-actions-column">
                  <RowActionMenu
                    label={`Thao tác ${candidate.companyName}`}
                    actions={[
                      ...(currentUser.role === 'admin'
                        ? [
                            {
                              label: 'Giao việc',
                              icon: <ClipboardCheck size={14} />,
                              onSelect: () =>
                                setAssignmentTarget({
                                  id: candidate.id,
                                  label: candidate.companyName,
                                  module: 'customer_data'
                                })
                            }
                          ]
                        : []),
                      ...(currentUser.role === 'sale'
                        ? [
                            {
                              label: 'Yêu cầu hỗ trợ',
                              icon: <LifeBuoy size={14} />,
                              onSelect: () =>
                                setSupportTarget({
                                  id: candidate.id,
                                  label: candidate.companyName,
                                  module: 'customer_data'
                                })
                            }
                          ]
                        : []),
                      ...(canManageCandidate(candidate)
                        ? [
                            ...(isActive
                              ? [
                                  {
                                    label: 'Hẹn lịch',
                                    icon: <CalendarClock size={14} />,
                                    onSelect: () => openScheduleForm(candidate)
                                  }
                                ]
                              : []),
                            {
                              label: 'Chấm điểm',
                              icon: <BarChart3 size={14} />,
                              onSelect: () => setScoringCandidateId(candidate.id)
                            },
                            {
                              label: 'Chỉnh sửa',
                              icon: <Pencil size={14} />,
                              onSelect: () => openEditForm(candidate, 'profile')
                            },
                            ...(isActive
                              ? [
                                  {
                                    label: 'Chuyển thành Lead',
                                    icon: <CheckCircle2 size={14} />,
                                    onSelect: () => onStartConversion(candidate)
                                  }
                                ]
                              : [])
                          ]
                        : []),
                      ...(canManageCandidate(candidate)
                        ? [
                            {
                              label: 'Xóa khỏi danh sách',
                              icon: <Trash2 size={14} />,
                              onSelect: () => archiveCandidate(candidate),
                              danger: true
                            }
                          ]
                        : [])
                    ]}
                  />
                </td>
              )}
            </ReorderableTableCells>
          </tr>
        );
      })}
    </tbody>
  </ConfiguredSystemTable>
);
