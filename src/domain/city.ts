/**
 * Planta da cidade: função pura do nível de ampliação.
 * A cena Phaser, o minimapa, a validação de grade e o caminho do avatar leem daqui.
 */
import { hashString, rng } from './util';

export const TILE = 16;

export const T = {
  GRASS: 0,
  ROAD: 1,
  PLAZA: 2,
  WATER: 3,
  BRIDGE: 4,
  HIGH: 5,
  CLIFF: 6,
  STAIRS: 7,
  HIGHROAD: 8,
} as const;

export const CITY_W = 72;
export const LOT_W = 7;
export const LOT_H = 6;
/** Área sólida da casa dentro do terreno. */
export const HOUSE_FP = { dx: 1, dy: 1, w: 5, h: 3 };

export type SiteId = 'fonte' | 'correio' | 'quadro' | 'mesa' | 'observatorio' | 'feira' | 'poco';

export interface Cell {
  x: number;
  y: number;
}

export interface Lot extends Cell {
  id: string;
  w: number;
  h: number;
  /** Célula em frente à porta, onde o avatar para. */
  door: Cell;
}

export interface Site extends Cell {
  id: SiteId;
  w: number;
  h: number;
  door: Cell;
  label: string;
  solid: boolean;
}

export interface Scenery extends Cell {
  kind: 'oak' | 'pine' | 'birch' | 'fruit' | 'bush' | 'flowers' | 'rock' | 'reeds' | 'lantern' | 'bench' | 'cart' | 'hay' | 'stump';
  seed: number;
  /** Deslocamento em pixels para quebrar o alinhamento da grade. */
  ox: number;
  oy: number;
  solid: boolean;
}

export interface CityPlan {
  w: number;
  h: number;
  expansion: number;
  terrain: Uint8Array;
  lots: Lot[];
  sites: Record<SiteId, Site>;
  plaza: { cx: number; cy: number; r: number };
  scenery: Scenery[];
  /** Células que não aceitam decoração do usuário nem passagem. */
  reserved: Uint8Array;
}

const COLS_OUTER = [3, 11, 19, 47, 55, 63];
const COLS_SOUTH = [3, 11, 19, 27, 39, 47, 55, 63];
const ROAD_X0 = 35;
const ROAD_X1 = 37;
const PLAZA = { cx: 36, cy: 30, r: 6.3 };

export function cityHeight(expansion: number): number {
  return expansion <= 0 ? 48 : 47 + 12 * expansion;
}

/** Centro do rio (em células) para uma coluna. */
export function riverCenter(x: number): number {
  return 40.6 + 1.1 * Math.sin(x / 7) + 0.7 * Math.sin(x / 3.1 + 1);
}

function makeLot(id: string, x: number, y: number): Lot {
  return { id, x, y, w: LOT_W, h: LOT_H, door: { x: x + 3, y: y + 4 } };
}

const cache = new Map<number, CityPlan>();

