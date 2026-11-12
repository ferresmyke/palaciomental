/**
 * Migrações do esquema e verificação de integridade.
 * Regra: migrações nunca apagam dados do usuário, e uma cópia de segurança é feita antes de aplicá-las.
 */
import { findCatalogItem } from './catalog';
import { TPL_NOTE } from './seed';
import { SCHEMA_VERSION, type Db } from './types';

export interface Migration {
  from: number;
  to: number;
  label: string;
  run: (db: Db) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    label: 'Obsidian, tarefas que se repetem e cópias automáticas',
    run: (db) => {
      for (const t of Object.values(db.tasks)) if (t.repeat === undefined) t.repeat = null;
    },
  },
];

export class NewerSchemaError extends Error {}

export function schemaOf(db: Db): number | null {
  return db.meta.world?.schemaVersion ?? null;
}

export function needsMigration(db: Db): boolean {
  const v = schemaOf(db);
  return v !== null && v < SCHEMA_VERSION;
}

/** Aplica as migrações em ordem. Devolve os rótulos das que rodaram. */
export function migrate(db: Db): string[] {
  const world = db.meta.world;
  if (!world) return [];
  if (world.schemaVersion > SCHEMA_VERSION) throw new NewerSchemaError('Este Recanto foi criado por uma versão mais nova do app.');
  const applied: string[] = [];
  while (world.schemaVersion < SCHEMA_VERSION) {
    const m = MIGRATIONS.find((x) => x.from === world.schemaVersion);
    if (!m) throw new Error(`Sem migração a partir da versão ${world.schemaVersion}.`);
    m.run(db);
    world.schemaVersion = m.to;
    applied.push(m.label);
  }
  return applied;
}

export interface IntegrityIssue {
  table: string;
  id: string;
  problem: string;
}

type Mode = 'check' | 'repair';

function scan(db: Db, mode: Mode): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const fix = mode === 'repair';
  const note = (table: string, id: string, problem: string) => issues.push({ table, id, problem });
  const house = (id: string | null | undefined) => !!id && !!db.houses[id];
  const furn = (id: string | null | undefined) => !!id && !!db.furniture[id];

  for (const f of Object.values(db.furniture))
    if (!house(f.houseId)) {
      note('furniture', f.id, 'móvel sem casa');
      if (fix) delete db.furniture[f.id];
    }
  for (const p of Object.values(db.placements)) {
    if (p.scope !== 'city' && !house(p.scope)) {
      note('placements', p.id, 'objeto em casa inexistente');
      if (fix) delete db.placements[p.id];
    } else if (p.furnitureId && !furn(p.furnitureId)) {
      note('placements', p.id, 'objeto ligado a móvel inexistente');
      if (fix) delete db.placements[p.id];
    } else if (!p.furnitureId && !findCatalogItem(p.catalogId)) {
      note('placements', p.id, `objeto de catálogo desconhecido (${p.catalogId})`);
      if (fix) delete db.placements[p.id];
    }
  }
  for (const b of Object.values(db.books)) {
    if (b.houseId && !house(b.houseId)) {
      note('books', b.id, 'livro em casa inexistente');
      if (fix) {
        b.houseId = null;
        b.furnitureId = null;
      }
    }
    if (b.furnitureId && !furn(b.furnitureId)) {
      note('books', b.id, 'livro em móvel inexistente');
      if (fix) b.furnitureId = null;
    }
    if (!db.templates[b.templateId]) {
      note('books', b.id, 'livro com modelo inexistente');
      if (fix) b.templateId = TPL_NOTE;
    }
  }
  for (const t of Object.values(db.tasks)) {
    if (t.houseId && !house(t.houseId)) {
      note('tasks', t.id, 'tarefa em casa inexistente');
      if (fix) {
        t.houseId = null;
        t.onDesk = false;
      }
    }
    if (t.bookId && !db.books[t.bookId]) {
      note('tasks', t.id, 'tarefa em livro inexistente');
      if (fix) t.bookId = null;
    }
    const badRefs = t.refs.filter((r) => !db.books[r]);
    if (badRefs.length) {
      note('tasks', t.id, 'referências a livros inexistentes');
      if (fix) t.refs = t.refs.filter((r) => !!db.books[r]);
    }
  }
  const firstCons = Object.values(db.constellations).sort((a, b) => a.order - b.order)[0];
  for (const g of Object.values(db.goals)) {
    if (!db.constellations[g.constellationId]) {
      note('goals', g.id, 'objetivo em constelação inexistente');
      if (fix && firstCons) g.constellationId = firstCons.id;
    }
    if (g.projectIds.some((p) => !db.books[p])) {
      note('goals', g.id, 'objetivo ligado a projeto inexistente');
      if (fix) g.projectIds = g.projectIds.filter((p) => !!db.books[p]);
    }
  }
  for (const c of Object.values(db.constellations))
    if (c.houseId && !house(c.houseId)) {
      note('constellations', c.id, 'constelação de casa inexistente');
      if (fix) c.houseId = null;
    }
  return issues;
}

export const checkIntegrity = (db: Db): IntegrityIssue[] => scan(db, 'check');

/** Corrige sem apagar conteúdo do usuário: só desliga referências quebradas. Devolve quantas correções fez. */
export const repairIntegrity = (db: Db): number => scan(db, 'repair').length;
