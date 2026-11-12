import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildGraph, bookLinks, outLinks } from '@/domain/links';
import { checkIntegrity, migrate, needsMigration, NewerSchemaError, repairIntegrity } from '@/domain/migrations';
import * as ops from '@/domain/ops';
import { emptyDb, SCHEMA_VERSION, type Db } from '@/domain/types';
import { IndexedDbRepository } from '@/persistence/idb';
import { MemoryRepository } from '@/persistence/memory';
import { ensureDailySnapshot, KEEP_SNAPSHOTS, parseSnapshot, takeSnapshot } from '@/persistence/snapshots';
import { dbStore, exec, flush, getDb, initStore } from '@/store/db';
import { restoreSnapshot } from '@/store/protection';

const NOW = new Date(2026, 10, 12, 10, 0).getTime();
let db: Db;
function run<T>(fn: (d: Db) => T): T {
  let out!: T;
  db = produce(db, (d) => {
    out = fn(d as Db);
  });
  return out;
}
const shelf = (h: string, n: string) => {
  const house = Object.values(db.houses).find((x) => x.name === h)!;
  return Object.values(db.furniture).find((f) => f.houseId === house.id && f.name === n)!;
};

beforeEach(() => {
  ops.clock.now = () => NOW;
  db = emptyDb();
  run((d) => ops.initWorld(d));
  run((d) => ops.completeOnboarding(d, { name: 'R', mode: 'six' }));
});

describe('migrações', () => {
  it('um banco v1 é atualizado sem perder nada, com cópia prévia no repositório', async () => {
    const repo = new MemoryRepository();
    const old = produce(db, (d) => {
      d.meta.world.schemaVersion = 1;
      const id = ops.createTask(d as Db, { title: 'Tarefa antiga' });
      delete (d.tasks[id] as { repeat?: unknown }).repeat;
    });
    await repo.replaceAll(old);
    await initStore(repo);
    expect(getDb().meta.world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.values(getDb().tasks).find((t) => t.title === 'Tarefa antiga')!.repeat).toBeNull();
    expect(Object.keys(getDb().houses)).toHaveLength(6);
    const snaps = await repo.listSnapshots();
    expect(snaps.some((s) => s.reason.startsWith('antes da migração'))).toBe(true);
    expect(needsMigration(getDb())).toBe(false);
  });

  it('recusa dados de uma versão mais nova em vez de corrompê-los', () => {
    const newer = produce(db, (d) => {
      d.meta.world.schemaVersion = SCHEMA_VERSION + 1;
    });
    expect(() => migrate(newer)).toThrow(NewerSchemaError);
  });

  it('o IndexedDB versão 1 atualiza para a 2 preservando os dados', async () => {
    const { openDB } = await import('idb');
    const name = `legado-${Date.now()}`;
    const legacy = await openDB(name, 1, {
      upgrade(d) {
        for (const t of ['meta', 'houses', 'furniture', 'placements', 'books', 'templates', 'tasks', 'tags', 'goals', 'constellations', 'attachments', 'blobs']) d.createObjectStore(t, { keyPath: 'id' });
      },
    });
    await legacy.put('houses', { id: 'h1', name: 'Casa antiga', themeId: 'lar', modelId: 'chale', color: 'telha', lotId: 'B1', hidden: false, order: 0, createdAt: 1 });
    await legacy.put('meta', { id: 'world', name: 'Antigo', createdAt: 1, onboarded: true, expansion: 0, schemaVersion: 1, settings: { reduceMotion: false, showAvatar: true, light: 'auto', avatar: { skin: 1, hair: 1, hairStyle: 0, shirt: 1, pants: 0 } } });
    legacy.close();
    const repo = new IndexedDbRepository(name);
    await initStore(repo);
    expect(getDb().houses['h1'].name).toBe('Casa antiga');
    expect(getDb().meta.world.schemaVersion).toBe(SCHEMA_VERSION);
    expect((await repo.listSnapshots()).length).toBeGreaterThan(0);
    await repo.putHandle('x', { a: 1 });
    expect(await repo.getHandle('x')).toEqual({ a: 1 });
  });
});

