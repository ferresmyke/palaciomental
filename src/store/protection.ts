/** Cópias de segurança automáticas: fazer agora, listar e restaurar. */
import { takeSnapshot, parseSnapshot } from '@/persistence/snapshots';
import type { ID } from '@/domain/types';
import { clearBlobUrls } from './actions';
import { flush, getDb, getRepo, replaceDb } from './db';

export async function snapshotNow(reason = 'manual'): Promise<void> {
  await flush();
  await takeSnapshot(getDb(), getRepo(), reason);
}

/** Restaura uma cópia. Antes, guarda o estado atual em outra cópia, então dá para voltar atrás. */
export async function restoreSnapshot(id: ID): Promise<boolean> {
  const repo = getRepo();
  const snap = await repo.getSnapshot(id);
  if (!snap) return false;
  await flush();
  await takeSnapshot(getDb(), repo, 'antes de restaurar uma cópia');
  const db = parseSnapshot(snap);
  await repo.replaceAll(db);
  clearBlobUrls();
  replaceDb(db);
  await flush();
  return true;
}
