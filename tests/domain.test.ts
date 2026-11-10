import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import * as ops from '@/domain/ops';
import { cityPlan, findPath, riverCenter, walkGrid, T, terrainAt } from '@/domain/city';
import { validateInterior, findFreeInteriorSpot, placementsIn, freeLots, citySolidCells, ROOM_W } from '@/domain/grid';
import { search } from '@/domain/search';
import * as sel from '@/domain/selectors';
import { TPL_NOTE, TPL_PROJECT } from '@/domain/seed';
import { emptyDb, CITY_SCOPE } from '@/domain/types';
import type { Db, ID } from '@/domain/types';
import { addDays, today } from '@/domain/util';

let db: Db;
/** Aplica uma operação como a loja faz: sobre um rascunho imutável. */
function run<T>(fn: (d: Db) => T): T {
  let out!: T;
  db = produce(db, (d) => {
    out = fn(d as Db);
  });
  return out;
}
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();
const houseByName = (name: string) => Object.values(db.houses).find((h) => h.name === name)!;
const shelf = (houseId: ID, name: string) => Object.values(db.furniture).find((f) => f.houseId === houseId && f.name === name)!;

beforeEach(() => {
  ops.clock.now = () => NOW;
  db = emptyDb();
  run((d) => ops.initWorld(d));
  run((d) => ops.completeOnboarding(d, { name: 'Recanto de Teste', mode: 'six' }));
});

describe('início e conjunto inicial', () => {
  it('cria as seis casas com interior-base, estantes sugeridas e constelações', () => {
    const houses = sel.liveHouses(db);
    expect(houses.map((h) => h.name)).toEqual(['Oficina', 'Lar', 'Tesouraria', 'Ginásio', 'Hospedaria', 'Ateliê']);
    expect(db.meta.world.name).toBe('Recanto de Teste');
    for (const h of houses) {
      const furn = sel.houseFurniture(db, h.id);
      expect(furn.filter((f) => f.kind === 'essential').map((f) => f.role).sort()).toEqual(['board', 'chest', 'desk']);
      expect(sel.containers(db, h.id).length).toBeGreaterThanOrEqual(3);
      expect(Object.values(db.constellations).some((c) => c.houseId === h.id)).toBe(true);
      expect(sel.tidy(db, h.id).label).toBe('Acolhedora');
    }
    expect(sel.containers(db, houseByName('Oficina').id).map((f) => f.name)).toEqual(['Projetos', 'Equipes', 'Processos', 'Reuniões']);
    expect(new Set(houses.map((h) => h.lotId)).size).toBe(6);
  });

  it('começar do zero deixa só a praça e terrenos livres', () => {
    db = emptyDb();
    run((d) => ops.initWorld(d));
    run((d) => ops.completeOnboarding(d, { name: '', mode: 'zero' }));
    expect(sel.liveHouses(db)).toHaveLength(0);
    expect(db.meta.world.name).toBe('Recanto');
    expect(freeLots(db, cityPlan(0)).length).toBe(12);
    expect(Object.keys(db.templates).length).toBeGreaterThanOrEqual(8);
  });

  it('o interior inicial não tem sobreposição inválida', () => {
    for (const h of sel.liveHouses(db)) {
      const ps = placementsIn(db, h.id);
      for (const p of ps) expect(validateInterior(p, ps, p.id).ok, `${h.name}: ${p.catalogId}`).toBe(true);
    }
  });
});

