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
  onAck: (sessionId: string) => void,
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
      const record = anonymiseSession(s, players, masker);
      if (!record) continue;
      // Resolves when the server confirms; offline, Firestore holds it until signal returns.
      setDoc(doc(db, 'coaches', uid, 'sessions', s.id), { ...record, updatedAt: serverTimestamp() })
        .then(() => onAck(s.id))
        .catch((e) => console.warn('Sync failed for a session', e?.code ?? e));
      queued++;
    }
    return { ok: true, queued };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deletes every synced record for this coach (used by "Delete all data"). */
export async function deleteCloudCopies(sessionIds: string[]): Promise<void> {
  const [{ doc, deleteDoc }, { getDb, getUid }] = await Promise.all([import('firebase/firestore'), import('../ai/firebase')]);
  const [db, uid] = await Promise.all([getDb(), getUid()]);
  await Promise.all(sessionIds.map((id) => deleteDoc(doc(db, 'coaches', uid, 'sessions', id))));
}
