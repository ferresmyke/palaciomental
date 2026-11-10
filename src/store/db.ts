/**
 * Loja de dados. Toda edição passa por `exec`, que gera um comando reversível
 * (patches do immer) e persiste só os registros alterados. Não há botão "salvar".
 */
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { createStore } from 'zustand/vanilla';
import { clock, initWorld, purgeExpired } from '@/domain/ops';
import { emptyDb, TABLES } from '@/domain/types';
import type { Db, ID, TableName } from '@/domain/types';
import type { Change, Repository } from '@/persistence/repository';
import { MemoryRepository } from '@/persistence/memory';

enablePatches();

export interface Command {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  mergeKey?: string;
  at: number;
}

export interface DbState {
  db: Db;
  ready: boolean;
  undoStack: Command[];
  redoStack: Command[];
  saveError: string | null;
  /** Incrementa a cada alteração: as cenas usam para saber quando redesenhar. */
  rev: number;
}

const HISTORY_LIMIT = 200;
const MERGE_WINDOW = 1500;

export const dbStore = createStore<DbState>(() => ({
  db: emptyDb(),
  ready: false,
  undoStack: [],
  redoStack: [],
  saveError: null,
  rev: 0,
}));

let repo: Repository = new MemoryRepository();
let queue: Promise<void> = Promise.resolve();

export function getRepo(): Repository {
  return repo;
}

export function getDb(): Db {
  return dbStore.getState().db;
}

function changesFrom(patches: Patch[], prev: Db, next: Db): Change[] {
  const seen = new Set<string>();
  const out: Change[] = [];
  const add = (table: TableName, id: ID) => {
    const key = `${table}/${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ table, id, value: (next[table] as Record<ID, unknown>)[id] });
  };
  for (const p of patches) {
    const table = p.path[0] as TableName;
    if (!TABLES.includes(table)) continue;
    if (p.path.length >= 2) add(table, String(p.path[1]));
    else for (const id of new Set([...Object.keys(prev[table]), ...Object.keys(next[table])])) add(table, id);
  }
  return out;
}

function persist(changes: Change[]): void {
  if (!changes.length) return;
  queue = queue
    .then(() => repo.apply(changes))
    .then(() => {
      if (dbStore.getState().saveError) dbStore.setState({ saveError: null });
    })
    .catch((e: unknown) => {
      console.error('Falha ao salvar', e);
      dbStore.setState({ saveError: 'Não foi possível salvar no navegador.' });
    });
}

/** Aguarda todas as gravações pendentes (usado em testes e antes de exportar). */
export function flush(): Promise<void> {
  return queue;
}

export interface ExecOptions {
  /** Comandos consecutivos com a mesma chave viram um só passo de desfazer (ex.: digitação). */
  merge?: string;
  /** Não entra no histórico de desfazer. */
  transient?: boolean;
}

/** Executa uma operação de domínio como comando reversível. Lança OpError se a operação for inválida. */
export function exec<T>(label: string, fn: (draft: Db) => T, opts: ExecOptions = {}): T {
  const state = dbStore.getState();
  let result!: T;
  const [next, patches, inverse] = produceWithPatches(state.db, (draft) => {
    result = fn(draft as Db);
  });
  if (!patches.length) return result;
  const now = Date.now();
  let undoStack = state.undoStack;
  if (!opts.transient) {
    const last = undoStack[undoStack.length - 1];
    if (opts.merge && last && last.mergeKey === opts.merge && now - last.at < MERGE_WINDOW) {
      undoStack = [
        ...undoStack.slice(0, -1),
        { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now },
      ];
    } else {
      undoStack = [...undoStack, { label, patches, inverse, mergeKey: opts.merge, at: now }].slice(-HISTORY_LIMIT);
    }
  }
  dbStore.setState({ db: next, undoStack, redoStack: opts.transient ? state.redoStack : [], rev: state.rev + 1 });
  persist(changesFrom(patches, state.db, next));
  return result;
}

export function undo(): string | null {
  const state = dbStore.getState();
  const cmd = state.undoStack[state.undoStack.length - 1];
  if (!cmd) return null;
  const next = applyPatches(state.db, cmd.inverse);
  dbStore.setState({ db: next, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, cmd], rev: state.rev + 1 });
  persist(changesFrom(cmd.inverse, state.db, next));
  return cmd.label;
}

export function redo(): string | null {
  const state = dbStore.getState();
  const cmd = state.redoStack[state.redoStack.length - 1];
  if (!cmd) return null;
  const next = applyPatches(state.db, cmd.patches);
  dbStore.setState({ db: next, undoStack: [...state.undoStack, cmd], redoStack: state.redoStack.slice(0, -1), rev: state.rev + 1 });
  persist(changesFrom(cmd.patches, state.db, next));
  return cmd.label;
}

/** Carrega o banco do repositório, garante os dados de sistema e limpa a lixeira vencida. */
export async function initStore(r: Repository): Promise<void> {
  repo = r;
  queue = Promise.resolve();
  const loaded = await repo.load();
  dbStore.setState({ db: loaded, ready: false, undoStack: [], redoStack: [], rev: 0, saveError: null });
  exec('Preparar o Recanto', (d) => initWorld(d), { transient: true });
  exec('Limpar lixeira vencida', (d) => purgeExpired(d, clock.now()), { transient: true });
  await flush();
  // Anexos órfãos (sem registro) são descartados.
  try {
    const known = new Set(Object.keys(getDb().attachments));
    for (const id of await repo.listBlobIds()) if (!known.has(id)) await repo.deleteBlob(id);
  } catch (e) {
    console.warn('Limpeza de anexos ignorada', e);
  }
  dbStore.setState({ ready: true });
}

/** Substitui todo o banco (importação de backup). Zera o histórico de desfazer. */
export function replaceDb(db: Db): void {
  dbStore.setState({ db, undoStack: [], redoStack: [], rev: dbStore.getState().rev + 1 });
  exec('Preparar o Recanto', (d) => initWorld(d), { transient: true });
}