describe('endereço lógico permanente', () => {
  it('mover ou girar o móvel não altera o endereço dos livros', () => {
    const h = houseByName('Oficina');
    const s = shelf(h.id, 'Projetos');
    const bookId = run((d) => ops.createBook(d, { title: 'Contrato X', furnitureId: s.id }));
    const before = sel.bookAddress(db, db.books[bookId]).text;
    expect(before).toBe('Recanto de Teste › Oficina › Projetos › Contrato X');
    const p = ops.placementOfFurniture(db, s.id)!;
    run((d) => ops.movePlacement(d, p.id, 6, 6, 1));
    expect(db.placements[p.id]).toMatchObject({ x: 6, y: 6, rot: 1 });
    expect(sel.bookAddress(db, db.books[bookId]).text).toBe(before);
    expect(db.books[bookId].furnitureId).toBe(s.id);
  });

  it('status, urgência e conclusão mudam a representação, nunca o endereço', () => {
    const h = houseByName('Oficina');
    const s = shelf(h.id, 'Projetos');
    const bookId = run((d) => ops.createBook(d, { title: 'Reforma', templateId: TPL_PROJECT, furnitureId: s.id }));
    const taskId = run((d) => ops.createTask(d, { title: 'Orçar', bookId, dueDate: addDays(today(NOW), -3) }));
    const addr = sel.bookAddress(db, db.books[bookId]).text;
    run((d) => ops.updateTask(d, taskId, { status: 'doing' }));
    expect(sel.deskBooks(db, h.id).map((b) => b.id)).toContain(bookId);
    expect(sel.bookAddress(db, db.books[bookId]).text).toBe(addr);
    run((d) => ops.updateTask(d, taskId, { status: 'done' }));
    expect(sel.deskBooks(db, h.id)).toHaveLength(0);
    expect(sel.bookAddress(db, db.books[bookId]).text).toBe(addr);
  });

  it('trocar o tipo do móvel nunca perde conteúdo', () => {
    const h = houseByName('Lar');
    const s = shelf(h.id, 'Compras');
    const ids = ['A', 'B', 'C'].map((t) => run((d) => ops.createBook(d, { title: t, furnitureId: s.id })));
    for (const type of ['drawer', 'cork', 'box', 'cabinet', 'bureau', 'shelf'] as const) {
      run((d) => ops.setContainerType(d, s.id, type));
      expect(db.furniture[s.id].containerType).toBe(type);
      expect(sel.furnitureBooks(db, s.id).map((b) => b.id)).toEqual(ids);
      const ps = placementsIn(db, h.id);
      const p = ops.placementOfFurniture(db, s.id)!;
      expect(validateInterior(p, ps, p.id).ok).toBe(true);
    }
  });
});

describe('referências sem duplicação', () => {
  it('tarefa e projeto apontam para livros de outra casa sem copiar', () => {
    const hosp = houseByName('Hospedaria');
    const ofi = houseByName('Oficina');
    const pessoa = run((d) => ops.createBook(d, { title: 'Dra. Ana', templateId: 'tpl_person', furnitureId: shelf(hosp.id, 'Pessoas').id }));
    const projeto = run((d) => ops.createBook(d, { title: 'Check-up', templateId: TPL_PROJECT, furnitureId: shelf(ofi.id, 'Projetos').id }));
    const tarefa = run((d) => ops.createTask(d, { title: 'Ligar para a Dra. Ana', bookId: projeto }));
    run((d) => ops.updateTask(d, tarefa, { refs: [pessoa] }));
    run((d) => ops.addBlock(d, projeto, 'bookref', undefined, { bookId: pessoa }));
    expect(Object.values(db.books).filter((b) => b.title === 'Dra. Ana')).toHaveLength(1);
    run((d) => ops.updateBook(d, pessoa, { title: 'Dra. Ana Lima' }));
    expect(db.books[db.tasks[tarefa].refs[0]].title).toBe('Dra. Ana Lima');
    const ref = db.books[projeto].blocks[0];
    expect(ref.type === 'bookref' && db.books[ref.bookId!].title).toBe('Dra. Ana Lima');
  });
});

describe('progresso calculado', () => {
  it('projeto e objetivo derivam das tarefas', () => {
    const ofi = houseByName('Oficina');
    const goal = run((d) => ops.createGoal(d, { title: 'Lançar o site' }));
    expect(sel.goalProgress(db, db.goals[goal]).state).toBe('nopath');
    const p1 = run((d) => ops.tracePath(d, goal, { title: 'Conteúdo', houseId: ofi.id }));
    const p2 = run((d) => ops.tracePath(d, goal, { title: 'Design', houseId: ofi.id }));
    expect(db.books[p1].furnitureId).toBe(shelf(ofi.id, 'Projetos').id);
    const t = [1, 2, 3, 4].map((i) => run((d) => ops.createTask(d, { title: `T${i}`, bookId: p1 })));
    run((d) => ops.createTask(d, { title: 'D1', bookId: p2 }));
    expect(sel.projectProgress(db, p1)).toMatchObject({ done: 0, total: 4, ratio: 0 });
    run((d) => ops.updateTask(d, t[0], { status: 'done' }));
    run((d) => ops.updateTask(d, t[1], { status: 'done' }));
    expect(sel.projectProgress(db, p1).ratio).toBe(0.5);
    expect(sel.goalProgress(db, db.goals[goal]).ratio).toBe(0.25);
    run((d) => ops.deleteTask(d, t[2]));
    expect(sel.projectProgress(db, p1).total).toBe(3);
    run((d) => ops.updateGoal(d, goal, { dormant: true }));
    expect(sel.goalProgress(db, db.goals[goal]).state).toBe('dormant');
    expect(() => run((d) => ops.linkProject(d, goal, run((x) => ops.createBook(x, { title: 'nota' }))))).toThrow();
  });
});

