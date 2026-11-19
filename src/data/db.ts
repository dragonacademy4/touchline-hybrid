/** IndexedDB storage. Everything lives on the device first. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type CloudReport, type Player, type Session, type Settings } from '../lib/types';

interface TouchlineDB extends DBSchema {
  players: { key: string; value: Player };
  sessions: { key: string; value: Session; indexes: { byDate: string } };
  reports: { key: string; value: CloudReport };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'touchline';
const DB_VERSION = 1;

let dbp: Promise<IDBPDatabase<TouchlineDB>> | null = null;

export function db(): Promise<IDBPDatabase<TouchlineDB>> {
  dbp ??= openDB<TouchlineDB>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('players', { keyPath: 'id' });
      const s = d.createObjectStore('sessions', { keyPath: 'id' });
      s.createIndex('byDate', 'date');
      d.createObjectStore('reports', { keyPath: 'id' });
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

export async function loadAll(): Promise<{ players: Player[]; sessions: Session[]; reports: CloudReport[]; settings: Settings }> {
  const d = await db();
  const [players, sessions, reports, settings] = await Promise.all([
    d.getAll('players'),
    d.getAll('sessions'),
    d.getAll('reports'),
    d.get('meta', 'settings') as Promise<Partial<Settings> | undefined>,
  ]);
  return { players, sessions, reports, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } };
}

export async function putPlayer(p: Player) {
  await (await db()).put('players', p);
}
export async function deletePlayer(id: string) {
  await (await db()).delete('players', id);
}
export async function putSession(s: Session) {
  await (await db()).put('sessions', s);
}
export async function deleteSession(id: string) {
  await (await db()).delete('sessions', id);
}
export async function putReport(r: CloudReport) {
  await (await db()).put('reports', r);
}
export async function deleteReport(id: string) {
  await (await db()).delete('reports', id);
}
export async function putSettings(s: Settings) {
  await (await db()).put('meta', s, 'settings');
}

/** Bulk write in one transaction (demo load, import). */
export async function putMany(players: Player[], sessions: Session[]) {
  const d = await db();
  const tx = d.transaction(['players', 'sessions'], 'readwrite');
  await Promise.all([...players.map((p) => tx.objectStore('players').put(p)), ...sessions.map((s) => tx.objectStore('sessions').put(s)), tx.done]);
}

export async function clearAll() {
  const d = await db();
  const tx = d.transaction(['players', 'sessions', 'reports', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('players').clear(), tx.objectStore('sessions').clear(), tx.objectStore('reports').clear(), tx.objectStore('meta').clear(), tx.done]);
}

/** Closes the connection (tests). */
export async function closeDb() {
  if (dbp) (await dbp).close();
  dbp = null;
}
