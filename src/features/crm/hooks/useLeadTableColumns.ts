import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import type { UserProfile } from '@/shared/types/user';
import { useLanguage } from '@/context/LanguageContext';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { useState, useMemo } from 'react';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import { type TableColumnOption } from '@/components/TableColumnCustomizer';
import { CUSTOMER_INSIGHT_GROUPS, CUSTOMER_INSIGHT_ITEMS } from '@/features/crm/model/customerInsightCatalog';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';

export interface LeadTableColumnInputs {
  currentUser: UserProfile;
  inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
  customFieldDefinitions: EntityFieldDefinition[];
}

/** Shared column selection, order and widths for the lead table. */
export const useLeadTableColumns = ({
  currentUser,
  inlineSystemFieldConfiguration,
  customFieldDefinitions
}: LeadTableColumnInputs) => {
  const { t } = useLanguage();
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const {
    selectedIds: storedVisibleColumnIds,
    setSelectedIds: setStoredVisibleColumnIds,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'leads',
    legacySelectionKey: `sunflower:lead-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:lead-column-widths:${currentUser.uid}`
  });

  const leadColumnOptions = useMemo<TableColumnOption[]>(() => {
    const sectionLabels: Record<string, string> = {
      company: t('Thông tin doanh nghiệp'),
      classification: t('Phân loại khách hàng'),
      contact: t('Liên hệ và nhu cầu'),
      needs: t('Liên hệ và nhu cầu'),
      assignment: t('Phụ trách và lịch làm việc'),
      additional: t('Trường thông tin bổ sung')
    };
    const configuredField = (key: string, fallback: string) => {
      const field = inlineSystemFieldConfiguration.fields.find(item => item.key === key);
      return field?.removed ? null : field?.label || t(fallback);
    };
    const systemColumn = (
      id: string,
      key: string,
      fallback: string,
      group: string,
      defaultVisible = false
    ): TableColumnOption | null => {
      const label = configuredField(key, fallback);
      return label ? { id, label, group, defaultVisible } : null;
    };
    return [
      { id: 'index', label: 'STT', group: t('Điều khiển bảng'), required: true },
      {
        id: 'company',
        label: configuredField('companyName', 'Doanh nghiệp') || t('Doanh nghiệp'),
        group: sectionLabels.company,
        required: true
      },
      systemColumn('taxCode', 'taxCode', 'Mã số thuế', sectionLabels.company),
      systemColumn('website', 'website', 'Website', sectionLabels.company),
      systemColumn('businessSector', 'businessSector', 'Lĩnh vực hoạt động', sectionLabels.company),
      systemColumn('address', 'address', 'Địa chỉ doanh nghiệp', sectionLabels.company),
      systemColumn('companySize', 'companySize', 'Quy mô', sectionLabels.classification),
      { id: 'source', label: t('Khu vực'), group: sectionLabels.classification },
      systemColumn('sourceValue', 'source', 'Nguồn tìm kiếm', sectionLabels.classification),
      systemColumn('province', 'province', 'Tỉnh/thành', sectionLabels.classification),
      systemColumn('ward', 'ward', 'Phường/xã', sectionLabels.classification),
      systemColumn('industrialPark', 'industrialPark', 'Khu công nghiệp', sectionLabels.classification),
      { id: 'contact', label: t('Liên hệ'), group: sectionLabels.contact },
      systemColumn('contactPerson', 'contactPerson', 'Người liên hệ', sectionLabels.contact),
      systemColumn('contactPosition', 'contactPosition', 'Chức vụ', sectionLabels.contact),
      systemColumn('phone', 'phone', 'Điện thoại', sectionLabels.contact),
      systemColumn('email', 'email', 'Email', sectionLabels.contact),
      systemColumn('expectedProducts', 'expectedProducts', 'Sản phẩm / nhu cầu quan tâm', sectionLabels.contact),
      systemColumn('potentialValue', 'potentialValue', 'Giá trị tiềm năng', sectionLabels.contact, true),
      systemColumn('stage', 'stage', 'Giai đoạn xử lý', sectionLabels.contact),
      systemColumn('note', 'note', 'Ghi chú', sectionLabels.contact),
      systemColumn('assignedSale', 'assignedSaleId', 'Sale phụ trách', sectionLabels.assignment, true),
      systemColumn('discoveredBy', 'discoveredById', 'Sale tìm được Lead', sectionLabels.assignment),
      systemColumn('nextFollowUpAt', 'nextFollowUpAt', 'Chăm sóc tiếp', sectionLabels.assignment, true),
      ...CUSTOMER_INSIGHT_GROUPS.flatMap(group =>
        group.items.map(entry => ({
          id: `insight:${entry.id}`,
          label: entry.label,
          group: `${t('Phân loại khách hàng')} · ${group.label}`,
          defaultVisible: false
        }))
      ),
      ...customFieldDefinitions
        .filter(definition => definition.active)
        .map(definition => ({
          id: `custom:${definition.id}`,
          label: definition.name,
          group: sectionLabels[definition.section] || sectionLabels.additional,
          defaultVisible: definition.defaultVisible
        })),
      { id: 'actions', label: t('Thao tác'), group: t('Điều khiển bảng'), required: true }
    ].filter((column): column is TableColumnOption => Boolean(column));
  }, [customFieldDefinitions, inlineSystemFieldConfiguration.fields, t]);
  const visibleLeadColumnIds = useMemo(() => {
    const availableIds = new Set(leadColumnOptions.map(column => column.id));
    const requiredIds = leadColumnOptions.filter(column => column.required).map(column => column.id);
    const selectedIds = storedVisibleColumnIds?.filter(id => availableIds.has(id));
    const defaultIds = leadColumnOptions
      .filter(column => column.required || column.defaultVisible !== false)
      .map(column => column.id);
    return new Set([...requiredIds, ...(selectedIds?.length ? selectedIds : defaultIds)]);
  }, [leadColumnOptions, storedVisibleColumnIds]);
  const visibleLeadCustomFields = useMemo(
    () =>
      customFieldDefinitions.filter(
        definition => definition.active && visibleLeadColumnIds.has(`custom:${definition.id}`)
      ),
    [customFieldDefinitions, visibleLeadColumnIds]
  );
  const visibleLeadInsightItems = useMemo(
    () => CUSTOMER_INSIGHT_ITEMS.filter(entry => visibleLeadColumnIds.has(`insight:${entry.id}`)),
    [visibleLeadColumnIds]
  );

  const saveVisibleLeadColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const availableIds = new Set(leadColumnOptions.map(column => column.id));
    const requiredIds = leadColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([...requiredIds, ...selectedIds.filter(id => availableIds.has(id))]));
    setStoredVisibleColumnIds(nextIds);
    setShowColumnCustomizer(false);
  };
  const { orderedColumnIds: orderedLeadColumnIds, getHeaderProps: getLeadHeaderProps } = useReorderableTableColumns({
    columns: leadColumnOptions,
    selectedIds: storedVisibleColumnIds || Array.from(visibleLeadColumnIds),
    onOrderChange: saveVisibleLeadColumns,
    layoutId: 'leads',
    lockedStartIds: ['index', 'company'],
    lockedEndIds: ['actions']
  });
  const leadColumnLabels = Object.fromEntries(leadColumnOptions.map(column => [column.id, column.label]));

  const visibleLeadColumnCount = leadColumnOptions.filter(column => visibleLeadColumnIds.has(column.id)).length;

  return {
    showColumnCustomizer,
    setShowColumnCustomizer,
    canEditColumns,
    leadColumnOptions,
    visibleLeadColumnIds,
    visibleLeadCustomFields,
    visibleLeadInsightItems,
    saveVisibleLeadColumns,
    orderedLeadColumnIds,
    getLeadHeaderProps,
    leadColumnLabels,
    visibleLeadColumnCount
  };
};
