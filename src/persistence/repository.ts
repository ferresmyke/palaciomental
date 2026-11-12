import type { Db, ID, TableName } from '@/domain/types';

export interface Change {
  table: TableName;
  id: ID;
  /** undefined = remover o registro. */
  value: unknown | undefined;
}

export interface StoredBlob {
  id: ID;
  mime: string;
  data: ArrayBuffer;
}

/** Cópia de segurança do banco (sem anexos), guardada no próprio navegador. */
export interface Snapshot {
  id: ID;
  at: number;
  reason: string;
  /** JSON do banco inteiro. */
  json: string;
  houses: number;
  books: number;
  tasks: number;
}

/**
 * Camada de repositório: a aplicação só conhece esta interface.
 * Hoje há IndexedDB e memória; uma implementação remota (Supabase) pode entrar depois.
 */
export interface Repository {
  load(): Promise<Db>;
  apply(changes: Change[]): Promise<void>;
  replaceAll(db: Db): Promise<void>;
  putBlob(blob: StoredBlob): Promise<void>;
  getBlob(id: ID): Promise<StoredBlob | undefined>;
  deleteBlob(id: ID): Promise<void>;
  listBlobIds(): Promise<ID[]>;
  clearBlobs(): Promise<void>;
  putSnapshot(s: Snapshot): Promise<void>;
  /** Do mais novo para o mais antigo, sem o JSON (leve). */
  listSnapshots(): Promise<Omit<Snapshot, 'json'>[]>;
  getSnapshot(id: ID): Promise<Snapshot | undefined>;
  deleteSnapshot(id: ID): Promise<void>;
  /** Guarda um objeto estruturado (ex.: a pasta do Obsidian) que não cabe em JSON. */
  putHandle(key: string, value: unknown): Promise<void>;
  getHandle(key: string): Promise<unknown | undefined>;
  deleteHandle(key: string): Promise<void>;
}
