import { dbService, type UserProfile } from './firebaseService';

export type AuditCategory = 'session' | 'navigation' | 'business' | 'administration';
export type AuditModule =
  | 'authentication'
  | 'account'
  | 'lead_candidates'
  | 'leads'
  | 'crm'
  | 'system';

export interface AuditChange {
  field: string;
  label: string;
  before?: string;
  after?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserProfile['role'];
  sessionId: string;
  category: AuditCategory;
  module: AuditModule;
  action: string;
  summary: string;
  occurredAt: string;
  createdAt: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  changes?: AuditChange[];
  pageId?: string;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  role: UserProfile['role'];
  status: 'online' | 'offline';
  sessionId: string;
  lastSeenAt: string;
  sessionStartedAt?: string;
  lastPageId?: string;
  updatedAt: string;
}

const SESSION_STORAGE_KEY = 'sunflower_audit_session_id';
const MAX_AUDIT_EVENTS = 250;

const newIdentifier = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getSessionId = (): string => {
  const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = newIdentifier('session');
  sessionStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
};

const toEvent = (
  actor: UserProfile,
  input: Omit<AuditEvent, 'id' | 'actorId' | 'actorName' | 'actorRole' | 'sessionId' | 'occurredAt' | 'createdAt'>
): AuditEvent => {
  const now = new Date().toISOString();
  return {
    id: newIdentifier('audit'),
    actorId: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    sessionId: getSessionId(),
    occurredAt: now,
    createdAt: now,
    ...input
  };
};

const logFailure = (context: string, error: unknown) => {
  // Monitoring must never interrupt the business action that produced it.
  console.warn(`[Audit] ${context} was not recorded.`, error);
};

export const auditService = {
  async record(
    actor: UserProfile,
    input: Omit<AuditEvent, 'id' | 'actorId' | 'actorName' | 'actorRole' | 'sessionId' | 'occurredAt' | 'createdAt'>
  ): Promise<void> {
    await dbService.addDocument('audit_events', toEvent(actor, input));
  },

  recordSafely(
    actor: UserProfile,
    input: Omit<AuditEvent, 'id' | 'actorId' | 'actorName' | 'actorRole' | 'sessionId' | 'occurredAt' | 'createdAt'>
  ): void {
    void this.record(actor, input).catch(error => logFailure(input.action, error));
  },

  async updatePresence(
    actor: UserProfile,
    status: UserPresence['status'],
    pageId = ''
  ): Promise<void> {
    const now = new Date().toISOString();
    const previous = await dbService.getDocument('user_presence', actor.uid) as UserPresence | null;
    const nextPresence: UserPresence = {
      userId: actor.uid,
      displayName: actor.displayName,
      role: actor.role,
      status,
      sessionId: getSessionId(),
      lastSeenAt: now,
      sessionStartedAt: previous?.sessionId === getSessionId() ? previous.sessionStartedAt || now : now,
      lastPageId: pageId || previous?.lastPageId || '',
      updatedAt: now
    };
    if (previous) {
      await dbService.updateDocument('user_presence', actor.uid, nextPresence);
    } else {
      await dbService.addDocumentIfAbsent('user_presence', actor.uid, { id: actor.uid, ...nextPresence });
    }
  },

  updatePresenceSafely(actor: UserProfile, status: UserPresence['status'], pageId = ''): void {
    void this.updatePresence(actor, status, pageId).catch(error => logFailure('presence', error));
  },

  recordNavigation(actor: UserProfile, pageId: string, pageLabel: string): void {
    this.recordSafely(actor, {
      category: 'navigation',
      module: 'system',
      action: 'page_opened',
      summary: `Mở màn hình ${pageLabel}`,
      targetType: 'page',
      targetId: pageId,
      targetLabel: pageLabel,
      pageId
    });
    this.updatePresenceSafely(actor, 'online', pageId);
  },

  async getUserEvents(userId: string): Promise<AuditEvent[]> {
    return dbService.getCollectionByField('audit_events', 'actorId', userId, {
      orderByField: 'occurredAt',
      direction: 'desc',
      maxResults: MAX_AUDIT_EVENTS
    }) as Promise<AuditEvent[]>;
  }
};
