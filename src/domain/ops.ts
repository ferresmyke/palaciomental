/**
 * Operações de domínio. Cada função altera um rascunho do banco (immer) e é
 * executada pela loja como um comando reversível. Nenhuma depende de UI ou Phaser.
 */
import { catalogItem, containerCatalogId, essentialCatalogId, findCatalogItem, houseModel, themeById, STARTER_THEMES } from './catalog';
import { cityPlan, expansionForLot } from './city';
import { findFreeInteriorSpot, freeLots, placementsIn, validatePlacement } from './grid';
import { ensureSeed, TPL_NOTE, TPL_PROJECT } from './seed';
import type {
  Block,
  BlockType,
  Book,
  ChecklistItem,
  ContainerType,
  Db,
  FieldDef,
  FieldType,
  FieldValue,
  Furniture,
  Goal,
  Horizon,
  House,
  ID,
  Placement,
  Priority,
  Repeat,
  Rot,
  Settings,
  SortMode,
  Task,
  TaskStatus,
  Template,
} from './types';
import { CITY_SCOPE, CONTAINER_LABEL } from './types';
import { newId, parseISODate, today, toISODate } from './util';

/** Relógio substituível em testes. */
export const clock = { now: (): number => Date.now() };

export class OpError extends Error {}

function fail(msg: string): never {
  throw new OpError(msg);
}

function world(db: Db) {
  return db.meta.world ?? fail('Mundo não inicializado.');
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
}

const live = <T extends { trash?: unknown }>(x: T | undefined): x is T => !!x && !x.trash;

// ───────────────────────────── Mundo ─────────────────────────────

export function initWorld(db: Db): void {
  ensureSeed(db, clock.now());
}

export function renameWorld(db: Db, name: string): void {
  world(db).name = name.trim() || 'Recanto';
}

export function updateSettings(db: Db, patch: Partial<Settings>): void {
  Object.assign(world(db).settings, patch);
}

export function expandCity(db: Db): void {
  world(db).expansion += 1;
}

const LOT_PREFERENCE = ['B3', 'B4', 'B2', 'B5', 'A3', 'A4', 'B1', 'B6', 'A2', 'A5', 'A1', 'A6'];

export function completeOnboarding(db: Db, opts: { name: string; mode: 'six' | 'zero' | 'demo' }): void {
  ensureSeed(db, clock.now());
  const w = world(db);
  w.name = opts.name.trim() || 'Recanto';
  w.onboarded = true;
  if (opts.mode !== 'zero')
    for (const themeId of STARTER_THEMES) {
      const theme = themeById(themeId);
      createHouse(db, { name: theme.name, themeId });
    }
}

// ───────────────────────────── Casas ─────────────────────────────

export function suggestLot(db: Db): string | null {
  const plan = cityPlan(world(db).expansion);
  const free = new Set(freeLots(db, plan));
  for (const id of LOT_PREFERENCE) if (free.has(id)) return id;
  return plan.lots.find((l) => free.has(l.id))?.id ?? null;
}

const SHELF_SLOTS = [0, 2, 10, 12];

function addFurniture(
  db: Db,
  houseId: ID,
  f: Pick<Furniture, 'name' | 'kind' | 'containerType' | 'role'>,
  p: Pick<Placement, 'catalogId' | 'x' | 'y'> & Partial<Placement>,
): ID {
  const now = clock.now();
  const id = newId('mv');
  db.furniture[id] = {
    id,
    houseId,
    sort: 'manual',
    order: nextOrder(Object.values(db.furniture).filter((x) => x.houseId === houseId)),
    createdAt: now,
    ...f,
  };
  const pid = newId('pl');
  db.placements[pid] = { id: pid, scope: houseId, rot: 0, variant: 0, color: null, createdAt: now, ...p, furnitureId: id };
  return id;
}

function buildBaseInterior(db: Db, house: House, withShelves: boolean): void {
  const theme = themeById(house.themeId);
  addFurniture(db, house.id, { name: 'Mesa de trabalho', kind: 'essential', role: 'desk' }, { catalogId: essentialCatalogId('desk'), x: 5, y: 3 });
  addFurniture(db, house.id, { name: 'Quadro de avisos', kind: 'essential', role: 'board' }, { catalogId: essentialCatalogId('board'), x: 6, y: 0 });
  addFurniture(db, house.id, { name: 'Baú', kind: 'essential', role: 'chest' }, { catalogId: essentialCatalogId('chest'), x: 10, y: 7 });
  if (withShelves)
    theme.shelves.slice(0, SHELF_SLOTS.length).forEach((name, i) => {
      addFurniture(db, house.id, { name, kind: 'container', containerType: 'shelf' }, { catalogId: 'shelf', x: SHELF_SLOTS[i], y: 0 });
    });
  addThemeDecor(db, house);
}

function addThemeDecor(db: Db, house: House): void {
  const theme = themeById(house.themeId);
  for (const d of theme.decor) {
    if (!findCatalogItem(d.catalogId)) continue;
    if (!validatePlacement(db, house.id, d, null).ok) continue;
    const pid = newId('pl');
    db.placements[pid] = {
      id: pid,
      scope: house.id,
      catalogId: d.catalogId,
      x: d.x,
      y: d.y,
      rot: d.rot ?? 0,
      variant: d.variant ?? 0,
      color: d.color ?? null,
      createdAt: clock.now(),
    };
  }
}

export function createHouse(
  db: Db,
  opts: { name: string; themeId: string; modelId?: string; color?: string; lotId?: string | null },
): ID {
  const name = opts.name.trim();
  if (!name) fail('A casa precisa de um nome.');
  const theme = themeById(opts.themeId);
  let lotId = opts.lotId ?? suggestLot(db);
  if (!lotId) {
    expandCity(db);
    lotId = suggestLot(db) ?? fail('Não há terreno livre.');
  }
  const plan = cityPlan(world(db).expansion);
  if (!freeLots(db, plan).includes(lotId)) fail('Este terreno já está ocupado.');
  const id = newId('casa');
  const model = houseModel(opts.modelId ?? theme.model);
  const house: House = {
    id,
    name,
    themeId: theme.id,
    modelId: model.id,
    color: opts.color ?? (model.colors.includes(theme.color) ? theme.color : model.colors[0]),
    lotId,
    hidden: false,
    order: nextOrder(Object.values(db.houses)),
    createdAt: clock.now(),
  };
  db.houses[id] = house;
  buildBaseInterior(db, house, true);
  const cid = newId('cons');
  db.constellations[cid] = { id: cid, name, houseId: id, order: nextOrder(Object.values(db.constellations)), createdAt: clock.now() };
  return id;
}

export function updateHouse(db: Db, id: ID, patch: Partial<Pick<House, 'name' | 'themeId' | 'modelId' | 'color' | 'hidden'>>): void {
  const h = db.houses[id] ?? fail('Casa não encontrada.');
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) fail('A casa precisa de um nome.');
    // A constelação padrão acompanha o nome enquanto não for renomeada à parte.
    for (const c of Object.values(db.constellations)) if (c.houseId === id && c.name === h.name) c.name = name;
    h.name = name;
  }
  if (patch.themeId !== undefined) h.themeId = themeById(patch.themeId).id;
  if (patch.modelId !== undefined) {
    const model = houseModel(patch.modelId);
    h.modelId = model.id;
    if (!model.colors.includes(h.color)) h.color = model.colors[0];
  }
  if (patch.color !== undefined) h.color = patch.color;
  if (patch.hidden !== undefined) h.hidden = patch.hidden;
}