describe('integridade', () => {
  it('encontra e corrige referências quebradas sem apagar conteúdo do usuário', () => {
    const b = run((d) => ops.createBook(d, { title: 'Livro', furnitureId: shelf('Lar', 'Compras').id }));
    const t = run((d) => ops.createTask(d, { title: 'Tarefa', bookId: b }));
    const broken = produce(db, (d) => {
      delete d.furniture[shelf('Lar', 'Compras').id];
      delete d.books[b];
      d.tasks[t].refs = ['fantasma'];
    });
    const issues = checkIntegrity(broken);
    expect(issues.map((i) => i.problem)).toEqual(expect.arrayContaining(['objeto ligado a móvel inexistente', 'tarefa em livro inexistente', 'referências a livros inexistentes']));
    const fixed = produce(broken, (d) => {
      expect(repairIntegrity(d as Db)).toBeGreaterThan(0);
    });
    expect(fixed.tasks[t].bookId).toBeNull();
    expect(fixed.tasks[t].title).toBe('Tarefa');
    expect(checkIntegrity(fixed)).toHaveLength(0);
    expect(checkIntegrity(db)).toHaveLength(0);
  });
});

describe('cópias automáticas', () => {
  it('uma por dia, as 14 mais recentes, e restaurar guarda o estado atual antes', async () => {
    const repo = new MemoryRepository();
    expect(await ensureDailySnapshot(db, repo, NOW)).not.toBeNull();
    expect(await ensureDailySnapshot(db, repo, NOW + 3600000)).toBeNull();
    expect(await ensureDailySnapshot(db, repo, NOW + 25 * 3600000)).not.toBeNull();
    for (let i = 0; i < 20; i++) await takeSnapshot(db, repo, 'x', NOW + i * 1000);
    expect((await repo.listSnapshots()).length).toBe(KEEP_SNAPSHOTS);

    await initStore(new MemoryRepository());
    exec('Começar', (d) => ops.completeOnboarding(d, { name: 'Original', mode: 'six' }));
    const livro = exec('Livro', (d) => ops.createBook(d, { title: 'Antes' }));
    const { getRepo } = await import('@/store/db');
    await flush();
    const snap = await takeSnapshot(getDb(), getRepo(), 'teste');
    exec('Apagar', (d) => ops.deleteBook(d, livro));
    exec('Novo', (d) => ops.createBook(d, { title: 'Depois' }));
    expect(await restoreSnapshot(snap.id)).toBe(true);
    expect(Object.values(getDb().books).map((b) => b.title)).toEqual(['Antes']);
    expect(getDb().books[livro].trash).toBeUndefined();
    const reasons = (await getRepo().listSnapshots()).map((s) => s.reason);
    expect(reasons).toContain('antes de restaurar uma cópia');
    expect(parseSnapshot((await getRepo().getSnapshot(snap.id))!).books[livro].title).toBe('Antes');
    expect(dbStore.getState().undoStack).toHaveLength(0);
  });
});

describe('tarefas que se repetem', () => {
  it('ao concluir, cria a próxima em uma data futura e a concluída não se repete', () => {
    const id = run((d) => ops.createTask(d, { title: 'Pagar aluguel', dueDate: '2026-11-05', priority: 'high' }));
    run((d) => ops.setTaskRepeat(d, id, { every: 'month', interval: 1 }));
    run((d) => ops.updateTask(d, id, { checklist: [{ id: 'c', text: 'Conferir valor', done: true }] }));
    run((d) => ops.updateTask(d, id, { status: 'done' }));
    const all = Object.values(db.tasks);
    expect(all).toHaveLength(2);
    const next = all.find((t) => t.id !== id)!;
    expect(next).toMatchObject({ title: 'Pagar aluguel', status: 'pending', dueDate: '2026-12-05', priority: 'high' });
    expect(next.checklist.map((c) => c.done)).toEqual([false]);
    expect(next.repeat).toEqual({ every: 'month', interval: 1 });
    expect(db.tasks[id].status).toBe('done');
    expect(db.tasks[id].repeat).toBeNull();
    run((d) => ops.updateTask(d, id, { status: 'pending' }));
    run((d) => ops.updateTask(d, id, { status: 'done' }));
    expect(Object.values(db.tasks)).toHaveLength(2);
  });

  it('datas: fim de mês, ano bissexto, semanas e atrasos grandes', () => {
    expect(ops.nextRepeatDate('2026-01-31', { every: 'month', interval: 1 })).toBe('2026-02-28');
    expect(ops.nextRepeatDate('2028-02-29', { every: 'year', interval: 1 })).toBe('2029-02-28');
    expect(ops.nextRepeatDate('2026-11-12', { every: 'week', interval: 2 })).toBe('2026-11-26');
    expect(ops.nextRepeatDate('2026-12-30', { every: 'day', interval: 3 })).toBe('2027-01-02');
    const id = run((d) => ops.createTask(d, { title: 'Hábito', dueDate: '2026-10-01' }));
    run((d) => ops.setTaskRepeat(d, id, { every: 'day', interval: 1 }));
    run((d) => ops.updateTask(d, id, { status: 'done' }));
    expect(Object.values(db.tasks).find((t) => t.id !== id)!.dueDate).toBe('2026-11-13');
  });

  it('repetir sem prazo define o prazo de hoje', () => {
    const id = run((d) => ops.createTask(d, { title: 'Regar plantas' }));
    run((d) => ops.setTaskRepeat(d, id, { every: 'week', interval: 1 }));
    expect(db.tasks[id].dueDate).toBe('2026-11-12');
  });
});

