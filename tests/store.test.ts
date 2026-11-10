import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as ops from '@/domain/ops';
import * as sel from '@/domain/selectors';
import { placementsIn } from '@/domain/grid';
import { exportBackup, importBackup, parseBackup, BackupError } from '@/persistence/backup';
import { IndexedDbRepository } from '@/persistence/idb';
import { MemoryRepository } from '@/persistence/memory';
import { dbStore, exec, flush, getDb, initStore, redo, replaceDb, undo } from '@/store/db';

let n = 0;
const freshIdb = () => new IndexedDbRepository(`teste-${Date.now()}-${n++}`);

beforeEach(() => {
  ops.clock.now = () => Date.now();
});

describe('comandos reversíveis', () => {
  it('desfaz e refaz edições, inclusive no layout', async () => {
    await initStore(new MemoryRepository());
    exec('Começar', (d) => ops.completeOnboarding(d, { name: 'R', mode: 'six' }));
    const house = sel.liveHouses(getDb())[0];
    const before = placementsIn(getDb(), house.id).length;
    const pid = exec('Inserir planta', (d) => ops.placeObject(d, { scope: house.id, catalogId: 'plant', x: 8, y: 6 }));
    exec('Mover planta', (d) => ops.movePlacement(d, pid, 9, 6));
    expect(getDb().placements[pid].x).toBe(9);
    expect(undo()).toBe('Mover planta');
    expect(getDb().placements[pid].x).toBe(8);
    expect(undo()).toBe('Inserir planta');
    expect(placementsIn(getDb(), house.id).length).toBe(before);
    expect(redo()).toBe('Inserir planta');
    expect(redo()).toBe('Mover planta');
    expect(getDb().placements[pid].x).toBe(9);
    expect(redo()).toBeNull();
  });

  it('agrupa a digitação em um único passo e descarta o refazer após nova edição', async () => {
    await initStore(new MemoryRepository());
    const id = exec('Novo livro', (d) => ops.createBook(d, { title: 'A' }));
    for (const t of ['Ab', 'Abc', 'Abcd']) exec('Renomear', (d) => ops.updateBook(d, id, { title: t }), { merge: `titulo:${id}` });
    expect(dbStore.getState().undoStack).toHaveLength(2);
    undo();
    expect(getDb().books[id].title).toBe('A');
    exec('Outra', (d) => ops.updateBook(d, id, { title: 'Z' }));
    expect(dbStore.getState().redoStack).toHaveLength(0);
  });

  it('operação inválida não altera o estado', async () => {
    await initStore(new MemoryRepository());
    const rev = dbStore.getState().rev;
    expect(() => exec('Livro sem título', (d) => ops.createBook(d, { title: '  ' }))).toThrow(ops.OpError);
    expect(dbStore.getState().rev).toBe(rev);
  });
});