describe('modelos de livro', () => {
  it('adicionar campo inclui em todos os livros; remover preserva os dados até a remoção definitiva', () => {
    const tpl = run((d) => ops.createTemplate(d, { name: 'Receita' }));
    const fTempo = run((d) => ops.addField(d, tpl, { name: 'Tempo', type: 'number' }));
    const b = run((d) => ops.createBook(d, { title: 'Bolo', templateId: tpl }));
    run((d) => ops.setBookField(d, b, fTempo, 40));
    const fOrigem = run((d) => ops.addField(d, tpl, { name: 'Origem', type: 'text' }));
    expect(db.templates[tpl].fields.map((f) => f.id)).toEqual([fTempo, fOrigem]);
    expect(db.books[b].fields[fOrigem]).toBeUndefined();
    run((d) => ops.hideField(d, tpl, fTempo));
    expect(db.templates[tpl].fields.find((f) => f.id === fTempo)?.hidden).toBe(true);
    expect(db.books[b].fields[fTempo]).toBe(40);
    run((d) => ops.hideField(d, tpl, fTempo, false));
    expect(db.templates[tpl].fields.find((f) => f.id === fTempo)?.hidden).toBeUndefined();
    run((d) => ops.purgeField(d, tpl, fTempo));
    expect(db.books[b].fields[fTempo]).toBeUndefined();
    expect(db.templates[tpl].fields.map((f) => f.id)).toEqual([fOrigem]);
  });

  it('mudar o tipo de um campo converte e avisa quando há perda', () => {
    const tpl = run((d) => ops.createTemplate(d, { name: 'Ficha' }));
    const f = run((d) => ops.addField(d, tpl, { name: 'Valor', type: 'text' }));
    const b1 = run((d) => ops.createBook(d, { title: 'um', templateId: tpl }));
    const b2 = run((d) => ops.createBook(d, { title: 'dois', templateId: tpl }));
    run((d) => ops.setBookField(d, b1, f, '1.250,50'));
    run((d) => ops.setBookField(d, b2, f, 'a combinar'));
    expect(ops.fieldTypeChangeLoss(db, tpl, f, 'currency')).toBe(1);
    expect(ops.fieldTypeChangeLoss(db, tpl, f, 'longtext')).toBe(0);
    run((d) => ops.changeFieldType(d, tpl, f, 'currency'));
    expect(db.books[b1].fields[f]).toBe(1250.5);
    expect(db.books[b2].fields[f]).toBeNull();
    run((d) => ops.changeFieldType(d, tpl, f, 'select'));
    const opt = db.templates[tpl].fields[0].options!;
    expect(opt.map((o) => o.label)).toEqual(['1250.5']);
    expect(db.books[b1].fields[f]).toBe(opt[0].id);
  });

  it('excluir modelo exige destino e transforma campos preenchidos em texto', () => {
    const b = run((d) => ops.createBook(d, { title: 'João', templateId: 'tpl_person' }));
    run((d) => ops.setBookField(d, b, 'p_phone', '11 99999-0000'));
    run((d) => ops.setBookField(d, b, 'p_relation', 'p_relation_o1'));
    expect(() => run((d) => ops.deleteTemplate(d, TPL_NOTE))).toThrow();
    run((d) => ops.deleteTemplate(d, 'tpl_person'));
    expect(db.books[b].templateId).toBe(TPL_NOTE);
    const first = db.books[b].blocks[0];
    expect(first.type === 'text' && first.text).toContain('Telefone: 11 99999-0000');
    expect(first.type === 'text' && first.text).toContain('Relação: Amizade');
    expect(db.templates['tpl_person'].trash).toBeTruthy();
  });

  it('duplicar um modelo pronto cria um modelo editável do usuário', () => {
    const copy = run((d) => ops.createTemplate(d, { name: 'Paciente', fromId: 'tpl_person' }));
    expect(db.templates[copy].system).toBe(false);
    expect(db.templates[copy].fields.map((f) => f.name)).toEqual(db.templates['tpl_person'].fields.map((f) => f.name));
    expect(db.templates[copy].fields[0].id).not.toBe(db.templates['tpl_person'].fields[0].id);
  });
});

