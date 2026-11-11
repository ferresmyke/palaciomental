/** Folha de sprites: ferramenta de design para conferir toda a arte procedural de uma vez. */
import { CATALOG, HOUSE_MODELS, THEMES } from '@/domain/catalog';
import { cityPlan } from '@/domain/city';
import { fixedSprite, houseSprites, objectSprite, scenerySprite, siteSprites } from '@/game/art/sprites';
import { paintCityGround, paintRoom, paintWater } from '@/game/art/terrain';
import type { SpriteArt } from '@/game/art/px';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const scale = Number(params.get('s') ?? 3);
const only = params.get('only');

function section(title: string, floor = false): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row' + (floor ? ' floor' : '');
  app.append(h, row);
  return row;
}

function show(row: HTMLElement, a: SpriteArt | HTMLCanvasElement, label: string, s = scale): void {
  const canvas = a instanceof HTMLCanvasElement ? a : a.canvas;
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext('2d')!.drawImage(canvas, 0, 0);
  c.style.width = `${canvas.width * s}px`;
  c.style.height = `${canvas.height * s}px`;
  fig.append(c, label);
  row.append(fig);
}

function layered(row: HTMLElement, parts: SpriteArt[], label: string): void {
  const c = document.createElement('canvas');
  c.width = parts[0].canvas.width;
  c.height = parts[0].canvas.height;
  const ctx = c.getContext('2d')!;
  for (const p of parts) ctx.drawImage(p.canvas, 0, 0);
  show(row, c, label);
}

if (!only || only === 'city') {
  const houses = section('Casas (modelo × cor)');
  for (const m of HOUSE_MODELS)
    for (const color of m.colors.slice(0, 2)) {
      const h = houseSprites(m.id, color, THEMES[HOUSE_MODELS.indexOf(m) % THEMES.length].id);
      layered(houses, [h.body, h.roof], `${m.id}/${color}`);
    }
  const night = houseSprites('chale', 'telha', 'lar');
  layered(houses, [night.body, night.roof, night.glow], 'janelas acesas');
  const c = siteSprites('correio');
  layered(houses, [c.body, c.roof], 'correio');
  const o = siteSprites('observatorio');
  layered(houses, [o.body, o.roof], 'observatório');

  const fixed = section('Praça e lugares');
  show(fixed, fixedSprite.fountain(), 'fonte');
  show(fixed, fixedSprite.quadro(), 'quadro');
  show(fixed, fixedSprite.mesa(), 'mesa do dia');
  show(fixed, fixedSprite.feira(), 'feira');
  show(fixed, fixedSprite.poco(), 'poço');
  show(fixed, fixedSprite.lotSign(), 'terreno');
  for (const k of ['boxes', 'flowers', 'garden', 'pots', 'lantern'] as const) show(fixed, fixedSprite.yard(k), k);
  for (let i = 1; i <= 3; i++) show(fixed, fixedSprite.letters(i), `cartas ${i}`);
  show(fixed, fixedSprite.person({ skin: 1, hair: 2, hairStyle: 0, shirt: 1, pants: 0 }), 'avatar');
  show(fixed, fixedSprite.person({ skin: 3, hair: 0, hairStyle: 1, shirt: 2, pants: 1 }), 'vizinha');

  const scen = section('Cenário');
  for (const k of ['oak', 'pine', 'birch', 'fruit', 'bush', 'flowers', 'rock', 'reeds', 'stump', 'lantern', 'bench', 'cart', 'hay'])
    for (const seed of [1, 4]) show(scen, scenerySprite(k, seed), k);

  const cityObj = section('Catálogo da cidade');
  for (const item of CATALOG.filter((i) => i.scope === 'city'))
    item.variants.forEach((_, v) => show(cityObj, objectSprite({ catalogId: item.id, variant: v, color: item.colors[v % Math.max(1, item.colors.length)] ?? null }), `${item.id}#${v}`));
}

if (!only || only === 'interior') {
  const spines = ['ocre', 'azul', 'vinho', null, 'verde', 'cinza', 'rosa', 'musgo', 'azul', 'vinho', 'ocre', 'terracota', 'verde', 'ebano'];
  const state: Record<string, Record<string, unknown>> = {
    shelf: { spines },
    cabinet: { spines },
    bureau: { spines },
    cork: { spines },
    drawer: { count: 5 },
    box: { count: 3 },
    desk: { open: ['azul', 'vinho'], tasks: 2 },
    board: { count: 6, urgent: 2 },
    chest: { count: 2 },
  };
  for (const cat of ['essenciais', 'moveis', 'decoracao', 'tematicos', 'parede', 'tapetes']) {
    const row = section(`Interior: ${cat}`, true);
    for (const item of CATALOG.filter((i) => i.scope === 'interior' && i.category === cat))
      item.variants.forEach((_, v) =>
        show(row, objectSprite({ catalogId: item.id, variant: v, color: item.colors[(v * 2) % Math.max(1, item.colors.length)] ?? null, state: state[item.id] }), `${item.id}#${v}`),
      );
  }
  const rots = section('Rotações', true);
  for (const id of ['shelf', 'desk', 'chest', 'chair', 'armchair', 'drawer', 'cabinet'])
    for (const rot of [0, 1, 2, 3]) show(rots, objectSprite({ catalogId: id, rot, state: state[id] }), `${id} r${rot}`);
  const loose = section('Itens soltos', true);
  for (const k of ['book', 'crate', 'basket', 'papers', 'bag', 'parcel', 'scroll', 'letter']) show(loose, fixedSprite.loose(k, 'azul', 1), k);
}

if (only === 'rooms') {
  const rooms = section('Interiores');
  for (const t of THEMES) show(rooms, paintRoom(t.wall, t.floor), t.id, 2);
}
if (only === 'ground') {
  const g = section('Terreno');
  show(g, paintWater(), 'água', 3);
  show(g, paintCityGround(cityPlan(Number(params.get('e') ?? 0))), 'chão', Number(params.get('gs') ?? 1));
}
(window as unknown as { sheetReady: boolean }).sheetReady = true;
