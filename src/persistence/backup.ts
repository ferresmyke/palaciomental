/**
 * Exportação e importação de backup: conteúdo, modelos, layout e anexos em um único arquivo JSON.
 */
import { emptyDb, SCHEMA_VERSION, TABLES } from '@/domain/types';
import type { Db } from '@/domain/types';
import type { Repository } from './repository';

export const BACKUP_FORMAT = 'palacio-mental-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  db: Db;
  blobs: Record<string, { mime: string; base64: string }>;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function exportBackup(db: Db, repo: Repository): Promise<string> {
  const blobs: BackupFile['blobs'] = {};
  for (const id of Object.keys(db.attachments)) {
    const b = await repo.getBlob(id);
    if (b) blobs[id] = { mime: b.mime, base64: toBase64(b.data) };
  }
  const file: BackupFile = { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), db, blobs };
  return JSON.stringify(file);
}

export class BackupError extends Error {}

/** Valida o arquivo e devolve o banco pronto para substituir o atual. */
export function parseBackup(json: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('O arquivo não é um backup válido.');
  }
  const file = data as Partial<BackupFile>;
  if (!file || file.format !== BACKUP_FORMAT || typeof file.db !== 'object' || !file.db)
    throw new BackupError('O arquivo não é um backup do Palácio Mental.');
  if ((file.schemaVersion ?? 0) > SCHEMA_VERSION) throw new BackupError('Este backup foi criado por uma versão mais nova do app.');
  const db = emptyDb();
  for (const t of TABLES) {
    const table = (file.db as unknown as Record<string, unknown>)[t];
    if (table && typeof table === 'object') Object.assign(db[t], table);
  }
  if (!db.meta.world) throw new BackupError('O backup não contém um Recanto.');
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: file.exportedAt ?? '', db, blobs: file.blobs ?? {} };
}

export async function importBackup(json: string, repo: Repository): Promise<Db> {
  const file = parseBackup(json);
  await repo.replaceAll(file.db);
  await repo.clearBlobs();
  for (const [id, b] of Object.entries(file.blobs)) await repo.putBlob({ id, mime: b.mime, data: fromBase64(b.base64) });
  return file.db;
}