describe('grade e colisão', () => {
  it('rejeita sobreposição, fora do cômodo e a entrada bloqueada', () => {
    const h = houseByName('Lar');
    const ps = placementsIn(db, h.id);
    expect(validateInterior({ catalogId: 'shelf', x: 0, y: 0, rot: 0 }, ps).ok).toBe(false);
    expect(validateInterior({ catalogId: 'shelf', x: ROOM_W - 1, y: 5, rot: 0 }, ps).ok).toBe(false);
    expect(validateInterior({ catalogId: 'crate', x: 6, y: 8, rot: 0 }, ps).reason).toMatch(/entrada/);
    expect(validateInterior({ catalogId: 'picture', x: 3, y: 2, rot: 0 }, ps).ok).toBe(false);
    expect(validateInterior({ catalogId: 'tree_oak', x: 3, y: 5, rot: 0 }, ps).ok).toBe(false);
  });

  it('tapetes e objetos de parede usam camadas próprias', () => {
    const ps = placementsIn(db, houseByName('Lar').id);
    // a mesa fica sobre o tapete; outro tapete no mesmo lugar não cabe
    expect(validateInterior({ catalogId: 'ruground', x: 6, y: 4, rot: 0 }, ps).ok).toBe(false);
    expect(validateInterior({ catalogId: 'ruground', x: 0, y: 5, rot: 0 }, ps).ok).toBe(true);
    // parede livre acima de uma estante é válida para um quadro
    expect(validateInterior({ catalogId: 'picture', x: 0, y: 0, rot: 0 }, ps).ok).toBe(true);
    expect(validateInterior({ catalogId: 'picture', x: 6, y: 0, rot: 0 }, ps).ok).toBe(false);
  });

  it('girar troca a largura pela profundidade', () => {
    const h = houseByName('Lar');
    const id = run((d) => ops.placeObject(d, { scope: h.id, catalogId: 'runner', x: 0, y: 2 }));
    run((d) => ops.rotatePlacement(d, id));
    expect(db.placements[id].rot).toBe(1);
    const others = placementsIn(db, h.id);
    expect(validateInterior({ catalogId: 'runner', x: 0, y: 6, rot: 1 }, others).ok).toBe(false);
    expect(validateInterior({ catalogId: 'runner', x: 0, y: 6, rot: 0 }, others, id).ok).toBe(true);
  });

  it('insere, duplica e remove decoração; essenciais não podem ser removidos nem duplicados', () => {
    const h = houseByName('Ateliê');
    const id = run((d) => ops.placeObject(d, { scope: h.id, catalogId: 'plant', x: 8, y: 6, variant: 2 }));
    const copy = run((d) => ops.duplicatePlacement(d, id));
    expect(db.placements[copy]).toMatchObject({ catalogId: 'plant', variant: 2 });
    expect(() => run((d) => ops.placeObject(d, { scope: h.id, catalogId: 'plant', x: 8, y: 6 }))).toThrow(ops.OpError);
    run((d) => ops.removePlacement(d, copy));
    expect(db.placements[copy]).toBeUndefined();
    const desk = ops.placementOfFurniture(db, sel.essential(db, h.id, 'desk')!.id)!;
    expect(() => run((d) => ops.removePlacement(d, desk.id))).toThrow();
    expect(() => run((d) => ops.duplicatePlacement(d, desk.id))).toThrow();
    expect(() => run((d) => ops.deleteFurniture(d, desk.furnitureId!, { mode: 'trash' }))).toThrow(/essencial/);
  });

  it('restaurar a disposição inicial mantém móveis e livros', () => {
    const h = houseByName('Oficina');
    const s = shelf(h.id, 'Equipes');
    const b = run((d) => ops.createBook(d, { title: 'Time A', furnitureId: s.id }));
    const p = ops.placementOfFurniture(db, s.id)!;
    run((d) => ops.movePlacement(d, p.id, 8, 6));
    const extra = run((d) => ops.createFurniture(d, { houseId: h.id, type: 'drawer', name: 'Fichas' }));
    run((d) => ops.restoreDefaultLayout(d, h.id));
    expect(ops.placementOfFurniture(db, s.id)).toMatchObject({ x: 2, y: 0, rot: 0 });
    expect(ops.placementOfFurniture(db, extra)).toBeTruthy();
    expect(db.books[b].furnitureId).toBe(s.id);
    const ps = placementsIn(db, h.id);
    for (const q of ps) expect(validateInterior(q, ps, q.id).ok).toBe(true);
  });

  it('a cidade valida terrenos, caminhos e vegetação; casas mudam de terreno livre', () => {
    const plan = cityPlan(0);
    expect(() => run((d) => ops.placeObject(d, { scope: CITY_SCOPE, catalogId: 'bench', x: 36, y: 30 }))).toThrow();
    let spot: { x: number; y: number } | null = null;
    for (let y = 33; y < 37 && !spot; y++)
      for (let x = 46; x < 60 && !spot; x++) {
        const free = (cx: number) => !plan.reserved[y * plan.w + cx] && !plan.scenery.some((s) => s.solid && s.x === cx && s.y === y);
        if (free(x) && free(x + 1)) spot = { x, y };
      }
    const id = run((d) => ops.placeObject(d, { scope: CITY_SCOPE, catalogId: 'bench', ...spot! }));
    expect(citySolidCells(db, plan).has(spot!.y * plan.w + spot!.x)).toBe(true);
    expect(() => run((d) => ops.placeObject(d, { scope: CITY_SCOPE, catalogId: 'lantern', ...spot! }))).toThrow();
    run((d) => ops.removePlacement(d, id));
    const h = houseByName('Lar');
    const other = houseByName('Oficina');
    expect(() => run((d) => ops.moveHouse(d, h.id, other.lotId))).toThrow(/ocupado/);
    const free = freeLots(db, plan)[0];
    run((d) => ops.moveHouse(d, h.id, free));
    expect(db.houses[h.id].lotId).toBe(free);
    expect(() => run((d) => ops.moveHouse(d, h.id, 'S1-1'))).toThrow();
    run((d) => ops.expandCity(d));
    run((d) => ops.moveHouse(d, h.id, 'S1-1'));
    expect(cityPlan(1).lots.length).toBe(20);
  });

  it('acha uma posição livre para um novo móvel', () => {
    const h = houseByName('Lar');
    const spot = findFreeInteriorSpot('drawer', placementsIn(db, h.id));
    expect(spot).not.toBeNull();
    const fid = run((d) => ops.createFurniture(d, { houseId: h.id, type: 'drawer' }));
    expect(ops.placementOfFurniture(db, fid)).toMatchObject(spot!);
    expect(db.furniture[fid].name).toBe('Gaveteiro');
    const fid2 = run((d) => ops.createFurniture(d, { houseId: h.id, type: 'drawer' }));
    expect(db.furniture[fid2].name).toBe('Gaveteiro 2');
  });
});