export function moveHouse(db: Db, id: ID, lotId: string): void {
  const h = db.houses[id] ?? fail('Casa não encontrada.');
  const plan = cityPlan(world(db).expansion);
  if (!plan.lots.some((l) => l.id === lotId)) fail('Terreno inexistente.');
  if (!freeLots(db, plan, id).includes(lotId)) fail('Este terreno já está ocupado.');
  h.lotId = lotId;
}

export function reorderHouses(db: Db, orderedIds: ID[]): void {
  orderedIds.forEach((id, i) => {
    if (db.houses[id]) db.houses[id].order = i;
  });
}

export type ContentDest =
  | { mode: 'move'; houseId?: ID; furnitureId?: ID | null }
  | { mode: 'floor' }
  | { mode: 'archive' }
  | { mode: 'trash' };

function trashMark(batchId: ID) {
  return { deletedAt: clock.now(), batchId };
}

function archiveBookInPlace(b: Book): void {
  b.archivedAt = clock.now();
  b.pinnedOpen = false;
}

export function deleteHouse(db: Db, id: ID, dest: ContentDest): ID {
  const h = db.houses[id] ?? fail('Casa não encontrada.');
  if (dest.mode === 'move' && (!dest.houseId || !live(db.houses[dest.houseId]) || dest.houseId === id)) fail('Escolha outra casa de destino.');
  const targetHouse = dest.mode === 'move' ? dest.houseId! : null;
  if (dest.mode === 'floor') fail('Escolha o destino do conteúdo.');
  const batchId = newId('lote');
  for (const b of Object.values(db.books)) {
    if (b.houseId !== id || b.trash) continue;
    if (dest.mode === 'move') {
      b.houseId = targetHouse;
      b.furnitureId = null;
    } else if (dest.mode === 'archive') {
      archiveBookInPlace(b);
      b.houseId = null;
      b.furnitureId = null;
    } else b.trash = trashMark(batchId);
  }
  for (const t of Object.values(db.tasks)) {
    if (t.houseId !== id || t.trash) continue;
    if (dest.mode === 'move') t.houseId = targetHouse;
    else if (dest.mode === 'archive') {
      setStatusInternal(t, 'archived');
      t.houseId = null;
      t.onDesk = false;
    } else t.trash = trashMark(batchId);
  }
  for (const f of Object.values(db.furniture)) if (f.houseId === id && !f.trash) f.trash = trashMark(batchId);
  for (const c of Object.values(db.constellations)) if (c.houseId === id) c.houseId = null;
  h.trash = trashMark(batchId);
  return batchId;
}

// ───────────────────────────── Móveis e layout ─────────────────────────────

export function createFurniture(
  db: Db,
  opts: { houseId: ID; type: ContainerType; name?: string; x?: number; y?: number; rot?: Rot; variant?: number; color?: string | null },
): ID {
  if (!live(db.houses[opts.houseId])) fail('Casa não encontrada.');
  const catalogId = containerCatalogId(opts.type);
  const rot = opts.rot ?? 0;
  let pos = opts.x !== undefined && opts.y !== undefined ? { x: opts.x, y: opts.y } : null;
  if (pos) {
    const v = validatePlacement(db, opts.houseId, { catalogId, ...pos, rot }, null);
    if (!v.ok) fail(v.reason ?? 'Posição inválida.');
  } else {
    pos = findFreeInteriorSpot(catalogId, placementsIn(db, opts.houseId), rot) ?? fail('Não há espaço livre nesta casa. Abra espaço no Modo Reforma.');
  }
  const name = opts.name?.trim() || uniqueFurnitureName(db, opts.houseId, CONTAINER_LABEL[opts.type]);
  return addFurniture(
    db,
    opts.houseId,
    { name, kind: 'container', containerType: opts.type },
    { catalogId, x: pos.x, y: pos.y, rot, variant: opts.variant ?? 0, color: opts.color ?? null },
  );
}

