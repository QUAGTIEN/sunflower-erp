import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint
} from 'firebase/firestore';
import type { ErpDocument } from '@/shared/types';
import { codeCounterKey, codeMonth, formatDocumentCode, type DocumentCodePrefix } from '@/shared/utils/documentCodes';
import { firebaseAuth, getFirebaseDatabase, isFirebaseRuntimeEnabled, reportFirebaseFailure } from './client';
import {
  deleteLocalDocument,
  initializeLocalStorage,
  normalizeCollectionRecords,
  normalizeCollectionUpdate,
  readLocalCollection,
  readRawLocalCollection,
  subscribeLocalCollection,
  updateLocalDocument,
  upsertLocalDocument
} from '@/infrastructure/local-storage/localCollectionStore';

if (!isFirebaseRuntimeEnabled) {
  initializeLocalStorage();
}

const createDocumentAlreadyExistsError = (existingDocument: unknown) =>
  Object.assign(new Error('Document already exists.'), { code: 'document-already-exists', existingDocument });

interface CollectionSubscriptionOptions {
  onError?: (error: unknown) => void;
  fieldName?: string;
  fieldValue?: unknown;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  maxResults?: number;
}

interface CachedSubscriptionSnapshot {
  userId: string;
  data: ErpDocument[];
}

const subscriptionSnapshotCache = new Map<string, CachedSubscriptionSnapshot>();

const serializeSubscriptionValue = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value ?? '');
  }
};

const getSubscriptionCacheKey = (colName: string, options?: CollectionSubscriptionOptions): string =>
  [
    colName,
    options?.fieldName || '',
    serializeSubscriptionValue(options?.fieldValue),
    options?.orderByField || '',
    options?.orderDirection || '',
    options?.maxResults || ''
  ].join('|');

export const isDocumentAlreadyExistsError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'document-already-exists';