describe('integridade ao excluir e lixeira', () => {
  it('excluir casa exige destino: mover leva o conteúdo para outra casa', () => {
    const lar = houseByName('Lar');
    const ofi = houseByName('Oficina');
    const b = run((d) => ops.createBook(d, { title: 'Manual', furnitureId: shelf(lar.id, 'Documentos').id }));
    const t = run((d) => ops.createTask(d, { title: 'Trocar filtro', houseId: lar.id, onDesk: true }));
    expect(() => run((d) => ops.deleteHouse(d, lar.id, { mode: 'floor' }))).toThrow();
    expect(() => run((d) => ops.deleteHouse(d, lar.id, { mode: 'move', houseId: lar.id }))).toThrow();
    const batch = run((d) => ops.deleteHouse(d, lar.id, { mode: 'move', houseId: ofi.id }));
    expect(db.books[b]).toMatchObject({ houseId: ofi.id, furnitureId: null });
    expect(db.tasks[t].houseId).toBe(ofi.id);
    expect(sel.liveHouses(db).map((h) => h.name)).not.toContain('Lar');
    expect(sel.trashEntries(db, NOW)[0]).toMatchObject({ kind: 'house', label: 'Lar', batchId: batch });
    run((d) => ops.restoreBatch(d, batch));
    expect(db.houses[lar.id].trash).toBeUndefined();
    expect(sel.containers(db, lar.id).length).toBe(4);
  });

  it('excluir casa com conteúdo na lixeira restaura tudo no endereço original', () => {
    const lar = houseByName('Lar');
    const s = shelf(lar.id, 'Documentos');
    const b = run((d) => ops.createBook(d, { title: 'Escritura', furnitureId: s.id }));
    const batch = run((d) => ops.deleteHouse(d, lar.id, { mode: 'trash' }));
    expect(db.books[b].trash?.batchId).toBe(batch);
    expect(search(db, 'Escritura')).toHaveLength(0);
    const r = run((d) => ops.restoreBatch(d, batch));
    expect(r.needsDestination).toHaveLength(0);
    expect(sel.bookAddress(db, db.books[b]).text).toBe('Recanto de Teste › Lar › Documentos › Escritura');
  });

  it('arquivar o conteúdo ao excluir a casa leva ao arquivo geral', () => {
    const lar = houseByName('Lar');
    const b = run((d) => ops.createBook(d, { title: 'Garantia', furnitureId: shelf(lar.id, 'Documentos').id }));
    run((d) => ops.deleteHouse(d, lar.id, { mode: 'archive' }));
    expect(db.books[b].archivedAt).toBe(NOW);
    expect(sel.chestBooks(db, null).map((x) => x.id)).toEqual([b]);
    expect(sel.bookAddress(db, db.books[b]).text).toContain('Arquivo geral');
  });

  it('excluir móvel: mover para outro móvel, chão, arquivo ou lixeira', () => {
    const lar = houseByName('Lar');
    const a = shelf(lar.id, 'Compras');
    const c = shelf(lar.id, 'Documentos');
    const b1 = run((d) => ops.createBook(d, { title: 'Lista', furnitureId: a.id }));
    run((d) => ops.deleteFurniture(d, a.id, { mode: 'move', furnitureId: c.id }));
    expect(db.books[b1].furnitureId).toBe(c.id);
    const m = shelf(lar.id, 'Manutenção');
    const b2 = run((d) => ops.createBook(d, { title: 'Caldeira', furnitureId: m.id }));
    const batch = run((d) => ops.deleteFurniture(d, m.id, { mode: 'floor' }));
    expect(db.books[b2]).toMatchObject({ houseId: lar.id, furnitureId: null });
    expect(sel.looseItems(db, lar.id).map((i) => i.id)).toContain(b2);
    expect(placementsIn(db, lar.id).some((p) => p.furnitureId === m.id)).toBe(false);
    run((d) => ops.restoreBatch(d, batch));
    expect(placementsIn(db, lar.id).some((p) => p.furnitureId === m.id)).toBe(true);
  });

  it('livro restaurado sem endereço pede um destino', () => {
    const lar = houseByName('Lar');
    const s = shelf(lar.id, 'Compras');
    const b = run((d) => ops.createBook(d, { title: 'Feira', furnitureId: s.id }));
    const batchBook = run((d) => ops.deleteBook(d, b));
    const batchShelf = run((d) => ops.deleteFurniture(d, s.id, { mode: 'trash' }));
    run((d) => ops.purgeBatch(d, batchShelf));
    expect(db.furniture[s.id]).toBeUndefined();
    const r = run((d) => ops.restoreBatch(d, batchBook));
    expect(r.needsDestination).toEqual([{ kind: 'book', id: b }]);
    expect(db.books[b]).toMatchObject({ houseId: lar.id, furnitureId: null });
  });

  it('a lixeira expira em 30 dias e a exclusão definitiva limpa referências', () => {
    const ofi = houseByName('Oficina');
    const goal = run((d) => ops.createGoal(d, { title: 'Meta' }));
    const p = run((d) => ops.tracePath(d, goal, { title: 'Proj', houseId: ofi.id }));
    const t = run((d) => ops.createTask(d, { title: 'x', bookId: p }));
    run((d) => ops.deleteBook(d, p));
    expect(run((d) => ops.purgeExpired(d, NOW + 29 * 86400000))).toBe(0);
    expect(sel.trashEntries(db, NOW + 29 * 86400000)[0].daysLeft).toBe(1);
    expect(run((d) => ops.purgeExpired(d, NOW + 31 * 86400000))).toBe(1);
    expect(db.books[p]).toBeUndefined();
    expect(db.tasks[t].bookId).toBeNull();
    expect(db.goals[goal].projectIds).toEqual([]);
  });

  it('excluir etiqueta só a remove dos itens', () => {
    const tag = run((d) => ops.createTag(d, 'casa'));
    const t = run((d) => ops.createTask(d, { title: 'x' }));
    run((d) => ops.updateTask(d, t, { tagIds: [tag] }));
    run((d) => ops.deleteTag(d, tag));
    expect(db.tasks[t].tagIds).toEqual([]);
    expect(db.tasks[t].trash).toBeUndefined();
  });

  it('excluir constelação exige destino dos objetivos', () => {
    const c1 = run((d) => ops.createConstellation(d, 'Ano de 2027'));
    const c2 = run((d) => ops.createConstellation(d, 'Sonhos'));
    const g = run((d) => ops.createGoal(d, { title: 'Viajar', constellationId: c1 }));
    expect(() => run((d) => ops.deleteConstellation(d, c1, { mode: 'move', constellationId: c1 }))).toThrow();
    run((d) => ops.deleteConstellation(d, c1, { mode: 'move', constellationId: c2 }));
    expect(db.goals[g].constellationId).toBe(c2);
  });
});

