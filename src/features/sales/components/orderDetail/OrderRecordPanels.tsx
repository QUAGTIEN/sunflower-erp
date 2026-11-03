import { X } from 'lucide-react';
import { getPOHistoryStatusLabel } from '../../model/poWorkflow';
import { actorLabel, type OrderHistoryLog } from '../../model/orderDetail';
import { formatDateTime } from '@/shared/utils/dateFormatting';

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
