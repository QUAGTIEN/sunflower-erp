import { X } from 'lucide-react';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import { LoadingStatus } from '@/components/LoadingStates';
import {
  getDesignApprovalStatusDefinition,
  getDesignWorkStatusDefinition
} from '@/features/design/model/designWorkflow';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { OrderLine } from './OrderItemsTable';

export type LineNoteField = 'saleNotes' | 'designNotes';
export type LineFileField = 'saleLayouts' | 'designLayouts';

interface OrderDesignPanelProps {
  poId: string;
  items: OrderLine[];
  canEditSaleBrief: boolean;
  canEditDesignReply: boolean;
  onUpdateNotes: (itemIndex: number, field: LineNoteField, value: string) => void;
  onUploadFiles: (itemIndex: number, field: LineFileField, files: FileList | null) => void;
  onRemoveFile: (itemIndex: number, field: LineFileField, fileIndex: number) => void;
  onPreviewImage: (image: string) => void;
}

const MESSAGES = {
  readError: 'Không tải được yêu cầu thiết kế. Vui lòng thử lại.',
  unavailable: 'Yêu cầu thiết kế chỉ xem được khi kết nối Firebase.'
};

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');
const filesOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((file): file is string => typeof file === 'string' && file !== '') : [];

function LineFiles({
  files,
  canEdit,
  label,
  onRemove,
  onPreviewImage
}: {
  files: string[];
  canEdit: boolean;
  label: string;
  onRemove: (fileIndex: number) => void;
  onPreviewImage: (image: string) => void;
}) {
  if (!files.length) return <span className="order-muted">Chưa có tệp</span>;
  return (
    <div className="order-file-grid">
      {files.map((file, fileIndex) => (
        <span key={`${fileIndex}-${file.slice(-16)}`} className="order-file-tile">
          <button type="button" aria-label={`Xem ${label} ${fileIndex + 1}`} onClick={() => onPreviewImage(file)}>
            <img src={file} alt="" />
          </button>
          {canEdit && (
            <button
              type="button"
              className="order-file-tile__remove"
              aria-label={`Xóa ${label} ${fileIndex + 1}`}
              title="Xóa tệp"
              onClick={() => onRemove(fileIndex)}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/** Design requests of the order, then each line's brief from Sale and the designer's reply and files. */
export function OrderDesignPanel({
  poId,
  items,
  canEditSaleBrief,
  canEditDesignReply,
  onUpdateNotes,
  onUploadFiles,
  onRemoveFile,
  onPreviewImage
}: OrderDesignPanelProps) {
  const queries: LiveQuery<'requests'>[] = [
    { name: 'requests', collection: 'design_requests', filter: { fieldName: 'poId', fieldValue: poId } }
  ];
  const live = useLiveCollections(queries, MESSAGES);
  const requests = (live.snapshots?.requests || []).filter(request => request.archived !== true);

  return (
    <div className="order-panel-stack">
      <section className="order-subsection">
        <h3>Yêu cầu thiết kế</h3>
        <LoadingStatus loading={live.loading} hasData={Boolean(live.snapshots)} label="Đang tải yêu cầu thiết kế" />
        {live.error && !live.loading && <p className="order-error">{live.error}</p>}
        {live.snapshots && (
          <div className="table-container">
            <table className="order-plain-table">
              <thead>
                <tr>
                  <th>Mã yêu cầu</th>
                  <th>Mặt hàng</th>
                  <th>Tiến độ thiết kế</th>
                  <th>Duyệt mẫu</th>
                  <th>Hạn</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(request => {
                  const work = getDesignWorkStatusDefinition(request.workStatus);
                  const approval = getDesignApprovalStatusDefinition(request.approvalStatus);
                  return (
                    <tr key={request.id}>
                      <td>
                        <strong>{textOf(request.requestCode) || request.id}</strong>
                      </td>
                      <td title={textOf(request.productName)}>
                        {[textOf(request.productCode), textOf(request.productName)].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>
                        <span className="erp-status-text" style={{ color: work.color }}>
                          {work.label}
                        </span>
                      </td>
                      <td>
                        <span className="erp-status-text" style={{ color: approval.color }}>
                          {approval.label}
                        </span>
                      </td>
                      <td>{formatDate(request.dueDate, 'vi-VN', '—')}</td>
                    </tr>
                  );
                })}
                {!requests.length && (
                  <tr>
                    <td className="order-empty" colSpan={5}>
                      Đơn hàng chưa có yêu cầu thiết kế.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {items.map((item, index) => (
        <section key={item.itemId || index} className="order-subsection order-line-brief">
          <h3>
            {index + 1}. {item.productCode || 'Mặt hàng'}
            {item.productName ? ` · ${item.productName}` : ''}
          </h3>
          <div className="order-line-brief__columns">
            <div className="order-line-brief__column">
              <h4>Yêu cầu của Sale</h4>
              <label htmlFor={`sale-notes-${index}`}>Ghi chú yêu cầu thiết kế</label>
              {canEditSaleBrief ? (
                <textarea
                  id={`sale-notes-${index}`}
                  value={textOf(item.saleNotes)}
                  onChange={event => onUpdateNotes(index, 'saleNotes', event.target.value)}
                  placeholder="Nhập ghi chú yêu cầu thiết kế…"
                />
              ) : (
                <p className="order-readonly-text">{textOf(item.saleNotes) || 'Không có ghi chú'}</p>
              )}
              <span className="order-field-label">Layout Sale tải lên</span>
              {canEditSaleBrief && (
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  aria-label="Tải layout của Sale"
                  onChange={event => onUploadFiles(index, 'saleLayouts', event.target.files)}
                />
              )}
              <LineFiles
                files={filesOf(item.saleLayouts)}
                canEdit={canEditSaleBrief}
                label="layout Sale"
                onRemove={fileIndex => onRemoveFile(index, 'saleLayouts', fileIndex)}
                onPreviewImage={onPreviewImage}
              />
            </div>
            <div className="order-line-brief__column">
              <h4>Phản hồi của Thiết kế</h4>
              <label htmlFor={`design-notes-${index}`}>Ghi chú thiết kế</label>
              {canEditDesignReply ? (
                <textarea
                  id={`design-notes-${index}`}
                  value={textOf(item.designNotes)}
                  onChange={event => onUpdateNotes(index, 'designNotes', event.target.value)}
                  placeholder="Nhập phản hồi của bộ phận thiết kế…"
                />
              ) : (
                <p className="order-readonly-text">{textOf(item.designNotes) || 'Chưa có phản hồi thiết kế'}</p>
              )}
              <span className="order-field-label">File thiết kế hoàn thiện</span>
              {canEditDesignReply && (
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  aria-label="Tải file thiết kế hoàn thiện"
                  onChange={event => onUploadFiles(index, 'designLayouts', event.target.files)}
                />
              )}
              <LineFiles
                files={filesOf(item.designLayouts)}
                canEdit={canEditDesignReply}
                label="file thiết kế"
                onRemove={fileIndex => onRemoveFile(index, 'designLayouts', fileIndex)}
                onPreviewImage={onPreviewImage}
              />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
