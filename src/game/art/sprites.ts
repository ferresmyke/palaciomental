/**
 * Registro de sprites: resolve um item do catálogo (receita + variação + cor + rotação + estado)
 * em um canvas, com cache. As cenas transformam o canvas em textura; a interface usa o canvas direto.
 */
import { findCatalogItem, houseModel, themeById, type CatalogItem } from '@/domain/catalog';
import type { AvatarLook } from '@/domain/types';
import { hashString } from '@/domain/util';
import { lookKey, paintPerson } from './chars';
import {
  CITY_RECIPES,
  paintFeira,
  paintFountain,
  paintGlow,
  paintHouse,
  paintLetters,
  paintLotSign,
  paintMesa,
  paintObservatory,
  paintPoco,
  paintPuff,
  paintQuadro,
  paintYard,
  type HouseArt,
  type RecipeOpts,
} from './cityArt';
import { INTERIOR_RECIPES, paintLoose } from './interiorArt';
import { art, Px, type SpriteArt } from './px';

const cache = new Map<string, SpriteArt>();
const houseCache = new Map<string, HouseArt>();

function memo(key: string, make: () => SpriteArt): SpriteArt & { key: string } {
  let a = cache.get(key);
  if (!a) {
    a = make();
    cache.set(key, a);
  }
  return Object.assign(a, { key });
}

export type Keyed = SpriteArt & { key: string };

function fallback(item: CatalogItem): SpriteArt {
  const p = new Px(item.w * 16, item.h * 16 + 8);
  p.rect(1, 1, p.w - 2, p.h - 2, 0x8c5c32);
  p.frame(1, 1, p.w - 2, p.h - 2, 0x4a2f1c);
  p.outline();
  return art(p, 0, 0);
}

export interface ObjectLook {
  catalogId: string;
  variant?: number;
  color?: string | null;
  rot?: number;
  state?: Record<string, unknown>;
  seed?: number;
}

/** Sprite de um objeto do catálogo. */
export function objectSprite(look: ObjectLook): Keyed {
  const item = findCatalogItem(look.catalogId);
  const variant = look.variant ?? 0;
  const color = look.color ?? item?.colors[0] ?? null;
  const rot = item?.rotatable ? (look.rot ?? 0) : 0;
  const stateKey = look.state ? JSON.stringify(look.state) : '';
  const seed = look.seed ?? hashString(look.catalogId) % 9973;
  const key = `o:${look.catalogId}:${variant}:${color}:${rot}:${seed}:${stateKey}`;
  return memo(key, () => {
    if (!item) return fallback({ id: '?', name: '?', category: '', scope: 'interior', kind: 'decor', mount: 'floor', w: 1, h: 1, recipe: '', variants: [], colors: [] });
    const recipe = (item.scope === 'city' ? CITY_RECIPES : INTERIOR_RECIPES)[item.recipe];
    const opts: RecipeOpts = { variant, color, rot, seed, state: look.state };
    return recipe ? recipe(opts) : fallback(item);
  });
}

/** Cenário fixo da cidade (árvores, pedras, lanternas...). */
export function scenerySprite(kind: string, seed: number): Keyed {
  const bucket = seed % 5;
  const variant = kind === 'oak' ? (bucket === 0 ? 1 : 0) : kind === 'pine' ? (bucket < 2 ? 1 : 0) : bucket % 2;
  const color = (kind === 'oak' || kind === 'bush' || kind === 'birch') && bucket === 4 ? (seed % 2 ? 'outono' : 'florida') : null;
  const key = `s:${kind}:${bucket}`;
  return memo(key, () => {
    const recipe = CITY_RECIPES[kind];
    return recipe ? recipe({ variant: kind === 'lantern' ? 0 : variant, color, rot: 0, seed: 100 + bucket * 17 }) : paintLotSign();
  });
}

export function houseSprites(modelId: string, color: string, themeId: string): HouseArt & { key: string } {
  const key = `h:${modelId}:${color}:${themeId}`;
  let a = houseCache.get(key);
  if (!a) {
    const theme = themeById(themeId);
    const accent = { stone: 'azul', cream: 'verde', green: 'vinho', sky: 'azul', wine: 'ocre', lilac: 'rosa' }[theme.wall] ?? 'verde';
    a = paintHouse(houseModel(modelId), color, theme.emblem, accent);
    houseCache.set(key, a);
  }
  return Object.assign(a, { key });
}

export function siteSprites(site: 'correio' | 'observatorio'): HouseArt & { key: string } {
  const key = `site:${site}`;
  let a = houseCache.get(key);
  if (!a) {
    a =
      site === 'observatorio'
        ? paintObservatory()
        : paintHouse({ id: 'correio', name: '', desc: '', walls: 'plaster', roof: 'tile', colors: [] }, 'ardosia', 'letter', 'azul', 4);
    houseCache.set(key, a);
  }
  return Object.assign(a, { key });
}

export const fixedSprite = {
  fountain: () => memo('f:fountain', paintFountain),
  quadro: () => memo('f:quadro', paintQuadro),
  mesa: () => memo('f:mesa', paintMesa),
  feira: () => memo('f:feira', paintFeira),
  poco: () => memo('f:poco', paintPoco),
  lotSign: () => memo('f:lot', paintLotSign),
  glow: () => memo('f:glow', () => paintGlow(28)),
  puff: () => memo('f:puff', paintPuff),
  letters: (level: number) => memo(`f:letters:${level}`, () => paintLetters(level)),
  yard: (kind: Parameters<typeof paintYard>[0]) => memo(`f:yard:${kind}`, () => paintYard(kind)),
  loose: (kind: string, color: string | null, seed: number) => memo(`f:loose:${kind}:${color}:${seed % 3}`, () => paintLoose(kind, color, seed % 3)),
  person: (look: AvatarLook) => memo(lookKey(look), () => paintPerson(look)),
};

/** Prévia em data URL (primeiro quadro), para o catálogo em React. */
const previewCache = new Map<string, string>();
export function spritePreviewUrl(a: Keyed): string {
  let url = previewCache.get(a.key);
  if (!url) {
    const fw = a.canvas.width / a.frames;
    const c = document.createElement('canvas');
    c.width = fw;
    c.height = a.canvas.height;
    c.getContext('2d')!.drawImage(a.canvas, 0, 0, fw, a.canvas.height, 0, 0, fw, a.canvas.height);
    url = c.toDataURL();
    previewCache.set(a.key, url);
  }
  return url;
}
