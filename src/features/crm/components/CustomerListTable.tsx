import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardPlus,
  Eye,
  LifeBuoy,
  PackagePlus,
  Pencil,
  Trash2
} from 'lucide-react';
import { ConfiguredSystemTable } from '@/components/ConfiguredSystemFields';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu } from '@/components/RowActionMenu';
import type { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { customerCallHistoryKeys, customerCallSubjectKey } from '@/features/crm/model/callHistory';
import { canManageCustomerProducts } from '@/features/crm/model/customerProductCatalog';
import { formatEntityCustomFieldValue } from '@/features/crm/model/entityFieldConfig';
import type { SupportRequestTarget } from '@/components/SupportRequestDialog';
import type { WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import type { CustomerListFilterInputs } from '@/features/crm/hooks/useCustomerListFilters';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { ErpDocument } from '@/shared/types';

interface CustomerListTableProps {
  leads: LeadRecord[];
  users: ErpDocument[];
  currentUser: ErpDocument;
  filteredCustomers: CustomerRecord[];
  displayedCustomers: CustomerRecord[];
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  onPageSizeChange: (pageSize: number) => void;
  columnLabels: Record<string, string>;
  visibleColumnIds: Set<string>;
  visibleColumnCount: number;
  orderedColumnIds: ReturnType<typeof useReorderableTableColumns>['orderedColumnIds'];
  getHeaderProps: ReturnType<typeof useReorderableTableColumns>['getHeaderProps'];
  visibleCustomFields: CustomerListFilterInputs['customFieldDefinitions'];
  getCustomerOrders: (customerId: string) => ErpDocument[];
  getCustomerOrderValue: (customerId: string) => number;
  isNewCustomer: (customer: CustomerRecord) => boolean;
  onOpenCustomer: (customer: CustomerRecord, callPhone?: string) => void;
  onEditCustomer: (customer: CustomerRecord) => void;
  onDeleteCustomer: (customerId: string) => unknown;
  onPreparedOrderCreated?: (customerId: string) => void;
  onAssignWork: (target: WorkAssignmentTarget) => void;
  onRequestSupport: (target: SupportRequestTarget) => void;
  onShowProductEditor: (open: boolean) => void;
}

/** Paginated customer table with row actions. Filtering happens in useCustomerListFilters. */
export const CustomerListTable: React.FC<CustomerListTableProps> = ({
  leads,
  users,
  currentUser,
  filteredCustomers,
  displayedCustomers,
  page: safeCustomerPage,
  totalPages: customerTotalPages,
  pageSize: customerPageSize,
  onPageChange: setCustomerPage,
  onPageSizeChange: setCustomerPageSize,
  columnLabels: customerColumnLabels,
  visibleColumnIds: visibleCustomerColumnIds,
  visibleColumnCount: visibleCustomerColumnCount,
  orderedColumnIds: orderedCustomerColumnIds,
  getHeaderProps: getCustomerHeaderProps,
  visibleCustomFields: visibleCustomerCustomFields,
  getCustomerOrders,
  getCustomerOrderValue,
  isNewCustomer,
  onOpenCustomer: openCustomerDetail,
  onEditCustomer: openEditModal,
  onDeleteCustomer: handleDeleteCustomer,
  onPreparedOrderCreated,
  onAssignWork: setAssignmentTarget,
  onRequestSupport: setSupportTarget,
  onShowProductEditor: setShowProductEditor
}) => {
  const renderCustomerText = (value?: string | number) => {
    const displayValue = value === undefined || value === null || value === '' ? 'Chưa cập nhật' : String(value);
    return (
      <span
        className={displayValue === 'Chưa cập nhật' ? 'crm-text-muted crm-table-text' : 'crm-table-text'}
        title={displayValue}
      >
        {displayValue}
      </span>
    );
  };

  return (
    <div className="crm-customer-grid">
      <div className="table-container crm-customer-table-wrap">
        <ConfiguredSystemTable
          table="customers"
          className="crm-customer-table is-compact has-dynamic-columns"
          style={{ minWidth: `${Math.max(1180, visibleCustomerColumnCount * 150 + 130)}px` }}
        >
          <thead>
            <tr>
              <ReorderableTableCells
                order={orderedCustomerColumnIds}
                getHeaderProps={getCustomerHeaderProps}
                labels={customerColumnLabels}
              >
                <th key="index" className="erp-table-index-column">
                  STT
                </th>
                <th key="company" data-system-field="companyName">
                  Khách hàng
                </th>
                {visibleCustomerColumnIds.has('customerCode') && (
                  <th key="customerCode" data-system-field="customerCode">
                    Mã KH
                  </th>
                )}
                {visibleCustomerColumnIds.has('rank') && (
                  <th key="rank" data-system-field="customerRank">
                    Phân loại
                  </th>
                )}
                {visibleCustomerColumnIds.has('taxCode') && (
                  <th key="taxCode" data-system-field="taxCode">
                    Mã số thuế
                  </th>
                )}
                {visibleCustomerColumnIds.has('assignedSale') && (
                  <th key="assignedSale" data-system-field="assignedSaleId">
                    Sale phụ trách
                  </th>
                )}
                {visibleCustomerColumnIds.has('province') && (
                  <th key="province" data-system-field="province">
                    Tỉnh / thành
                  </th>
                )}
                {visibleCustomerColumnIds.has('ward') && (
                  <th key="ward" data-system-field="ward">
                    Phường / xã
                  </th>
                )}
                {visibleCustomerColumnIds.has('industrialPark') && (
                  <th key="industrialPark" data-system-field="industrialPark">
                    Khu công nghiệp
                  </th>
                )}
                {visibleCustomerColumnIds.has('address') && (
                  <th key="address" data-system-field="address">
                    Địa chỉ chi tiết / giao hàng
                  </th>
                )}
                {visibleCustomerColumnIds.has('contactPerson') && (
                  <th key="contactPerson" data-system-field="contactPerson">
                    Người liên hệ
                  </th>
                )}
                {visibleCustomerColumnIds.has('phone') && (
                  <th key="phone" data-system-field="phone">
                    SĐT
                  </th>
                )}
                {visibleCustomerColumnIds.has('procurementPhone') && (
                  <th key="procurementPhone" data-system-field="procurementPhone">
                    SĐT thu mua
                  </th>
                )}
                {visibleCustomerColumnIds.has('warehousePhone') && (
                  <th key="warehousePhone" data-system-field="warehousePhone">
                    SĐT nhận hàng / kho
                  </th>
                )}
                {visibleCustomerColumnIds.has('email') && (
                  <th key="email" data-system-field="email">
                    Mail
                  </th>
                )}
                {visibleCustomerColumnIds.has('discountType') && (
                  <th key="discountType" data-system-field="discountType">
                    Hình thức chiết khấu
                  </th>
                )}
                {visibleCustomerColumnIds.has('discountValue') && <th key="discountValue">Chiết khấu mặc định</th>}
                {visibleCustomerColumnIds.has('debtLimit') && (
                  <th key="debtLimit" data-system-field="debtLimit">
                    Hạn mức công nợ
                  </th>
                )}
                {visibleCustomerColumnIds.has('paymentTerms') && (
                  <th key="paymentTerms" data-system-field="paymentTerms">
                    Điều khoản thanh toán
                  </th>
                )}
                {visibleCustomerColumnIds.has('bankAccount') && (
                  <th key="bankAccount" data-system-field="bankAccount">
                    Tài khoản ngân hàng
                  </th>
                )}
                {visibleCustomerColumnIds.has('note') && (
                  <th key="note" data-system-field="note">
                    Ghi chú yêu cầu riêng
                  </th>
                )}
                {visibleCustomerColumnIds.has('businessResult') && (
                  <th key="businessResult" data-system-field="businessResult">
                    Kết quả kinh doanh
                  </th>
                )}
                {visibleCustomerCustomFields.map(definition => (
                  <th key={`custom:${definition.id}`}>{definition.name}</th>
                ))}
                <th key="actions">Thao tác</th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {displayedCustomers.map((customer, customerIndex) => {
              const customerOrders = getCustomerOrders(customer.id);
              const orderValue = getCustomerOrderValue(customer.id);
              const isNew = isNewCustomer(customer);
              const saleName =
                users.find(user => user.uid === customer.assignedSaleId)?.displayName || 'Chưa phân công';
              return (
                <React.Fragment key={customer.id}>
                  <tr onClick={() => openCustomerDetail(customer)}>
                    <ReorderableTableCells order={orderedCustomerColumnIds}>
                      <td key="index" className="erp-table-index-column">
                        {(safeCustomerPage - 1) * customerPageSize + customerIndex + 1}
                      </td>
                      <td key="company">
                        <div
                          className="crm-customer-identity"
                          title={`${customer.companyName} · ${customer.contactPerson || 'Chưa có người liên hệ'}`}
                        >
                          <strong className="erp-company-name">{customer.companyName}</strong>
                          {isNew && (
                            <span className="crm-new-customer-badge" title="Khách hàng mới trong 7 ngày đầu">
                              <span aria-hidden="true" />
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      {visibleCustomerColumnIds.has('customerCode') && (
                        <td key="customerCode">
                          <span className="customer-code-badge">{customer.customerCode || customer.id}</span>
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('rank') && (
                        <td key="rank">
                          <div
                            className="crm-customer-segment"
                            title={
                              customer.discountType === 'amount'
                                ? `CK ${Number(customer.discountAmount || 0).toLocaleString('vi-VN')} đ`
                                : `Chiết khấu ${Number(customer.discountRate || 0)}%`
                            }
                          >
                            <span className={`customer-rank-text ${customer.customerRank ? 'has-rank' : ''}`}>
                              {customer.customerRank ? `Hạng ${customer.customerRank}` : 'Chưa xếp hạng'}
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('taxCode') && (
                        <td key="taxCode">
                          <span className={customer.taxCode ? 'crm-tax-code' : 'crm-text-muted'}>
                            {customer.taxCode || 'Chưa cập nhật'}
                          </span>
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('assignedSale') && (
                        <td key="assignedSale">
                          <strong className={customer.assignedSaleId ? '' : 'crm-text-muted'}>{saleName}</strong>
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('province') && (
                        <td key="province">{renderCustomerText(customer.province)}</td>
                      )}
                      {visibleCustomerColumnIds.has('ward') && <td key="ward">{renderCustomerText(customer.ward)}</td>}
                      {visibleCustomerColumnIds.has('industrialPark') && (
                        <td key="industrialPark">{renderCustomerText(customer.industrialPark)}</td>
                      )}
                      {visibleCustomerColumnIds.has('address') && (
                        <td key="address">{renderCustomerText(customer.address)}</td>
                      )}
                      {visibleCustomerColumnIds.has('contactPerson') && (
                        <td key="contactPerson">{renderCustomerText(customer.contactPerson)}</td>
                      )}
                      {visibleCustomerColumnIds.has('phone') && (
                        <td key="phone">
                          <PhoneCallCell
                            phone={customer.phone}
                            companyName={customer.companyName}
                            subjectKey={customerCallSubjectKey(customer)}
                            historyKeys={customerCallHistoryKeys(customer, leads)}
                            context={{
                              contactPerson: customer.contactPerson,
                              province: customer.province,
                              businessSector: customer.businessSector,
                              assignedSaleName: saleName
                            }}
                            auditModule="crm"
                            targetType="customer"
                            targetId={customer.id}
                            currentUser={currentUser}
                            canRecord={
                              currentUser.role === 'admin' ||
                              (currentUser.role === 'sale' &&
                                (!customer.assignedSaleId || customer.assignedSaleId === currentUser.uid))
                            }
                            onOpenDetails={() => openCustomerDetail(customer)}
                          />
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('procurementPhone') && (
                        <td key="procurementPhone">
                          <PhoneCallCell
                            phone={customer.procurementPhone}
                            companyName={customer.companyName}
                            subjectKey={customerCallSubjectKey(customer)}
                            historyKeys={customerCallHistoryKeys(customer, leads)}
                            context={{
                              phoneLabel: 'Số bộ phận thu mua',
                              province: customer.province,
                              businessSector: customer.businessSector,
                              expectedProducts: customer.expectedProducts,
                              assignedSaleName: saleName
                            }}
                            auditModule="crm"
                            targetType="customer"
                            targetId={customer.id}
                            currentUser={currentUser}
                            canRecord={
                              currentUser.role === 'admin' ||
                              (currentUser.role === 'sale' &&
                                (!customer.assignedSaleId || customer.assignedSaleId === currentUser.uid))
                            }
                            onOpenDetails={() => openCustomerDetail(customer, customer.procurementPhone)}
                          />
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('warehousePhone') && (
                        <td key="warehousePhone">
                          <PhoneCallCell
                            phone={customer.warehousePhone}
                            companyName={customer.companyName}
                            subjectKey={customerCallSubjectKey(customer)}
                            historyKeys={customerCallHistoryKeys(customer, leads)}
                            context={{
                              phoneLabel: 'Số bộ phận kho',
                              province: customer.province,
                              businessSector: customer.businessSector,
                              expectedProducts: customer.expectedProducts,
                              assignedSaleName: saleName
                            }}
                            auditModule="crm"
                            targetType="customer"
                            targetId={customer.id}
                            currentUser={currentUser}
                            canRecord={
                              currentUser.role === 'admin' ||
                              (currentUser.role === 'sale' &&
                                (!customer.assignedSaleId || customer.assignedSaleId === currentUser.uid))
                            }
                            onOpenDetails={() => openCustomerDetail(customer, customer.warehousePhone)}
                          />
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('email') && (
                        <td key="email">
                          <span
                            className={customer.email ? 'crm-contact-value crm-email-value' : 'crm-text-muted'}
                            title={customer.email || undefined}
                          >
                            {customer.email || 'Chưa cập nhật'}
                          </span>
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('discountType') && (
                        <td key="discountType">
                          {renderCustomerText(
                            customer.discountType === 'amount' ? 'Theo tiền chênh' : 'Theo phần trăm'
                          )}
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('discountValue') && (
                        <td key="discountValue">
                          {renderCustomerText(
                            customer.discountType === 'amount'
                              ? `${Number(customer.discountAmount || 0).toLocaleString('vi-VN')} đ`
                              : `${Number(customer.discountRate || 0).toLocaleString('vi-VN')}%`
                          )}
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('debtLimit') && (
                        <td key="debtLimit">
                          {renderCustomerText(`${Number(customer.debtLimit || 0).toLocaleString('vi-VN')} đ`)}
                        </td>
                      )}
                      {visibleCustomerColumnIds.has('paymentTerms') && (
                        <td key="paymentTerms">{renderCustomerText(customer.paymentTerms)}</td>
                      )}
                      {visibleCustomerColumnIds.has('bankAccount') && (
                        <td key="bankAccount">{renderCustomerText(customer.bankAccount)}</td>
                      )}
                      {visibleCustomerColumnIds.has('note') && <td key="note">{renderCustomerText(customer.note)}</td>}
                      {visibleCustomerColumnIds.has('businessResult') && (
                        <td key="businessResult">
                          {customerOrders.length ? (
                            <div
                              className="crm-business-result"
                              title={`${customerOrders.length} đơn · ${orderValue.toLocaleString('vi-VN')} đ`}
                            >
                              <strong>{customerOrders.length} đơn</strong>
                              <span className="crm-business-result__value">
                                · {orderValue.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          ) : (
                            <div
                              className="crm-business-result is-empty"
                              title="Khách hàng mới, chưa có đơn hàng. Cần tạo đơn hàng."
                            >
                              <strong>0 đơn</strong>
                              <span>· Chưa có đơn hàng</span>
                            </div>
                          )}
                        </td>
                      )}
                      {visibleCustomerCustomFields.map(definition => (
                        <td key={`custom:${definition.id}`}>
                          {formatEntityCustomFieldValue(definition, customer.customFieldValues?.[definition.id])}
                        </td>
                      ))}
                      <td key="actions">
                        <RowActionMenu
                          label={`Thao tác ${customer.companyName}`}
                          actions={[
                            ...(canManageCustomerProducts(currentUser, customer)
                              ? [
                                  {
                                    label: 'Tạo mã sản phẩm',
                                    icon: <PackagePlus size={14} />,
                                    onSelect: () => {
                                      openCustomerDetail(customer);
                                      setShowProductEditor(true);
                                    }
                                  }
                                ]
                              : []),
                            ...(currentUser.role === 'admin' || currentUser.role === 'sale'
                              ? [
                                  {
                                    label: 'Tạo đơn hàng',
                                    icon: <ClipboardPlus size={14} />,
                                    onSelect: () => onPreparedOrderCreated?.(customer.id)
                                  }
                                ]
                              : []),
                            {
                              label: 'Chi tiết',
                              icon: <Eye size={14} />,
                              onSelect: () => openCustomerDetail(customer)
                            },
                            ...(currentUser.role === 'admin'
                              ? [
                                  {
                                    label: 'Giao việc',
                                    icon: <ClipboardCheck size={14} />,
                                    onSelect: () =>
                                      setAssignmentTarget({
                                        id: customer.id,
                                        label: customer.companyName,
                                        module: 'crm'
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
                                        id: customer.id,
                                        label: customer.companyName,
                                        module: 'crm'
                                      })
                                  }
                                ]
                              : []),
                            ...(currentUser.role === 'admin' || currentUser.role === 'sale'
                              ? [
                                  {
                                    label: 'Chỉnh sửa',
                                    icon: <Pencil size={14} />,
                                    onSelect: () => openEditModal(customer)
                                  },
                                  {
                                    label:
                                      currentUser.role !== 'admin' && customer.deleteRequested
                                        ? 'Đã gửi yêu cầu xóa'
                                        : 'Xóa khách hàng',
                                    icon: <Trash2 size={14} />,
                                    onSelect: () => handleDeleteCustomer(customer.id),
                                    disabled: currentUser.role !== 'admin' && customer.deleteRequested,
                                    danger: true
                                  }
                                ]
                              : [])
                          ]}
                        />
                      </td>
                    </ReorderableTableCells>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </ConfiguredSystemTable>
      </div>
      {filteredCustomers.length > 0 && (
        <footer className="crm-customer-pagination">
          <span>
            Tổng số: <strong>{filteredCustomers.length}</strong> bản ghi
          </span>
          <label>
            Hiển thị{' '}
            <select
              value={customerPageSize}
              onChange={event => {
                setCustomerPageSize(Number(event.target.value));
                setCustomerPage(1);
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
              onClick={() => setCustomerPage(page => Math.max(1, page - 1))}
              disabled={safeCustomerPage === 1}
              aria-label="Trang trước"
            >
              <ChevronLeft size={15} />
            </button>
            <strong>
              {safeCustomerPage} / {customerTotalPages}
            </strong>
            <button
              type="button"
              onClick={() => setCustomerPage(page => Math.min(customerTotalPages, page + 1))}
              disabled={safeCustomerPage === customerTotalPages}
              aria-label="Trang sau"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