describe('persistência em IndexedDB', () => {
  it('tudo sobrevive a fechar e reabrir: conteúdo, modelos, layout e anexos', async () => {
    const name = `persist-${Date.now()}`;
    await initStore(new IndexedDbRepository(name));
    exec('Começar', (d) => ops.completeOnboarding(d, { name: 'Recanto da Ana', mode: 'six' }));
    const house = sel.liveHouses(getDb())[1];
    const s = sel.containers(getDb(), house.id)[0];
    const tpl = exec('Modelo', (d) => ops.createTemplate(d, { name: 'Receita' }));
    const f = exec('Campo', (d) => ops.addField(d, tpl, { name: 'Tempo', type: 'number' }));
    const b = exec('Livro', (d) => ops.createBook(d, { title: 'Pão', templateId: tpl, furnitureId: s.id }));
    exec('Campo', (d) => ops.setBookField(d, b, f, 45));
    exec('Bloco', (d) => ops.addBlock(d, b, 'checklist', undefined, { items: [{ id: 'c1', text: 'Farinha', done: true }] }));
    const p = ops.placementOfFurniture(getDb(), s.id)!;
    exec('Mover', (d) => ops.movePlacement(d, p.id, 8, 6, 1));
    const pic = exec('Quadro', (d) => ops.placeObject(d, { scope: house.id, catalogId: 'picture', x: 5, y: 0 }));
    const repo = new IndexedDbRepository(name);
    await repo.putBlob({ id: 'anx_1', mime: 'image/png', data: new Uint8Array([1, 2, 3]).buffer });
    exec('Anexo', (d) => ops.addAttachment(d, { id: 'anx_1', name: 'foto.png', mime: 'image/png', size: 3 }));
    exec('Imagem do quadro', (d) => ops.setPlacementLook(d, pic, { imageId: 'anx_1' }));
    const t = exec('Tarefa', (d) => ops.createTask(d, { title: 'Comprar fermento' }));
    exec('Excluir', (d) => ops.deleteTask(d, t));
    await flush();

    await initStore(new IndexedDbRepository(name));
    const db = getDb();
    expect(db.meta.world).toMatchObject({ name: 'Recanto da Ana', onboarded: true });
    expect(sel.liveHouses(db)).toHaveLength(6);
    expect(db.books[b].fields[f]).toBe(45);
    expect(db.books[b].blocks[0]).toMatchObject({ type: 'checklist' });
    expect(db.placements[p.id]).toMatchObject({ x: 8, y: 6, rot: 1 });
    expect(db.placements[pic].imageId).toBe('anx_1');
    expect(db.templates[tpl].fields[0].name).toBe('Tempo');
    expect(db.tasks[t].trash).toBeTruthy();
    const blob = await new IndexedDbRepository(name).getBlob('anx_1');
    expect([...new Uint8Array(blob!.data)]).toEqual([1, 2, 3]);
  });

  it('desfazer também é persistido', async () => {
    const name = `undo-${Date.now()}`;
    await initStore(new IndexedDbRepository(name));
    const id = exec('Livro', (d) => ops.createBook(d, { title: 'Temporário' }));
    undo();
    await flush();
    await initStore(new IndexedDbRepository(name));
    expect(getDb().books[id]).toBeUndefined();
  });
});

describe('exportação e importação', () => {
  it('o backup leva conteúdo, modelos, layout e anexos para outro navegador', async () => {
    const a = freshIdb();
    await initStore(a);
    exec('Começar', (d) => ops.completeOnboarding(d, { name: 'Origem', mode: 'six' }));
    const house = sel.liveHouses(getDb())[0];
    const pid = exec('Planta', (d) => ops.placeObject(d, { scope: house.id, catalogId: 'plant', x: 8, y: 6, variant: 3, color: 'azul' }));
    const tpl = exec('Modelo', (d) => ops.createTemplate(d, { name: 'Ficha' }));
    await a.putBlob({ id: 'anx_9', mime: 'text/plain', data: new TextEncoder().encode('olá').buffer as ArrayBuffer });
    exec('Anexo', (d) => ops.addAttachment(d, { id: 'anx_9', name: 'nota.txt', mime: 'text/plain', size: 3 }));
    await flush();
    const json = await exportBackup(getDb(), a);

    const b = freshIdb();
    await initStore(b);
    expect(sel.liveHouses(getDb())).toHaveLength(0);
    replaceDb(await importBackup(json, b));
    await flush();
    await initStore(b);
    const db = getDb();
    expect(db.meta.world.name).toBe('Origem');
    expect(db.placements[pid]).toMatchObject({ catalogId: 'plant', variant: 3, color: 'azul' });
    expect(db.templates[tpl].name).toBe('Ficha');
    const blob = await b.getBlob('anx_9');
    expect(new TextDecoder().decode(blob!.data)).toBe('olá');
  });

  it('recusa arquivos que não são backup', () => {
    expect(() => parseBackup('não é json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"outro"}')).toThrow(BackupError);
  });
});
