import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { getPOHistoryStatusLabel } from '../../model/poWorkflow';
import {
  actorLabel,
  lineCost,
  type ChecklistTask,
  type OrderHistoryLog,
  type OrderLine
} from '../../model/orderDetail';

export type LineNoteField = 'saleNotes' | 'designNotes';
export type LineFileField = 'saleLayouts' | 'designLayouts';

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');
const filesOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((file): file is string => typeof file === 'string' && file !== '') : [];
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
const lineTitle = (item: OrderLine, index: number) =>
  [`${index + 1}. ${item.productCode || 'Mặt hàng'}`, item.productName].filter(Boolean).join(' · ');

/** Collapsible block of the order form's left column; same card and trigger as "Tệp đơn hàng & thiết kế". */
function OrderSideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <section className="po-attachments-card">
      <button
        type="button"
        className="po-collapse-trigger"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setIsOpen(current => !current)}
      >
        <span>{title}</span>
        <span className="po-section-action">{isOpen ? 'Thu gọn' : 'Mở rộng'}</span>
      </button>
      {isOpen && (
        <div id={id} className="po-attachment-content order-side-section">
          {children}
        </div>
      )}
    </section>
  );
}

export function OrderCostSection({
  items,
  supplierNames
}: {
  items: OrderLine[];
  supplierNames: Record<string, string>;
}) {
  const totalProfit = items.reduce((sum, item) => sum + lineCost(item).profit, 0);
  return (
    <OrderSideSection id="order-cost-section" title="Giá vốn & lợi nhuận">
      {items.map((item, index) => {
        const cost = lineCost(item);
        const supplier = item.supplierName || supplierNames[textOf(item.supplierId)] || '';
        return (
          <div key={item.itemId || index} className="order-side-entry">
            <strong title={lineTitle(item, index)}>{lineTitle(item, index)}</strong>
            <dl className="order-side-values">
              <dt>Nhà cung cấp</dt>
              <dd title={supplier}>{supplier || 'Chưa phân bổ'}</dd>
              <dt>Đơn giá mua</dt>
              <dd>{money(cost.purchasePrice)}</dd>
              <dt>Thành tiền mua</dt>
              <dd>{money(cost.buyingTotal)}</dd>
              <dt>Lợi nhuận gộp</dt>
              <dd className={cost.profit < 0 ? 'is-negative' : undefined}>{money(cost.profit)}</dd>
            </dl>
          </div>
        );
      })}
      <dl className="order-side-values order-side-values--total">
        <dt>Tổng lợi nhuận gộp</dt>
        <dd className={totalProfit < 0 ? 'is-negative' : undefined}>{money(totalProfit)}</dd>
      </dl>
    </OrderSideSection>
  );
}

/** A note is saved when the field loses focus, so typing does not write the order on every key. */
function LineNoteField({
  id,
  label,
  value,
  placeholder,
  canEdit,
  emptyText,
  onSave
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  canEdit: boolean;
  emptyText: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="order-side-field">
      <label htmlFor={id}>{label}</label>
      {canEdit ? (
        <textarea
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
        />
      ) : (
        <p id={id} className="order-readonly-text">
          {value || emptyText}
        </p>
      )}
    </div>
  );
}

function LineFiles({
  label,
  files,
  canEdit,
  onUpload,
  onRemove,
  onPreviewImage
}: {
  label: string;
  files: string[];
  canEdit: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (fileIndex: number) => void;
  onPreviewImage: (image: string) => void;
}) {
  return (
    <div className="order-side-field">
      <span className="order-side-field__label">{label}</span>
      {canEdit && (
        <input
          type="file"
          multiple
          accept="image/*"
          aria-label={`Tải ${label.toLowerCase()}`}
          onChange={event => onUpload(event.target.files)}
        />
      )}
      {files.length ? (
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
      ) : (
        <span className="order-muted">Chưa có tệp</span>
      )}
    </div>
  );
}

interface OrderDesignNotesSectionProps {
  items: OrderLine[];
  canEditSaleBrief: boolean;
  canEditDesignReply: boolean;
  onUpdateNotes: (itemIndex: number, field: LineNoteField, value: string) => void;
  onUploadFiles: (itemIndex: number, field: LineFileField, files: FileList | null) => void;
  onRemoveFile: (itemIndex: number, field: LineFileField, fileIndex: number) => void;
  onPreviewImage: (image: string) => void;
}