describe('Correio, arrumação e Mesa do Dia', () => {
  it('uma tarefa do Correio é classificada, guardada e muda o índice de arrumação', () => {
    const lar = houseByName('Lar');
    const t = run((d) => ops.createTask(d, { title: 'Comprar lâmpadas' }));
    expect(sel.inboxCount(db)).toBe(1);
    expect(sel.taskAddress(db, db.tasks[t]).text).toBe('Recanto de Teste › Correio › Comprar lâmpadas');
    run((d) => ops.moveTask(d, t, { houseId: lar.id }));
    expect(sel.inboxCount(db)).toBe(0);
    expect(sel.looseItems(db, lar.id).map((i) => i.id)).toEqual([t]);
    expect(sel.tidy(db, lar.id)).toMatchObject({ total: 1, loose: 1, level: 2 });
    run((d) => ops.moveTask(d, t, { houseId: lar.id, onDesk: true }));
    expect(sel.tidy(db, lar.id)).toMatchObject({ loose: 0, level: 3, label: 'Esmerada' });
    expect(sel.taskAddress(db, db.tasks[t]).parts).toContain('Mesa de trabalho');
  });

  it('o índice de arrumação segue os limiares documentados', () => {
    const lar = houseByName('Lar');
    const s = shelf(lar.id, 'Compras');
    for (let i = 0; i < 8; i++) run((d) => ops.createBook(d, { title: `solto ${i}`, houseId: lar.id }));
    expect(sel.tidy(db, lar.id)).toMatchObject({ level: 0, label: 'Em arrumação' });
    const loose = () => sel.floorBooks(db, lar.id);
    for (let i = 0; i < 5; i++) run((d) => ops.moveBook(d, loose()[0].id, { houseId: lar.id, furnitureId: s.id }));
    expect(sel.tidy(db, lar.id)).toMatchObject({ loose: 3, level: 1 });
    for (let i = 0; i < 2; i++) run((d) => ops.moveBook(d, loose()[0].id, { houseId: lar.id, furnitureId: s.id }));
    expect(sel.tidy(db, lar.id)).toMatchObject({ loose: 1, level: 2 });
    run((d) => ops.moveBook(d, loose()[0].id, { houseId: lar.id, furnitureId: s.id }));
    expect(sel.tidy(db, lar.id)).toMatchObject({ loose: 0, level: 3, index: 1 });
  });

  it('a Mesa do Dia separa hoje, semana, atrasadas, urgentes, em andamento, aguardando e concluídas', () => {
    const t0 = today(NOW);
    const mk = (title: string, patch: Parameters<typeof ops.updateTask>[2]) => {
      const id = run((d) => ops.createTask(d, { title }));
      run((d) => ops.updateTask(d, id, patch));
      return id;
    };
    const a = mk('hoje', { dueDate: t0 });
    const b = mk('semana', { dueDate: addDays(t0, 4) });
    const c = mk('atrasada', { dueDate: addDays(t0, -2), priority: 'critical' });
    const d2 = mk('andando', { status: 'doing' });
    const e = mk('esperando', { status: 'waiting' });
    const f = mk('feita', { status: 'done', dueDate: addDays(t0, -5) });
    mk('arquivada', { status: 'archived' });
    const ag = sel.agenda(db, NOW);
    expect(ag.today.map((t) => t.id)).toEqual([a]);
    expect(ag.week.map((t) => t.id)).toEqual([b]);
    expect(ag.overdue.map((t) => t.id)).toEqual([c]);
    expect(ag.urgent.map((t) => t.id)).toEqual([c]);
    expect(ag.doing.map((t) => t.id)).toEqual([d2]);
    expect(ag.waiting.map((t) => t.id)).toEqual([e]);
    expect(ag.done.map((t) => t.id)).toEqual([f]);
    expect(sel.taskRisk(db.tasks[c], NOW)).toBe('overdue');
    expect(sel.taskRisk(db.tasks[f], NOW)).toBe('none');
    expect(db.tasks[f].completedAt).toBe(NOW);
  });

  it('resumo da casa usa a voz do app', () => {
    const lar = houseByName('Lar');
    expect(sel.houseSummary(db, lar.id, NOW)).toBe('Tudo no lugar.');
    for (let i = 0; i < 4; i++) run((d) => ops.createBook(d, { title: `x${i}`, houseId: lar.id }));
    run((d) => ops.createTask(d, { title: 'pagar', houseId: lar.id, onDesk: true, dueDate: addDays(today(NOW), 3) }));
    expect(sel.houseSummary(db, lar.id, NOW)).toBe('4 itens soltos. 1 prazo na quinta.');
  });

  it('a Ronda reúne itens soltos, atrasos e projetos parados', () => {
    const ofi = houseByName('Oficina');
    const p = run((d) => ops.createBook(d, { title: 'Parado', templateId: TPL_PROJECT, furnitureId: shelf(ofi.id, 'Projetos').id }));
    run((d) => ops.createTask(d, { title: 'velha', bookId: p, dueDate: addDays(today(NOW), -1) }));
    run((d) => ops.createTask(d, { title: 'solta' }));
    const later = NOW + 20 * 86400000;
    const cards = sel.rondaCards(db, later);
    expect(cards[0]).toMatchObject({ name: 'Correio' });
    const card = cards.find((c) => c.houseId === ofi.id)!;
    expect(card.overdue).toHaveLength(1);
    expect(card.stalled.map((b) => b.id)).toEqual([p]);
  });

  it('converte anotação do Correio em livro de um modelo, e de volta', () => {
    const hosp = houseByName('Hospedaria');
    const t = run((d) => ops.createTask(d, { title: 'Marina' }));
    run((d) => ops.updateTask(d, t, { notes: 'vizinha do 12' }));
    const b = run((d) => ops.taskToBook(d, t, 'tpl_person', { houseId: hosp.id, furnitureId: shelf(hosp.id, 'Pessoas').id }));
    expect(db.tasks[t]).toBeUndefined();
    expect(db.books[b]).toMatchObject({ title: 'Marina', templateId: 'tpl_person' });
    const t2 = run((d) => ops.bookToTask(d, b));
    expect(db.books[b]).toBeUndefined();
    expect(db.tasks[t2].notes).toBe('vizinha do 12');
  });
});

