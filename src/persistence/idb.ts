import { openDB, type IDBPDatabase } from 'idb';
import { emptyDb, TABLES } from '@/domain/types';
import type { Db, ID } from '@/domain/types';
import type { Change, Repository, Snapshot, StoredBlob } from './repository';

const BLOBS = 'blobs';
const SNAPS = 'snapshots';
const HANDLES = 'handles';

/** Persistência local-first no navegador. Um object store por tabela, mais os anexos. */
export class IndexedDbRepository implements Repository {
  private dbp: Promise<IDBPDatabase>;

  constructor(name = 'palacio-mental') {
    this.dbp = openDB(name, 2, {
      // v1: tabelas e anexos. v2: cópias automáticas e pastas ligadas (Obsidian). Nada é apagado ao atualizar.
      upgrade(db) {
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SNAPS)) db.createObjectStore(SNAPS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
      },
    });
  }

  async load(): Promise<Db> {
    const idb = await this.dbp;
    const db = emptyDb();
    const tx = idb.transaction(TABLES, 'readonly');
    await Promise.all(
      TABLES.map(async (t) => {
        for (const row of await tx.objectStore(t).getAll()) (db[t] as Record<ID, unknown>)[(row as { id: ID }).id] = row;
      }),
    );
    await tx.done;
    return db;
  }

  async apply(changes: Change[]): Promise<void> {
    if (!changes.length) return;
    const idb = await this.dbp;
    const tables = [...new Set(changes.map((c) => c.table))];
    const tx = idb.transaction(tables, 'readwrite');
    for (const c of changes) {
      const store = tx.objectStore(c.table);
      if (c.value === undefined) void store.delete(c.id);
      else void store.put(c.value);
    }
    await tx.done;
  }

  async replaceAll(db: Db): Promise<void> {
    const idb = await this.dbp;
    const tx = idb.transaction(TABLES, 'readwrite');
    for (const t of TABLES) {
      const store = tx.objectStore(t);
      void store.clear();
      for (const v of Object.values(db[t])) void store.put(v);
    }
    await tx.done;
  }

  async putBlob(blob: StoredBlob): Promise<void> {
    await (await this.dbp).put(BLOBS, blob);
  }
  async getBlob(id: ID): Promise<StoredBlob | undefined> {
    return (await this.dbp).get(BLOBS, id);
  }
  async deleteBlob(id: ID): Promise<void> {
    await (await this.dbp).delete(BLOBS, id);
  }
  async listBlobIds(): Promise<ID[]> {
    return (await (await this.dbp).getAllKeys(BLOBS)) as ID[];
  }
  async clearBlobs(): Promise<void> {
    await (await this.dbp).clear(BLOBS);
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    await (await this.dbp).put(SNAPS, s);
  }
  async listSnapshots(): Promise<Omit<Snapshot, 'json'>[]> {
    const all = (await (await this.dbp).getAll(SNAPS)) as Snapshot[];
    return all.sort((a, b) => b.at - a.at).map(({ json: _json, ...rest }) => rest);
  }
  async getSnapshot(id: ID): Promise<Snapshot | undefined> {
    return (await this.dbp).get(SNAPS, id);
  }
  async deleteSnapshot(id: ID): Promise<void> {
    await (await this.dbp).delete(SNAPS, id);
  }
  async putHandle(key: string, value: unknown): Promise<void> {
    await (await this.dbp).put(HANDLES, value, key);
  }
  async getHandle(key: string): Promise<unknown | undefined> {
    return (await this.dbp).get(HANDLES, key);
  }
  async deleteHandle(key: string): Promise<void> {
    await (await this.dbp).delete(HANDLES, key);
  }
}
