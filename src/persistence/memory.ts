import { emptyDb, TABLES } from '@/domain/types';
import type { Db, ID } from '@/domain/types';
import type { Change, Repository, Snapshot, StoredBlob } from './repository';

/** Repositório em memória: usado em testes e como reserva quando o IndexedDB não existe. */
export class MemoryRepository implements Repository {
  private tables = new Map<string, Map<ID, unknown>>();
  private blobs = new Map<ID, StoredBlob>();
  private snaps = new Map<ID, Snapshot>();
  private handles = new Map<string, unknown>();

  constructor() {
    for (const t of TABLES) this.tables.set(t, new Map());
  }

  async load(): Promise<Db> {
    const db = emptyDb();
    for (const t of TABLES) for (const [id, v] of this.tables.get(t)!) (db[t] as Record<ID, unknown>)[id] = structuredClone(v);
    return db;
  }

  async apply(changes: Change[]): Promise<void> {
    for (const c of changes) {
      const table = this.tables.get(c.table)!;
      if (c.value === undefined) table.delete(c.id);
      else table.set(c.id, structuredClone(c.value));
    }
  }

  async replaceAll(db: Db): Promise<void> {
    for (const t of TABLES) {
      const table = this.tables.get(t)!;
      table.clear();
      for (const [id, v] of Object.entries(db[t])) table.set(id, structuredClone(v));
    }
  }

  async putBlob(blob: StoredBlob): Promise<void> {
    this.blobs.set(blob.id, blob);
  }
  async getBlob(id: ID): Promise<StoredBlob | undefined> {
    return this.blobs.get(id);
  }
  async deleteBlob(id: ID): Promise<void> {
    this.blobs.delete(id);
  }
  async listBlobIds(): Promise<ID[]> {
    return [...this.blobs.keys()];
  }
  async clearBlobs(): Promise<void> {
    this.blobs.clear();
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    this.snaps.set(s.id, s);
  }
  async listSnapshots(): Promise<Omit<Snapshot, 'json'>[]> {
    return [...this.snaps.values()].sort((a, b) => b.at - a.at).map(({ json: _json, ...rest }) => rest);
  }
  async getSnapshot(id: ID): Promise<Snapshot | undefined> {
    return this.snaps.get(id);
  }
  async deleteSnapshot(id: ID): Promise<void> {
    this.snaps.delete(id);
  }
  async putHandle(key: string, value: unknown): Promise<void> {
    this.handles.set(key, value);
  }
  async getHandle(key: string): Promise<unknown | undefined> {
    return this.handles.get(key);
  }
  async deleteHandle(key: string): Promise<void> {
    this.handles.delete(key);
  }
}