/** Each line's brief from Sale and the designer's reply with their layout files. */
export function OrderDesignNotesSection({
  items,
  canEditSaleBrief,
  canEditDesignReply,
  onUpdateNotes,
  onUploadFiles,
  onRemoveFile,
  onPreviewImage
}: OrderDesignNotesSectionProps) {
  return (
    <OrderSideSection id="order-design-notes-section" title="Ghi chú thiết kế">
      {items.map((item, index) => (
        <div key={item.itemId || index} className="order-side-entry">
          <strong title={lineTitle(item, index)}>{lineTitle(item, index)}</strong>
          <LineNoteField
            key={`saleNotes-${textOf(item.saleNotes)}`}
            id={`sale-notes-${index}`}
            label="Yêu cầu của Sale"
            value={textOf(item.saleNotes)}
            placeholder="Nhập ghi chú yêu cầu thiết kế…"
            canEdit={canEditSaleBrief}
            emptyText="Không có ghi chú"
            onSave={value => onUpdateNotes(index, 'saleNotes', value)}
          />
          <LineFiles
            label="Layout Sale"
            files={filesOf(item.saleLayouts)}
            canEdit={canEditSaleBrief}
            onUpload={files => onUploadFiles(index, 'saleLayouts', files)}
            onRemove={fileIndex => onRemoveFile(index, 'saleLayouts', fileIndex)}
            onPreviewImage={onPreviewImage}
          />
          <LineNoteField
            key={`designNotes-${textOf(item.designNotes)}`}
            id={`design-notes-${index}`}
            label="Phản hồi của Thiết kế"
            value={textOf(item.designNotes)}
            placeholder="Nhập phản hồi của bộ phận thiết kế…"
            canEdit={canEditDesignReply}
            emptyText="Chưa có phản hồi thiết kế"
            onSave={value => onUpdateNotes(index, 'designNotes', value)}
          />
          <LineFiles
            label="File thiết kế hoàn thiện"
            files={filesOf(item.designLayouts)}
            canEdit={canEditDesignReply}
            onUpload={files => onUploadFiles(index, 'designLayouts', files)}
            onRemove={fileIndex => onRemoveFile(index, 'designLayouts', fileIndex)}
            onPreviewImage={onPreviewImage}
          />
        </div>
      ))}
    </OrderSideSection>
  );
}

interface OrderNotesSectionProps {
  tasks: ChecklistTask[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}

export function OrderNotesSection({ tasks, draft, onDraftChange, onAdd, onToggle, onRemove }: OrderNotesSectionProps) {
  return (
    <OrderSideSection id="order-notes-section" title="Trao đổi nội bộ">
      <div className="order-note-composer">
        <label htmlFor="order-note-input" className="order-visually-hidden">
          Phản hồi nội bộ
        </label>
        <input
          id="order-note-input"
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') onAdd();
          }}
          placeholder="Thêm phản hồi hoặc tiến độ…"
        />
        <button type="button" className="btn btn-primary" onClick={onAdd} disabled={!draft.trim()}>
          Thêm
        </button>
      </div>
      {tasks.length ? (
        <ul className="order-checklist">
          {tasks.map(task => (
            <li key={task.id} className={task.completed ? 'is-done' : undefined}>
              <label title={task.content}>
                <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
                <span>{task.content}</span>
              </label>
              <span className="order-muted">{actorLabel(task.updatedBy).split(' (')[0]}</span>
              <button
                type="button"
                className="order-icon-link"
                aria-label={`Xóa phản hồi ${task.content}`}
                title="Xóa"
                onClick={() => onRemove(task.id)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="order-muted">Chưa có phản hồi nội bộ.</p>
      )}
    </OrderSideSection>
  );
}

interface OrderHistorySectionProps {
  logs: OrderHistoryLog[];
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export function OrderHistorySection({ logs, createdBy, createdAt, updatedBy, updatedAt }: OrderHistorySectionProps) {
  return (
    <OrderSideSection id="order-history-section" title="Lịch sử trạng thái">
      {logs.length ? (
        <ol className="order-history">
          {[...logs].reverse().map((log, index) => (
            <li key={`${log.updatedAt}-${index}`}>
              <strong>{getPOHistoryStatusLabel(log.status)}</strong>
              <span className="order-muted">
                {formatDateTime(log.updatedAt, 'vi-VN')} · {actorLabel(log.updatedBy) || 'Không rõ người thực hiện'}
              </span>
              {log.note && <span>{log.note}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="order-muted">Chưa có lịch sử.</p>
      )}
      <dl className="order-side-values order-side-values--audit">
        <dt>Tạo bởi</dt>
        <dd>
          {actorLabel(createdBy) || 'Không rõ'}
          {createdAt ? ` · ${formatDateTime(createdAt, 'vi-VN')}` : ''}
        </dd>
        <dt>Cập nhật bởi</dt>
        <dd>
          {updatedBy ? actorLabel(updatedBy) : 'Chưa có'}
          {updatedBy && updatedAt ? ` · ${formatDateTime(updatedAt, 'vi-VN')}` : ''}
        </dd>
      </dl>
    </OrderSideSection>
  );
}