// ----------------------------------------------------
// DB SERVICE WRAPPER (Firestore or Mock DB)
// ----------------------------------------------------
export const dbService = {
  async getRawCollection(colName: string): Promise<ErpDocument[]> {
    const database = await getFirebaseDatabase(`reading raw collection ${colName}`);
    if (database) {
      try {
        const snap = await getDocs(collection(database, colName));
        return snap.docs.map(document => ({ id: document.id, ...document.data() }));
      } catch (error) {
        reportFirebaseFailure(`reading raw collection ${colName}`, error);
        throw error;
      }
    }
    return readRawLocalCollection(colName);
  },

  async getCollection(colName: string): Promise<ErpDocument[]> {
    const database = await getFirebaseDatabase(`reading collection ${colName}`);
    if (database) {
      try {
        const snap = await getDocs(collection(database, colName));
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return normalizeCollectionRecords(colName, data);
      } catch (error) {
        reportFirebaseFailure(`reading collection ${colName}`, error);
        throw error;
      }
    }
    return readLocalCollection(colName);
  },

  async getDocument(colName: string, docId: string): Promise<ErpDocument | null> {
    const database = await getFirebaseDatabase(`reading document ${colName}/${docId}`);
    if (database) {
      try {
        const snap = await getDoc(doc(database, colName, docId));
        if (!snap.exists()) return null;
        return normalizeCollectionRecords(colName, [{ id: snap.id, ...snap.data() }])[0];
      } catch (error) {
        reportFirebaseFailure(`reading document ${colName}/${docId}`, error);
        throw error;
      }
    }
    const list = readLocalCollection(colName);
    return list.find(item => item.id === docId) || null;
  },

  async getCollectionByField(
    colName: string,
    fieldName: string,
    fieldValue: unknown,
    options: { orderByField?: string; direction?: 'asc' | 'desc'; maxResults?: number } = {}
  ): Promise<ErpDocument[]> {
    const database = await getFirebaseDatabase(`querying collection ${colName}`);
    const maxResults = options.maxResults || 250;
    if (database) {
      try {
        const constraints: QueryConstraint[] = [where(fieldName, '==', fieldValue)];
        if (options.orderByField) {
          constraints.push(orderBy(options.orderByField, options.direction || 'desc'));
        }
        constraints.push(limit(maxResults));
        const snap = await getDocs(query(collection(database, colName), ...constraints));
        return normalizeCollectionRecords(
          colName,
          snap.docs.map(item => ({ id: item.id, ...item.data() }))
        );
      } catch (error) {
        reportFirebaseFailure(`querying collection ${colName}`, error);
        throw error;
      }
    }

    const records = readLocalCollection(colName).filter(item => item?.[fieldName] === fieldValue);
    if (options.orderByField) {
      const direction = options.direction === 'asc' ? 1 : -1;
      records.sort(
        (left, right) =>
          String(left?.[options.orderByField!] || '').localeCompare(String(right?.[options.orderByField!] || '')) *
          direction
      );
    }
    return records.slice(0, maxResults);
  },

  async addDocument(colName: string, docData: ErpDocument): Promise<ErpDocument> {
    const docId = docData.id || `${colName.substring(0, 3)}-${Math.random().toString(36).substr(2, 9)}`;
    const finalDoc = normalizeCollectionRecords(colName, [
      {
        ...docData,
        id: docId,
        createdAt: docData.createdAt || new Date().toISOString()
      }
    ])[0];

    const database = await getFirebaseDatabase(`creating document in ${colName}`);
    if (database) {
      try {
        await setDoc(doc(database, colName, docId), finalDoc);
        return finalDoc;
      } catch (error) {
        reportFirebaseFailure(`creating document in ${colName}`, error);
        throw error;
      }
    }

    upsertLocalDocument(colName, finalDoc);
    return finalDoc;
  },

  async addDocumentIfAbsent(colName: string, docId: string, docData: ErpDocument): Promise<ErpDocument> {
    const finalDoc = normalizeCollectionRecords(colName, [
      {
        ...docData,
        id: docId,
        createdAt: docData.createdAt || new Date().toISOString()
      }
    ])[0];

    const database = await getFirebaseDatabase(`creating unique document in ${colName}`);
    if (database) {
      try {
        const documentReference = doc(database, colName, docId);
        await runTransaction(database, async transaction => {
          const existingSnapshot = await transaction.get(documentReference);
          if (existingSnapshot.exists()) {
            throw createDocumentAlreadyExistsError({
              id: existingSnapshot.id,
              ...existingSnapshot.data()
            });
          }
          transaction.set(documentReference, finalDoc);
        });
        return finalDoc;
      } catch (error) {
        if (isDocumentAlreadyExistsError(error)) throw error;
        reportFirebaseFailure(`creating unique document in ${colName}`, error);
        // Unique records must fail closed. Falling back to a local write here
        // could let two Sales register the same business while remote sync is down.
        throw error;
      }
    }

    const existingDocument = readLocalCollection(colName).find(item => item.id === docId);
    if (existingDocument) throw createDocumentAlreadyExistsError(existingDocument);
    upsertLocalDocument(colName, finalDoc);
    return finalDoc;
  },

  /**
   * Issues the next number of a document sequence (`code_counters/{counterKey}`) in a transaction, so two users
   * never receive the same code. A number is never handed out twice, even if the document is not saved afterwards.
   */
  async nextSequence(counterKey: string): Promise<number> {
    const database = await getFirebaseDatabase(`issuing a code from ${counterKey}`);
    if (database) {
      try {
        const counterReference = doc(database, 'code_counters', counterKey);
        return await runTransaction(database, async transaction => {
          const counter = await transaction.get(counterReference);
          const sequence = Number(counter.data()?.sequence || 0) + 1;
          transaction.set(counterReference, { sequence, updatedAt: new Date().toISOString() });
          return sequence;
        });
      } catch (error) {
        // Codes must stay unique, so a failed counter never falls back to a local number.
        reportFirebaseFailure(`issuing a code from ${counterKey}`, error);
        throw error;
      }
    }
    const counter = readLocalCollection('code_counters').find(item => item.id === counterKey);
    const sequence = Number(counter?.sequence || 0) + 1;
    upsertLocalDocument('code_counters', { id: counterKey, sequence, updatedAt: new Date().toISOString() });
    return sequence;
  },

  /** The next D-MA1 code of a prefix this month, e.g. `DH-2610-0007`, from that month's counter. */
  async issueDocumentCode(prefix: DocumentCodePrefix): Promise<string> {
    const month = codeMonth();
    return formatDocumentCode(prefix, month, await this.nextSequence(codeCounterKey(prefix, month)));
  },

  async updateDocument(colName: string, docId: string, updatedFields: ErpDocument): Promise<boolean> {
    const finalUpdatedFields = normalizeCollectionUpdate(colName, {
      ...updatedFields,
      updatedAt: new Date().toISOString()
    });

    const database = await getFirebaseDatabase(`updating document ${colName}/${docId}`);
    if (database) {
      try {
        await updateDoc(doc(database, colName, docId), finalUpdatedFields);
        return true;
      } catch (error) {
        reportFirebaseFailure(`updating document ${colName}/${docId}`, error);
        throw error;
      }
    }

    return updateLocalDocument(colName, docId, finalUpdatedFields);
  },

  async synchronizeDocumentFields(colName: string, docId: string, fields: Record<string, unknown>): Promise<boolean> {
    const database = await getFirebaseDatabase(`synchronizing document ${colName}/${docId}`);
    if (database) {
      try {
        await updateDoc(doc(database, colName, docId), fields);
        return true;
      } catch (error) {
        reportFirebaseFailure(`synchronizing document ${colName}/${docId}`, error);
        throw error;
      }
    }
    return updateLocalDocument(colName, docId, fields);
  },

  async deleteDocument(colName: string, docId: string): Promise<boolean> {
    const database = await getFirebaseDatabase(`deleting document ${colName}/${docId}`);
    if (database) {
      try {
        await deleteDoc(doc(database, colName, docId));
        return true;
      } catch (error) {
        reportFirebaseFailure(`deleting document ${colName}/${docId}`, error);
        throw error;
      }
    }

    return deleteLocalDocument(colName, docId);
  },

  subscribeCollection(
    colName: string,
    callback: (data: ErpDocument[]) => void,
    options?: CollectionSubscriptionOptions
  ): () => void {
    if (isFirebaseRuntimeEnabled) {
      const cacheKey = getSubscriptionCacheKey(colName, options);
      const currentUserId = firebaseAuth?.currentUser?.uid || '';
      const cachedSnapshot = subscriptionSnapshotCache.get(cacheKey);
      let deliveredCachedSnapshot = false;
      if (currentUserId && cachedSnapshot?.userId === currentUserId) {
        deliveredCachedSnapshot = true;
        callback(cachedSnapshot.data);
      }

      let active = true;
      let unsubscribeRemote: (() => void) | null = null;

      void (async () => {
        try {
          const database = await getFirebaseDatabase(`subscribing to ${colName}`);
          if (!database || !active) return;

          const constraints: QueryConstraint[] = [];
          if (options?.fieldName) {
            constraints.push(where(options.fieldName, '==', options.fieldValue));
          }
          if (options?.orderByField) {
            constraints.push(orderBy(options.orderByField, options.orderDirection || 'asc'));
          }
          if (options?.maxResults && options.maxResults > 0) {
            constraints.push(limit(options.maxResults));
          }
          const collectionQuery =
            constraints.length > 0
              ? query(collection(database, colName), ...constraints)
              : collection(database, colName);

          unsubscribeRemote = onSnapshot(
            collectionQuery,
            snapshot => {
              if (!active) return;
              const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              const normalizedData = normalizeCollectionRecords(colName, data);
              const snapshotUserId = firebaseAuth?.currentUser?.uid || '';
              if (snapshotUserId) {
                subscriptionSnapshotCache.set(cacheKey, {
                  userId: snapshotUserId,
                  data: normalizedData
                });
              }
              callback(normalizedData);
            },
            error => {
              if (!active) return;
              reportFirebaseFailure(`subscribing to ${colName}`, error);
              if (options?.onError) options.onError(error);
              else if (!deliveredCachedSnapshot) callback([]);
            }
          );
        } catch (error) {
          if (!active) return;
          reportFirebaseFailure(`subscribing to ${colName}`, error);
          if (options?.onError) options.onError(error);
          else if (!deliveredCachedSnapshot) callback([]);
        }
      })();

      return () => {
        active = false;
        unsubscribeRemote?.();
      };
    }

    return subscribeLocalCollection(colName, callback);
  }
};
