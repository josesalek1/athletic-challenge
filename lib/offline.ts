import type { SupabaseClient } from '@supabase/supabase-js';
import type { Payload } from './types';

const QUEUE_KEY = 'athletic-challenge:offline-queue:v1';
export const OFFLINE_EVENT = 'athletic:offline-change';

export type OfflineMutation =
  | {
      id: string;
      type: 'entry';
      user_id: string;
      day: string;
      challenge_id: string;
      payload: Payload;
      queued_at: string;
    }
  | {
      id: string;
      type: 'training_set';
      user_id: string;
      day: string;
      slot: string;
      exercise_key: string;
      set_index: number;
      weight_kg: number | null;
      reps: number | null;
      seconds: number | null;
      queued_at: string;
    }
  | {
      id: string;
      type: 'training_session';
      user_id: string;
      day: string;
      slot: string;
      done: boolean;
      queued_at: string;
    };

function readQueue(): OfflineMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineMutation[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
}

export function queueMutation(mutation: Omit<OfflineMutation, 'queued_at'>) {
  const next = readQueue().filter((item) => item.id !== mutation.id);
  next.push({ ...mutation, queued_at: new Date().toISOString() } as OfflineMutation);
  writeQueue(next);
  return next.length;
}

export function pendingMutationCount() {
  return readQueue().length;
}

export function removeQueuedMutation(id: string) {
  const queue = readQueue();
  const next = queue.filter((item) => item.id !== id);
  if (next.length !== queue.length) writeQueue(next);
}

export function queuedEntries(userId: string, day: string) {
  return readQueue().filter((item): item is Extract<OfflineMutation, { type: 'entry' }> =>
    item.type === 'entry' && item.user_id === userId && item.day === day
  );
}

export function queuedTrainingSets(userId: string, day: string, slot: string) {
  return readQueue().filter((item): item is Extract<OfflineMutation, { type: 'training_set' }> =>
    item.type === 'training_set' && item.user_id === userId && item.day === day && item.slot === slot
  );
}

export function hasQueuedTrainingSession(userId: string, day: string, slot: string) {
  return readQueue().some((item) =>
    item.type === 'training_session' && item.user_id === userId && item.day === day && item.slot === slot && item.done
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

export async function flushOfflineQueue(supabase: SupabaseClient) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, remaining: pendingMutationCount() };
  }

  const queue = readQueue();
  if (!queue.length) return { synced: 0, remaining: 0 };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { synced: 0, remaining: queue.length };

  const remaining: OfflineMutation[] = [];
  let synced = 0;

  for (const mutation of queue) {
    if (mutation.user_id !== session.user.id) {
      remaining.push(mutation);
      continue;
    }

    let error: unknown = null;
    try {
      if (mutation.type === 'entry') {
        ({ error } = await supabase.from('entries').upsert({
          user_id: mutation.user_id,
          day: mutation.day,
          challenge_id: mutation.challenge_id,
          payload: mutation.payload,
        }, { onConflict: 'user_id,challenge_id,day' }));
      } else if (mutation.type === 'training_set') {
        ({ error } = await supabase.from('training_sets').upsert({
          user_id: mutation.user_id,
          day: mutation.day,
          slot: mutation.slot,
          exercise_key: mutation.exercise_key,
          set_index: mutation.set_index,
          weight_kg: mutation.weight_kg,
          reps: mutation.reps,
          seconds: mutation.seconds,
        }, { onConflict: 'user_id,day,slot,exercise_key,set_index' }));
      } else {
        ({ error } = await supabase.from('training_sessions').upsert({
          user_id: mutation.user_id,
          day: mutation.day,
          slot: mutation.slot,
          done: mutation.done,
        }, { onConflict: 'user_id,day,slot' }));
      }
    } catch (caught) {
      error = caught;
    }

    if (error) remaining.push(mutation);
    else synced++;
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length };
}

export function clearOfflineData() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(QUEUE_KEY);
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' });
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' });
    });
  }
}