function uniqueFurnitureName(db: Db, houseId: ID, base: string): string {
  const names = new Set(Object.values(db.furniture).filter((f) => f.houseId === houseId && !f.trash).map((f) => f.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function renameFurniture(db: Db, id: ID, name: string): void {
  const f = db.furniture[id] ?? fail('Móvel não encontrado.');
  if (!name.trim()) fail('O móvel precisa de um nome.');
  f.name = name.trim();
}

export function setFurnitureSort(db: Db, id: ID, sort: SortMode): void {
  (db.furniture[id] ?? fail('Móvel não encontrado.')).sort = sort;
}

export function placementOfFurniture(db: Db, furnitureId: ID): Placement | undefined {
  return Object.values(db.placements).find((p) => p.furnitureId === furnitureId);
}

/** Troca o tipo do móvel: muda só a apresentação. Os livros e o endereço permanecem. */
export function setContainerType(db: Db, furnitureId: ID, type: ContainerType): void {
  const f = db.furniture[furnitureId] ?? fail('Móvel não encontrado.');
  if (f.kind !== 'container') fail('Este móvel não pode mudar de tipo.');
  const p = placementOfFurniture(db, furnitureId) ?? fail('Móvel sem posição.');
  const catalogId = containerCatalogId(type);
  const item = catalogItem(catalogId);
  const rot: Rot = item.rotatable ? p.rot : 0;
  const tryAt = item.mount === 'wall' ? { x: p.x, y: 0 } : { x: p.x, y: p.y };
  let pos: { x: number; y: number } | null = tryAt;
  if (!validatePlacement(db, p.scope, { catalogId, ...tryAt, rot }, null, p.id).ok) {
    const others = placementsIn(db, p.scope).filter((o) => o.id !== p.id);
    pos = findFreeInteriorSpot(catalogId, others, rot);
  }
  if (!pos) fail('Não há espaço para este tipo de móvel. Abra espaço no Modo Reforma.');
  f.containerType = type;
  p.catalogId = catalogId;
  p.x = pos.x;
  p.y = pos.y;
  p.rot = rot;
  p.variant = 0;
}

export function deleteFurniture(db: Db, id: ID, dest: ContentDest): ID {
  const f = db.furniture[id] ?? fail('Móvel não encontrado.');
  if (f.kind === 'essential') fail('Este móvel é essencial e não pode ser removido.');
  const batchId = newId('lote');
  if (dest.mode === 'move') {
    const target = dest.furnitureId ? db.furniture[dest.furnitureId] : undefined;
    if (!live(target) || target.id === id || target.kind !== 'container') fail('Escolha outro móvel de destino.');
  }
  let order = dest.mode === 'move' && dest.furnitureId ? nextOrder(booksIn(db, dest.furnitureId)) : 0;
  for (const b of Object.values(db.books)) {
    if (b.furnitureId !== id || b.trash) continue;
    if (dest.mode === 'move') {
      const target = db.furniture[dest.furnitureId!];
      b.furnitureId = target.id;
      b.houseId = target.houseId;
      b.order = order++;
    } else if (dest.mode === 'floor') b.furnitureId = null;
    else if (dest.mode === 'archive') {
      archiveBookInPlace(b);
      b.furnitureId = null;
    } else b.trash = trashMark(batchId);
  }
  f.trash = trashMark(batchId);
  return batchId;
}

function booksIn(db: Db, furnitureId: ID): Book[] {
  return Object.values(db.books).filter((b) => b.furnitureId === furnitureId && !b.trash);
}

export interface PlaceOpts {
  scope: ID;
  catalogId: string;
  x: number;
  y: number;
  rot?: Rot;
  variant?: number;
  color?: string | null;
  name?: string;
}

function planFor(db: Db, scope: ID) {
  return scope === CITY_SCOPE ? cityPlan(world(db).expansion) : null;
}

/** Insere um objeto do catálogo. Móveis-contêiner ganham também o móvel lógico. */
export function placeObject(db: Db, o: PlaceOpts): ID {
  const item = catalogItem(o.catalogId);
  const rot: Rot = item.rotatable ? (o.rot ?? 0) : 0;
  if (item.kind === 'essential') fail('Cada casa já tem os seus móveis essenciais.');
  if (o.scope !== CITY_SCOPE && !live(db.houses[o.scope])) fail('Casa não encontrada.');
  const v = validatePlacement(db, o.scope, { catalogId: o.catalogId, x: o.x, y: o.y, rot }, planFor(db, o.scope));
  if (!v.ok) fail(v.reason ?? 'Posição inválida.');
  if (item.kind === 'container') {
    const fid = createFurniture(db, {
      houseId: o.scope,
      type: item.containerType!,
      name: o.name,
      x: o.x,
      y: o.y,
      rot,
      variant: o.variant,
      color: o.color,
    });
    return placementOfFurniture(db, fid)!.id;
  }
  const id = newId('pl');
  db.placements[id] = {
    id,
    scope: o.scope,
    catalogId: o.catalogId,
    x: o.x,
    y: o.y,
    rot,
    variant: o.variant ?? 0,
    color: o.color ?? null,
    createdAt: clock.now(),
  };
  return id;
}

/** Move (e opcionalmente gira) um objeto. O endereço lógico dos livros não muda. */
export function movePlacement(db: Db, id: ID, x: number, y: number, rot?: Rot): void {
  const p = db.placements[id] ?? fail('Objeto não encontrado.');
  const item = catalogItem(p.catalogId);
  const r: Rot = item.rotatable ? (rot ?? p.rot) : 0;
  const v = validatePlacement(db, p.scope, { catalogId: p.catalogId, x, y, rot: r }, planFor(db, p.scope), id);
  if (!v.ok) fail(v.reason ?? 'Posição inválida.');
  p.x = x;
  p.y = y;
  p.rot = r;
}

export function rotatePlacement(db: Db, id: ID): void {
  const p = db.placements[id] ?? fail('Objeto não encontrado.');
  const item = catalogItem(p.catalogId);
  if (!item.rotatable) fail('Este objeto não gira.');
  for (let i = 1; i <= 3; i++) {
    const rot = ((p.rot + i) % 4) as Rot;
    if (validatePlacement(db, p.scope, { catalogId: p.catalogId, x: p.x, y: p.y, rot }, planFor(db, p.scope), id).ok) {
      p.rot = rot;
      return;
    }
  }
  fail('Não há espaço para girar aqui.');
}

export function setPlacementLook(db: Db, id: ID, look: { variant?: number; color?: string | null; imageId?: ID | null }): void {
  const p = db.placements[id] ?? fail('Objeto não encontrado.');
  if (look.variant !== undefined) p.variant = look.variant;
  if (look.color !== undefined) p.color = look.color;
  if (look.imageId !== undefined) {
    if (look.imageId) p.imageId = look.imageId;
    else delete p.imageId;
  }
}

export function duplicatePlacement(db: Db, id: ID, at?: { x: number; y: number }): ID {
  const p = db.placements[id] ?? fail('Objeto não encontrado.');
  const item = catalogItem(p.catalogId);
  if (item.kind === 'essential') fail('Móveis essenciais são únicos em cada casa.');
  let pos = at ?? null;
  if (!pos) {
    const plan = planFor(db, p.scope);
    const tries = [
      [item.rotatable && p.rot % 2 ? item.h : item.w, 0],
      [0, item.rotatable && p.rot % 2 ? item.w : item.h],
      [-(item.rotatable && p.rot % 2 ? item.h : item.w), 0],
      [0, -(item.rotatable && p.rot % 2 ? item.w : item.h)],
    ];
    for (const [dx, dy] of tries) {
      const c = { x: p.x + dx, y: item.mount === 'wall' ? 0 : p.y + dy };
      if (validatePlacement(db, p.scope, { catalogId: p.catalogId, ...c, rot: p.rot }, plan).ok) {
        pos = c;
        break;
      }
    }
    if (!pos && p.scope !== CITY_SCOPE) pos = findFreeInteriorSpot(p.catalogId, placementsIn(db, p.scope), p.rot);
    if (!pos) fail('Não há espaço livre ao lado para duplicar.');
  }
  const f = p.furnitureId ? db.furniture[p.furnitureId] : undefined;
  const newPid = placeObject(db, {
    scope: p.scope,
    catalogId: p.catalogId,
    x: pos.x,
    y: pos.y,
    rot: p.rot,
    variant: p.variant,
    color: p.color,
    name: f ? uniqueFurnitureName(db, f.houseId, `${f.name} (cópia)`) : undefined,
  });
  if (p.imageId) db.placements[newPid].imageId = p.imageId;
  return newPid;
}

/** Remove decoração. Para móveis com conteúdo use deleteFurniture. */
export function removePlacement(db: Db, id: ID): void {
  const p = db.placements[id] ?? fail('Objeto não encontrado.');
  if (p.furnitureId) fail('Móveis são removidos escolhendo o destino dos livros.');
  delete db.placements[id];
}

/** Restaura a disposição inicial da casa. Móveis e livros permanecem; só as posições mudam. */
export function restoreDefaultLayout(db: Db, houseId: ID): void {
  const house = db.houses[houseId] ?? fail('Casa não encontrada.');
  const mine = Object.values(db.placements).filter((p) => p.scope === houseId);
  const furn = Object.values(db.furniture)
    .filter((f) => f.houseId === houseId && !f.trash)
    .sort((a, b) => a.order - b.order);
  const old = new Map(mine.filter((p) => p.furnitureId).map((p) => [p.furnitureId!, p]));
  for (const p of mine) if (!p.furnitureId || !db.furniture[p.furnitureId]?.trash) delete db.placements[p.id];
  const put = (f: Furniture, catalogId: string, x: number, y: number) => {
    const prev = old.get(f.id);
    const pid = prev?.id ?? newId('pl');
    db.placements[pid] = {
      id: pid,
      scope: houseId,
      catalogId,
      x,
      y,
      rot: 0,
      variant: prev?.variant ?? 0,
      color: prev?.color ?? null,
      furnitureId: f.id,
      createdAt: prev?.createdAt ?? clock.now(),
    };
  };
  const base: Record<string, [number, number]> = { desk: [5, 3], board: [6, 0], chest: [10, 7] };
  for (const f of furn) if (f.kind === 'essential') put(f, essentialCatalogId(f.role!), ...base[f.role!]);
  let slot = 0;
  for (const f of furn) {
    if (f.kind !== 'container') continue;
    const catalogId = containerCatalogId(f.containerType!);
    let pos: { x: number; y: number } | null = null;
    while (f.containerType === 'shelf' && slot < SHELF_SLOTS.length && !pos) {
      const c = { x: SHELF_SLOTS[slot++], y: 0 };
      if (validatePlacement(db, houseId, { catalogId, ...c, rot: 0 }, null).ok) pos = c;
    }
    pos ??= findFreeInteriorSpot(catalogId, placementsIn(db, houseId), 0);
    if (!pos) fail('Não foi possível reorganizar todos os móveis.');
    put(f, catalogId, pos.x, pos.y);
  }
  addThemeDecor(db, house);
}

// ───────────────────────────── Livros ─────────────────────────────

export function createBook(
  db: Db,
  opts: { title: string; templateId?: ID; houseId?: ID | null; furnitureId?: ID | null },
): ID {
  const title = opts.title.trim();
  if (!title) fail('O livro precisa de um título.');
  const tpl = live(db.templates[opts.templateId ?? TPL_NOTE]) ? db.templates[opts.templateId ?? TPL_NOTE] : db.templates[TPL_NOTE];
  let houseId = opts.houseId ?? null;
  let furnitureId = opts.furnitureId ?? null;
  if (furnitureId) {
    const f = db.furniture[furnitureId];
    if (!live(f) || f.kind !== 'container') fail('Móvel de destino inválido.');
    houseId = f.houseId;
  } else if (houseId && !live(db.houses[houseId])) fail('Casa não encontrada.');
  const now = clock.now();
  const id = newId('lv');
  db.books[id] = {
    id,
    title,
    templateId: tpl.id,
    houseId,
    furnitureId,
    order: furnitureId ? nextOrder(booksIn(db, furnitureId)) : now,
    fields: {},
    blocks: [],
    cover: { color: null, emblem: null, ribbon: null },
    pinnedOpen: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...(tpl.behavior === 'project' ? { project: { status: 'pending' as TaskStatus, dueDate: null, description: '' } } : {}),
  };
  return id;
}

function book(db: Db, id: ID): Book {
  return db.books[id] ?? fail('Livro não encontrado.');
}

function touch(b: { updatedAt: number }): void {
  b.updatedAt = clock.now();
}

export function updateBook(
  db: Db,
  id: ID,
  patch: Partial<Pick<Book, 'title' | 'pinnedOpen'>> & { cover?: Partial<Book['cover']>; project?: Partial<NonNullable<Book['project']>> },
): void {
  const b = book(db, id);
  if (patch.title !== undefined) {
    if (!patch.title.trim()) fail('O livro precisa de um título.');
    const old = b.title;
    b.title = patch.title.trim();
    if (old !== b.title) renameWikilinks(db, old, b.title);
  }
  if (patch.pinnedOpen !== undefined) b.pinnedOpen = patch.pinnedOpen;
  if (patch.cover) Object.assign(b.cover, patch.cover);
  if (patch.project && b.project) {
    Object.assign(b.project, patch.project);
    if (b.project.status === 'done' && !b.cover.ribbon) b.cover.ribbon = 'dourado';
  }
  touch(b);
}

/** Mantém os links [[assim]] funcionando quando um livro é renomeado. */
function renameWikilinks(db: Db, oldTitle: string, newTitle: string): void {
  const esc = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[\\[${esc}((?:#[^\\]|]*)?(?:\\|[^\\]]*)?)\\]\\]`, 'g');
  const safe = newTitle.replace(/[\]|[]/g, '');
  const fix = (text: string) => text.replace(re, (_m, rest: string) => `[[${safe}${rest}]]`);
  for (const o of Object.values(db.books)) {
    for (const bl of o.blocks) if (bl.type === 'text' || bl.type === 'heading') bl.text = fix(bl.text);
  }
}

export function setBookField(db: Db, id: ID, fieldId: ID, value: FieldValue): void {
  const b = book(db, id);
  b.fields[fieldId] = value;
  touch(b);
}

/** Guarda um livro em um móvel, deixa no chão de uma casa ou devolve ao Correio. */
export function moveBook(db: Db, id: ID, dest: { houseId: ID | null; furnitureId: ID | null }, index?: number): void {
  const b = book(db, id);
  if (dest.furnitureId) {
    const f = db.furniture[dest.furnitureId];
    if (!live(f) || f.kind !== 'container') fail('Móvel de destino inválido.');
    const siblings = booksIn(db, f.id)
      .filter((x) => x.id !== id)
      .sort((a, c) => a.order - c.order);
    const at = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    siblings.splice(at, 0, b);
    siblings.forEach((x, i) => (x.order = i));
    b.houseId = f.houseId;
    b.furnitureId = f.id;
  } else {
    if (dest.houseId && !live(db.houses[dest.houseId])) fail('Casa não encontrada.');
    b.houseId = dest.houseId;
    b.furnitureId = null;
    b.order = clock.now();
  }
  touch(b);
}

export function reorderBook(db: Db, id: ID, index: number): void {
  const b = book(db, id);
  if (!b.furnitureId) return;
  const f = db.furniture[b.furnitureId];
  if (f) f.sort = 'manual';
  moveBook(db, id, { houseId: b.houseId, furnitureId: b.furnitureId }, index);
}

export function archiveBook(db: Db, id: ID, archived = true): void {
  const b = book(db, id);
  if (archived) archiveBookInPlace(b);
  else {
    b.archivedAt = null;
    if (b.furnitureId && !live(db.furniture[b.furnitureId])) b.furnitureId = null;
  }
  touch(b);
}

export function deleteBook(db: Db, id: ID): ID {
  const b = book(db, id);
  const batchId = newId('lote');
  b.trash = trashMark(batchId);
  return batchId;
}

function newBlock(type: BlockType): Block {
  const id = newId('bl');
  switch (type) {
    case 'text':
    case 'heading':
      return { id, type, text: '' };
    case 'checklist':
      return { id, type, items: [] };
    case 'link':
      return { id, type, url: '', label: '' };
    case 'file':
    case 'image':
      return { id, type, attachmentId: null, caption: '' };
    case 'table':
      return {
        id,
        type,
        rows: [
          ['', ''],
          ['', ''],
        ],
      };
    case 'date':
      return { id, type, date: null, label: '' };
    case 'bookref':
      return { id, type, bookId: null };
  }
}

export function addBlock(db: Db, bookId: ID, type: BlockType, index?: number, init?: Partial<Block>): ID {
  const b = book(db, bookId);
  const block = { ...newBlock(type), ...(init ?? {}) } as Block;
  const at = index === undefined ? b.blocks.length : Math.max(0, Math.min(index, b.blocks.length));
  b.blocks.splice(at, 0, block);
  touch(b);
  return block.id;
}

export function updateBlock(db: Db, bookId: ID, blockId: ID, patch: Partial<Block>): void {
  const b = book(db, bookId);
  const block = b.blocks.find((x) => x.id === blockId) ?? fail('Bloco não encontrado.');
  Object.assign(block, patch, { id: block.id, type: block.type });
  touch(b);
}

export function moveBlock(db: Db, bookId: ID, blockId: ID, index: number): void {
  const b = book(db, bookId);
  const from = b.blocks.findIndex((x) => x.id === blockId);
  if (from < 0) fail('Bloco não encontrado.');
  const [block] = b.blocks.splice(from, 1);
  b.blocks.splice(Math.max(0, Math.min(index, b.blocks.length)), 0, block);
  touch(b);
}

export function removeBlock(db: Db, bookId: ID, blockId: ID): void {
  const b = book(db, bookId);
  b.blocks = b.blocks.filter((x) => x.id !== blockId);
  touch(b);
}

/** Texto legível de um valor de campo. */
export function fieldText(db: Db, def: FieldDef, value: FieldValue | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  switch (def.type) {
    case 'select':
      return def.options?.find((o) => o.id === value)?.label ?? '';
    case 'multiselect':
      return (value as string[]).map((v) => def.options?.find((o) => o.id === v)?.label ?? '').filter(Boolean).join(', ');
    case 'checklist':
      return (value as ChecklistItem[]).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
    case 'file':
    case 'image':
      return (value as string[]).map((a) => db.attachments[a]?.name ?? '').filter(Boolean).join(', ');
    case 'bookref':
      return db.books[value as string]?.title ?? '';
    default:
      return String(value);
  }
}

function fieldsAsText(db: Db, b: Book, tpl: Template): string {
  const lines: string[] = [];
  for (const def of tpl.fields) {
    const text = fieldText(db, def, b.fields[def.id]);
    if (text) lines.push(`${def.name}: ${text}`);
  }
  return lines.join('\n');
}

export function changeBookTemplate(db: Db, bookId: ID, templateId: ID): void {
  const b = book(db, bookId);
  const from = db.templates[b.templateId];
  const to = live(db.templates[templateId]) ? db.templates[templateId] : fail('Modelo não encontrado.');
  if (from?.id === to.id) return;
  const next: Record<ID, FieldValue> = {};
  const leftovers: string[] = [];
  if (from)
    for (const def of from.fields) {
      const value = b.fields[def.id];
      if (value === undefined || value === null || value === '') continue;
      const match = to.fields.find((d) => !d.hidden && d.name === def.name && d.type === def.type && !d.options);
      if (match) next[match.id] = value;
      else {
        const text = fieldText(db, def, value);
        if (text) leftovers.push(`${def.name}: ${text}`);
      }
    }
  if (leftovers.length) b.blocks.unshift({ id: newId('bl'), type: 'text', text: leftovers.join('\n') });
  b.fields = next;
  b.templateId = to.id;
  if (to.behavior === 'project' && !b.project) b.project = { status: 'pending', dueDate: null, description: '' };
  if (to.behavior !== 'project') delete b.project;
  touch(b);
}

// ───────────────────────────── Modelos de livro ─────────────────────────────

function template(db: Db, id: ID): Template {
  return db.templates[id] ?? fail('Modelo não encontrado.');
}

export function createTemplate(db: Db, opts: { name: string; fromId?: ID }): ID {
  const name = opts.name.trim();
  if (!name) fail('O modelo precisa de um nome.');
  const id = newId('tpl');
  const src = opts.fromId ? template(db, opts.fromId) : null;
  const idMap = new Map<string, string>();
  db.templates[id] = {
    id,
    name,
    system: false,
    behavior: 'none',
    fields: src
      ? src.fields
          .filter((f) => !f.hidden)
          .map((f) => {
            const fid = newId('cp');
            idMap.set(f.id, fid);
            return { ...f, id: fid, options: f.options?.map((o) => ({ ...o })) };
          })
      : [],
    cover: src ? { ...src.cover } : { color: 'ocre', emblem: 'book' },
    version: 1,
    createdAt: clock.now(),
  };
  return id;
}

export function updateTemplate(db: Db, id: ID, patch: { name?: string; cover?: Partial<Template['cover']> }): void {
  const t = template(db, id);
  if (patch.name !== undefined) {
    if (!patch.name.trim()) fail('O modelo precisa de um nome.');
    t.name = patch.name.trim();
  }
  if (patch.cover) Object.assign(t.cover, patch.cover);
  t.version++;
}

export function addField(db: Db, templateId: ID, opts: { name: string; type: FieldType; options?: string[] }): ID {
  const t = template(db, templateId);
  if (!opts.name.trim()) fail('O campo precisa de um nome.');
  const id = newId('cp');
  t.fields.push({
    id,
    name: opts.name.trim(),
    type: opts.type,
    ...(opts.type === 'select' || opts.type === 'multiselect'
      ? { options: (opts.options ?? []).map((label) => ({ id: newId('op'), label })) }
      : {}),
  });
  t.version++;
  return id;
}

function fieldDef(t: Template, fieldId: ID): FieldDef {
  return t.fields.find((f) => f.id === fieldId) ?? fail('Campo não encontrado.');
}

export function updateField(db: Db, templateId: ID, fieldId: ID, patch: { name?: string; options?: { id?: ID; label: string }[] }): void {
  const t = template(db, templateId);
  const f = fieldDef(t, fieldId);
  if (patch.name !== undefined) {
    if (!patch.name.trim()) fail('O campo precisa de um nome.');
    f.name = patch.name.trim();
  }
  if (patch.options) f.options = patch.options.map((o) => ({ id: o.id ?? newId('op'), label: o.label }));
  t.version++;
}

export function moveField(db: Db, templateId: ID, fieldId: ID, index: number): void {
  const t = template(db, templateId);
  const from = t.fields.findIndex((f) => f.id === fieldId);
  if (from < 0) fail('Campo não encontrado.');
  const [f] = t.fields.splice(from, 1);
  t.fields.splice(Math.max(0, Math.min(index, t.fields.length)), 0, f);
  t.version++;
}

/** Remove o campo do modelo sem apagar dados: ele fica oculto e recuperável. */
export function hideField(db: Db, templateId: ID, fieldId: ID, hidden = true): void {
  const t = template(db, templateId);
  const f = fieldDef(t, fieldId);
  if (hidden) f.hidden = true;
  else delete f.hidden;
  t.version++;
}

/** Remoção definitiva: apaga o campo e os dados dele em todos os livros. */
export function purgeField(db: Db, templateId: ID, fieldId: ID): void {
  const t = template(db, templateId);
  fieldDef(t, fieldId);
  t.fields = t.fields.filter((f) => f.id !== fieldId);
  for (const b of Object.values(db.books)) if (b.templateId === templateId) delete b.fields[fieldId];
  t.version++;
}

const TEXTUAL: FieldType[] = ['text', 'longtext', 'phone', 'email', 'link'];

function parseDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Converte um valor entre tipos de campo. `lost` indica perda de informação. */
export function convertFieldValue(
  db: Db,
  def: FieldDef,
  value: FieldValue | undefined,
  to: FieldType,
  targetOptions: { id: ID; label: string }[],
): { value: FieldValue; lost: boolean } {
  const empty =
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) return { value: null, lost: false };
  const from = def.type;
  if (from === to) return { value: value!, lost: false };
  const text = fieldText(db, def, value);
  const isTextual = (t: FieldType) => TEXTUAL.includes(t);
  const isScalar = (t: FieldType) => isTextual(t) || t === 'number' || t === 'currency' || t === 'date' || t === 'recurring';
  if (isTextual(to)) {
    const lost = from === 'file' || from === 'image' || (to !== 'longtext' && text.includes('\n'));
    return { value: lost && (from === 'file' || from === 'image') ? text : to === 'longtext' ? text : text.replace(/\n/g, '; '), lost };
  }
  if (to === 'number' || to === 'currency') {
    if (from === 'number' || from === 'currency') return { value: value!, lost: false };
    const cleaned = text.replace(/[^\d,.-]/g, '');
    const n = Number(cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned);
    return cleaned && Number.isFinite(n) ? { value: n, lost: false } : { value: null, lost: true };
  }
  if (to === 'date' || to === 'recurring') {
    if (from === 'date' || from === 'recurring') return { value: value!, lost: false };
    const d = parseDate(text);
    return d ? { value: d, lost: false } : { value: null, lost: true };
  }
  const optionFor = (label: string): ID => {
    const l = label.trim();
    let o = targetOptions.find((x) => x.label.toLowerCase() === l.toLowerCase());
    if (!o) {
      o = { id: newId('op'), label: l };
      targetOptions.push(o);
    }
    return o.id;
  };
  if (to === 'select') {
    if (from === 'multiselect') {
      const arr = value as string[];
      return { value: arr[0] ?? null, lost: arr.length > 1 };
    }
    if (isScalar(from) && !text.includes('\n')) return { value: optionFor(text), lost: false };
    return { value: null, lost: true };
  }
  if (to === 'multiselect') {
    if (from === 'select') return { value: [value as string], lost: false };
    if (isScalar(from))
      return {
        value: text
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(optionFor),
        lost: false,
      };
    return { value: null, lost: true };
  }
  if (to === 'checklist') {
    if (isTextual(from))
      return {
        value: text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((t) => ({ id: newId('ck'), text: t, done: false })),
        lost: false,
      };
    return { value: null, lost: true };
  }
  if ((to === 'file' || to === 'image') && (from === 'file' || from === 'image')) return { value: value!, lost: false };
  return { value: null, lost: true };
}

/** Quantos livros perderiam dados se o campo mudasse de tipo. */
export function fieldTypeChangeLoss(db: Db, templateId: ID, fieldId: ID, to: FieldType): number {
  const t = template(db, templateId);
  const def = fieldDef(t, fieldId);
  let lost = 0;
  const scratch = (def.options ?? []).map((o) => ({ ...o }));
  for (const b of Object.values(db.books))
    if (b.templateId === templateId && convertFieldValue(db, def, b.fields[fieldId], to, scratch).lost) lost++;
  return lost;
}

export function changeFieldType(db: Db, templateId: ID, fieldId: ID, to: FieldType): void {
  const t = template(db, templateId);
  const def = fieldDef(t, fieldId);
  if (def.type === to) return;
  const keepOptions = (def.type === 'select' || def.type === 'multiselect') && (to === 'select' || to === 'multiselect');
  const options = keepOptions ? (def.options ?? []) : [];
  const snapshot: FieldDef = { ...def, options: def.options?.map((o) => ({ ...o })) };
  for (const b of Object.values(db.books)) {
    if (b.templateId !== templateId || !(fieldId in b.fields)) continue;
    b.fields[fieldId] = convertFieldValue(db, snapshot, b.fields[fieldId], to, options).value;
  }
  def.type = to;
  if (to === 'select' || to === 'multiselect') def.options = options;
  else delete def.options;
  t.version++;
}

/** Exclui um modelo. Os livros passam a usar outro modelo e os campos preenchidos viram texto. */
export function deleteTemplate(db: Db, id: ID, destTemplateId: ID = TPL_NOTE): ID {
  const t = template(db, id);
  if (id === TPL_NOTE || id === TPL_PROJECT) fail('Este modelo sustenta funções do app e não pode ser excluído.');
  const dest = live(db.templates[destTemplateId]) && destTemplateId !== id ? db.templates[destTemplateId] : db.templates[TPL_NOTE];
  for (const b of Object.values(db.books)) {
    if (b.templateId !== id) continue;
    const text = fieldsAsText(db, b, t);
    if (text) b.blocks.unshift({ id: newId('bl'), type: 'text', text });
    b.fields = {};
    b.templateId = dest.id;
    if (dest.behavior === 'project' && !b.project) b.project = { status: 'pending', dueDate: null, description: '' };
  }
  const batchId = newId('lote');
  t.trash = trashMark(batchId);
  return batchId;
}

// ───────────────────────────── Tarefas ─────────────────────────────

function task(db: Db, id: ID): Task {
  return db.tasks[id] ?? fail('Tarefa não encontrada.');
}

export function createTask(
  db: Db,
  opts: { title: string; houseId?: ID | null; bookId?: ID | null; onDesk?: boolean; dueDate?: string | null; priority?: Priority; status?: TaskStatus },
): ID {
  const title = opts.title.trim();
  if (!title) fail('A tarefa precisa de um nome.');
  let houseId = opts.houseId ?? null;
  const bookId = opts.bookId ?? null;
  if (bookId) {
    const b = db.books[bookId];
    if (!live(b)) fail('Livro não encontrado.');
    houseId = b.houseId ?? houseId;
  }
  const now = clock.now();
  const id = newId('tf');
  db.tasks[id] = {
    id,
    title,
    description: '',
    houseId,
    bookId,
    onDesk: !!opts.onDesk && !!houseId && !bookId,
    status: opts.status ?? 'pending',
    priority: opts.priority ?? 'normal',
    tagIds: [],
    startDate: null,
    dueDate: opts.dueDate ?? null,
    checklist: [],
    notes: '',
    links: [],
    refs: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
  };
  return id;
}

function setStatusInternal(t: Task, status: TaskStatus): void {
  const now = clock.now();
  if (status === 'done' && t.status !== 'done') t.completedAt = now;
  if (status !== 'done' && status !== 'archived') t.completedAt = null;
  t.archivedAt = status === 'archived' ? now : null;
  t.status = status;
  t.updatedAt = now;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'priority' | 'tagIds' | 'startDate' | 'dueDate' | 'checklist' | 'notes' | 'links' | 'refs' | 'status'>
>;

export function updateTask(db: Db, id: ID, patch: TaskPatch): void {
  const t = task(db, id);
  const { status, title, ...rest } = patch;
  if (title !== undefined) {
    if (!title.trim()) fail('A tarefa precisa de um nome.');
    t.title = title.trim();
  }
  Object.assign(t, rest);
  const wasDone = t.status === 'done';
  if (status !== undefined) setStatusInternal(t, status);
  if (status === 'done' && !wasDone && t.repeat) spawnNextOccurrence(db, t);
  touch(t);
}

/** Próxima data de uma repetição. Meses curtos usam o último dia (31/01 + 1 mês = 28/02). */
export function nextRepeatDate(from: string, rep: Repeat): string {
  const d = parseISODate(from);
  const n = Math.max(1, Math.floor(rep.interval) || 1);
  if (rep.every === 'day') d.setDate(d.getDate() + n);
  else if (rep.every === 'week') d.setDate(d.getDate() + 7 * n);
  else {
    const day = d.getDate();
    d.setDate(1);
    if (rep.every === 'month') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return toISODate(d);
}

/** Ao concluir uma tarefa que se repete, cria a próxima: sempre em uma data futura. */
function spawnNextOccurrence(db: Db, t: Task): ID {
  const rep = t.repeat!;
  const now = clock.now();
  const base = t.dueDate ?? today(now);
  let next = nextRepeatDate(base, rep);
  for (let i = 0; i < 2000 && next <= today(now); i++) next = nextRepeatDate(next, rep);
  const gap = t.dueDate && t.startDate ? Math.round((parseISODate(t.dueDate).getTime() - parseISODate(t.startDate).getTime()) / 86400000) : null;
  const id = newId('tf');
  const nextStart = gap !== null ? toISODate(new Date(parseISODate(next).getTime() - gap * 86400000)) : null;
  db.tasks[id] = {
    ...t,
    id,
    status: 'pending',
    dueDate: next,
    startDate: nextStart,
    checklist: t.checklist.map((c) => ({ ...c, id: newId('ck'), done: false })),
    links: t.links.map((l) => ({ ...l, id: newId('lk') })),
    tagIds: [...t.tagIds],
    refs: [...t.refs],
    repeat: { ...rep },
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    trash: undefined,
  };
  delete db.tasks[id].trash;
  // A ocorrência concluída fica no histórico e não se repete de novo.
  t.repeat = null;
  return id;
}

export function setTaskRepeat(db: Db, id: ID, repeat: Repeat | null): void {
  const t = task(db, id);
  t.repeat = repeat ? { every: repeat.every, interval: Math.max(1, Math.floor(repeat.interval) || 1) } : null;
  if (repeat && !t.dueDate) t.dueDate = today(clock.now());
  touch(t);
}

/** Classifica ou guarda uma tarefa: casa, livro (opcional) ou mesa de trabalho. */
export function moveTask(db: Db, id: ID, dest: { houseId: ID | null; bookId?: ID | null; onDesk?: boolean }): void {
  const t = task(db, id);
  let houseId = dest.houseId;
  const bookId = dest.bookId ?? null;
  if (bookId) {
    const b = db.books[bookId];
    if (!live(b)) fail('Livro não encontrado.');
    houseId = b.houseId ?? houseId;
  }
  if (houseId && !live(db.houses[houseId])) fail('Casa não encontrada.');
  t.houseId = houseId;
  t.bookId = bookId;
  t.onDesk = !!dest.onDesk && !!houseId && !bookId;
  touch(t);
}

export function deleteTask(db: Db, id: ID): ID {
  const t = task(db, id);
  const batchId = newId('lote');
  t.trash = trashMark(batchId);
  return batchId;
}

/** Transforma uma anotação do Correio em livro de um modelo. */
export function taskToBook(db: Db, taskId: ID, templateId: ID, dest: { houseId: ID | null; furnitureId: ID | null }): ID {
  const t = task(db, taskId);
  const id = createBook(db, { title: t.title, templateId, houseId: dest.houseId, furnitureId: dest.furnitureId });
  const b = db.books[id];
  const text = [t.description, t.notes].filter(Boolean).join('\n\n');
  if (text) b.blocks.push({ id: newId('bl'), type: 'text', text });
  if (t.checklist.length) b.blocks.push({ id: newId('bl'), type: 'checklist', items: t.checklist.map((c) => ({ ...c })) });
  for (const l of t.links) b.blocks.push({ id: newId('bl'), type: 'link', url: l.url, label: l.label });
  if (b.project && t.dueDate) b.project.dueDate = t.dueDate;
  delete db.tasks[taskId];
  return id;
}

export function bookToTask(db: Db, bookId: ID): ID {
  const b = book(db, bookId);
  const id = createTask(db, { title: b.title, houseId: b.houseId });
  const t = db.tasks[id];
  t.notes = b.blocks
    .map((bl) => ('text' in bl ? bl.text : ''))
    .filter(Boolean)
    .join('\n\n');
  for (const bl of b.blocks) if (bl.type === 'checklist') t.checklist.push(...bl.items.map((c) => ({ ...c })));
  for (const other of Object.values(db.tasks)) if (other.bookId === bookId) other.bookId = null;
  delete db.books[bookId];
  return id;
}

// ───────────────────────────── Etiquetas ─────────────────────────────

export function createTag(db: Db, name: string, color = 'ocre'): ID {
  if (!name.trim()) fail('A etiqueta precisa de um nome.');
  const existing = Object.values(db.tags).find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing.id;
  const id = newId('tag');
  db.tags[id] = { id, name: name.trim(), color };
  return id;
}

export function updateTag(db: Db, id: ID, patch: { name?: string; color?: string }): void {
  const t = db.tags[id] ?? fail('Etiqueta não encontrada.');
  if (patch.name !== undefined && patch.name.trim()) t.name = patch.name.trim();
  if (patch.color !== undefined) t.color = patch.color;
}

/** Remove a etiqueta dos itens, sem apagar os itens. */
export function deleteTag(db: Db, id: ID): void {
  delete db.tags[id];
  for (const t of Object.values(db.tasks)) if (t.tagIds.includes(id)) t.tagIds = t.tagIds.filter((x) => x !== id);
}

// ───────────────────────────── Objetivos e constelações ─────────────────────────────

export function createConstellation(db: Db, name: string): ID {
  if (!name.trim()) fail('A constelação precisa de um nome.');
  const id = newId('cons');
  db.constellations[id] = { id, name: name.trim(), houseId: null, order: nextOrder(Object.values(db.constellations)), createdAt: clock.now() };
  return id;
}

export function renameConstellation(db: Db, id: ID, name: string): void {
  const c = db.constellations[id] ?? fail('Constelação não encontrada.');
  if (!name.trim()) fail('A constelação precisa de um nome.');
  c.name = name.trim();
}

export function deleteConstellation(db: Db, id: ID, dest: { mode: 'move'; constellationId: ID } | { mode: 'trash' }): void {
  if (!db.constellations[id]) fail('Constelação não encontrada.');
  if (dest.mode === 'move' && (!db.constellations[dest.constellationId] || dest.constellationId === id))
    fail('Escolha outra constelação de destino.');
  const batchId = newId('lote');
  for (const g of Object.values(db.goals)) {
    if (g.constellationId !== id || g.trash) continue;
    if (dest.mode === 'move') g.constellationId = dest.constellationId;
    else g.trash = trashMark(batchId);
  }
  delete db.constellations[id];
}

function defaultConstellation(db: Db): ID {
  const first = Object.values(db.constellations).sort((a, b) => a.order - b.order)[0];
  return first?.id ?? createConstellation(db, 'Meus objetivos');
}

export function createGoal(db: Db, opts: { title: string; constellationId?: ID; horizon?: Horizon; description?: string }): ID {
  if (!opts.title.trim()) fail('O objetivo precisa de um título.');
  const constellationId = opts.constellationId && db.constellations[opts.constellationId] ? opts.constellationId : defaultConstellation(db);
  const id = newId('obj');
  db.goals[id] = {
    id,
    title: opts.title.trim(),
    description: opts.description ?? '',
    horizon: opts.horizon ?? 'year',
    constellationId,
    projectIds: [],
    dormant: false,
    createdAt: clock.now(),
  };
  return id;
}

export function updateGoal(db: Db, id: ID, patch: Partial<Pick<Goal, 'title' | 'description' | 'horizon' | 'constellationId' | 'dormant'>>): void {
  const g = db.goals[id] ?? fail('Objetivo não encontrado.');
  if (patch.title !== undefined && !patch.title.trim()) fail('O objetivo precisa de um título.');
  if (patch.constellationId !== undefined && !db.constellations[patch.constellationId]) fail('Constelação não encontrada.');
  Object.assign(g, patch);
  if (patch.title !== undefined) g.title = patch.title.trim();
}

export function linkProject(db: Db, goalId: ID, bookId: ID, linked = true): void {
  const g = db.goals[goalId] ?? fail('Objetivo não encontrado.');
  if (linked) {
    const b = book(db, bookId);
    if (!b.project) fail('Só livros do modelo Projeto podem ser ligados a um objetivo.');
    if (!g.projectIds.includes(bookId)) g.projectIds.push(bookId);
  } else g.projectIds = g.projectIds.filter((x) => x !== bookId);
}

/** "Traçar caminho": cria um projeto na casa escolhida e o liga ao objetivo. */
export function tracePath(db: Db, goalId: ID, opts: { title: string; houseId: ID }): ID {
  const g = db.goals[goalId] ?? fail('Objetivo não encontrado.');
  const shelf = Object.values(db.furniture)
    .filter((f) => f.houseId === opts.houseId && !f.trash && f.kind === 'container')
    .sort((a, b) => Number(b.name.toLowerCase().includes('projeto')) - Number(a.name.toLowerCase().includes('projeto')) || a.order - b.order)[0];
  const id = createBook(db, { title: opts.title, templateId: TPL_PROJECT, houseId: opts.houseId, furnitureId: shelf?.id ?? null });
  g.projectIds.push(id);
  g.dormant = false;
  return id;
}

export function deleteGoal(db: Db, id: ID): ID {
  const g = db.goals[id] ?? fail('Objetivo não encontrado.');
  const batchId = newId('lote');
  g.trash = trashMark(batchId);
  return batchId;
}

// ───────────────────────────── Anexos ─────────────────────────────

export function addAttachment(db: Db, meta: { id: ID; name: string; mime: string; size: number }): void {
  db.attachments[meta.id] = { ...meta, createdAt: clock.now() };
}

// ───────────────────────────── Lixeira ─────────────────────────────

export const TRASH_DAYS = 30;
const TRASH_TABLES = ['houses', 'furniture', 'books', 'tasks', 'goals', 'templates'] as const;
type TrashTable = (typeof TRASH_TABLES)[number];

export interface RestoreResult {
  ok: boolean;
  /** Itens cujo endereço original não existe mais: o usuário decide onde guardar. */
  needsDestination: { kind: 'book' | 'task'; id: ID }[];
}

/** Restaura tudo o que foi excluído no mesmo lote, de volta ao endereço original. */
export function restoreBatch(db: Db, batchId: ID): RestoreResult {
  const needs: RestoreResult['needsDestination'] = [];
  for (const h of Object.values(db.houses)) {
    if (h.trash?.batchId !== batchId) continue;
    delete h.trash;
    const plan = cityPlan(Math.max(world(db).expansion, expansionForLot(h.lotId)));
    if (!freeLots(db, plan, h.id).includes(h.lotId)) {
      let lot = suggestLot(db);
      if (!lot) {
        expandCity(db);
        lot = suggestLot(db);
      }
      h.lotId = lot ?? h.lotId;
    }
    if (!Object.values(db.constellations).some((c) => c.houseId === h.id)) {
      const orphan = Object.values(db.constellations).find((c) => c.houseId === null && c.name === h.name);
      if (orphan) orphan.houseId = h.id;
    }
  }
  for (const f of Object.values(db.furniture)) {
    if (f.trash?.batchId !== batchId) continue;
    delete f.trash;
    const p = placementOfFurniture(db, f.id);
    if (p && live(db.houses[f.houseId])) {
      const others = placementsIn(db, f.houseId).filter((o) => o.id !== p.id);
      const here = { catalogId: p.catalogId, x: p.x, y: p.y, rot: p.rot };
      const clash = !validatePlacement(db, f.houseId, here, null, p.id).ok;
      if (clash) {
        const spot = findFreeInteriorSpot(p.catalogId, others, p.rot);
        if (spot) Object.assign(p, spot);
      }
    }
  }
  for (const b of Object.values(db.books)) {
    if (b.trash?.batchId !== batchId) continue;
    delete b.trash;
    const houseOk = !b.houseId || live(db.houses[b.houseId]);
    const furnOk = !b.furnitureId || live(db.furniture[b.furnitureId]);
    if (!houseOk || !furnOk) {
      if (!houseOk) b.houseId = null;
      b.furnitureId = null;
      needs.push({ kind: 'book', id: b.id });
    }
  }
  for (const t of Object.values(db.tasks)) {
    if (t.trash?.batchId !== batchId) continue;
    delete t.trash;
    if (t.bookId && !live(db.books[t.bookId])) t.bookId = null;
    if (t.houseId && !live(db.houses[t.houseId])) {
      t.houseId = null;
      t.onDesk = false;
      needs.push({ kind: 'task', id: t.id });
    }
  }
  for (const g of Object.values(db.goals)) {
    if (g.trash?.batchId !== batchId) continue;
    delete g.trash;
    if (!db.constellations[g.constellationId]) g.constellationId = defaultConstellation(db);
  }
  for (const t of Object.values(db.templates)) if (t.trash?.batchId === batchId) delete t.trash;
  return { ok: true, needsDestination: needs };
}

function purgeEntity(db: Db, table: TrashTable, id: ID): void {
  if (table === 'houses') {
    // Livros e tarefas de outros lotes ficam na lixeira e pedirão um destino ao serem restaurados.
    for (const p of Object.values(db.placements)) if (p.scope === id) delete db.placements[p.id];
    for (const f of Object.values(db.furniture)) if (f.houseId === id) delete db.furniture[f.id];
  } else if (table === 'furniture') {
    for (const p of Object.values(db.placements)) if (p.furnitureId === id) delete db.placements[p.id];
    for (const b of Object.values(db.books)) if (b.furnitureId === id && !b.trash) b.furnitureId = null;
  } else if (table === 'books') {
    for (const t of Object.values(db.tasks)) {
      if (t.bookId === id) t.bookId = null;
      if (t.refs.includes(id)) t.refs = t.refs.filter((x) => x !== id);
    }
    for (const g of Object.values(db.goals)) if (g.projectIds.includes(id)) g.projectIds = g.projectIds.filter((x) => x !== id);
  } else if (table === 'templates') {
    for (const b of Object.values(db.books)) if (b.templateId === id) b.templateId = TPL_NOTE;
  }
  delete (db[table] as Record<ID, unknown>)[id];
}

/** Exclusão definitiva de um lote da lixeira. */
export function purgeBatch(db: Db, batchId: ID): number {
  let n = 0;
  for (const table of TRASH_TABLES)
    for (const e of Object.values(db[table]) as { id: ID; trash?: { batchId: ID } }[])
      if (e.trash?.batchId === batchId && db[table][e.id]) {
        purgeEntity(db, table, e.id);
        n++;
      }
  return n;
}

export function emptyTrash(db: Db): number {
  const batches = new Set<ID>();
  for (const table of TRASH_TABLES)
    for (const e of Object.values(db[table]) as { trash?: { batchId: ID } }[]) if (e.trash) batches.add(e.trash.batchId);
  let n = 0;
  for (const b of batches) n += purgeBatch(db, b);
  return n;
}

/** Remove da lixeira o que passou de 30 dias. */
export function purgeExpired(db: Db, now: number = clock.now()): number {
  const limit = now - TRASH_DAYS * 86400000;
  const batches = new Set<ID>();
  for (const table of TRASH_TABLES)
    for (const e of Object.values(db[table]) as { trash?: { batchId: ID; deletedAt: number } }[])
      if (e.trash && e.trash.deletedAt < limit) batches.add(e.trash.batchId);
  let n = 0;
  for (const b of batches) n += purgeBatch(db, b);
  return n;
}
