import { useEffect, useMemo, useState } from 'react';
import { Clock3, Search, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService, isImportantAuditEvent, type AuditEvent, type UserPresence } from '@/services/auditService';
import type { UserProfile } from '@/shared/types';
import { formatDateTime } from '@/shared/utils/dateFormatting';

type ActivityPeriod = 'today' | '7d' | '30d' | 'all' | 'custom';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface AccountActivityDialogProps {
  account: UserProfile;
  onClose: () => void;
}

const periodStart = (period: ActivityPeriod, from: string) => {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === '7d') return new Date(now.getTime() - 7 * DAY_IN_MS);
  if (period === '30d') return new Date(now.getTime() - 30 * DAY_IN_MS);
  if (period === 'custom' && from) return new Date(`${from}T00:00:00`);
  return undefined;
};

const eventText = (event: AuditEvent) =>
  [
    event.summary,
    event.action,
    event.module,
    event.targetLabel,
    ...(event.changes || []).map(change => `${change.label} ${change.before || ''} ${change.after || ''}`)
  ]
    .join(' ')
    .toLocaleLowerCase('vi-VN');

/** Sign-ins and important actions of one account; mount it with `key={account.uid}` so each account loads fresh. */
export function AccountActivityDialog({ account, onClose }: AccountActivityDialogProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [presence, setPresence] = useState<UserPresence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<ActivityPeriod>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let current = true;
    Promise.all([
      auditService.getUserEvents(account.uid),
      dbService.getDocument('user_presence', account.uid) as Promise<UserPresence | null>
    ])
      .then(([loadedEvents, loadedPresence]) => {
        if (!current) return;
        setEvents(loadedEvents.filter(isImportantAuditEvent));
        setPresence(loadedPresence);
      })
      .catch(() => current && setError('Không thể tải lịch sử. Vui lòng thử lại.'))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [account.uid]);

  const visibleEvents = useMemo(() => {
    const start = periodStart(period, from);
    const end = period === 'custom' && to ? new Date(`${to}T23:59:59.999`) : undefined;
    const keyword = query.trim().toLocaleLowerCase('vi-VN');
    return events.filter(event => {
      const occurredAt = new Date(event.occurredAt);
      if (start && occurredAt < start) return false;
      if (end && occurredAt > end) return false;
      return !keyword || eventText(event).includes(keyword);
    });
  }, [events, from, period, query, to]);

  const eventsByDay = useMemo(
    () =>
      visibleEvents.reduce<Record<string, AuditEvent[]>>((groups, event) => {
        const day = new Date(event.occurredAt).toLocaleDateString('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        (groups[day] ||= []).push(event);
        return groups;
      }, {}),
    [visibleEvents]
  );
  const online = presence?.status === 'online';

  return (
    <div className="modal-overlay">
      <div className="modal-content user-activity-modal" role="dialog" aria-label="Lịch sử đăng nhập và thao tác">
        <div className="modal-header">
          <div className="account-activity-heading">
            <span className="account-dialog-title">Lịch sử đăng nhập và thao tác</span>
            <span className="user-activity-modal__subtitle" title={`${account.displayName} · ${account.email}`}>
              {account.displayName} · {account.email}
            </span>
          </div>
          <IconButton label="Đóng" icon={<X size={16} />} onClick={onClose} />
        </div>
        <div className="modal-body user-activity-modal__body">
          <section className="user-activity-summary">
            <div>
              <span className={`user-activity-status user-activity-status--${online ? 'online' : 'offline'}`}>
                {online ? 'Đang trực tuyến' : 'Không trực tuyến'}
              </span>
              <p>
                {presence?.lastSeenAt
                  ? `Hoạt động gần nhất: ${formatDateTime(presence.lastSeenAt, 'vi-VN', 'Chưa có dữ liệu')}`
                  : 'Chưa ghi nhận phiên đăng nhập.'}
              </p>
            </div>
            <div>
              <strong>{visibleEvents.length}</strong>
              <span> sự kiện phù hợp</span>
            </div>
          </section>

          <section className="user-activity-filters">
            <div className="user-activity-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Tìm trong lịch sử"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Tìm thao tác, khách hàng, chứng từ…"
              />
            </div>
            <select
              aria-label="Khoảng thời gian"
              value={period}
              onChange={event => setPeriod(event.target.value as ActivityPeriod)}
            >
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày gần đây</option>
              <option value="30d">30 ngày gần đây</option>
              <option value="all">Tất cả (tối đa 250)</option>
              <option value="custom">Tùy chọn khoảng thời gian</option>
            </select>
            {period === 'custom' && (
              <>
                <input type="date" aria-label="Từ ngày" value={from} onChange={event => setFrom(event.target.value)} />
                <input type="date" aria-label="Đến ngày" value={to} onChange={event => setTo(event.target.value)} />
              </>
            )}
          </section>

          {loading ? (
            <div className="user-activity-empty">Đang tải lịch sử...</div>
          ) : error ? (
            <div className="user-activity-empty user-activity-empty--error">{error}</div>
          ) : Object.keys(eventsByDay).length === 0 ? (
            <div className="user-activity-empty">
              <Clock3 size={20} /> Chưa có đăng nhập hoặc thao tác quan trọng trong khoảng thời gian này.
            </div>
          ) : (
            <div className="user-activity-timeline">
              {Object.entries(eventsByDay).map(([day, dayEvents]) => (
                <section key={day} className="user-activity-day">
                  <h3>{day}</h3>
                  {dayEvents.map(event => (
                    <article key={event.id} className="user-activity-event">
                      <time>
                        {new Date(event.occurredAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </time>
                      <div>
                        <strong>{event.summary}</strong>
                        {event.targetLabel && <span className="user-activity-event__target">{event.targetLabel}</span>}
                        {(event.changes || []).map(change => (
                          <p key={change.field}>
                            {change.label}: <b>{change.before || '—'}</b> → <b>{change.after || '—'}</b>
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