export function cityPlan(expansionRaw: number): CityPlan {
  const expansion = Math.max(0, Math.floor(expansionRaw));
  const hit = cache.get(expansion);
  if (hit) return hit;

  const w = CITY_W;
  const h = cityHeight(expansion);
  const terrain = new Uint8Array(w * h);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) terrain[y * w + x] = t;
  };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? terrain[y * w + x] : T.GRASS);
  const fill = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
  };

  // Rio
  for (let x = 0; x < w; x++) {
    const c = riverCenter(x);
    for (let y = 0; y < h; y++) if (Math.abs(y + 0.5 - c) < 1.75) set(x, y, T.WATER);
  }

  // Colina do Observatório
  fill(25, 2, 47, 9, T.HIGH);
  fill(25, 10, 47, 11, T.CLIFF);
  fill(ROAD_X0, 10, ROAD_X1, 11, T.STAIRS);
  fill(ROAD_X0, 8, ROAD_X1, 9, T.HIGHROAD);

  // Ruas
  const lastStreet = expansion <= 0 ? 45 : 53 + 12 * (expansion - 1);
  fill(3, 18, 69, 20, T.ROAD);
  fill(3, 29, 69, 31, T.ROAD);
  for (let y = 12; y <= lastStreet; y++)
    for (let x = ROAD_X0; x <= ROAD_X1; x++) set(x, y, get(x, y) === T.WATER ? T.BRIDGE : T.ROAD);
  for (let s = 1; s <= expansion; s++) {
    const y0 = 51 + 12 * (s - 1);
    fill(3, y0, 69, y0 + 2, T.ROAD);
  }

  // Praça
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - (PLAZA.cx + 0.5), y + 0.5 - (PLAZA.cy + 0.5));
      if (d <= PLAZA.r) set(x, y, T.PLAZA);
    }

  // Terrenos
  const lots: Lot[] = [];
  COLS_OUTER.forEach((x, i) => lots.push(makeLot(`B${i + 1}`, x, 23)));
  COLS_OUTER.forEach((x, i) => lots.push(makeLot(`A${i + 1}`, x, 12)));
  for (let s = 1; s <= expansion; s++)
    COLS_SOUTH.forEach((x, i) => lots.push(makeLot(`S${s}-${i + 1}`, x, 45 + 12 * (s - 1))));
  for (const lot of lots) {
    set(lot.x + 3, lot.y + 4, T.ROAD);
    set(lot.x + 3, lot.y + 5, T.ROAD);
  }

  // Lugares fixos
  const site = (id: SiteId, label: string, x: number, y: number, sw: number, sh: number, door: Cell, solid = true): Site => ({
    id,
    label,
    x,
    y,
    w: sw,
    h: sh,
    door,
    solid,
  });
  const sites: Record<SiteId, Site> = {
    fonte: site('fonte', 'Fonte', 35, 29, 3, 3, { x: 36, y: 32 }),
    correio: site('correio', 'Correio', 26, 23, 4, 3, { x: 28, y: 26 }),
    quadro: site('quadro', 'Quadro da cidade', 40, 26, 2, 1, { x: 40, y: 27 }),
    mesa: site('mesa', 'Mesa do Dia', 31, 34, 2, 1, { x: 32, y: 33 }),
    observatorio: site('observatorio', 'Observatório', 34, 4, 5, 4, { x: 36, y: 8 }),
    feira: site('feira', 'Feirinha', 41, 34, 3, 2, { x: 42, y: 33 }),
    poco: site('poco', 'Poço', 44, 25, 1, 1, { x: 44, y: 26 }),
  };
  // Caminho do Correio até a praça
  for (let x = 28; x <= 31; x++) set(x, 26, get(x, 26) === T.GRASS ? T.ROAD : get(x, 26));
  set(28, 27, T.ROAD);
  set(29, 27, T.ROAD);
  set(30, 27, T.ROAD);

  // Áreas reservadas (sem decoração do usuário)
  const reserved = new Uint8Array(w * h);
  const reserve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < w && y < h) reserved[y * w + x] = 1;
  };
  for (let i = 0; i < w * h; i++) if (terrain[i] !== T.GRASS && terrain[i] !== T.HIGH) reserved[i] = 1;
  for (const lot of lots) reserve(lot.x, lot.y, lot.x + lot.w - 1, lot.y + lot.h - 1);
  for (const s of Object.values(sites)) reserve(s.x, s.y - 1, s.x + s.w - 1, s.y + s.h);

  // Vegetação e detalhes de cenário
  const scenery: Scenery[] = [];
  const taken = new Uint8Array(w * h);
  const rand = rng(hashString('recanto') + expansion * 7919);
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && !reserved[y * w + x] && !taken[y * w + x];
  const put = (kind: Scenery['kind'], x: number, y: number, solid: boolean, jitter = 4) => {
    taken[y * w + x] = 1;
    scenery.push({
      kind,
      x,
      y,
      solid,
      seed: Math.floor(rand() * 1e9),
      ox: Math.round((rand() - 0.5) * 2 * jitter),
      oy: Math.round((rand() - 0.5) * jitter),
    });
  };
  const nearWater = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === T.WATER) return true;
    return false;
  };
  const nearRoad = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = get(x + dx, y + dy);
        if (t === T.ROAD || t === T.PLAZA || t === T.BRIDGE || t === T.STAIRS || t === T.HIGHROAD) return true;
      }
    return false;
  };

  // Lanternas e bancos: pontos fixos
  const fixed: [Scenery['kind'], number, number, boolean][] = [
    ['lantern', 30, 25, true],
    ['lantern', 42, 25, true],
    ['lantern', 29, 35, true],
    ['lantern', 43, 36, true],
    ['lantern', 34, 13, true],
    ['lantern', 38, 13, true],
    ['lantern', 33, 8, true],
    ['lantern', 39, 8, true],
    ['bench', 33, 24, true],
    ['bench', 39, 36, true],
    ['cart', 23, 32, true],
    ['hay', 45, 33, true],
  ];
  for (const x of [8, 16, 24, 48, 56, 64]) {
    fixed.push(['lantern', x, 32, true]);
    fixed.push(['lantern', x + 2, 21, true]);
  }
  for (let s = 1; s <= expansion; s++)
    for (const x of [8, 24, 44, 60]) fixed.push(['lantern', x, 54 + 12 * (s - 1), true]);
  for (const [kind, x, y, solid] of fixed) if (free(x, y)) put(kind, x, y, solid, 0);

  const trees: Scenery['kind'][] = ['oak', 'oak', 'pine', 'birch', 'oak', 'pine', 'fruit'];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!free(x, y)) continue;
      const t = get(x, y);
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const r = rand();
      const r2 = rand();
      if (nearRoad(x, y)) {
        if (r < 0.035) put('flowers', x, y, false);
        continue;
      }
      if (t === T.HIGH) {
        const nearTower = x >= 31 && x <= 41;
        if (!nearTower && r < 0.22) put(r2 < 0.75 ? 'pine' : 'rock', x, y, true);
        else if (r < 0.3) put('flowers', x, y, false);
        continue;
      }
      if (nearWater(x, y)) {
        if (r < 0.3) put(r2 < 0.6 ? 'reeds' : r2 < 0.85 ? 'rock' : 'bush', x, y, false);
        continue;
      }
      let p = 0.035;
      if (edge <= 1) p = 0.85;
      else if (edge <= 3) p = 0.5;
      else if (y < 11) p = 0.45;
      else if (y >= 21 && y <= 22) p = 0.3;
      else if (y > 43 && expansion === 0) p = 0.32;
      else if (y >= 33 && y <= 36) p = 0.1;
      if (r < p) {
        const kind = y < 11 ? (r2 < 0.6 ? 'pine' : 'oak') : trees[Math.floor(r2 * trees.length)];
        put(kind, x, y, true);
      } else if (r < p + 0.06) put(r2 < 0.5 ? 'bush' : r2 < 0.9 ? 'flowers' : 'stump', x, y, r2 < 0.5);
    }

  const plan: CityPlan = { w, h, expansion, terrain, lots, sites, plaza: PLAZA, scenery, reserved };
  cache.set(expansion, plan);
  return plan;
}

