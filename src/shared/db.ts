import { deleteDB, openDB, type DBSchema, type IDBPDatabase, type StoreNames } from 'idb';
import { broadcast } from './messages';
import type { ChatMessage, Session, TranscriptEntry } from './types';

interface QuillyDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { byStartedAt: number } };
  entries: { key: string; value: TranscriptEntry; indexes: { bySession: string; bySessionSeq: [string, number] } };
  chat: { key: string; value: ChatMessage; indexes: { bySession: string; bySessionCreated: [string, number] } };
}

const DB_NAME = 'quilly';
const DB_VERSION = 1;
/** Name the database had before the project was renamed; its contents move over on first open. */
const LEGACY_DB_NAME = 'meet-hunter';
const STORES = ['sessions', 'entries', 'chat'] as const;

let dbPromise: Promise<IDBPDatabase<QuillyDB>> | null = null;

function db(): Promise<IDBPDatabase<QuillyDB>> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<IDBPDatabase<QuillyDB>> {
  const database = await openDB<QuillyDB>(DB_NAME, DB_VERSION, { upgrade: createSchema });
  await migrateLegacy(database).catch((error) => console.warn('[quilly] legacy database not migrated:', error));
  return database;
}

function createSchema(database: IDBPDatabase<QuillyDB>): void {
  const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
  sessions.createIndex('byStartedAt', 'startedAt');
  const entries = database.createObjectStore('entries', { keyPath: 'id' });
  entries.createIndex('bySession', 'sessionId');
  entries.createIndex('bySessionSeq', ['sessionId', 'seq']);
  const chat = database.createObjectStore('chat', { keyPath: 'id' });
  chat.createIndex('bySession', 'sessionId');
  chat.createIndex('bySessionCreated', ['sessionId', 'createdAt']);
}

/**
 * Copies every row of the legacy database into `target`, then deletes it.
 * Several contexts (background, side panel, app) may open the database at
 * once and all run this; rows are keyed, so copying twice is harmless, and
 * the delete waits for the other connections to close.
 */
async function migrateLegacy(target: IDBPDatabase<QuillyDB>): Promise<void> {
  const existing = await indexedDB.databases();
  if (!existing.some((d) => d.name === LEGACY_DB_NAME)) return;
  const legacy = await openDB<QuillyDB>(LEGACY_DB_NAME, DB_VERSION, {
    upgrade: createSchema, // only reached if the legacy database somehow lacks the schema
    blocking: () => legacy.close(), // another context is deleting it: let go
  });
  try {
    for (const store of STORES) if (legacy.objectStoreNames.contains(store)) await copyStore(legacy, target, store);
  } finally {
    legacy.close();
  }
  await deleteDB(LEGACY_DB_NAME);
  broadcast({ type: 'sessions/changed' });
}

async function copyStore<Name extends StoreNames<QuillyDB>>(from: IDBPDatabase<QuillyDB>, to: IDBPDatabase<QuillyDB>, store: Name): Promise<void> {
  const rows = await from.getAll(store);
  if (rows.length === 0) return;
  const tx = to.transaction(store, 'readwrite');
  await Promise.all([...rows.map((row) => tx.store.put(row)), tx.done]);
}

/** Fields added after the first release default here, so older rows need no migration pass. */
function normalizeSession(session: Session): Session {
  return { ...session, eventCount: session.eventCount ?? 0 };
}

function normalizeEntry(entry: TranscriptEntry): TranscriptEntry {
  return { ...entry, kind: entry.kind ?? 'caption' };
}

/**
 * Session writes announce themselves (`sessions/changed`) so every open
 * surface (side panel, sessions list, detail page) refreshes, whichever
 * context made the change.
 */
export const sessionsRepo = {
  async list(): Promise<Session[]> {
    const all = await (await db()).getAllFromIndex('sessions', 'byStartedAt');
    return all.reverse().map(normalizeSession);
  },
  async get(id: string): Promise<Session | undefined> {
    const session = await (await db()).get('sessions', id);
    return session && normalizeSession(session);
  },
  async put(session: Session): Promise<void> {
    await (await db()).put('sessions', session);
    broadcast({ type: 'sessions/changed', sessionId: session.id });
  },
  async listRecording(): Promise<Session[]> {
    return (await this.list()).filter((s) => s.status === 'recording');
  },
  async delete(id: string): Promise<void> {
    const tx = (await db()).transaction(['sessions', 'entries', 'chat'], 'readwrite');
    await Promise.all([
      tx.objectStore('sessions').delete(id),
      deleteBySession(tx.objectStore('entries'), id),
      deleteBySession(tx.objectStore('chat'), id),
      tx.done,
    ]);
    broadcast({ type: 'sessions/changed', sessionId: id });
  },
  async clearAll(): Promise<void> {
    const tx = (await db()).transaction(['sessions', 'entries', 'chat'], 'readwrite');
    await Promise.all([tx.objectStore('sessions').clear(), tx.objectStore('entries').clear(), tx.objectStore('chat').clear(), tx.done]);
    broadcast({ type: 'sessions/changed' });
  },
};

export const entriesRepo = {
  async list(sessionId: string): Promise<TranscriptEntry[]> {
    const rows = await (await db()).getAllFromIndex('entries', 'bySessionSeq', IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));
    return rows.map(normalizeEntry);
  },
  async get(id: string): Promise<TranscriptEntry | undefined> {
    const entry = await (await db()).get('entries', id);
    return entry && normalizeEntry(entry);
  },
  async put(entry: TranscriptEntry): Promise<void> {
    await (await db()).put('entries', entry);
  },
};

export const chatRepo = {
  async list(sessionId: string): Promise<ChatMessage[]> {
    return (await db()).getAllFromIndex('chat', 'bySessionCreated', IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));
  },
  async put(message: ChatMessage): Promise<void> {
    await (await db()).put('chat', message);
  },
  async clear(sessionId: string): Promise<void> {
    const tx = (await db()).transaction('chat', 'readwrite');
    await Promise.all([deleteBySession(tx.store, sessionId), tx.done]);
  },
};

async function deleteBySession(
  store: { index(name: 'bySession'): { getAllKeys(query: string): Promise<string[]> }; delete(key: string): Promise<void> },
  sessionId: string,
): Promise<void> {
  const keys = await store.index('bySession').getAllKeys(sessionId);
  await Promise.all(keys.map((key) => store.delete(key)));
}
