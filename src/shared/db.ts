import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChatMessage, Session, TranscriptEntry } from './types';

interface QuillyDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { byStartedAt: number } };
  entries: { key: string; value: TranscriptEntry; indexes: { bySession: string; bySessionSeq: [string, number] } };
  chat: { key: string; value: ChatMessage; indexes: { bySession: string; bySessionCreated: [string, number] } };
}

let dbPromise: Promise<IDBPDatabase<QuillyDB>> | null = null;

function db(): Promise<IDBPDatabase<QuillyDB>> {
  // The database keeps its original name on purpose: renaming it would orphan every recorded session.
  dbPromise ??= openDB<QuillyDB>('meet-hunter', 1, {
    upgrade(database) {
      const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('byStartedAt', 'startedAt');
      const entries = database.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('bySession', 'sessionId');
      entries.createIndex('bySessionSeq', ['sessionId', 'seq']);
      const chat = database.createObjectStore('chat', { keyPath: 'id' });
      chat.createIndex('bySession', 'sessionId');
      chat.createIndex('bySessionCreated', ['sessionId', 'createdAt']);
    },
  });
  return dbPromise;
}

/** Fields added after the first release default here, so older rows need no migration pass. */
function normalizeSession(session: Session): Session {
  return { ...session, eventCount: session.eventCount ?? 0 };
}

function normalizeEntry(entry: TranscriptEntry): TranscriptEntry {
  return { ...entry, kind: entry.kind ?? 'caption' };
}

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
  },
  async clearAll(): Promise<void> {
    const tx = (await db()).transaction(['sessions', 'entries', 'chat'], 'readwrite');
    await Promise.all([tx.objectStore('sessions').clear(), tx.objectStore('entries').clear(), tx.objectStore('chat').clear(), tx.done]);
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