describe('busca universal', () => {
  it('encontra por título, conteúdo e campos de modelos personalizados, com endereço completo', () => {
    const hosp = houseByName('Hospedaria');
    const tpl = run((d) => ops.createTemplate(d, { name: 'Fornecedor' }));
    const f = run((d) => ops.addField(d, tpl, { name: 'Especialidade', type: 'text' }));
    const b = run((d) => ops.createBook(d, { title: 'Seu Zé', templateId: tpl, furnitureId: shelf(hosp.id, 'Pessoas').id }));
    run((d) => ops.setBookField(d, b, f, 'Encanamento e calhas'));
    run((d) => ops.addBlock(d, b, 'text', undefined, { text: 'Atende aos sábados de manhã.' }));
    const r1 = search(db, 'encanamento');
    expect(r1[0]).toMatchObject({ kind: 'book', id: b, typeLabel: 'Fornecedor', address: 'Recanto de Teste › Hospedaria › Pessoas › Seu Zé' });
    expect(r1[0].snippet).toContain('Encanamento');
    expect(search(db, 'sabados')[0].id).toBe(b);
    expect(search(db, 'ze')[0].id).toBe(b);
    expect(search(db, 'hospedaria').some((r) => r.kind === 'house')).toBe(true);
    expect(search(db, 'pessoas').some((r) => r.kind === 'furniture')).toBe(true);
    expect(search(db, 'inexistente')).toHaveLength(0);
    run((d) => ops.hideField(d, tpl, f));
    expect(search(db, 'encanamento')).toHaveLength(0);
  });
});

