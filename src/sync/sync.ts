import { anonymiseSession } from './anonymise';
import { buildMasker } from '../ai/engine';
import type { Player, Session, Settings } from '../lib/types';

export type SyncResult = { ok: true; queued: number } | { ok: false; error: string };

/**
 * Writes anonymised copies of structured sessions to
 * coaches/{anonymous uid}/sessions/{id}. Firestore's persistent cache queues
 * writes made offline and sends them when signal returns.
 */
export async function syncSessions(
  sessions: Session[],
  players: Player[],
  settings: Settings,
  onAck: (sessionId: string, sentUpdatedAt: number) => void,
): Promise<SyncResult> {
  if (!settings.syncEnabled) return { ok: true, queued: 0 };
  const masker = buildMasker(players, settings);
  const pending = sessions.filter((s) => s.structured && !s.demo && (!s.syncedAt || s.syncedAt < s.updatedAt));
  if (!pending.length) return { ok: true, queued: 0 };
  try {
    const [{ doc, setDoc, serverTimestamp }, { getDb, getUid }] = await Promise.all([import('firebase/firestore'), import('../ai/firebase')]);
    const [db, uid] = await Promise.all([getDb(), getUid()]);
    let queued = 0;
    for (const s of pending) {
      let record;
      try {
        record = anonymiseSession(s, players, masker);
      } catch (e) {
        // A leak check failure skips this session only; the others still sync.
        console.warn('Sync skipped a session:', e instanceof Error ? e.name : 'error');
        continue;
      }
      if (!record) continue;
      // Resolves when the server confirms; offline, Firestore holds it until signal returns.
      setDoc(doc(db, 'coaches', uid, 'sessions', s.id), { ...record, updatedAt: serverTimestamp() })
        .then(() => onAck(s.id, s.updatedAt))
        .catch((e) => console.warn('Sync failed for a session:', e?.code ?? 'error'));
      queued++;
    }
    return { ok: true, queued };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deletes one session's cloud copy. Offline, Firestore queues the delete until signal returns. */
export async function deleteCloudCopy(sessionId: string): Promise<void> {
  try {
    const [{ doc, deleteDoc }, { getDb, getUid }] = await Promise.all([import('firebase/firestore'), import('../ai/firebase')]);
    const [db, uid] = await Promise.all([getDb(), getUid()]);
    deleteDoc(doc(db, 'coaches', uid, 'sessions', sessionId)).catch((e) => console.warn('Cloud delete failed:', e?.code ?? 'error'));
  } catch (e) {
    console.warn('Cloud delete not available:', e instanceof Error ? e.name : 'error');
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/**
 * Deletes every backed-up record for this coach by listing the collection on
 * the server (so records this phone no longer knows about go too), then
 * removes the anonymous account and Firestore's local cache.
 */
export async function deleteAllCloudCopies(timeoutMs = 20_000): Promise<number> {
  const [{ collection, getDocsFromServer, deleteDoc, terminate, clearIndexedDbPersistence }, { getDb, getUid, signOutAndForget }] = await Promise.all([
    import('firebase/firestore'),
    import('../ai/firebase'),
  ]);
  const db = await getDb();
  const uid = await withTimeout(getUid(), timeoutMs);
  const snap = await withTimeout(getDocsFromServer(collection(db, 'coaches', uid, 'sessions')), timeoutMs);
  await withTimeout(Promise.all(snap.docs.map((d) => deleteDoc(d.ref))), timeoutMs);
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => undefined);
  await signOutAndForget();
  return snap.size;
}
