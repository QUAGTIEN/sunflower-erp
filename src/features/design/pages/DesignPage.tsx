import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileArchive,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Search,
  Settings2,
  UserRound,
  XCircle
} from 'lucide-react';
import { PageBackButton } from '@/components/PageBackButton';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import {
  DESIGN_WORK_STATUSES,
  DesignPOItem,
  DesignPOLike,
  DesignRecord,
  DesignRequest,
  DesignRequestHistory,
  DesignVersion,
  DesignWorkStatus,
  getDesignRequestAgeDays,
  getDesignWorkStatus,
  getDesignWorkStatusDefinition,
  isDesignRequestOverdue,
  resolveDesignForRequest
} from '@/features/design/model/designWorkflow';
import { getPOQueueUpdate } from '@/features/sales/model/poWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { syncDesignRequestsForPOs } from '@/features/design/api/designRequestService';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './Design.css';

interface DesignProps {
  pos: DesignPOLike[];
  designRequests: DesignRequest[];
  users: UserProfile[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Cực gấp',
  high: 'Gấp',
  normal: 'Bình thường',
  low: 'Thong thả'
};

const DESIGN_LIST_COLUMNS: TableColumnOption[] = [
  { id: 'request', label: 'Mã yêu cầu', required: true, group: 'Thông tin yêu cầu' },
  { id: 'po', label: 'Mã đơn hàng', defaultVisible: true, group: 'Thông tin yêu cầu' },
  { id: 'product', label: 'Mặt hàng cần thiết kế', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'specification', label: 'Quy cách / Chất liệu', defaultVisible: true, group: 'Thông tin sản phẩm' },
  { id: 'dueDate', label: 'Hạn xử lý', defaultVisible: true, group: 'Tiến độ' },
  { id: 'designer', label: 'Người phụ trách', defaultVisible: true, group: 'Tiến độ' },
  { id: 'status', label: 'Tiến độ thiết kế', defaultVisible: true, group: 'Tiến độ' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
};

const compressPreviewImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh thiết kế.'));
    reader.onload = event => {
      const image = new Image();
      image.onerror = () => reject(new Error('Tệp được chọn không phải ảnh hợp lệ.'));
      image.onload = () => {
        const maxSize = 1200;
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

export const Design: React.FC<DesignProps> = ({ pos, designRequests, users, currentUser, onRefresh }) => {
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilters, setStatusFilters] = useState<DesignWorkStatus[]>([]);
  const [designerFilters, setDesignerFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [showDesignFilters, setShowDesignFilters] = useState(false);
  const [showDesignColumnCustomizer, setShowDesignColumnCustomizer] = useState(false);
  const {
    selectedIds: sharedDesignColumns,
    setSelectedIds: setDesignVisibleColumns,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'design-requests',
    legacySelectionKey: `sunflower:design-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:design-column-widths:v3:${currentUser.uid}`
  });
  const designVisibleColumns = Array.from(
    new Set([
      'request',
      'actions',
      ...(sharedDesignColumns ||
        DESIGN_LIST_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id))
    ])
  );
  const designVisibleColumnSet = new Set(designVisibleColumns);
  const designActiveFilterCount = statusFilters.length + designerFilters.length + priorityFilters.length;
  const saveDesignVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const next = Array.from(new Set(['request', 'actions', ...selectedIds]));
    setDesignVisibleColumns(next);
    setShowDesignColumnCustomizer(false);
  };
  const { orderedColumnIds: orderedDesignColumnIds, getHeaderProps: getDesignHeaderProps } = useReorderableTableColumns(
    {
      columns: DESIGN_LIST_COLUMNS,
      selectedIds: designVisibleColumns,
      onOrderChange: saveDesignVisibleColumns,
      layoutId: 'design-requests',
      lockedStartIds: ['request'],
      lockedEndIds: ['actions']
    }
  );
  const designColumnLabels = Object.fromEntries(DESIGN_LIST_COLUMNS.map(column => [column.id, column.label]));
  const [statusNote, setStatusNote] = useState('');
  const [nextWorkStatus, setNextWorkStatus] = useState<DesignWorkStatus>('unreviewed');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [aiLink, setAiLink] = useState('');
  const [corelLink, setCorelLink] = useState('');
  const [versionComment, setVersionComment] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const migrationKeyRef = useRef('');

  useEffect(() => dbService.subscribeCollection('designs', data => setDesigns(data as DesignRecord[])), []);

  useEffect(() => {
    if (pos.length === 0) return;
    const migrationKey = pos.map(po => `${po.id}:${po.updatedAt || po.createdAt || ''}`).join('|');
    if (migrationKeyRef.current === migrationKey) return;
    migrationKeyRef.current = migrationKey;
    void syncDesignRequestsForPOs(pos, currentUser).catch(error => {
      console.error('Unable to synchronize design requests:', error);
      migrationKeyRef.current = '';
    });
  }, [currentUser, pos]);

  const visibleRequests = useMemo(
    () =>
      designRequests.filter(request => {
        if (request.archived === true) return false;
        if (currentUser.role !== 'designer') return true;
        return !request.assignedDesignerId || request.assignedDesignerId === currentUser.uid;
      }),
    [currentUser.role, currentUser.uid, designRequests]
  );

  const filteredRequests = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return sortNewestFirst(
      visibleRequests
        .filter(
          request => statusFilters.length === 0 || statusFilters.includes(getDesignWorkStatus(request.workStatus))
        )
        .filter(
          request =>
            designerFilters.length === 0 || designerFilters.includes(request.assignedDesignerId || 'unassigned')
        )
        .filter(request => priorityFilters.length === 0 || priorityFilters.includes(request.priority || 'normal'))
        .filter(
          request =>
            !search ||
            [
              request.requestCode,
              request.poCode,
              request.customerReferenceCode,
              request.productCode,
              request.productName,
              request.size,
              request.material
            ].some(value =>
              String(value || '')
                .toLocaleLowerCase('vi-VN')
                .includes(search)
            )
        ),
      request => [request.createdAt]
    );
  }, [designerFilters, priorityFilters, searchTerm, statusFilters, visibleRequests]);
  const designPagination = useDataTablePagination(filteredRequests);

  const selectedRequest = designRequests.find(request => request.id === selectedRequestId) || null;
  const selectedDesign = selectedRequest ? resolveDesignForRequest(designs, selectedRequest) : null;
  const selectedDesignVersions = selectedDesign?.versions?.length
    ? selectedDesign.versions
    : selectedDesign?.fileUrl
      ? [
          {
            versionNumber: selectedDesign.currentVersion || 1,
            previewImage: selectedDesign.fileUrl,
            aiLink: selectedDesign.aiLink || '',
            corelLink: selectedDesign.corelLink || '',
            comment: selectedDesign.notes || 'Phiên bản được chuyển đổi từ dữ liệu thiết kế cũ.',
            createdAt: selectedDesign.updatedAt || selectedDesign.createdAt || '',
            createdBy: selectedDesign.designerName || 'Hệ thống',
            feedbackFromClient: selectedDesign.status === 'approved' ? 'KHÁCH HÀNG ĐÃ DUYỆT MẪU' : '',
            feedbackAt: selectedDesign.updatedAt || ''
          }
        ]
      : [];
  const selectedVersion =
    selectedDesignVersions.find((version: DesignVersion) => version.versionNumber === selectedVersionNumber) ||
    selectedDesignVersions[selectedDesignVersions.length - 1] ||
    null;

  const openRequest = (request: DesignRequest) => {
    setSelectedRequestId(request.id);
    setNextWorkStatus(getDesignWorkStatus(request.workStatus));
    setStatusNote('');
    setActionError('');
  };

  const closeRequest = () => {
    setSelectedRequestId('');
    setSelectedVersionNumber(null);
    setStatusNote('');
    setFeedbackText('');
    setActionError('');
  };

  const updatePODesignProgress = async (request: DesignRequest, updatedWorkStatus: DesignWorkStatus, note: string) => {
    const po = pos.find(candidate => candidate.id === request.poId);
    if (!po) return;
    const requestsForPO = designRequests
      .filter(candidate => candidate.poId === request.poId && candidate.archived !== true)
      .map(candidate => (candidate.id === request.id ? { ...candidate, workStatus: updatedWorkStatus } : candidate));
    const allCompleted =
      requestsForPO.length > 0 && requestsForPO.every(candidate => candidate.workStatus === 'completed');
    const hasWaitingInfo = requestsForPO.some(candidate => candidate.workStatus === 'waiting_info');
    const updatedLogs = [
      ...(po.historyLogs || []),
      {
        status: 'waiting_design',
        updatedBy: currentUser.displayName,
        updatedAt: new Date().toISOString(),
        note: `${request.requestCode}: ${getDesignWorkStatusDefinition(updatedWorkStatus).label}${note ? ` – ${note}` : ''}`
      }
    ];
    await dbService.updateDocument('pos', po.id, {
      ...getPOQueueUpdate('waiting_design', {
        designProgress: allCompleted ? 'designer_completed' : hasWaitingInfo ? 'waiting_info' : 'in_progress'
      }),
      historyLogs: updatedLogs
    });
  };

  const handleUpdateWorkStatus = async () => {
    return runMutationAction(
      'DesignPage.tsx:handleUpdateWorkStatus',
      async () => {
        if (!selectedRequest || isSaving) return;
        if (nextWorkStatus === 'waiting_info' && !statusNote.trim()) {
          setActionError('Vui lòng ghi rõ thông tin còn thiếu để Sale có thể bổ sung.');
          return;
        }
        if (nextWorkStatus === 'completed' && !selectedVersion) {
          setActionError('Vui lòng tải lên ít nhất một phiên bản thiết kế trước khi đánh dấu đã hoàn thành.');
          return;
        }
        setIsSaving(true);
        setActionError('');
        const now = new Date().toISOString();
        const nextHistory = [
          ...(selectedRequest.history || []),
          {
            type: 'work_status',
            workStatus: nextWorkStatus,
            approvalStatus: selectedRequest.approvalStatus || 'not_sent',
            note: statusNote.trim(),
            updatedBy: currentUser.displayName,
            updatedAt: now
          }
        ];
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('design_requests', selectedRequest.id, {
              workStatus: nextWorkStatus,
              statusNote: statusNote.trim(),
              startedAt:
                nextWorkStatus === 'in_progress' && !selectedRequest.startedAt ? now : selectedRequest.startedAt || '',
              completedAt: nextWorkStatus === 'completed' ? now : '',
              updatedBy: currentUser.displayName,
              history: nextHistory
            })
          );
          await updatePODesignProgress(selectedRequest, nextWorkStatus, statusNote.trim());
          setStatusNote('');
          onRefresh();

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          console.error('Unable to update design work status:', error);
          setActionError('Không thể cập nhật tiến độ thiết kế. Vui lòng thử lại.');
        } finally {
          setIsSaving(false);
        }
      },
      undefined
    );
  };

  const handlePreviewFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setActionError('');
    try {
      setPreviewImage(await compressPreviewImage(file));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể xử lý ảnh thiết kế.');
    }
  };

  const resetVersionForm = () => {
    setShowVersionModal(false);
    setPreviewImage('');
    setAiLink('');
    setCorelLink('');
    setVersionComment('');
  };

  const handleAddVersion = async (event: React.FormEvent) => {
    return runMutationAction(
      'DesignPage.tsx:handleAddVersion',
      async () => {
        event.preventDefault();
        if (!selectedRequest || isSaving) return;
        if (!previewImage) {
          setActionError('Vui lòng chọn ảnh xem trước của bản thiết kế.');
          return;
        }
        setIsSaving(true);
        setActionError('');
        const now = new Date().toISOString();
        const existingVersions = selectedDesignVersions;
        const nextVersionNumber =
          Math.max(0, ...existingVersions.map(version => Number(version.versionNumber) || 0)) + 1;
        const newVersion = {
          versionNumber: nextVersionNumber,
          previewImage,
          aiLink: aiLink.trim(),
          corelLink: corelLink.trim(),
          comment: versionComment.trim(),
          createdAt: now,
          createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
          feedbackFromClient: '',
          feedbackAt: ''
        };
        try {
          if (selectedDesign) {
            await requireConfirmedMutation(
              dbService.updateDocument('designs', selectedDesign.id, {
                designRequestId: selectedRequest.id,
                itemId: selectedRequest.itemId,
                itemIndex: selectedRequest.itemIndex,
                customerReferenceCode: selectedRequest.customerReferenceCode,
                versions: [...existingVersions, newVersion],
                currentVersion: nextVersionNumber,
                status: 'client_pending',
                designerId: currentUser.uid,
                designerName: currentUser.displayName
              })
            );
          } else {
            await dbService.addDocument('designs', {
              id: `design-${selectedRequest.id}`,
              designRequestId: selectedRequest.id,
              poId: selectedRequest.poId,
              poCode: selectedRequest.poCode,
              itemId: selectedRequest.itemId,
              itemIndex: selectedRequest.itemIndex,
              customerReferenceCode: selectedRequest.customerReferenceCode,
              designerId: currentUser.uid,
              designerName: currentUser.displayName,
              versions: [newVersion],
              currentVersion: 1,
              status: 'client_pending',
              createdAt: now
            });
          }

          const requestHistory = [
            ...(selectedRequest.history || []),
            {
              type: 'version_uploaded',
              workStatus: 'completed',
              approvalStatus: 'waiting_client',
              note: `Hoàn thành và tải lên phiên bản thiết kế v${nextVersionNumber}. ${versionComment.trim()}`.trim(),
              updatedBy: currentUser.displayName,
              updatedAt: now
            }
          ];
          await requireConfirmedMutation(
            dbService.updateDocument('design_requests', selectedRequest.id, {
              workStatus: 'completed',
              approvalStatus: 'waiting_client',
              completedAt: now,
              statusNote: versionComment.trim(),
              latestVersion: nextVersionNumber,
              updatedBy: currentUser.displayName,
              history: requestHistory
            })
          );

          const po = pos.find(candidate => candidate.id === selectedRequest.poId);
          if (po) {
            const requestsForPO = designRequests
              .filter(candidate => candidate.poId === selectedRequest.poId && candidate.archived !== true)
              .map(candidate =>
                candidate.id === selectedRequest.id
                  ? {
                      ...candidate,
                      workStatus: 'completed' as DesignWorkStatus,
                      approvalStatus: 'waiting_client' as const
                    }
                  : candidate
              );
            const allDesignerWorkCompleted =
              requestsForPO.length > 0 && requestsForPO.every(candidate => candidate.workStatus === 'completed');
            const updatedItems = (po.items || []).map((item: DesignPOItem, index: number) =>
              (item.itemId || item.productCode || `item-${index + 1}`) === selectedRequest.itemId
                ? {
                    ...item,
                    designNotes: versionComment.trim(),
                    designLayouts: Array.from(new Set([...(item.designLayouts || []), previewImage]))
                  }
                : item
            );
            await requireConfirmedMutation(
              dbService.updateDocument('pos', po.id, {
                ...getPOQueueUpdate('waiting_design', {
                  designProgress: allDesignerWorkCompleted ? 'customer_approval_pending' : 'in_progress'
                }),
                items: updatedItems,
                historyLogs: [
                  ...(po.historyLogs || []),
                  {
                    status: 'waiting_design',
                    updatedBy: currentUser.displayName,
                    updatedAt: now,
                    note: `${selectedRequest.requestCode}: Designer đã hoàn thành v${nextVersionNumber}, chờ Sale gửi khách hàng duyệt.`
                  }
                ]
              })
            );
          }
          setSelectedVersionNumber(nextVersionNumber);
          resetVersionForm();
          onRefresh();

          showSuccessToast('Đã thêm thành công');
        } catch (error) {
          showErrorToast();
          console.error('Unable to add design version:', error);
          setActionError('Không thể lưu phiên bản thiết kế. Vui lòng thử lại.');
        } finally {
          setIsSaving(false);
        }
      },
      event
    );
  };

  const handleClientFeedback = async (approved: boolean) => {
    return runMutationAction(
      'DesignPage.tsx:handleClientFeedback',
      async () => {
        if (!selectedRequest || !selectedDesign || !selectedVersion || isSaving) return;
        if (!approved && !feedbackText.trim()) {
          setActionError('Vui lòng nhập nội dung khách hàng yêu cầu sửa.');
          return;
        }
        setIsSaving(true);
        setActionError('');
        const now = new Date().toISOString();
        const updatedVersions = selectedDesignVersions.map((version: DesignVersion) =>
          version.versionNumber === selectedVersion.versionNumber
            ? {
                ...version,
                feedbackFromClient: approved ? 'KHÁCH HÀNG ĐÃ DUYỆT MẪU' : `KHÁCH YÊU CẦU SỬA: ${feedbackText.trim()}`,
                feedbackAt: now
              }
            : version
        );
        const nextWorkStatus: DesignWorkStatus = approved ? 'completed' : 'queued';
        const nextApprovalStatus = approved ? 'approved' : 'revision_requested';
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('designs', selectedDesign.id, {
              status: approved ? 'approved' : 'rejected',
              versions: updatedVersions
            })
          );
          await requireConfirmedMutation(
            dbService.updateDocument('design_requests', selectedRequest.id, {
              workStatus: nextWorkStatus,
              approvalStatus: nextApprovalStatus,
              approvalNote: feedbackText.trim(),
              completedAt: approved ? selectedRequest.completedAt || now : '',
              updatedBy: currentUser.displayName,
              history: [
                ...(selectedRequest.history || []),
                {
                  type: 'client_feedback',
                  workStatus: nextWorkStatus,
                  approvalStatus: nextApprovalStatus,
                  note: approved ? 'Khách hàng đã duyệt mẫu.' : feedbackText.trim(),
                  updatedBy: currentUser.displayName,
                  updatedAt: now
                }
              ]
            })
          );

          const po = pos.find(candidate => candidate.id === selectedRequest.poId);
          if (po) {
            const requestsForPO = designRequests
              .filter(candidate => candidate.poId === selectedRequest.poId && candidate.archived !== true)
              .map(candidate =>
                candidate.id === selectedRequest.id
                  ? { ...candidate, approvalStatus: nextApprovalStatus, workStatus: nextWorkStatus }
                  : candidate
              );
            const allApproved =
              requestsForPO.length > 0 && requestsForPO.every(candidate => candidate.approvalStatus === 'approved');
            const updatedItems = (po.items || []).map((item: DesignPOItem, index: number) =>
              approved && (item.itemId || item.productCode || `item-${index + 1}`) === selectedRequest.itemId
                ? { ...item, previewImage: selectedVersion.previewImage }
                : item
            );
            await requireConfirmedMutation(
              dbService.updateDocument('pos', po.id, {
                ...getPOQueueUpdate(allApproved ? 'waiting_production' : 'waiting_design', {
                  designProgress: allApproved ? 'approved' : approved ? 'partially_approved' : 'revision_requested',
                  productionProgress: allApproved ? 'pending' : po.productionProgress || ''
                }),
                items: updatedItems,
                historyLogs: [
                  ...(po.historyLogs || []),
                  {
                    status: allApproved ? 'waiting_production' : 'waiting_design',
                    updatedBy: currentUser.displayName,
                    updatedAt: now,
                    note: approved
                      ? `${selectedRequest.requestCode}: khách hàng đã duyệt mẫu${allApproved ? '; toàn bộ mặt hàng đã sẵn sàng chuyển sản xuất.' : '.'}`
                      : `${selectedRequest.requestCode}: khách hàng yêu cầu Designer sửa – ${feedbackText.trim()}`
                  }
                ]
              })
            );
          }
          setFeedbackText('');
          onRefresh();

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          console.error('Unable to save client feedback:', error);
          setActionError('Không thể cập nhật phản hồi khách hàng. Vui lòng thử lại.');
        } finally {
          setIsSaving(false);
        }
      },
      approved
    );
  };

  return (
    <div className="design-request-view">
      {!selectedRequest && (
        <>
          <PageContextHeader section="Thiết kế" current="Danh sách yêu cầu thiết kế" />

          <div className="card design-request-list-card">
            <div className="design-request-toolbar">
              <div className="design-request-search">
                <Search size={16} />
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Tìm mã yêu cầu, mã đơn hàng, mã hàng hoặc sản phẩm..."
                />
              </div>
              <DataFilterButton
                activeCount={designActiveFilterCount}
                open={showDesignFilters}
                onClick={() => setShowDesignFilters(true)}
              />
              {canEditColumns && (
                <button
                  type="button"
                  className="data-filter-button"
                  onClick={() => setShowDesignColumnCustomizer(true)}
                  title="Tùy chỉnh cột"
                  aria-label="Tùy chỉnh cột"
                >
                  <Settings2 size={16} />
                </button>
              )}
            </div>

            <DataFilterChipBar
              chips={[
                ...statusFilters.map(value => ({
                  id: `status:${value}`,
                  label: DESIGN_WORK_STATUSES.find(status => status.value === value)?.label || value,
                  onRemove: () => setStatusFilters(current => current.filter(item => item !== value))
                })),
                ...designerFilters.map(value => ({
                  id: `designer:${value}`,
                  label:
                    value === 'unassigned'
                      ? 'Chưa phân công'
                      : users.find(user => user.uid === value)?.displayName || value,
                  onRemove: () => setDesignerFilters(current => current.filter(item => item !== value))
                })),
                ...priorityFilters.map(value => ({
                  id: `priority:${value}`,
                  label: PRIORITY_LABELS[value] || value,
                  onRemove: () => setPriorityFilters(current => current.filter(item => item !== value))
                }))
              ]}
              onClear={() => {
                setStatusFilters([]);
                setDesignerFilters([]);
                setPriorityFilters([]);
              }}
            />

            <div className="table-container design-request-table erp-primary-data-table">
              <table data-resize-key="design-requests">
                <thead>
                  <tr>
                    <ReorderableTableCells
                      order={orderedDesignColumnIds}
                      getHeaderProps={getDesignHeaderProps}
                      labels={designColumnLabels}
                    >
                      <th key="request">Mã yêu cầu</th>
                      {designVisibleColumnSet.has('po') && <th key="po">Mã đơn hàng</th>}
                      {designVisibleColumnSet.has('product') && <th key="product">Mặt hàng cần thiết kế</th>}
                      {designVisibleColumnSet.has('specification') && <th key="specification">Quy cách / Chất liệu</th>}
                      {designVisibleColumnSet.has('dueDate') && <th key="dueDate">Hạn xử lý</th>}
                      {designVisibleColumnSet.has('designer') && <th key="designer">Người phụ trách</th>}
                      {designVisibleColumnSet.has('status') && <th key="status">Tiến độ thiết kế</th>}
                      <th key="actions">Thao Tác</th>
                    </ReorderableTableCells>
                  </tr>
                </thead>
                <tbody>
                  {designPagination.rows.map(request => {
                    const status = getDesignWorkStatusDefinition(request.workStatus);
                    const designer = users.find(user => user.uid === request.assignedDesignerId);
                    const ageDays = getDesignRequestAgeDays(request);
                    const overdue = isDesignRequestOverdue(request);
                    return (
                      <tr key={request.id} className={overdue ? 'is-overdue' : ''} onClick={() => openRequest(request)}>
                        <ReorderableTableCells order={orderedDesignColumnIds} expandOverflowText={false}>
                          <td key="request">
                            <strong className="design-request-code">{request.requestCode}</strong>
                            <span className={`design-priority design-priority--${request.priority || 'normal'}`}>
                              {PRIORITY_LABELS[request.priority] || 'Bình thường'}
                            </span>
                          </td>
                          {designVisibleColumnSet.has('po') && (
                            <td key="po">
                              <strong>{request.customerReferenceCode || request.poCode}</strong>
                              <span className="design-secondary-text">{request.poCode}</span>
                            </td>
                          )}
                          {designVisibleColumnSet.has('product') && (
                            <td key="product">
                              <strong>{request.productName || 'Chưa đặt tên'}</strong>
                              <span className="design-secondary-text">{request.productCode || 'Chưa có mã hàng'}</span>
                            </td>
                          )}
                          {designVisibleColumnSet.has('specification') && (
                            <td key="specification">
                              <span>{request.size || '—'}</span>
                              <span className="design-secondary-text">{request.material || '—'}</span>
                            </td>
                          )}
                          {designVisibleColumnSet.has('dueDate') && (
                            <td key="dueDate">
                              <span className={overdue ? 'design-overdue-text' : ''}>
                                {formatDate(request.dueDate)}
                              </span>
                              <span className="design-secondary-text">
                                {ageDays === null
                                  ? '—'
                                  : `${ageDays} ${request.workStatus === 'completed' ? 'ngày xử lý' : 'ngày chờ'}`}
                              </span>
                            </td>
                          )}
                          {designVisibleColumnSet.has('designer') && (
                            <td key="designer">{designer?.displayName || 'Chưa phân công'}</td>
                          )}
                          {designVisibleColumnSet.has('status') && (
                            <td key="status">
                              <span className="design-progress-text" style={{ color: status.color }}>
                                {status.label}
                              </span>
                            </td>
                          )}
                          <td key="actions">
                            <RowActionMenu
                              label={`Thao tác ${request.requestCode}`}
                              actions={[{ label: 'Mở công việc', onSelect: () => openRequest(request) }]}
                            />
                          </td>
                        </ReorderableTableCells>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...designPagination.paginationProps} />
          </div>
        </>
      )}

      <TableColumnCustomizer
        open={showDesignColumnCustomizer}
        columns={DESIGN_LIST_COLUMNS}
        selectedIds={designVisibleColumns}
        onClose={() => setShowDesignColumnCustomizer(false)}
        onSave={saveDesignVisibleColumns}
      />
      <DataFilterPanel
        open={showDesignFilters}
        title="Lọc danh sách thiết kế"
        description="Lọc theo tiến độ, người phụ trách và mức độ ưu tiên."
        activeCount={designActiveFilterCount}
        onClose={() => setShowDesignFilters(false)}
        onReset={() => {
          setStatusFilters([]);
          setDesignerFilters([]);
          setPriorityFilters([]);
        }}
      >
        <DataFilterSection title="Tiến độ thiết kế" selectedCount={statusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={DESIGN_WORK_STATUSES.map(status => ({ value: status.value, label: status.label }))}
            selectedValues={statusFilters}
            onChange={values => setStatusFilters(values as DesignWorkStatus[])}
          />
        </DataFilterSection>
        <DataFilterSection title="Người phụ trách" selectedCount={designerFilters.length}>
          <DataFilterCheckboxGroup
            options={[
              { value: 'unassigned', label: 'Chưa phân công' },
              ...users
                .filter(user => user.role === 'designer')
                .map(user => ({ value: user.uid, label: user.displayName }))
            ]}
            selectedValues={designerFilters}
            onChange={setDesignerFilters}
            searchable
          />
        </DataFilterSection>
        <DataFilterSection title="Mức độ ưu tiên" selectedCount={priorityFilters.length}>
          <DataFilterCheckboxGroup
            options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label: label }))}
            selectedValues={priorityFilters}
            onChange={setPriorityFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>

      {selectedRequest && (
        <div className="design-task-page">
          <header className="design-task-page-header">
            <PageBackButton onClick={closeRequest} />
            <div>
              <span>CHI TIẾT CÔNG VIỆC THIẾT KẾ</span>
              <h1>
                {selectedRequest.requestCode} · {selectedRequest.productName || 'Chưa đặt tên'}
              </h1>
              <p>
                {selectedRequest.customerReferenceCode || selectedRequest.poCode} ·{' '}
                {selectedRequest.productCode || 'Chưa có mã hàng'}
              </p>
            </div>
            <span
              className="design-work-badge design-task-status"
              style={{
                color: getDesignWorkStatusDefinition(selectedRequest.workStatus).color,
                background: getDesignWorkStatusDefinition(selectedRequest.workStatus).background,
                borderColor: getDesignWorkStatusDefinition(selectedRequest.workStatus).color
              }}
            >
              {getDesignWorkStatusDefinition(selectedRequest.workStatus).label}
            </span>
          </header>

          {actionError && (
            <div className="design-action-error">
              <AlertCircle size={16} /> {actionError}
            </div>
          )}

          <section className="design-task-panel design-task-overview">
            <div className="design-task-brief">
              <div className="design-section-title">
                <ListChecks size={17} />
                <span>Thông tin bàn giao từ Sale</span>
              </div>
              <dl className="design-brief-grid">
                <div>
                  <dt>Mã đơn hàng</dt>
                  <dd>{selectedRequest.customerReferenceCode || selectedRequest.poCode}</dd>
                </div>
                <div>
                  <dt>Mã hàng</dt>
                  <dd>{selectedRequest.productCode || '—'}</dd>
                </div>
                <div>
                  <dt>Tên hàng</dt>
                  <dd>{selectedRequest.productName || '—'}</dd>
                </div>
                <div>
                  <dt>Quy cách</dt>
                  <dd>{selectedRequest.size || '—'}</dd>
                </div>
                <div>
                  <dt>Chất liệu</dt>
                  <dd>{selectedRequest.material || '—'}</dd>
                </div>
                <div>
                  <dt>Hạn hoàn thành</dt>
                  <dd>{formatDate(selectedRequest.dueDate)}</dd>
                </div>
              </dl>
              <div className="design-brief-note">
                <strong>Yêu cầu và ghi chú thiết kế</strong>
                <p>{selectedRequest.designBrief || 'Sale chưa cung cấp ghi chú riêng.'}</p>
              </div>
              <div className="design-reference-gallery">
                <strong>Artwork và hình ảnh tham khảo</strong>
                <div>
                  {(selectedRequest.referenceImages || []).map((imageUrl: string, index: number) => (
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={`${imageUrl.slice(0, 40)}-${index}`}
                    >
                      <img src={imageUrl} alt={`Ảnh tham khảo ${index + 1}`} />
                    </a>
                  ))}
                  {(selectedRequest.referenceImages || []).length === 0 && (
                    <span className="design-reference-empty">
                      <ImageIcon size={24} />
                      Chưa có artwork hoặc hình ảnh tham khảo.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <aside className="design-progress-card design-task-progress">
              <div className="design-section-title">
                <Clock3 size={17} />
                <span>Cập nhật tiến độ nội bộ</span>
              </div>
              <label>Trạng thái công việc của Designer</label>
              <select
                value={nextWorkStatus}
                onChange={event => setNextWorkStatus(event.target.value as DesignWorkStatus)}
                disabled={currentUser.role === 'sale'}
              >
                {DESIGN_WORK_STATUSES.map(status => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <label>Ghi chú cập nhật / thông tin cần bổ sung</label>
              <textarea
                rows={4}
                value={statusNote}
                onChange={event => setStatusNote(event.target.value)}
                placeholder="Mô tả tiến độ hoặc ghi rõ nội dung đang thiếu..."
                disabled={currentUser.role === 'sale'}
              />
              {currentUser.role !== 'sale' && (
                <button className="btn btn-primary" onClick={handleUpdateWorkStatus} disabled={isSaving}>
                  {isSaving ? 'Đang lưu...' : 'Lưu tiến độ thiết kế'}
                </button>
              )}
            </aside>
          </section>

          <section className="design-task-panel design-version-workspace">
            <div className="design-version-sidebar">
              <div className="design-version-header">
                <div className="design-section-title">
                  <FileArchive size={17} />
                  <span>Phiên bản thiết kế</span>
                </div>
                {(currentUser.role === 'admin' || currentUser.role === 'designer') && (
                  <button className="btn btn-sm btn-primary" onClick={() => setShowVersionModal(true)}>
                    <Plus size={14} /> Thêm phiên bản
                  </button>
                )}
              </div>
              <div className="design-version-list">
                {selectedDesignVersions.map((version: DesignVersion) => (
                  <button
                    type="button"
                    key={version.versionNumber}
                    className={selectedVersion?.versionNumber === version.versionNumber ? 'is-active' : ''}
                    onClick={() => setSelectedVersionNumber(version.versionNumber)}
                  >
                    <strong>v{version.versionNumber}</strong>
                    <span>{formatDate(version.createdAt)}</span>
                    <small>{version.comment || 'Không có ghi chú'}</small>
                  </button>
                ))}
                {selectedDesignVersions.length === 0 && (
                  <div className="design-version-empty">Chưa có phiên bản thiết kế nào.</div>
                )}
              </div>
            </div>

            <div className="design-version-preview">
              {selectedVersion ? (
                <>
                  <div className="design-version-preview__image">
                    {selectedVersion.previewImage ? (
                      <img src={selectedVersion.previewImage} alt={`Thiết kế v${selectedVersion.versionNumber}`} />
                    ) : (
                      <span>
                        <ImageIcon size={28} />
                        Không có ảnh xem trước
                      </span>
                    )}
                  </div>
                  <div className="design-version-preview__meta">
                    <div>
                      <strong>Phiên bản v{selectedVersion.versionNumber}</strong>
                      <span>{selectedVersion.comment || 'Không có ghi chú'}</span>
                    </div>
                    <div className="design-source-links">
                      {selectedVersion.aiLink && (
                        <a href={selectedVersion.aiLink} target="_blank" rel="noopener noreferrer">
                          File AI
                        </a>
                      )}
                      {selectedVersion.corelLink && (
                        <a href={selectedVersion.corelLink} target="_blank" rel="noopener noreferrer">
                          File Corel
                        </a>
                      )}
                      {!selectedVersion.aiLink && !selectedVersion.corelLink && <span>Chưa có file thiết kế gốc</span>}
                    </div>
                    {selectedVersion.feedbackFromClient && (
                      <p className="design-client-feedback">{selectedVersion.feedbackFromClient}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="design-version-empty design-version-empty--large">
                  <ImageIcon size={30} />
                  Chưa có bản thiết kế để xem trước.
                </div>
              )}

              {(currentUser.role === 'admin' || currentUser.role === 'sale') &&
                selectedDesign?.status === 'client_pending' &&
                selectedVersion && (
                  <div className="design-approval-panel">
                    <strong>Cập nhật phản hồi của khách hàng</strong>
                    <textarea
                      value={feedbackText}
                      onChange={event => setFeedbackText(event.target.value)}
                      placeholder="Nhập nội dung khách hàng yêu cầu sửa..."
                    />
                    <div>
                      <button
                        className="btn btn-success"
                        onClick={() => handleClientFeedback(true)}
                        disabled={isSaving}
                      >
                        <CheckCircle2 size={15} /> Khách đã duyệt
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleClientFeedback(false)}
                        disabled={isSaving}
                      >
                        <XCircle size={15} /> Yêu cầu Designer sửa
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </section>

          <section className="design-task-panel design-history-card">
            <div className="design-section-title">
              <UserRound size={17} />
              <span>Lịch sử xử lý công việc</span>
            </div>
            <div className="design-history-list">
              {[...(selectedRequest.history || [])].reverse().map((entry: DesignRequestHistory, index: number) => (
                <div key={`${entry.updatedAt || 'history'}-${index}`}>
                  <span className="design-history-dot" />
                  <strong>{entry.updatedBy || 'Hệ thống'}</strong>
                  <time>{formatDateTime(entry.updatedAt)}</time>
                  <p>{entry.note || getDesignWorkStatusDefinition(entry.workStatus).label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {showVersionModal && selectedRequest && (
        <div className="modal-overlay design-version-overlay">
          <div className="modal-content design-version-modal">
            <div className="modal-header">
              <span>THÊM PHIÊN BẢN THIẾT KẾ · {selectedRequest.requestCode}</span>
              <button className="btn btn-sm btn-outline" onClick={resetVersionForm}>
                Đóng
              </button>
            </div>
            <form onSubmit={handleAddVersion}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Ảnh xem trước bản thiết kế *</label>
                  <input type="file" accept="image/*" onChange={handlePreviewFile} required />
                  {previewImage && <img className="design-upload-preview" src={previewImage} alt="Ảnh xem trước" />}
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Link file AI</label>
                    <input
                      type="url"
                      value={aiLink}
                      onChange={event => setAiLink(event.target.value)}
                      placeholder="https://drive.google.com/..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Link file Corel</label>
                    <input
                      type="url"
                      value={corelLink}
                      onChange={event => setCorelLink(event.target.value)}
                      placeholder="https://drive.google.com/..."
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Ghi chú phiên bản *</label>
                  <textarea value={versionComment} onChange={event => setVersionComment(event.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={resetVersionForm}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Đang lưu...' : 'Hoàn thành và gửi Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