describe('planta da cidade e caminho do avatar', () => {
  it('a praça fica no centro, há rio com ponte e a colina só se alcança pela escada', () => {
    const plan = cityPlan(0);
    expect(terrainAt(plan, 36, 27)).toBe(T.PLAZA);
    expect(terrainAt(plan, 36, Math.floor(riverCenter(36)))).toBe(T.BRIDGE);
    expect(terrainAt(plan, 20, Math.floor(riverCenter(20)))).toBe(T.WATER);
    expect(terrainAt(plan, 36, 10)).toBe(T.STAIRS);
    const grid = walkGrid({ plan, occupiedLots: new Set(sel.liveHouses(db).map((h) => h.lotId)), solidCells: new Set() });
    const path = findPath(grid, plan.w, plan.h, plan.sites.fonte.door, plan.sites.observatorio.door)!;
    expect(path).not.toBeNull();
    expect(path.some((c) => terrainAt(plan, c.x, c.y) === T.STAIRS)).toBe(true);
    for (const c of path) expect(grid[c.y * plan.w + c.x]).toBe(1);
    for (const h of sel.liveHouses(db)) {
      const lot = plan.lots.find((l) => l.id === h.lotId)!;
      expect(findPath(grid, plan.w, plan.h, plan.sites.fonte.door, lot.door), h.name).not.toBeNull();
    }
    const south = findPath(grid, plan.w, plan.h, plan.sites.fonte.door, { x: 36, y: 45 })!;
    expect(south.some((c) => terrainAt(plan, c.x, c.y) === T.BRIDGE)).toBe(true);
  });

  it('ampliar a cidade acrescenta terrenos sem mudar os existentes', () => {
    const p0 = cityPlan(0);
    const p2 = cityPlan(2);
    expect(p2.lots.length).toBe(p0.lots.length + 16);
    for (const l of p0.lots) expect(p2.lots.find((x) => x.id === l.id)).toMatchObject({ x: l.x, y: l.y });
    expect(p2.h).toBeGreaterThan(p0.h);
  });
});
