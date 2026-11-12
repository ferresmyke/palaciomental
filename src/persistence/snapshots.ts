/**
 * Cópias de segurança automáticas guardadas no próprio navegador (IndexedDB).
 * Não substituem o backup em arquivo, mas protegem de erros, migrações e restaurações.
 */
import { emptyDb, TABLES, type Db } from '@/domain/types';
import { newId } from '@/domain/util';
import type { Repository, Snapshot } from './repository';

export const KEEP_SNAPSHOTS = 14;
const DAY = 86400000;

export async function takeSnapshot(db: Db, repo: Repository, reason: string, now = Date.now()): Promise<Snapshot> {
  const snap: Snapshot = {
    id: newId('cop'),
    at: now,
    reason,
    json: JSON.stringify(db),
    houses: Object.values(db.houses).filter((h) => !h.trash).length,
    books: Object.values(db.books).filter((b) => !b.trash).length,
    tasks: Object.values(db.tasks).filter((t) => !t.trash).length,
  };
  await repo.putSnapshot(snap);
  const all = await repo.listSnapshots();
  for (const old of all.slice(KEEP_SNAPSHOTS)) await repo.deleteSnapshot(old.id);
  return snap;
}

/** Faz uma cópia automática se a última tem mais de um dia. */
export async function ensureDailySnapshot(db: Db, repo: Repository, now = Date.now()): Promise<Snapshot | null> {
  if (!db.meta.world?.onboarded) return null;
  const [last] = await repo.listSnapshots();
  if (last && now - last.at < DAY) return null;
  return takeSnapshot(db, repo, 'automática', now);
}

export function parseSnapshot(snap: Snapshot): Db {
  const raw = JSON.parse(snap.json) as Partial<Db>;
  const db = emptyDb();
  for (const t of TABLES) if (raw[t]) Object.assign(db[t], raw[t]);
  return db;
}