export function terrainAt(plan: CityPlan, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return T.CLIFF;
  return plan.terrain[y * plan.w + x];
}

export function lotById(plan: CityPlan, lotId: string): Lot | undefined {
  return plan.lots.find((l) => l.id === lotId);
}

/** Quantas ampliações são necessárias para que o terreno exista. */
export function expansionForLot(lotId: string): number {
  const m = /^S(\d+)-/.exec(lotId);
  return m ? Number(m[1]) : 0;
}

export interface WalkContext {
  plan: CityPlan;
  /** Terrenos ocupados por casas visíveis. */
  occupiedLots: Set<string>;
  /** Células ocupadas por decoração sólida do usuário. */
  solidCells: Set<number>;
}

export function walkGrid(ctx: WalkContext): Uint8Array {
  const { plan } = ctx;
  const grid = new Uint8Array(plan.w * plan.h);
  for (let i = 0; i < grid.length; i++) {
    const t = plan.terrain[i];
    grid[i] = t === T.WATER || t === T.CLIFF ? 0 : 1;
  }
  const block = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < plan.w && y < plan.h) grid[y * plan.w + x] = 0;
  };
  for (const s of Object.values(plan.sites)) if (s.solid) block(s.x, s.y, s.x + s.w - 1, s.y + s.h - 1);
  for (const lot of plan.lots)
    if (ctx.occupiedLots.has(lot.id))
      block(lot.x + HOUSE_FP.dx, lot.y + HOUSE_FP.dy, lot.x + HOUSE_FP.dx + HOUSE_FP.w - 1, lot.y + HOUSE_FP.dy + HOUSE_FP.h - 1);
  for (const sc of plan.scenery) if (sc.solid) grid[sc.y * plan.w + sc.x] = 0;
  for (const c of ctx.solidCells) grid[c] = 0;
  // A borda do planalto só é atravessada pela escada.
  for (let y = 0; y < plan.h; y++)
    for (let x = 0; x < plan.w; x++) {
      if (plan.terrain[y * plan.w + x] !== T.HIGH) continue;
      const low =
        terrainAt(plan, x - 1, y) === T.GRASS ||
        terrainAt(plan, x + 1, y) === T.GRASS ||
        terrainAt(plan, x, y - 1) === T.GRASS;
      if (low) grid[y * plan.w + x] = 0;
    }
  return grid;
}

/** A* em 8 direções sobre uma grade de células caminháveis. Retorna a rota incluindo origem e destino. */
export function findPath(grid: Uint8Array, w: number, h: number, from: Cell, to: Cell): Cell[] | null {
  const idx = (x: number, y: number) => y * w + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return null;
  let goal = to;
  if (!grid[idx(to.x, to.y)]) {
    // Destino bloqueado: procura a célula livre mais próxima.
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= 4 && !best; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = to.x + dx;
          const y = to.y + dy;
          if (!inside(x, y) || !grid[idx(x, y)]) continue;
          const d = Math.hypot(dx, dy) + Math.hypot(x - from.x, y - from.y) * 0.01;
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
    if (!best) return null;
    goal = best;
  }
  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const f = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const start = idx(from.x, from.y);
  const end = idx(goal.x, goal.y);
  g[start] = 0;
  f[start] = Math.hypot(goal.x - from.x, goal.y - from.y);
  open.push(start);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ] as const;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === end) {
      const path: Cell[] = [];
      let c = cur;
      while (c !== -1) {
        path.push({ x: c % w, y: Math.floor(c / w) });
        c = came[c];
      }
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const startCell = ni === start;
      if (!grid[ni] && !startCell) continue;
      if (dx !== 0 && dy !== 0 && (!grid[idx(cx + dx, cy)] || !grid[idx(cx, cy + dy)])) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + Math.hypot(goal.x - nx, goal.y - ny);
        came[ni] = cur;
        open.push(ni);
      }
    }
  }
  return null;
}
