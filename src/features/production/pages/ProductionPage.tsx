import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { requireConfirmedMutation, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useState, useEffect, useRef } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { useLanguage } from '@/context/LanguageContext';
import { FloatingChat } from '@/components/FloatingChat';
import { MachineManagement } from '@/features/production/components/MachineManagement';
import {
  DEFAULT_MACHINES,
  getMachineCommands,
  getMachineForAssignment,
  getMachineRuntimeStatus,
  getMachineStatusLabel,
  getRequiredColorCount,
  PurchaseOrderLike,
  ProductionMachine,
  sortMachinesForAssignment,
  subscribeMachines
} from '@/features/production/api/machineService';
import { canManageProduction, hasProductionAccess } from '@/features/production/model/productionOrder';
import { getPOQueueUpdate } from '@/features/sales/model/poWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { formatDate, formatDateTime, toDateInputValue } from '@/shared/utils/dateFormatting';
import { ProductionOrderWorkspace } from '@/features/production/components/ProductionOrderWorkspace';
import { confirmAppNavigation } from '@/shared/feedback/navigationGuard';
import './Production.css';

interface ProductionProps {
  pos: any[];
  productionCommands: any[];
  currentUser: UserProfile;
  onRefresh: () => void;
  initialSelectedLsxId?: string;
  messages: any[];
  users: any[];
}