describe('conexões', () => {
  it('referências e [[wikilinks]] formam conexões nos dois sentidos', () => {
    const a = run((d) => ops.createBook(d, { title: 'Projeto de expansão', furnitureId: shelf('Oficina', 'Projetos').id }));
    const b = run((d) => ops.createBook(d, { title: 'Fornecedor Alfa', furnitureId: shelf('Oficina', 'Equipes').id }));
    const c = run((d) => ops.createBook(d, { title: 'Reunião de kickoff', furnitureId: shelf('Oficina', 'Reuniões').id }));
    run((d) => {
      ops.addBlock(d, a, 'bookref', undefined, { bookId: b });
      ops.addBlock(d, c, 'text', undefined, { text: 'Decidimos seguir com [[projeto de EXPANSÃO]] e [[Fornecedor Alfa|o Alfa]].' });
    });
    expect(outLinks(db, db.books[a]).map((x) => x.id)).toEqual([b]);
    expect(outLinks(db, db.books[c]).map((x) => x.id).sort()).toEqual([a, b].sort());
    const l = bookLinks(db, b);
    expect(l.back.map((x) => x.id).sort()).toEqual([a, c].sort());
    const g = buildGraph(db, a, 1);
    expect(g.nodes.map((n) => n.id).sort()).toEqual([a, b, c].sort());
    expect(g.edges).toHaveLength(3);
    expect(buildGraph(db, null).nodes).toHaveLength(3);
    expect(buildGraph(db, a, 1).edges.every((e) => e.a !== e.b)).toBe(true);
  });

  it('renomear um livro mantém os [[links]] dos outros funcionando', () => {
    const a = run((d) => ops.createBook(d, { title: 'Nome velho', furnitureId: shelf('Lar', 'Compras').id }));
    const c = run((d) => ops.createBook(d, { title: 'Citação', furnitureId: shelf('Lar', 'Compras').id }));
    run((d) => ops.addBlock(d, c, 'text', undefined, { text: 'Veja [[Nome velho]] e [[Nome velho|apelido]].' }));
    run((d) => ops.updateBook(d, a, { title: 'Nome novo' }));
    const bl = db.books[c].blocks[0];
    expect(bl.type === 'text' && bl.text).toBe('Veja [[Nome novo]] e [[Nome novo|apelido]].');
    expect(outLinks(db, db.books[c]).map((x) => x.id)).toEqual([a]);
  });
});

describe('dados de exemplo', () => {
  it('preenchem as seis casas sem quebrar a integridade e dão conexões, repetições e objetivos', async () => {
    const { loadDemo } = await import('@/domain/demo');
    run((d) => loadDemo(d, NOW));
    expect(Object.values(db.books).length).toBeGreaterThanOrEqual(25);
    expect(checkIntegrity(db)).toHaveLength(0);
    expect(Object.values(db.tasks).some((t) => t.repeat)).toBe(true);
    expect(Object.values(db.goals).length).toBe(5);
    expect(buildGraph(db, null).edges.length).toBeGreaterThanOrEqual(6);
    for (const h of Object.values(db.houses)) expect(Object.values(db.books).some((b) => b.houseId === h.id)).toBe(true);
    expect(Object.values(db.books).filter((b) => !b.houseId).length).toBeGreaterThan(0);
  });
});
