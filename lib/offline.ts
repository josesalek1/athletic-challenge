import type { SupabaseClient } from '@supabase/supabase-js';
import type { Payload } from './types';

const DB_NAME = 'athletic-challenge';
const DB_VERSION = 1;
const STORE = 'mutations';
const LEGACY_QUEUE_KEY = 'athletic-challenge:offline-queue:v1';
export const OFFLINE_EVENT = 'athletic:offline-change';

type MutationState = 'pending' | 'syncing' | 'error';
type MutationMeta = {
  id: string;
  user_id: string;
  queued_at: string;
  updated_at: string;
  status: MutationState;
  attempts: number;
  last_error?: string;
};

export type OfflineMutation = MutationMeta & (
  | { type: 'entry'; day: string; challenge_id: string; payload: Payload }
  | { type: 'training_set'; day: string; slot: string; exercise_key: string; set_index: number; weight_kg: number | null; reps: number | null; seconds: number | null }
  | { type: 'training_session'; day: string; slot: string; done: boolean }
  | { type: 'swim_session'; day: string; distance_m: number | null; duration_s: number | null; stroke: string | null; rpe: number | null; notes: string | null }
);

type NewMutation = Omit<OfflineMutation, keyof MutationMeta> & Pick<MutationMeta, 'id' | 'user_id'>;

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available.');
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    const store = database.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex('user_id', 'user_id');
    store.createIndex('status', 'status');
  };
  const database = await requestResult(request);
  await migrateLegacyQueue(database);
  return database;
}

async function migrateLegacyQueue(database: IDBDatabase) {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(LEGACY_QUEUE_KEY);
  if (!raw) return;
  try {
    const legacy = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (Array.isArray(legacy) && legacy.length) {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      for (const item of legacy) {
        const queuedAt = typeof item.queued_at === 'string' ? item.queued_at : new Date().toISOString();
        store.put({ ...item, status: 'pending', attempts: 0, queued_at: queuedAt, updated_at: queuedAt });
      }
      await transactionDone(transaction);
    }
    window.localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    // Keep the legacy queue intact if migration fails so no activity is lost.
  }
}

async function allMutations() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, 'readonly');
  const rows = await requestResult(transaction.objectStore(STORE).getAll()) as OfflineMutation[];
  database.close();
  return rows.sort((a, b) => a.queued_at.localeCompare(b.queued_at));
}

async function putMutation(mutation: OfflineMutation) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).put(mutation);
  await transactionDone(transaction);
  database.close();
}

export async function queueMutation(mutation: NewMutation) {
  const now = new Date().toISOString();
  await putMutation({
    ...mutation,
    queued_at: now,
    updated_at: now,
    status: 'pending',
    attempts: 0,
  } as OfflineMutation);
  announce();
  return pendingMutationCount();
}

export async function pendingMutationCount() {
  return (await allMutations()).length;
}

export async function offlineMutationSummary() {
  const rows = await allMutations();
  return {
    pending: rows.filter((row) => row.status === 'pending').length,
    syncing: rows.filter((row) => row.status === 'syncing').length,
    errors: rows.filter((row) => row.status === 'error').length,
    total: rows.length,
    lastError: rows.find((row) => row.status === 'error')?.last_error,
  };
}

export async function removeQueuedMutation(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).delete(id);
  await transactionDone(transaction);
  database.close();
  announce();
}

export async function retryFailedMutations() {
  const rows = await allMutations();
  await Promise.all(rows.filter((row) => row.status === 'error').map((row) => putMutation({
    ...row,
    status: 'pending',
    last_error: undefined,
    updated_at: new Date().toISOString(),
  })));
  announce();
}

export async function queuedEntries(userId: string, day: string) {
  return (await allMutations()).filter((item): item is Extract<OfflineMutation, { type: 'entry' }> =>
    item.type === 'entry' && item.user_id === userId && item.day === day
  );
}

export async function queuedTrainingSets(userId: string, day: string, slot: string) {
  return (await allMutations()).filter((item): item is Extract<OfflineMutation, { type: 'training_set' }> =>
    item.type === 'training_set' && item.user_id === userId && item.day === day && item.slot === slot
  );
}

export async function hasQueuedTrainingSession(userId: string, day: string, slot: string) {
  return (await allMutations()).some((item) =>
    item.type === 'training_session' && item.user_id === userId && item.day === day && item.slot === slot && item.done
  );
}

export async function queuedSwimSession(userId: string, day: string) {
  return (await allMutations()).find((item): item is Extract<OfflineMutation, { type: 'swim_session' }> =>
    item.type === 'swim_session' && item.user_id === userId && item.day === day
  );
}

export function isNetworkFailure(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return /fetch|network|offline|connection/i.test(message);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message?: unknown }).message ?? 'Sync failed.');
  return 'Sync failed.';
}

async function syncMutation(supabase: SupabaseClient, mutation: OfflineMutation) {
  const { error } = await supabase.rpc('sync_offline_mutation', {
    mutation_kind: mutation.type,
    mutation_data: mutation,
    mutation_queued_at: mutation.queued_at,
  });
  return error;
}

export async function flushOfflineQueue(supabase: SupabaseClient) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, remaining: await pendingMutationCount(), errors: 0 };
  }
  const queue = await allMutations();
  if (!queue.length) return { synced: 0, remaining: 0, errors: 0 };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { synced: 0, remaining: queue.length, errors: 0 };

  let synced = 0;
  let errors = 0;
  for (const mutation of queue) {
    if (mutation.user_id !== session.user.id || mutation.status === 'error') continue;
    await putMutation({ ...mutation, status: 'syncing', updated_at: new Date().toISOString() });
    try {
      const error = await syncMutation(supabase, mutation);
      if (error) throw error;
      await removeQueuedMutation(mutation.id);
      synced++;
    } catch (error) {
      const network = isNetworkFailure(error);
      await putMutation({
        ...mutation,
        status: network ? 'pending' : 'error',
        attempts: mutation.attempts + 1,
        last_error: errorMessage(error),
        updated_at: new Date().toISOString(),
      });
      if (!network) errors++;
      if (network) break;
    }
  }
  announce();
  return { synced, remaining: await pendingMutationCount(), errors };
}

export async function clearOfflineData() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_QUEUE_KEY);
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  announce();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' });
    void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' }));
  }
}