const getProductionQuantity = (command: any): number => {
  const quantity = Number(command?.qtyToProduce ?? command?.quantity ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

export const Production: React.FC<ProductionProps> = ({
  pos,
  productionCommands,
  currentUser,
  onRefresh,
  initialSelectedLsxId,
  messages,
  users
}) => {
  const { t } = useLanguage();
  const [showEditLsxModal, setShowEditLsxModal] = useState(false);
  const [selectedLsx, setSelectedLsx] = useState<any | null>(null);

  // LSX Transfer states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferReason, setTransferReason] = useState('');
  const [targetOperatorId, setTargetOperatorId] = useState('');
  const handledNavigation = useRef('');
  const [productionTab, setProductionTab] = useState<'commands' | 'machines'>('commands');

  // Auto-select LSX when initialSelectedLsxId changes
  useEffect(() => {
    if (initialSelectedLsxId && handledNavigation.current !== initialSelectedLsxId) {
      const cmd = productionCommands.find(c => c.id === initialSelectedLsxId || c.lsxCode === initialSelectedLsxId);
      if (cmd) {
        handledNavigation.current = initialSelectedLsxId;
        setProductionTab('commands');
        setSelectedLsx(cmd.productionOrderVersion === 2 ? null : cmd);
      }
    }
  }, [initialSelectedLsxId, productionCommands]);

  // Edit form states
  const [editMachineId, setEditMachineId] = useState('');
  const [editShift, setEditShift] = useState('');
  const [editOperatorName, setEditOperatorName] = useState('');
  const [editQtyToProduce, setEditQtyToProduce] = useState(10000);
  const [editNotes, setEditNotes] = useState('');

  const [editProductNameToBeCut, setEditProductNameToBeCut] = useState('');
  const [editPaperCore, setEditPaperCore] = useState('76mm');
  const [editPaperMaterialCode, setEditPaperMaterialCode] = useState('');
  const [editPaperQuantity, setEditPaperQuantity] = useState(1);
  const [editDeliveryDeadline, setEditDeliveryDeadline] = useState('');

  // Complete LSX states
  const [scrapQty, setScrapQty] = useState(0);
  const [completionNotes, setCompletionNotes] = useState('');

  const [machines, setMachines] = useState<ProductionMachine[]>([]);

  useEffect(() => {
    if (!hasProductionAccess(currentUser, 'production')) return;
    return subscribeMachines(setMachines, canManageProduction(currentUser));
  }, [currentUser]);

  const machineCatalog = machines.length > 0 ? machines : DEFAULT_MACHINES;

  const validateMachineAssignment = (
    assignment: string,
    po?: PurchaseOrderLike,
    excludeCommandId?: string
  ): boolean => {
    const machine = getMachineForAssignment(machineCatalog, assignment);
    if (!machine) return true;

    if (machine.status === 'maintenance' || machine.status === 'fault' || machine.status === 'inactive') {
      window.alert(
        `${machine.code} - ${machine.name} hiện ở trạng thái "${getMachineStatusLabel(machine.status)}" nên chưa thể nhận LSX.`
      );
      return false;
    }

    const requiredColors = getRequiredColorCount(po);
    if (requiredColors > 0 && machine.colorCount > 0 && machine.colorCount < requiredColors) {
      const shouldContinue = window.confirm(
        `Đơn hàng được nhận diện cần ${requiredColors} màu nhưng ${machine.name} chỉ khai báo ${machine.colorCount} màu. Bạn vẫn muốn phân công máy này?`
      );
      if (!shouldContinue) return false;
    }

    const conflictingCommands = getMachineCommands(machine, productionCommands, excludeCommandId);
    if (conflictingCommands.length > 0) {
      return window.confirm(
        `${machine.name} đang có ${conflictingCommands.length} LSX hoạt động (${conflictingCommands.map(command => command.lsxCode).join(', ')}). Bạn vẫn muốn xếp thêm lệnh vào máy này?`
      );
    }
    return true;
  };

  const handleOpenEditLsx = (lsx: any) => {
    setEditMachineId(lsx.machineId);
    setEditShift(lsx.shift);
    setEditOperatorName(lsx.operatorName || '');
    setEditQtyToProduce(getProductionQuantity(lsx));
    setEditNotes(lsx.notes || '');
    setEditProductNameToBeCut(lsx.productNameToBeCut || lsx.productName || '');
    setEditPaperCore(lsx.paperCore || '76mm');
    setEditPaperMaterialCode(lsx.paperMaterialCode || '');
    setEditPaperQuantity(lsx.paperQuantity || 1);
    setEditDeliveryDeadline(toDateInputValue(lsx.deliveryDeadline));
    setSelectedLsx(lsx);
    setShowEditLsxModal(true);
  };

  const handleEditLsxSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'ProductionPage.tsx:handleEditLsxSubmit',
      async () => {
        e.preventDefault();
        if (!selectedLsx) return;
        const linkedPo = pos.find(po => po.id === selectedLsx.poId);
        if (!validateMachineAssignment(editMachineId, linkedPo, selectedLsx.id)) return;

        await requireConfirmedMutation(
          dbService.updateDocument('production_commands', selectedLsx.id, {
            machineId: editMachineId,
            shift: editShift,
            operatorName: editOperatorName,
            qtyToProduce: Number(editQtyToProduce),
            notes: editNotes,
            productNameToBeCut: editProductNameToBeCut,
            paperCore: editPaperCore,
            paperMaterialCode: editPaperMaterialCode,
            paperQuantity: Number(editPaperQuantity),
            deliveryDeadline: editDeliveryDeadline
              ? new Date(editDeliveryDeadline).toISOString()
              : selectedLsx.deliveryDeadline,
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            updatedAt: new Date().toISOString()
          })
        );

        setShowEditLsxModal(false);
        setSelectedLsx(null);
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  const handleDeleteLsx = async (lsxId: string) => {
    return runMutationAction(
      'ProductionPage.tsx:handleDeleteLsx',
      async () => {
        const password = window.prompt(t('Nhập mật khẩu xác nhận xóa (admin123 hoặc 123456):'));
        if (password !== 'admin123' && password !== '123456') {
          alert(t('Mật khẩu không chính xác! Không thể xóa.'));
          return;
        }
        if (await confirmDelete(t('Bạn có chắc chắn muốn xóa lệnh sản xuất này?'))) {
          const lsx = productionCommands.find(l => l.id === lsxId);
          await requireConfirmedMutation(dbService.updateDocument('production_commands', lsxId, { deleted: true }));

          if (lsx) {
            const po = pos.find(p => p.id === lsx.poId);
            if (po) {
              const updatedLogs = [
                ...po.historyLogs,
                {
                  status: 'waiting_production',
                  updatedBy: currentUser.displayName,
                  updatedAt: new Date().toISOString(),
                  note: `Đã hủy lệnh sản xuất ${lsx.lsxCode}. Trạng thái PO quay lại chờ sản xuất.`
                }
              ];
              await requireConfirmedMutation(
                dbService.updateDocument('pos', po.id, {
                  ...getPOQueueUpdate('waiting_production', { productionProgress: 'pending' }),
                  historyLogs: updatedLogs
                })
              );
            }
          }

          setSelectedLsx(null);
          onRefresh();

          showSuccessToast('Đã xóa thành công');
        }
      },
      lsxId
    );
  };

  const activeCommands = sortNewestFirst(
    (productionCommands || []).filter(cmd => !cmd.deleted && cmd.productionOrderVersion !== 2),
    command => [command.createdAt, command.startedAt]
  );
  const getMachineOptionLabel = (machine: ProductionMachine, excludeCommandId?: string): string => {
    const runtimeStatus = getMachineRuntimeStatus(machine, activeCommands, excludeCommandId);
    const colorLabel = machine.colorCount > 0 ? `${machine.colorCount} màu` : 'chưa khai báo số màu';
    return `${machine.code} - ${machine.name} (${colorLabel} · ${getMachineStatusLabel(runtimeStatus)})`;
  };

  const handleCompleteLsx = async (e: React.FormEvent) => {
    return runMutationAction(
      'ProductionPage.tsx:handleCompleteLsx',
      async () => {
        e.preventDefault();
        if (!selectedLsx) return;

        const now = new Date().toISOString();

        // Update LSX
        await requireConfirmedMutation(
          dbService.updateDocument('production_commands', selectedLsx.id, {
            status: 'completed',
            scrapQty: Number(scrapQty),
            notes: `${selectedLsx.notes || ''} | Ghi chú hoàn thành: ${completionNotes}`,
            completedAt: now,
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            updatedAt: now
          })
        );

        // Legacy commands have no reliable per-item allocation. Never infer that one
        // completed command satisfies the entire PO or guess material consumption.
        const po = pos.find(p => p.id === selectedLsx.poId);
        if (po) {
          await requireConfirmedMutation(
            dbService.updateDocument('pos', po.id, {
              productionProgress: 'needs_reconciliation',
              historyLogs: [
                ...(po.historyLogs || []),
                {
                  status: po.status,
                  updatedBy: currentUser.displayName,
                  updatedAt: now,
                  note: `Lệnh cũ ${selectedLsx.lsxCode} hoàn thành; cần đối soát sản lượng theo từng dòng PO và phiếu xuất kho riêng. Không tự chuyển hàng chờ giao hoặc trừ kho ước lượng.`
                }
              ]
            })
          );
        }

        setSelectedLsx(null);
        setScrapQty(0);
        setCompletionNotes('');
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  const handleOpenTransfer = (lsx: any) => {
    setSelectedLsx(lsx);
    const firstOtherOperator = users.find(u => u.role === 'producer' && u.uid !== currentUser.uid);
    setTargetOperatorId(firstOtherOperator?.uid || '');
    setTransferReason('');
    setShowTransferModal(true);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'ProductionPage.tsx:handleTransferSubmit',
      async () => {
        e.preventDefault();
        if (!selectedLsx || !targetOperatorId) return;

        const targetOp = users.find(u => u.uid === targetOperatorId);
        if (!targetOp) return;

        await requireConfirmedMutation(
          dbService.updateDocument('production_commands', selectedLsx.id, {
            status: 'transfer_pending',
            proposedOperatorId: targetOperatorId,
            proposedOperatorName: targetOp.displayName,
            transferReason
          })
        );

        // Write a timeline log for the PO
        const po = pos.find(p => p.id === selectedLsx.poId);
        if (po) {
          const updatedLogs = [
            ...po.historyLogs,
            {
              status: 'waiting_production',
              updatedBy: currentUser.displayName,
              updatedAt: new Date().toISOString(),
              note: `Thợ máy đề xuất chuyển lệnh sản xuất ${selectedLsx.lsxCode} sang thợ ${targetOp.displayName}. Lý do: ${transferReason}`
            }
          ];
          await requireConfirmedMutation(dbService.updateDocument('pos', po.id, { historyLogs: updatedLogs }));
        }

        setShowTransferModal(false);
        setSelectedLsx(null);
        setTransferReason('');
        setTargetOperatorId('');
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  const handleApproveTransfer = async (lsx: any) => {
    return runMutationAction(
      'ProductionPage.tsx:handleApproveTransfer',
      async () => {
        if (!window.confirm(t('Bạn có chắc chắn muốn duyệt chuyển lệnh này sang thợ mới?'))) return;

        // Log to PO history
        const po = pos.find(p => p.id === lsx.poId);
        if (po) {
          const updatedLogs = [
            ...po.historyLogs,
            {
              status: 'waiting_production',
              updatedBy: currentUser.displayName,
              updatedAt: new Date().toISOString(),
              note: `Duyệt chuyển lệnh sản xuất ${lsx.lsxCode} từ thợ ${lsx.operatorName} sang thợ ${lsx.proposedOperatorName}. Lý do: ${lsx.transferReason}`
            }
          ];
          await requireConfirmedMutation(dbService.updateDocument('pos', po.id, { historyLogs: updatedLogs }));
        }

        // Update LSX
        await requireConfirmedMutation(
          dbService.updateDocument('production_commands', lsx.id, {
            operatorId: lsx.proposedOperatorId,
            operatorName: lsx.proposedOperatorName,
            status: 'producing',
            proposedOperatorId: '',
            proposedOperatorName: '',
            transferReason: ''
          })
        );

        setSelectedLsx(null);
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      lsx
    );
  };

  const handleRejectTransfer = async (lsx: any) => {
    return runMutationAction(
      'ProductionPage.tsx:handleRejectTransfer',
      async () => {
        if (!window.confirm(t('Bạn có chắc chắn muốn từ chối yêu cầu chuyển lệnh?'))) return;

        // Log to PO history
        const po = pos.find(p => p.id === lsx.poId);
        if (po) {
          const updatedLogs = [
            ...po.historyLogs,
            {
              status: 'waiting_production',
              updatedBy: currentUser.displayName,
              updatedAt: new Date().toISOString(),
              note: `Từ chối chuyển lệnh sản xuất ${lsx.lsxCode} của thợ ${lsx.operatorName}. Lệnh tiếp tục chạy.`
            }
          ];
          await requireConfirmedMutation(dbService.updateDocument('pos', po.id, { historyLogs: updatedLogs }));
        }

        await requireConfirmedMutation(
          dbService.updateDocument('production_commands', lsx.id, {
            status: 'producing',
            proposedOperatorId: '',
            proposedOperatorName: '',
            transferReason: ''
          })
        );

        setSelectedLsx(null);
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      lsx
    );
  };

  const getPOItemImage = (poId: string) => {
    const po = pos.find(p => p.id === poId);
    return po?.items?.[0]?.previewImage || '';
  };

  const isOperator = currentUser.role === 'producer';
  const canManage = canManageProduction(currentUser);
  const canCompleteLegacy = canManage && (currentUser.role === 'admin' || selectedLsx?.operatorId === currentUser.uid);
  if (!hasProductionAccess(currentUser, 'production'))
    return <div role="alert">Bạn không có quyền truy cập Sản xuất.</div>;

  return (
    <div
      className="production-view"
      data-erp-table-text="single-line"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <PageContextHeader
        section={t('Sản xuất')}
        current={productionTab === 'machines' ? 'Danh sách máy' : 'Lệnh sản xuất'}
      />

      <div className="production-tabs content-tabs" role="tablist" aria-label="Quản lý sản xuất">
        <button
          type="button"
          role="tab"
          aria-selected={productionTab === 'commands'}
          className={productionTab === 'commands' ? 'is-active' : ''}
          onClick={() => setProductionTab('commands')}
        >
          Lệnh sản xuất
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={productionTab === 'machines'}
          className={productionTab === 'machines' ? 'is-active' : ''}
          onClick={() => {
            if (confirmAppNavigation()) setProductionTab('machines');
          }}
        >
          Danh sách máy
        </button>
      </div>

      {productionTab === 'commands' ? (
        <ProductionOrderWorkspace
          key={initialSelectedLsxId || 'commands'}
          pos={pos}
          commands={productionCommands}
          currentUser={currentUser}
          users={users}
          onRefresh={onRefresh}
          initialSelectedId={
            productionCommands.find(
              command => command.id === initialSelectedLsxId || command.lsxCode === initialSelectedLsxId
            )?.id || initialSelectedLsxId
          }
          onOpenLegacy={id =>
            setSelectedLsx(
              productionCommands.find(
                command => command.id === id && command.productionOrderVersion !== 2 && !command.deleted
              ) || null
            )
          }
        />
      ) : (
        <MachineManagement
          machines={machineCatalog}
          productionCommands={productionCommands.filter(command => !command.deleted)}
          canManage={canManage}
        />
      )}

      {/* EDIT LSX DIALOG */}
      {showEditLsxModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('Chỉnh Sửa Lệnh Sản Xuất')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowEditLsxModal(false)}>
                {t('Đóng')}
              </button>
            </div>
            <form onSubmit={handleEditLsxSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>{t('Tên sản phẩm cần bế *')}</label>
                  <input
                    type="text"
                    value={editProductNameToBeCut}
                    onChange={e => setEditProductNameToBeCut(e.target.value)}
                    required
                  />
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Máy In Phân Công *')}</label>
                    <select value={editMachineId} onChange={e => setEditMachineId(e.target.value)} required>
                      {editMachineId && !getMachineForAssignment(machineCatalog, editMachineId) && (
                        <option value={editMachineId}>{editMachineId} (dữ liệu máy cũ)</option>
                      )}
                      {sortMachinesForAssignment(
                        machineCatalog,
                        activeCommands,
                        getRequiredColorCount(pos.find(po => po.id === selectedLsx?.poId))
                      )
                        .filter(machine => machine.status !== 'inactive' || machine.name === editMachineId)
                        .map(machine => (
                          <option key={machine.id} value={machine.name}>
                            {getMachineOptionLabel(machine, selectedLsx?.id)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('Ca Sản Xuất *')}</label>
                    <select value={editShift} onChange={e => setEditShift(e.target.value)}>
                      <option value="Ca Sáng (08:00 - 18:00)">{t('Ca Sáng (08:00 - 18:00)')}</option>
                      <option value="Ca Đêm (18:00 - 04:00)">{t('Ca Đêm (18:00 - 04:00)')}</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Số Lượng Tem Cần In *')}</label>
                    <input
                      type="number"
                      min="1"
                      value={editQtyToProduce}
                      onChange={e => setEditQtyToProduce(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Loại lõi giấy *')}</label>
                    <select value={editPaperCore} onChange={e => setEditPaperCore(e.target.value)}>
                      <option value="25mm">25mm</option>
                      <option value="29mm">29mm</option>
                      <option value="40mm">40mm</option>
                      <option value="42mm">42mm</option>
                      <option value="76mm">76mm</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Mã nguyên liệu giấy cần dùng *')}</label>
                    <input
                      type="text"
                      value={editPaperMaterialCode}
                      onChange={e => setEditPaperMaterialCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Số lượng giấy cấp *')}</label>
                    <input
                      type="number"
                      min="1"
                      value={editPaperQuantity}
                      onChange={e => setEditPaperQuantity(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Ngày cần giao hàng *')}</label>
                    <input
                      type="date"
                      value={editDeliveryDeadline}
                      onChange={e => setEditDeliveryDeadline(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Người Đứng Máy Vận Hành')}</label>
                    <input type="text" value={editOperatorName} onChange={e => setEditOperatorName(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>{t('Ghi Chú Kỹ Thuật Máy / Bế / Cán màng')}</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditLsxModal(false)}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('Cập Nhật')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LSX DETAILS AND COMPLETION MODAL */}
      {selectedLsx && !showEditLsxModal && !showTransferModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>
                {t('CHI TIẾT LỆNH SẢN XUẤT')}: {selectedLsx.lsxCode}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedLsx.status !== 'completed' && !isOperator && canManage && (
                  <>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleOpenEditLsx(selectedLsx)}
                      title={t('Sửa')}
                    >
                      {t('Sửa')}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDeleteLsx(selectedLsx.id)}
                      title={t('Xóa')}
                    >
                      {t('Xóa')}
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-outline" onClick={() => setSelectedLsx(null)}>
                  {t('Đóng')}
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Tên sản phẩm bế')}:</span>{' '}
                    {selectedLsx.productNameToBeCut || selectedLsx.productName}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Mã PO Gốc')}:</span> {selectedLsx.poCode}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Máy Phân Công')}:</span> {selectedLsx.machineId}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Ca Kíp Máy')}:</span> {selectedLsx.shift}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Người Vận Hành')}:</span> {selectedLsx.operatorName}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Số Lượng Cần In')}:</span>{' '}
                    {getProductionQuantity(selectedLsx).toLocaleString()} {t('tem')}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Loại lõi giấy')}:</span> {selectedLsx.paperCore || '76mm'}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Mã nguyên liệu giấy')}:</span> {selectedLsx.paperMaterialCode}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Số lượng giấy cấp')}:</span> {selectedLsx.paperQuantity}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Hạn giao hàng')}:</span>{' '}
                    {formatDate(selectedLsx.deliveryDeadline, 'vi-VN', 'N/A')}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Ghi chú')}:</span> {selectedLsx.notes || t('Không có')}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t('Ngày Lập Lệnh')}:</span>{' '}
                    {formatDateTime(selectedLsx.startedAt)}
                  </div>
                  {selectedLsx.completedAt && (
                    <div>
                      <span style={{ fontWeight: 600 }}>{t('Ngày Hoàn Thành')}:</span>{' '}
                      {formatDateTime(selectedLsx.completedAt)}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    textAlign: 'center',
                    border: '1px solid var(--color-border-light)',
                    padding: '6px',
                    borderRadius: '4px',
                    backgroundColor: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <h4
                    style={{ textAlign: 'left', fontSize: '11px', marginBottom: '6px', fontWeight: 600, width: '100%' }}
                  >
                    {t('Mẫu màu in thiết kế')}:
                  </h4>
                  {getPOItemImage(selectedLsx.poId) ? (
                    <img
                      src={getPOItemImage(selectedLsx.poId)}
                      alt="Layout in"
                      style={{ maxWidth: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                  ) : (
                    <div
                      style={{
                        padding: '40px 0',
                        backgroundColor: '#f8fafc',
                        color: 'var(--color-text-muted)',
                        fontSize: '12px'
                      }}
                    >
                      {t('Không có ảnh mẫu')}
                    </div>
                  )}
                </div>
              </div>

              {selectedLsx.status === 'transfer_pending' && (
                <div className="machine-alert">
                  <div>
                    <strong>Chờ duyệt bàn giao cho {selectedLsx.proposedOperatorName}</strong>
                    <span>{selectedLsx.transferReason}</span>
                  </div>
                  {currentUser.role === 'admin' && (
                    <div className="lsx-actions">
                      <button className="btn btn-primary" onClick={() => handleApproveTransfer(selectedLsx)}>
                        Duyệt bàn giao
                      </button>
                      <button className="btn btn-outline" onClick={() => handleRejectTransfer(selectedLsx)}>
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selectedLsx.status === 'producing' && isOperator && canCompleteLegacy && (
                <button className="btn btn-outline" onClick={() => handleOpenTransfer(selectedLsx)}>
                  Đề nghị bàn giao
                </button>
              )}
              {selectedLsx.status === 'producing' && canCompleteLegacy && (
                <form
                  onSubmit={handleCompleteLsx}
                  style={{
                    border: '1px solid var(--color-border)',
                    padding: '16px',
                    borderRadius: '4px',
                    marginTop: '16px',
                    backgroundColor: '#f8fafc'
                  }}
                >
                  <h3
                    style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--color-success)', fontWeight: 700 }}
                  >
                    {t('Báo cáo kết quả hoàn thành sản xuất')}:
                  </h3>
                  <div className="form-group">
                    <label>{t('Số Lượng Phế Phẩm / Hao Hụt Phát Sinh (Cái) *')}</label>
                    <input
                      type="number"
                      min="0"
                      value={scrapQty}
                      onChange={e => setScrapQty(Number(e.target.value))}
                      required
                    />
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {t('* Lượng tem in hỏng trong quá trình setup dao bế và in ấn')}
                    </span>
                  </div>

                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label>{t('Ghi Chú Kết Quả Vận Hành (Hao hụt giấy, mực...)')}</label>
                    <textarea
                      value={completionNotes}
                      onChange={e => setCompletionNotes(e.target.value)}
                      placeholder={t('VD: Chạy máy tốt, hao hụt 120 tem trong lúc set-up dao bế.')}
                      rows={2}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-success"
                    style={{ width: '100%', marginTop: '12px', padding: '10px', fontWeight: 600 }}
                  >
                    {t('Xác nhận hoàn thành (cần đối soát PO / kho)')}
                  </button>
                </form>
              )}

              {/* Audit trail */}
              <div
                style={{
                  marginTop: '20px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--color-border-light)',
                  fontSize: '12px',
                  color: 'var(--color-text-muted)'
                }}
              >
                <div>
                  {t('Tạo bởi:')} {selectedLsx.createdBy || t('Không xác định')}{' '}
                  {selectedLsx.createdAt && `(${formatDateTime(selectedLsx.createdAt, t('vi-VN'))})`}
                </div>
                {selectedLsx.updatedBy && (
                  <div>
                    {t('Cập nhật bởi:')} {selectedLsx.updatedBy} ({formatDateTime(selectedLsx.updatedAt, t('vi-VN'))})
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedLsx(null)}>
                {t('Đóng')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && selectedLsx && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>{t('BÀN GIAO / CHUYỂN LỆNH SẢN XUẤT')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowTransferModal(false)}>
                {t('Đóng')}
              </button>
            </div>
            <form onSubmit={handleTransferSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                  {t('Bàn giao lệnh')} <strong>{selectedLsx.lsxCode}</strong> (
                  {selectedLsx.productNameToBeCut || selectedLsx.productName}) {t('cho thợ khác vận hành.')}
                </p>
                <div className="form-group">
                  <label>{t('Thợ Tiếp Nhận Thay *')}</label>
                  <select value={targetOperatorId} onChange={e => setTargetOperatorId(e.target.value)} required>
                    <option value="">{t('Chọn thợ...')}</option>
                    {users
                      .filter(u => u.role === 'producer' && u.uid !== currentUser.uid)
                      .map(u => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>{t('Lý Do Bàn Giao (Sự cố, Đổi ca...) *')}</label>
                  <textarea
                    value={transferReason}
                    onChange={e => setTransferReason(e.target.value)}
                    required
                    placeholder={t('Nhập chi tiết sự cố máy móc hoặc lý do bàn giao...')}
                    style={{
                      minHeight: '80px',
                      width: '100%',
                      padding: '8px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowTransferModal(false)}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('Đề Xuất Chuyển')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedLsx && (
        <FloatingChat
          currentUser={currentUser}
          type="lsx"
          targetId={selectedLsx.id}
          targetCode={selectedLsx.lsxCode}
          messages={messages}
          users={users}
        />
      )}
    </div>
  );
};
