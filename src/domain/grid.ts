/**
 * Regras de grade, encaixe e colisão. Independentes do Phaser para serem testadas sem renderizar.
 */
import type { CatalogItem } from './catalog';
import { catalogItem, findCatalogItem } from './catalog';
import type { CityPlan } from './city';
import { HOUSE_FP } from './city';
import type { Db, ID, Placement, Rot } from './types';
import { CITY_SCOPE } from './types';

export const ROOM_W = 14;
export const ROOM_H = 9;
/** Células em frente à porta: ficam livres de móveis. */
export const DOOR_CELLS = [
  { x: 6, y: 8 },
  { x: 7, y: 8 },
];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Candidate {
  catalogId: string;
  x: number;
  y: number;
  rot: Rot;
}

export interface Validity {
  ok: boolean;
  reason?: string;
}

export function footprint(item: CatalogItem, rot: Rot): { w: number; h: number } {
  if (item.rotatable && rot % 2 === 1) return { w: item.h, h: item.w };
  return { w: item.w, h: item.h };
}

export function rectOf(c: Candidate): Rect {
  const fp = footprint(catalogItem(c.catalogId), c.rot);
  return { x: c.x, y: c.y, w: fp.w, h: fp.h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Camada de colisão: objetos só colidem dentro da mesma camada. */
function layerOf(item: CatalogItem): string {
  if (item.mount === 'wall') return 'wall';
  if (item.mount === 'rug') return 'rug';
  if (item.mount === 'floor') return 'floor';
  return 'city';
}

export function validateInterior(c: Candidate, others: Placement[], ignoreId?: ID): Validity {
  const item = findCatalogItem(c.catalogId);
  if (!item || item.scope !== 'interior') return { ok: false, reason: 'Este objeto não pertence ao interior.' };
  const r = rectOf(c);
  if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return { ok: false, reason: 'Fora da grade.' };
  if (item.mount === 'wall') {
    if (c.y !== 0) return { ok: false, reason: 'Este objeto fica na parede do fundo.' };
    if (r.x < 0 || r.x + r.w > ROOM_W) return { ok: false, reason: 'Fora da parede.' };
  } else {
    if (r.x < 0 || r.y < 0 || r.x + r.w > ROOM_W || r.y + r.h > ROOM_H) return { ok: false, reason: 'Fora do cômodo.' };
    if (item.mount === 'floor' && DOOR_CELLS.some((d) => overlaps(r, { x: d.x, y: d.y, w: 1, h: 1 })))
      return { ok: false, reason: 'A entrada precisa ficar livre.' };
  }
  const layer = layerOf(item);
  for (const o of others) {
    if (o.id === ignoreId) continue;
    const oi = findCatalogItem(o.catalogId);
    if (!oi || layerOf(oi) !== layer) continue;
    if (overlaps(r, rectOf(o))) return { ok: false, reason: `Já existe ${oi.name.toLowerCase()} neste lugar.` };
  }
  return { ok: true };
}

export function validateCity(c: Candidate, others: Placement[], plan: CityPlan, ignoreId?: ID): Validity {
  const item = findCatalogItem(c.catalogId);
  if (!item || item.scope !== 'city') return { ok: false, reason: 'Este objeto não pertence à cidade.' };
  const r = rectOf(c);
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return { ok: false, reason: 'Fora do mapa.' };
      if (plan.reserved[y * plan.w + x]) return { ok: false, reason: 'Este lugar é de um caminho, da água ou de um terreno.' };
    }
  for (const s of plan.scenery)
    if (s.solid && overlaps(r, { x: s.x, y: s.y, w: 1, h: 1 })) return { ok: false, reason: 'Já existe vegetação neste lugar.' };
  for (const o of others) {
    if (o.id === ignoreId) continue;
    if (overlaps(r, rectOf(o))) return { ok: false, reason: 'Já existe um objeto neste lugar.' };
  }
  return { ok: true };
}

export function placementsIn(db: Db, scope: ID): Placement[] {
  const out: Placement[] = [];
  for (const p of Object.values(db.placements)) {
    if (p.scope !== scope) continue;
    if (p.furnitureId && db.furniture[p.furnitureId]?.trash) continue;
    out.push(p);
  }
  return out;
}

export function validatePlacement(db: Db, scope: ID, c: Candidate, plan: CityPlan | null, ignoreId?: ID): Validity {
  const others = placementsIn(db, scope);
  if (scope === CITY_SCOPE) {
    if (!plan) return { ok: false, reason: 'Planta da cidade indisponível.' };
    return validateCity(c, others, plan, ignoreId);
  }
  return validateInterior(c, others, ignoreId);
}

/** Procura a primeira posição válida no interior para um objeto. */
export function findFreeInteriorSpot(catalogId: string, others: Placement[], rot: Rot = 0): { x: number; y: number } | null {
  const item = catalogItem(catalogId);
  if (item.mount === 'wall') {
    for (let x = 0; x < ROOM_W; x++) if (validateInterior({ catalogId, x, y: 0, rot }, others).ok) return { x, y: 0 };
    return null;
  }
  // Prefere encostar na parede do fundo, depois nas laterais.
  for (let y = 0; y < ROOM_H; y++)
    for (let x = 0; x < ROOM_W; x++) if (validateInterior({ catalogId, x, y, rot }, others).ok) return { x, y };
  return null;
}

/** Terrenos livres (sem casa, mesmo oculta). */
export function freeLots(db: Db, plan: CityPlan, ignoreHouseId?: ID): string[] {
  const taken = new Set<string>();
  for (const h of Object.values(db.houses)) if (!h.trash && h.id !== ignoreHouseId) taken.add(h.lotId);
  return plan.lots.filter((l) => !taken.has(l.id)).map((l) => l.id);
}

/** Células sólidas ocupadas por decoração do usuário na cidade. */
export function citySolidCells(db: Db, plan: CityPlan): Set<number> {
  const cells = new Set<number>();
  for (const p of placementsIn(db, CITY_SCOPE)) {
    const item = findCatalogItem(p.catalogId);
    if (!item?.solid) continue;
    const r = rectOf(p);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.add(y * plan.w + x);
  }
  return cells;
}

/** Decoração de cidade que invade a área sólida de um terreno (após mudanças na planta). */
export function houseRect(lot: { x: number; y: number }): Rect {
  return { x: lot.x + HOUSE_FP.dx, y: lot.y + HOUSE_FP.dy, w: HOUSE_FP.w, h: HOUSE_FP.h };
}
