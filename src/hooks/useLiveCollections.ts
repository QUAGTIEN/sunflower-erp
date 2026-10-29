import { useEffect, useMemo, useState } from 'react';
import { dbService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';

export type LiveDocument = Record<string, unknown> & { id: string };
export interface LiveQuery<Name extends string> {
  name: Name;
  collection: string;
  /** Required when firestore.rules only let the viewer read documents matching this field. */
  filter?: { fieldName: string; fieldValue: string };
}
interface Received {
  answeredQuery: string;
  rows: LiveDocument[];
}

const queryIdentity = (query: LiveQuery<string>, round: number) => `${round}:${JSON.stringify(query)}`;

/**
 * Subscribes to several Firestore collections and reports them only once every one has answered the
 * current queries, so a page never mixes a new month or filter with rows from the previous one.
 * Cached snapshots arrive at once; there is no local-storage fallback when Firebase is unavailable.
 */
export function useLiveCollections<Name extends string>(
  queries: LiveQuery<Name>[],
  messages: { readError: string; unavailable: string }
) {
  const [received, setReceived] = useState<Partial<Record<Name, Received>>>({});
  const [failure, setFailure] = useState('');
  const [round, setRound] = useState(0);
  // Callers may rebuild the query list on every render; its serialized form decides when to resubscribe.
  const queriesKey = JSON.stringify(queries);

  useEffect(() => {
    if (!isFirebaseRuntimeEnabled) return;
    const current = JSON.parse(queriesKey) as LiveQuery<Name>[];
    const stops = current.map(query =>
      dbService.subscribeCollection(
        query.collection,
        rows => {
          const answer = { answeredQuery: queryIdentity(query, round), rows: rows as LiveDocument[] };
          setReceived(previous => ({ ...previous, [query.name]: answer }));
        },
        { ...query.filter, onError: () => setFailure(messages.readError) }
      )
    );
    return () => stops.forEach(stop => stop());
  }, [queriesKey, round, messages.readError]);

  const snapshots = useMemo(() => {
    const rows = {} as Record<Name, LiveDocument[]>;
    for (const query of JSON.parse(queriesKey) as LiveQuery<Name>[]) {
      const answer = received[query.name];
      if (answer?.answeredQuery !== queryIdentity(query, round)) return null;
      rows[query.name] = answer.rows;
    }
    return rows;
  }, [queriesKey, round, received]);

  return {
    snapshots,
    loading: isFirebaseRuntimeEnabled && !snapshots && !failure,
    error: isFirebaseRuntimeEnabled ? failure : messages.unavailable,
    reload: () => {
      setFailure('');
      setRound(value => value + 1);
    }
  };
}
