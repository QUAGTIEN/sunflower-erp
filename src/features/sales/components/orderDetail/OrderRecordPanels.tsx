import { X } from 'lucide-react';
import { getPOHistoryStatusLabel } from '../../model/poWorkflow';
import { ORDER_ATTACHMENT_LABELS, actorLabel, lineImages, type OrderHistoryLog } from '../../model/orderDetail';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import type { OrderLine } from './OrderItemsTable';

export function OrderFilesPanel({
  poCode,
  links,
  items,
  onPreviewImage
}: {
  poCode: string;
  links: Record<string, unknown>;
  items: OrderLine[];
  onPreviewImage: (image: string) => void;
}) {
  const attachments = Object.entries(links).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
  );
  const images = Array.from(new Set(items.flatMap(lineImages)));
  return (
    <div className="order-files">
      <section className="order-subsection">
        <h3>Tài liệu đính kèm</h3>
        {attachments.length ? (
          <ul className="order-attachments">
            {attachments.map(([key, value]) => {
              const label = ORDER_ATTACHMENT_LABELS[key] || key;
              const isImage = value.startsWith('data:image/');
              return (
                <li key={key}>
                  <span className="order-attachments__name" title={label}>
                    {label}
                  </span>
                  {isImage && (
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => onPreviewImage(value)}>
                      Xem
                    </button>
                  )}
                  <a className="btn btn-sm btn-outline" href={value} download={`${label}_${poCode}`}>
                    Tải về
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="order-muted">Chưa có tài liệu đính kèm.</p>
        )}
      </section>
      <section className="order-subsection">
        <h3>Ảnh nhãn mẫu</h3>
        {images.length ? (
          <div className="order-file-grid">
            {images.map((image, index) => (
              <span key={`${index}-${image.slice(-16)}`} className="order-file-tile">
                <button
                  type="button"
                  aria-label={`Xem ảnh nhãn mẫu ${index + 1}`}
                  onClick={() => onPreviewImage(image)}
                >
                  <img src={image} alt="" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="order-muted">Chưa có ảnh nhãn mẫu.</p>
        )}
      </section>
    </div>
  );
}

export interface ChecklistTask {
  id: string;
  content: string;
  completed: boolean;
  updatedBy?: string;
}

export function OrderNotesPanel({
  tasks,
  draft,
  onDraftChange,
  onAdd,
  onToggle,
  onRemove
}: {
  tasks: ChecklistTask[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  return (
    <div className="order-panel-stack">
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
          placeholder="Thêm phản hồi hoặc tiến độ nội bộ…"
        />
        <button type="button" className="btn btn-primary" onClick={onAdd} disabled={!draft.trim()}>
          Thêm
        </button>
      </div>
      {tasks.length ? (
        <ul className="order-checklist">
          {tasks.map(task => (
            <li key={task.id} className={task.completed ? 'is-done' : undefined}>
              <label>
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
    </div>
  );
}

export function OrderHistoryPanel({ logs }: { logs: OrderHistoryLog[] }) {
  return (
    <div className="order-panel-stack">
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
    </div>
  );
}
