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
}
