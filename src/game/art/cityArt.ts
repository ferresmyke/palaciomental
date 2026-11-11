/**
 * Sprites da cidade: vegetação, casas, praça e objetos de exterior.
 */
import type { HouseModel } from '@/domain/catalog';
import { drawIcon } from './icons';
import { R, ramp } from './palette';
import { art, darken, hash2, lighten, mix, Px, strip, type Ramp, type SpriteArt } from './px';

export interface RecipeOpts {
  variant: number;
  color: string | null;
  rot: number;
  seed: number;
  state?: Record<string, unknown>;
}

type Recipe = (o: RecipeOpts) => SpriteArt;

const leaf = (o: RecipeOpts): Ramp => (o.color === 'outono' ? R.outono : o.color === 'florida' ? R.florida : R.foliage);

function trunk(p: Px, cx: number, top: number, bottom: number, w: number, r: Ramp = R.nogueira): void {
  for (let y = top; y <= bottom; y++) {
    const flare = y > bottom - 3 ? 1 : 0;
    for (let x = cx - Math.floor(w / 2) - flare; x <= cx + Math.floor(w / 2) + flare; x++) {
      const t = (x - (cx - w / 2)) / w;
      p.set(x, y, t < 0.3 ? r[3] : t < 0.7 ? r[2] : r[1]);
    }
    if (hash2(cx, y, 3) < 0.25) p.set(cx, y, r[0]);
  }
}

const oak: Recipe = (o) => {
  const young = o.variant === 1;
  const p = new Px(48, young ? 46 : 60, o.seed);
  const base = p.h - 3;
  const f = leaf(o);
  p.shadow(24, base, young ? 10 : 15, 4, 75);
  trunk(p, 24, base - (young ? 16 : 22), base, young ? 3 : 5);
  if (young) {
    p.blob(24, 16, 12, 11, f);
    p.blob(17, 21, 7, 6, f);
    p.blob(31, 21, 7, 6, f);
  } else {
    p.blob(24, 25, 18, 14, f);
    p.blob(12, 30, 9, 8, f);
    p.blob(36, 31, 9, 8, f);
    p.blob(25, 13, 12, 9, f);
    p.blob(16, 18, 8, 7, f);
    p.blob(34, 19, 8, 7, f);
  }
  // cachos de folhas claras e sombras internas
  for (let i = 0; i < (young ? 10 : 22); i++) {
    const x = 6 + Math.floor(p.rand() * 36);
    const y = 4 + Math.floor(p.rand() * (young ? 22 : 34));
    if (p.alpha(x, y) < 255 || p.alpha(x + 2, y + 1) < 255) continue;
    const lit = x + y < 44;
    p.set(x, y, lit ? f[4] : f[0]);
    p.set(x + 1, y, lit ? f[4] : f[0]);
    p.set(x + 1, y + 1, lit ? f[3] : f[1]);
  }
  if (o.color === 'florida') p.speckle(4, 2, 40, 40, [0xffffff, 0xfbe3e6], 0.03);
  p.outline(darken(f[0], 0.35));
  return art(p, 16, 3);
};

const pine: Recipe = (o) => {
  const short = o.variant === 1;
  const p = new Px(32, short ? 44 : 58, o.seed);
  const base = p.h - 3;
  p.shadow(16, base, 10, 3, 75);
  trunk(p, 16, base - 8, base, 3);
  const tiers = short ? 3 : 4;
  const topY = 3;
  const span = base - 7 - topY;
  for (let t = tiers - 1; t >= 0; t--) {
    const y0 = topY + (span / (tiers + 0.6)) * t;
    const y1 = y0 + span / tiers + 5;
    const half = 5 + t * (short ? 3 : 2.7);
    for (let y = Math.floor(y0); y <= y1; y++) {
      const k = (y - y0) / (y1 - y0);
      const hw = Math.max(0.5, half * k + (hash2(y, t, o.seed) < 0.5 ? 0 : 1));
      for (let x = Math.floor(16 - hw); x <= Math.ceil(16 + hw - 1); x++) {
        const side = (x - 16) / hw;
        let c = side < -0.35 ? R.pine[3] : side < 0.3 ? R.pine[2] : R.pine[1];
        if (k > 0.82) c = side < 0 ? R.pine[1] : R.pine[0];
        if (hash2(x, y, o.seed + 5) < 0.12) c = side < 0 ? R.pine[4] : R.pine[0];
        p.set(x, y, c);
      }
    }
  }
  p.outline(darken(R.pine[0], 0.3));
  return art(p, 8, 3);
};

const birch: Recipe = (o) => {
  const p = new Px(32, 54, o.seed);
  const base = p.h - 3;
  const f = o.color === 'outono' ? R.ocre : o.color === 'florida' ? R.florida : ([0x3c6a30, 0x508538, 0x6ba044, 0x8cbb54, 0xb3d470] as unknown as Ramp);
  p.shadow(16, base, 9, 3, 70);
  trunk(p, 16, base - 26, base, 3, R.branco);
  for (let y = base - 24; y < base; y += 4) p.rect(15 + (y % 3 === 0 ? 0 : 1), y, 2, 1, R.ebano[1]);
  p.blob(16, 16, 11, 12, f);
  p.blob(10, 23, 6, 6, f);
  p.blob(22, 22, 7, 6, f);
  p.blob(16, 8, 7, 6, f);
  p.outline(darken(f[0], 0.4));
  return art(p, 8, 3);
};

const fruit: Recipe = (o) => {
  const p = new Px(40, 48, o.seed);
  const base = p.h - 3;
  p.shadow(20, base, 12, 3, 75);
  trunk(p, 20, base - 16, base, 4, R.carvalho);
  p.blob(20, 20, 15, 13, R.foliage);
  p.blob(11, 25, 7, 6, R.foliage);
  p.blob(29, 25, 7, 6, R.foliage);
  const fr = o.variant === 1 ? R.laranja : R.vinho;
  for (let i = 0; i < 9; i++) {
    const x = 8 + Math.floor(p.rand() * 24);
    const y = 10 + Math.floor(p.rand() * 20);
    if (p.alpha(x, y) < 255) continue;
    p.rect(x, y, 2, 2, fr[3]);
    p.set(x, y, fr[4]);
    p.set(x + 1, y + 1, fr[1]);
  }
  p.outline(darken(R.foliage[0], 0.35));
  return art(p, 12, 3);
};

const bush: Recipe = (o) => {
  const p = new Px(20, 17, o.seed);
  const f = leaf(o);
  p.shadow(10, 14, 8, 2, 70);
  p.blob(10, 9, 8, 6, f);
  p.blob(5, 11, 4, 4, f);
  p.blob(15, 11, 4, 4, f);
  if (o.variant === 1) for (let i = 0; i < 6; i++) p.set(4 + Math.floor(p.rand() * 12), 6 + Math.floor(p.rand() * 7), R.vinho[3]);
  p.outline(darken(f[0], 0.35));
  return art(p, 2, 2);
};

const flowerCols = [0xf6e27a, 0xffffff, 0xf2a0b4, 0xb7a0f0, 0xf6906a, 0xe8504a];

const flowers: Recipe = (o) => {
  const p = new Px(16, 12, o.seed);
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(p.rand() * 12);
    const y = 3 + Math.floor(p.rand() * 6);
    const c = flowerCols[Math.floor(p.rand() * flowerCols.length)];
    p.rect(x, y + 1, 1, 3, R.foliage[2]);
    p.set(x - 1, y + 2, R.foliage[3]);
    p.rect(x - 1, y, 3, 1, c);
    p.set(x, y - 1, c);
    p.set(x, y, 0xf6c453);
  }
  return art(p, 0, 0);
};

const rock: Recipe = (o) => {
  const p = new Px(16, 13, o.seed);
  p.shadow(8, 11, 7, 2, 70);
  p.blob(8, 7, 6, 4.5, R.pedra, 0.2);
  p.blob(11, 9, 3.5, 2.5, R.pedra, 0.2);
  if (o.variant === 1) p.speckle(2, 2, 10, 5, [R.musgo[3], R.musgo[2]], 0.5);
  p.outline(darken(R.pedra[0], 0.3));
  return art(p, 0, 1);
};

const reeds: Recipe = (o) => {
  const p = new Px(16, 18, o.seed);
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.floor(p.rand() * 12);
    const h = 8 + Math.floor(p.rand() * 8);
    p.rect(x, 17 - h, 1, h, i % 2 ? R.musgo[3] : R.musgo[2]);
    if (p.rand() < 0.6) p.rect(x, 17 - h - 1, 1, 3, R.nogueira[2]);
  }
  return art(p, 0, 0);
};

const stump: Recipe = (o) => {
  const p = new Px(16, 12, o.seed);
  p.shadow(8, 10, 6, 2, 70);
  p.rect(4, 5, 8, 5, R.nogueira[2]);
  p.rect(4, 5, 2, 5, R.nogueira[3]);
  p.ellipse(8, 5, 4, 2, R.pinho[3]);
  p.ellipse(8, 5, 2, 1, R.pinho[1]);
  p.outline();
  return art(p, 0, 1);
};

const lantern: Recipe = (o) => {
  const low = o.variant === 1;
  const m = ramp(o.color, 'ferro');
  const p = new Px(16, low ? 22 : 38, o.seed);
  const b = p.h - 2;
  p.shadow(8, b, 5, 2, 70);
  p.rect(6, b - 2, 4, 2, m[1]);
  p.rect(7, low ? 9 : 10, 2, b - (low ? 11 : 12), m[2]);
  p.rect(7, low ? 9 : 10, 1, b - (low ? 11 : 12), m[3]);
  // cabeça da lanterna
  p.rect(4, 2, 8, 1, m[1]);
  p.rect(5, 1, 6, 1, m[2]);
  p.rect(7, 0, 2, 1, m[3]);
  p.rect(5, 3, 6, 6, R.luz[2]);
  p.rect(6, 4, 4, 4, R.luz[3]);
  p.rect(7, 5, 2, 2, R.luz[4]);
  p.rect(5, 3, 1, 6, m[1]);
  p.rect(10, 3, 1, 6, m[1]);
  p.rect(4, 9, 8, 1, m[1]);
  p.outline();
  return art(p, 0, 1, 1, { x: 8, y: 6 });
};

const bench: Recipe = (o) => {
  const w = ramp(o.color);
  const p = new Px(32, 18, o.seed);
  p.shadow(16, 16, 14, 2, 70);
  p.rect(3, 3, 26, 2, w[3]);
  p.rect(3, 6, 26, 2, w[2]);
  p.rect(2, 9, 28, 4, w[3]);
  p.rect(2, 9, 28, 1, w[4]);
  p.rect(2, 12, 28, 1, w[1]);
  for (const x of [3, 27]) {
    p.rect(x, 2, 2, 13, w[1]);
    p.rect(x, 13, 2, 3, w[0]);
  }
  p.outline();
  return art(p, 0, 1);
};

const cart: Recipe = (o) => {
  const p = new Px(44, 30, o.seed);
  const w = R.carvalho;
  p.shadow(22, 27, 19, 3, 75);
  p.rect(2, 14, 12, 2, w[2]);
  p.blob(22, 9, 13, 6, R.palha, 0.25);
  p.planks(8, 11, 30, 10, w, 4, false);
  p.frame(8, 11, 30, 10, w[0]);
  for (const cx of [14, 32]) {
    p.ellipse(cx, 22, 6, 6, R.nogueira[1]);
    p.ellipse(cx, 22, 4.2, 4.2, w[3]);
    p.ellipse(cx, 22, 1.6, 1.6, R.ferro[2]);
    p.line(cx - 4, 22, cx + 3, 22, R.nogueira[1]);
    p.line(cx, 18, cx, 25, R.nogueira[1]);
  }
  p.outline();
  return art(p, 6, 2);
};

const haystack: Recipe = (o) => {
  const p = new Px(20, 18, o.seed);
  p.shadow(10, 16, 9, 2, 70);
  p.blob(10, 9, 9, 7, R.palha, 0.25);
  for (let i = 0; i < 16; i++) {
    const x = 3 + Math.floor(p.rand() * 14);
    const y = 4 + Math.floor(p.rand() * 9);
    if (p.alpha(x, y) === 255) p.rect(x, y, 1, 2, i % 2 ? R.palha[4] : R.palha[0]);
  }
  p.rect(2, 9, 16, 1, R.nogueira[2]);
  p.outline();
  return art(p, 2, 1);
};

const fence: Recipe = (o) => {
  const w = ramp(o.color);
  const p = new Px(16, 16, o.seed);
  const stakes = o.variant === 1;
  if (o.rot % 2 === 0) {
    if (stakes) for (let x = 1; x < 16; x += 4) p.rect(x, 4 + (x % 8 === 1 ? 0 : 1), 2, 10, x % 8 === 1 ? w[3] : w[2]);
    p.rect(0, 7, 16, 2, w[3]);
    p.rect(0, 11, 16, 2, w[2]);
    if (!stakes)
      for (const x of [1, 12]) {
        p.rect(x, 3, 3, 12, w[2]);
        p.rect(x, 3, 1, 12, w[4]);
        p.rect(x, 3, 3, 1, w[4]);
      }
  } else {
    p.rect(6, 0, 4, 15, w[2]);
    p.rect(6, 0, 1, 15, w[4]);
    p.rect(9, 0, 1, 15, w[1]);
    for (const y of [1, 9]) p.rect(5, y, 6, 4, w[3]);
  }
  p.outline();
  return art(p, 0, 0);
};

const signpost: Recipe = (o) => {
  const w = ramp(o.color);
  const p = new Px(16, 22, o.seed);
  p.shadow(8, 20, 5, 2, 70);
  p.rect(7, 6, 2, 14, w[1]);
  p.planks(2, 3, 12, 7, w, 4);
  p.frame(2, 3, 12, 7, w[0]);
  p.rect(4, 5, 8, 1, w[0]);
  p.rect(4, 7, 6, 1, w[0]);
  p.outline();
  return art(p, 0, 1);
};

const statue: Recipe = (o) => {
  const p = new Px(16, 32, o.seed);
  const s = R.pedra;
  p.shadow(8, 30, 7, 2, 75);
  p.bevel(2, 22, 12, 8, s, 2);
  p.rect(4, 19, 8, 3, s[3]);
  p.ellipse(8, 6, 3, 3, s[3]);
  p.rect(5, 9, 6, 10, s[2]);
  p.rect(5, 9, 2, 10, s[3]);
  p.rect(3, 11, 2, 6, s[2]);
  p.rect(11, 11, 2, 6, s[1]);
  p.rect(9, 9, 2, 10, s[1]);
  p.speckle(2, 4, 12, 26, [R.musgo[3]], 0.03);
  p.outline(darken(s[0], 0.3));
  return art(p, 0, 1);
};

const birdbath: Recipe = (o) => {
  const p = new Px(16, 20, o.seed);
  const s = R.pedraQuente;
  p.shadow(8, 18, 6, 2, 70);
  p.rect(5, 15, 6, 3, s[2]);
  p.rect(7, 8, 2, 8, s[3]);
  p.ellipse(8, 6, 6, 3, s[3]);
  p.ellipse(8, 6, 4.5, 1.8, R.agua[3]);
  p.set(6, 5, R.agua[4]);
  p.rect(10, 2, 2, 2, R.nogueira[3]);
  p.set(12, 2, R.ocre[3]);
  p.outline();
  return art(p, 0, 1);
};

const garden: Recipe = (o) => {
  const p = new Px(32, 32, o.seed);
  p.rect(1, 2, 30, 28, R.nogueira[1]);
  p.frame(0, 1, 32, 30, R.carvalho[2]);
  p.rect(0, 1, 32, 1, R.carvalho[4]);
  for (let row = 0; row < 4; row++) {
    const y = 5 + row * 7;
    p.rect(2, y + 2, 28, 3, R.nogueira[2]);
    p.rect(2, y + 2, 28, 1, R.nogueira[3]);
    for (let x = 3; x < 29; x += 4) {
      const kind = row % 3;
      p.rect(x, y, 2, 3, R.foliage[3]);
      p.set(x - 1, y + 1, R.foliage[2]);
      p.set(x + 2, y + 1, R.foliage[4]);
      if (kind === 0) p.set(x, y + 2, R.laranja[2]);
      if (kind === 1) p.set(x + 1, y - 1, R.vinho[3]);
    }
  }
  return art(p, 0, 0);
};

const flowerbed: Recipe = (o) => {
  const p = new Px(32, 14, o.seed);
  p.rect(1, 5, 30, 8, R.nogueira[1]);
  p.frame(0, 4, 32, 10, R.pedraQuente[2]);
  p.rect(0, 4, 32, 1, R.pedraQuente[4]);
  const cols = o.variant === 1 ? [0xe8504a, 0xf6e27a, 0xf2a0b4] : o.variant === 2 ? [0xf6c453, 0xf6c453, 0xf0b23e] : flowerCols;
  for (let x = 2; x < 30; x += 3) {
    const y = 2 + Math.floor(p.rand() * 4);
    const c = cols[Math.floor(p.rand() * cols.length)];
    p.rect(x, y + 2, 1, 6 - (y - 2), R.foliage[3]);
    p.rect(x - 1, y, 3, 2, c);
    p.set(x, y + 1, o.variant === 2 ? R.nogueira[1] : lighten(c, 0.4));
  }
  return art(p, 0, 0);
};

const pathstone: Recipe = (o) => {
  const p = new Px(16, 16, o.seed);
  const s = R.pedraQuente;
  if (o.variant === 1) {
    for (let i = 0; i < 9; i++) {
      const x = 1 + Math.floor(p.rand() * 12);
      const y = 1 + Math.floor(p.rand() * 12);
      p.ellipse(x + 1.5, y + 1.5, 1.6, 1.3, s[2 + (i % 3)]);
    }
  } else {
    const spots: [number, number, number, number][] = [
      [1, 1, 7, 6],
      [9, 2, 6, 5],
      [2, 8, 5, 6],
      [8, 8, 7, 6],
    ];
    for (const [x, y, w, h] of spots) {
      p.rect(x, y, w, h, s[3]);
      p.rect(x, y, w, 1, s[4]);
      p.rect(x, y + h - 1, w, 1, s[1]);
      p.clear(x, y);
      p.clear(x + w - 1, y + h - 1);
    }
  }
  return art(p, 0, 0);
};

const smallbridge: Recipe = (o) => {
  const w = ramp(o.color);
  const horiz = o.rot % 2 === 0;
  const p = new Px(horiz ? 32 : 16, horiz ? 16 : 32, o.seed);
  if (horiz) {
    p.planks(0, 2, 32, 12, w, 4, true);
    p.rect(0, 1, 32, 2, w[1]);
    p.rect(0, 13, 32, 2, w[0]);
  } else {
    p.planks(2, 0, 12, 32, w, 4, false);
    p.rect(1, 0, 2, 32, w[1]);
    p.rect(13, 0, 2, 32, w[0]);
  }
  return art(p, 0, 0);
};

function chicken(p: Px, x: number, y: number, peck: boolean, flip: boolean): void {
  const b = new Px(9, 8);
  b.ellipse(4, 4.5, 3.5, 2.6, 0xf2ead8);
  b.rect(1, 3, 2, 2, 0xd8cdb4);
  if (peck) {
    b.rect(6, 5, 2, 2, 0xf2ead8);
    b.set(8, 7, R.ocre[3]);
    b.set(6, 4, R.vinho[3]);
  } else {
    b.rect(6, 1, 2, 3, 0xf2ead8);
    b.set(8, 2, R.ocre[3]);
    b.set(6, 0, R.vinho[3]);
    b.set(7, 2, 0x222222);
  }
  b.set(3, 7, R.ocre[2]);
  b.set(5, 7, R.ocre[2]);
  b.outline();
  p.blit(b, x, y, flip);
}

const chickens: Recipe = (o) => {
  const frames = [0, 1].map((f) => {
    const p = new Px(16, 12, o.seed);
    chicken(p, 0, 1, f === 1, false);
    chicken(p, 7, 4, f === 0, true);
    return p;
  });
  return art(strip(frames), 0, 0, 2);
};

// ───────────────────────────── Casas ─────────────────────────────

export interface HouseArt {
  body: SpriteArt;
  roof: SpriteArt;
  glow: SpriteArt;
  chimney: { x: number; y: number };
}

function plasterWall(p: Px, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, R.reboco[3]);
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      const n = hash2(i >> 1, j >> 1, 17);
      if (n < 0.1) p.set(i, j, R.reboco[2]);
      else if (n > 0.9) p.set(i, j, R.reboco[4]);
    }
}

function windowAt(p: Px, g: Px, x: number, y: number, accent: Ramp, box = true): void {
  p.rect(x - 3, y, 3, 12, accent[2]);
  p.rect(x + 13, y, 3, 12, accent[2]);
  p.rect(x - 3, y, 1, 12, accent[3]);
  p.rect(x + 15, y, 1, 12, accent[1]);
  for (const sx of [x - 3, x + 13]) for (let j = y + 2; j < y + 11; j += 3) p.rect(sx, j, 3, 1, accent[1]);
  p.rect(x, y, 13, 12, R.nogueira[1]);
  p.rect(x + 1, y + 1, 11, 10, R.vidro[1]);
  p.rect(x + 1, y + 1, 11, 4, R.vidro[2]);
  p.line(x + 2, y + 6, x + 6, y + 2, R.vidro[3]);
  p.rect(x + 6, y + 1, 1, 10, R.nogueira[2]);
  p.rect(x + 1, y + 6, 11, 1, R.nogueira[2]);
  p.rect(x - 1, y + 12, 15, 1, R.nogueira[3]);
  g.rect(x + 1, y + 1, 11, 10, R.luz[2]);
  g.rect(x + 2, y + 2, 9, 8, R.luz[3]);
  g.rect(x + 3, y + 3, 3, 3, R.luz[4]);
  g.rect(x + 6, y + 1, 1, 10, R.nogueira[1]);
  g.rect(x + 1, y + 6, 11, 1, R.nogueira[1]);
  if (box) {
    p.rect(x, y + 13, 13, 3, R.terracota[2]);
    p.rect(x, y + 13, 13, 1, R.terracota[3]);
    for (let i = 0; i < 6; i++) {
      p.set(x + 1 + i * 2, y + 12, i % 2 ? 0xe8504a : 0xf6e27a);
      p.set(x + 2 + i * 2, y + 12, R.foliage[3]);
    }
  }
}

function tileRow(p: Px, x0: number, x1: number, y: number, row: number, yy: number, r: Ramp, W: number): void {
  for (let x = x0; x < x1; x++) {
    const tx = Math.floor((x + (row % 2) * 4) / 8);
    const ix = (x + (row % 2) * 4) % 8;
    const tone = hash2(tx, row, 91);
    let c = tone < 0.3 ? r[2] : tone < 0.8 ? mix(r[2], r[3], 0.6) : r[3];
    if (yy === 0) c = r[4];
    else if (yy === 4) c = r[1];
    if (ix === 0) c = r[1];
    if (yy === 3 && (ix === 1 || ix === 7)) c = r[1];
    if (x > W - 5) c = darken(c, 0.3);
    else if (x < 3) c = lighten(c, 0.12);
    p.set(x, y, c);
  }
}

export function paintHouse(model: HouseModel, color: string, emblem: string, accentName: string, cells = 5): HouseArt {
  const bodyW = cells * 16;
  const W = bodyW + 8;
  const H = 100;
  const body = new Px(W, H, 23 + cells);
  const roof = new Px(W, H, 29);
  const glow = new Px(W, H);
  const rr = ramp(color, 'telha');
  const accent = ramp(accentName, 'verde');
  const wallTop = model.roof === 'gable' ? 62 : 66;
  const bx = 4;
  const cx = Math.floor(W / 2);

  body.shadow(cx, H - 2, bodyW / 2 + 3, 4, 80);
  // parede
  const wallH = H - 4 - wallTop;
  const drawWall = (x: number, y: number, w: number, h: number) => {
    if (model.walls === 'stone') body.bricks(x, y, w, h, R.pedraQuente, 9, 6);
    else if (model.walls === 'wood') body.planks(x, y, w, h, R.carvalho, 6, true, 2);
    else plasterWall(body, x, y, w, h);
  };
  drawWall(bx, wallTop, bodyW, wallH);
  let chimney = { x: W - 24, y: 10 };

  if (model.roof === 'gable') {
    // frontão
    const apexY = 16;
    for (let y = apexY; y < wallTop; y++) {
      const k = (y - apexY) / (wallTop - apexY);
      const half = Math.round((bodyW / 2) * k);
      drawWall(cx - half, y, half * 2, 1);
    }
    if (model.walls !== 'stone') {
      const t = model.walls === 'wood' ? R.nogueira : R.nogueira;
      body.rect(bx, wallTop - 1, bodyW, 3, t[2]);
      body.rect(bx, wallTop - 1, bodyW, 1, t[3]);
      body.rect(cx - 1, apexY + 4, 3, wallTop - apexY - 4, t[2]);
      body.line(cx - 22, wallTop - 2, cx - 1, apexY + 22, t[2]);
      body.line(cx - 22, wallTop - 3, cx - 1, apexY + 21, t[2]);
      body.line(cx + 22, wallTop - 2, cx + 1, apexY + 22, t[2]);
      body.line(cx + 22, wallTop - 3, cx + 1, apexY + 21, t[2]);
      body.rect(cx - 14, 46, 28, 2, t[2]);
    }
    // janela do sótão
    body.ellipse(cx + 0.5, 37.5, 6, 6, R.nogueira[1]);
    body.ellipse(cx + 0.5, 37.5, 4.5, 4.5, R.vidro[2]);
    body.rect(cx, 33, 1, 9, R.nogueira[2]);
    body.rect(cx - 4, 37, 9, 1, R.nogueira[2]);
    glow.ellipse(cx + 0.5, 37.5, 4.5, 4.5, R.luz[3]);
    glow.rect(cx, 33, 1, 9, R.nogueira[1]);
    glow.rect(cx - 4, 37, 9, 1, R.nogueira[1]);
    // águas do telhado
    for (let side = -1; side <= 1; side += 2)
      for (let i = 0; i <= bodyW / 2 + 5; i++) {
        const x = side < 0 ? cx - i : cx + i;
        const y = Math.round(apexY - 5 + (i / (bodyW / 2 + 5)) * (wallTop - apexY + 6));
        for (let t = 0; t < 10; t++) {
          let c = t < 2 ? rr[4] : t > 7 ? rr[0] : (i + t) % 6 < 1 ? rr[1] : t % 4 === 1 ? rr[3] : rr[2];
          if (side > 0) c = darken(c, 0.2);
          roof.set(x, y + t, c);
        }
      }
    roof.rect(cx - 2, apexY - 7, 5, 4, rr[4]);
    chimney = { x: cx + 20, y: 20 };
  } else if (model.roof === 'thatch') {
    const top = 20;
    const bottom = wallTop + 5;
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2);
      const edge = Math.round(top + (1 - Math.sqrt(Math.max(0, 1 - dx * dx * 0.92))) * 34);
      const fringe = bottom + Math.floor(hash2(x, 3, 71) * 3);
      for (let y = edge; y < fringe; y++) {
        const k = (y - edge) / Math.max(1, fringe - edge);
        const n = hash2(x, y >> 1, 73);
        let c = n < 0.25 ? rr[1] : n < 0.7 ? rr[2] : rr[3];
        if (hash2(x, 0, 75) < 0.2) c = n < 0.5 ? rr[3] : rr[4];
        const layer = (y - edge + Math.floor(hash2(x >> 1, 0, 77) * 3)) % 14;
        if (layer === 13) c = rr[0];
        else if (layer === 0 && k > 0.1) c = rr[4];
        if (k < 0.05) c = rr[4];
        if (dx > 0.82) c = darken(c, 0.25);
        if (y >= fringe - 2) c = rr[1];
        roof.set(x, y, c);
      }
    }
    // cumeeira trançada
    for (let x = 0; x < W; x++) {
      if (!roof.alpha(x, top + 3)) continue;
      roof.set(x, top + 1 + (x % 4 < 2 ? 0 : 1), rr[4]);
      roof.set(x, top + 3 + (x % 4 < 2 ? 1 : 0), rr[0]);
    }
    chimney = { x: W - 28, y: 18 };
  } else {
    const top = 22;
    const bottom = wallTop + 4;
    for (let y = top; y < bottom; y++) {
      const k = (y - top) / (bottom - top);
      const inset = Math.round(8 * (1 - k));
      const row = Math.floor((y - top) / 5);
      tileRow(roof, inset, W - inset, y, row, (y - top) % 5, rr, W - inset);
    }
    roof.rect(8, top - 2, W - 16, 3, rr[3]);
    roof.rect(8, top - 2, W - 16, 1, rr[4]);
    for (let x = 10; x < W - 10; x += 7) roof.rect(x, top - 2, 1, 3, rr[1]);
    roof.rect(0, bottom - 1, W, 1, rr[0]);
  }
  // chaminé
  const cm = model.walls === 'stone' ? R.pedra : R.tijolo;
  roof.bricks(chimney.x, chimney.y, 9, 16, cm, 5, 3);
  roof.rect(chimney.x - 1, chimney.y - 2, 11, 3, cm[1]);
  roof.rect(chimney.x - 1, chimney.y - 2, 11, 1, cm[3]);
  roof.rect(chimney.x + 7, chimney.y + 1, 2, 15, darken(cm[1], 0.2));

  // sombra do beiral
  if (model.roof !== 'gable') body.rect(bx, wallTop + 4, bodyW, 3, 0x1a1420, 70);
  // enxaimel
  if (model.walls === 'timber') {
    const t = R.nogueira;
    const top = model.roof === 'gable' ? wallTop + 2 : wallTop + 5;
    for (const x of [bx, bx + bodyW - 3, bx + 24, bx + bodyW - 27]) body.rect(x, top, 3, H - 9 - top, t[2]);
    for (const x of [bx, bx + 24]) body.rect(x, top, 1, H - 9 - top, t[3]);
    body.line(bx + 3, H - 10, bx + 23, top + 2, t[2]);
    body.line(bx + bodyW - 4, H - 10, bx + bodyW - 24, top + 2, t[2]);
  } else if (model.walls === 'plaster') {
    for (const x of [bx, bx + bodyW - 3]) body.rect(x, wallTop + 5, 3, H - 9 - wallTop - 5, R.carvalho[2]);
  } else if (model.walls === 'stone') {
    for (const x of [bx, bx + bodyW - 4]) for (let y = wallTop + 6; y < H - 8; y += 6) body.bevel(x, y, 4, 5, R.pedraQuente, 3);
  }
  // alicerce
  body.bricks(bx, H - 9, bodyW, 5, R.pedra, 7, 3);
  // porta
  const dw = 13;
  const dx = cx - 6;
  const dy = H - 4 - 21;
  body.rect(dx - 2, dy - 2, dw + 4, 23, R.nogueira[1]);
  body.planks(dx, dy, dw, 21, ramp(accentName === 'carvalho' ? 'nogueira' : 'carvalho'), 4, true, 2);
  body.clear(dx - 2, dy - 2);
  body.clear(dx + dw + 1, dy - 2);
  body.rect(dx, dy, dw, 1, R.nogueira[0]);
  body.rect(dx + dw - 4, dy + 11, 2, 2, R.dourado[3]);
  body.rect(dx, dy + 4, dw, 1, R.ferro[1]);
  body.rect(dx, dy + 16, dw, 1, R.ferro[1]);
  glow.rect(dx + 4, dy + 2, 5, 1, R.luz[3]);
  body.rect(dx - 3, H - 5, dw + 6, 2, R.pedraQuente[4]);
  body.rect(dx - 4, H - 3, dw + 8, 2, R.pedraQuente[2]);
  // janelas
  const wy = H - 4 - 26;
  if (cells >= 5) {
    windowAt(body, glow, bx + 8, wy, accent);
    windowAt(body, glow, bx + bodyW - 21, wy, accent);
  } else windowAt(body, glow, bx + bodyW - 19, wy, accent, false);
  // placa com o emblema
  const sx = cells >= 5 ? dx - 14 : bx + 5;
  body.rect(sx + 5, wy - 3, 1, 4, R.ferro[1]);
  body.rect(sx, wy - 4, 11, 1, R.ferro[2]);
  body.rect(sx, wy + 1, 11, 11, R.nogueira[1]);
  body.rect(sx + 1, wy + 2, 9, 9, R.pinho[3]);
  drawIcon(body, emblem, sx + 1, wy + 2, R.nogueira);
  body.outline();
  roof.outline();
  return { body: art(body, 4, 0), roof: art(roof, 4, 0), glow: art(glow, 4, 0), chimney: { x: chimney.x + 4, y: chimney.y - 4 } };
}

// ───────────────────────────── Praça e lugares fixos ─────────────────────────────

export function paintFountain(): SpriteArt {
  const frames = [0, 1, 2].map((f) => {
    const p = new Px(48, 56, 40 + f);
    const s = R.pedraQuente;
    p.shadow(24, 50, 24, 5, 70);
    p.ellipse(24, 38, 23, 14, s[1]);
    p.ellipse(24, 36, 23, 14, s[3]);
    p.ellipse(24, 35, 21, 12.5, s[4]);
    p.ellipse(24, 36, 19, 11, s[1]);
    p.ellipse(24, 36.5, 18, 10, R.agua[2]);
    p.ellipse(24, 35.5, 15, 8, R.agua[3]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + f * 0.5;
      p.set(Math.round(24 + Math.cos(a) * (7 + ((i + f) % 3) * 3)), Math.round(36 + Math.sin(a) * (4 + ((i + f) % 3) * 1.6)), R.agua[4]);
    }
    for (let i = 0; i < 46; i += 6) {
      const y = 44 + Math.round(Math.sin((i / 46) * Math.PI) * 5);
      p.rect(i + 1, y - 3, 1, 5, s[1]);
    }
    // coluna e taça
    p.rect(21, 20, 6, 16, s[3]);
    p.rect(21, 20, 2, 16, s[4]);
    p.rect(25, 20, 2, 16, s[1]);
    p.ellipse(24, 19, 9, 4, s[2]);
    p.ellipse(24, 18, 9, 3.5, s[4]);
    p.ellipse(24, 18, 7, 2.2, R.agua[3]);
    p.rect(23, 9, 2, 9, s[3]);
    p.ellipse(24, 8, 2.5, 2.5, s[4]);
    // jatos
    const jet = 0xdff3f6;
    for (let side = -1; side <= 1; side += 2)
      for (let t = 0; t < 9; t++) {
        const x = 24 + side * (2 + t * 0.9);
        const y = 6 + t * t * 0.16 - (f === 1 ? 1 : 0);
        if ((t + f) % 3 !== 0) p.set(Math.round(x), Math.round(y), jet);
      }
    for (let side = -1; side <= 1; side += 2) for (let y = 21; y < 33; y++) if ((y + f) % 3 !== 0) p.set(24 + side * 8, y, jet, 200);
    p.set(24 - 8 - (f % 2), 34, jet);
    p.set(24 + 8 + (f % 2), 34, jet);
    p.outline(darken(s[0], 0.2));
    return p;
  });
  return art(strip(frames), 0, 4, 3);
}

export function paintObservatory(): HouseArt {
  const W = 88;
  const H = 132;
  const body = new Px(W, H, 61);
  const roof = new Px(W, H, 62);
  const glow = new Px(W, H);
  const s = R.pedra;
  const cx = 44;
  body.shadow(cx, H - 4, 42, 6, 80);
  // base em degraus
  for (let i = 0; i < 3; i++) {
    const ry = 9 - i * 1.5;
    const rx = 42 - i * 6;
    const y = H - 12 - i * 6;
    body.ellipse(cx, y + 4, rx, ry, R.pedraQuente[1]);
    body.ellipse(cx, y, rx, ry, R.pedraQuente[3 + (i % 2)] ?? R.pedraQuente[3]);
    body.ellipse(cx, y - 1, rx - 2, ry - 1.5, R.pedraQuente[4]);
  }
  // torre cilíndrica
  const tw = 40;
  const tx = cx - tw / 2;
  const ty = 36;
  const th = H - 24 - ty;
  for (let y = ty; y < ty + th; y++)
    for (let x = 0; x < tw; x++) {
      const u = x / (tw - 1);
      const row = Math.floor((y - ty) / 6);
      const bx = Math.floor((x + (row % 2) * 4 + Math.sin(u * Math.PI) * 2) / 8);
      const tone = hash2(bx, row, 63);
      let c = tone < 0.3 ? s[2] : tone < 0.8 ? s[3] : s[4];
      if ((y - ty) % 6 === 0 || (x + (row % 2) * 4) % 8 === 0) c = s[1];
      const shade = u < 0.18 ? -0.12 : u > 0.72 ? (u - 0.72) * 1.5 : 0;
      c = shade > 0 ? darken(c, shade) : lighten(c, -shade);
      body.set(tx + x, y, c);
    }
  body.ellipse(cx, ty + th, tw / 2, 4, s[1]);
  // porta em arco
  body.ellipse(cx, H - 42, 8, 8, R.nogueira[0]);
  body.rect(cx - 8, H - 42, 16, 17, R.nogueira[0]);
  body.ellipse(cx, H - 41, 6, 6, R.nogueira[2]);
  body.planks(cx - 6, H - 41, 12, 16, R.nogueira, 4, true, 2);
  body.rect(cx + 2, H - 34, 2, 2, R.dourado[3]);
  glow.rect(cx - 1, H - 44, 2, 2, R.luz[3]);
  // janelas estreitas
  for (const [wx, wy] of [
    [cx - 12, 58],
    [cx + 8, 70],
    [cx - 4, 82],
  ] as const) {
    body.rect(wx, wy, 5, 10, s[0]);
    body.rect(wx + 1, wy + 1, 3, 8, R.vidro[1]);
    body.set(wx + 1, wy + 1, R.vidro[3]);
    glow.rect(wx + 1, wy + 1, 3, 8, R.luz[3]);
  }
  // varanda
  body.rect(tx - 4, ty - 2, tw + 8, 5, s[2]);
  body.rect(tx - 4, ty - 2, tw + 8, 1, s[4]);
  for (let x = tx - 4; x < tx + tw + 4; x += 4) body.rect(x, ty - 7, 2, 5, s[3]);
  body.rect(tx - 4, ty - 8, tw + 8, 1, s[4]);
  // cúpula
  const dr = R.ardosia;
  for (let y = 4; y < ty - 4; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / 23;
      const dy = (y + 0.5 - (ty - 4)) / 30;
      if (dx * dx + dy * dy > 1) continue;
      const l = (dx + 0.5) * (dx + 0.5) + (dy + 0.6) * (dy + 0.6);
      let c = l < 0.12 ? dr[4] : l < 0.5 ? dr[3] : l < 1.2 ? dr[2] : dr[1];
      const seg = Math.abs((Math.asin(Math.max(-1, Math.min(1, dx / Math.sqrt(Math.max(0.01, 1 - dy * dy))))) / Math.PI) * 8) % 1;
      if (seg < 0.08) c = dr[0];
      roof.set(x, y, c);
    }
  // fenda e luneta
  roof.rect(cx + 2, 6, 6, ty - 12, 0x10141c);
  roof.line(cx + 5, 24, cx + 22, 9, R.dourado[2]);
  roof.line(cx + 5, 25, cx + 22, 10, R.dourado[1]);
  roof.line(cx + 5, 23, cx + 22, 8, R.dourado[4]);
  roof.rect(cx + 21, 7, 3, 4, R.dourado[3]);
  // bandeira
  roof.rect(cx - 1, 0, 1, 7, R.nogueira[2]);
  roof.rect(cx, 0, 7, 4, R.laranja[3]);
  roof.rect(cx, 3, 5, 1, R.laranja[1]);
  body.outline();
  roof.outline();
  return { body: art(body, 4, 6), roof: art(roof, 4, 6), glow: art(glow, 4, 6), chimney: { x: 0, y: 0 } };
}

export function paintQuadro(): SpriteArt {
  const p = new Px(32, 32, 81);
  const w = R.nogueira;
  p.shadow(16, 30, 14, 2, 75);
  for (const x of [3, 27]) p.rect(x, 8, 2, 22, w[2]);
  p.rect(1, 9, 30, 15, w[1]);
  p.rect(2, 10, 28, 13, R.cortica[3]);
  p.rect(4, 11, 11, 10, R.papel[3]);
  p.line(6, 18, 9, 13, R.agua[2]);
  p.line(9, 13, 13, 16, R.agua[2]);
  p.set(8, 15, R.vinho[3]);
  p.rect(17, 12, 6, 4, R.papel[4]);
  p.rect(18, 13, 4, 1, w[1]);
  p.rect(24, 12, 4, 5, R.ocre[4]);
  p.rect(17, 17, 10, 4, R.papel[2]);
  p.rect(18, 18, 7, 1, w[2]);
  p.poly(
    [
      [0, 9],
      [16, 2],
      [32, 9],
    ],
    R.ardosia[2],
  );
  p.line(0, 9, 16, 2, R.ardosia[4]);
  p.rect(0, 8, 32, 2, R.ardosia[1]);
  p.outline();
  return art(p, 0, 1);
}

export function paintMesa(): SpriteArt {
  const p = new Px(36, 34, 83);
  const w = R.carvalho;
  p.shadow(18, 31, 16, 3, 75);
  // toldo
  p.rect(3, 6, 1, 24, w[1]);
  p.rect(32, 6, 1, 24, w[1]);
  for (let x = 0; x < 36; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0;
    p.rect(x, 2, 1, 6, stripe ? R.vinho[3] : R.papel[3]);
    p.set(x, 8 - (x % 4 === 0 || x % 4 === 3 ? 1 : 0), stripe ? R.vinho[2] : R.papel[2]);
  }
  p.rect(0, 1, 36, 1, R.vinho[1]);
  // mesa
  p.rect(4, 17, 28, 8, w[3]);
  p.rect(4, 17, 28, 1, w[4]);
  p.rect(4, 25, 28, 4, w[2]);
  p.rect(4, 28, 28, 1, w[0]);
  p.rect(7, 18, 8, 5, R.papel[4]);
  p.rect(8, 19, 6, 1, w[1]);
  p.rect(8, 21, 4, 1, w[1]);
  p.rect(17, 18, 7, 5, R.azul[2]);
  p.rect(18, 19, 5, 3, R.papel[3]);
  p.rect(26, 18, 3, 3, R.ebano[2]);
  p.line(27, 17, 30, 13, R.branco[4]);
  p.outline();
  return art(p, 2, 1);
}

export function paintFeira(): SpriteArt {
  const p = new Px(48, 46, 85);
  const w = R.carvalho;
  p.shadow(24, 43, 23, 3, 75);
  for (const x of [2, 44]) p.rect(x, 10, 2, 32, w[1]);
  for (let x = 0; x < 48; x++) {
    const stripe = Math.floor(x / 6) % 2 === 0;
    const c = stripe ? R.verde : R.papel;
    for (let y = 2; y < 13; y++) p.set(x, y, y < 4 ? c[4] : y > 10 ? c[1] : c[3]);
    if (x % 6 < 4) p.set(x, 13, c[2]);
  }
  p.planks(3, 26, 42, 14, w, 5, false);
  p.rect(3, 24, 42, 3, w[4]);
  const fruits = [R.laranja, R.vinho, R.foliage, R.ocre];
  for (let i = 0; i < 4; i++) {
    const x = 5 + i * 10;
    p.rect(x, 19, 9, 6, w[1]);
    for (let k = 0; k < 6; k++) p.ellipse(x + 2 + (k % 3) * 2.5, 19 + Math.floor(k / 3) * 2, 1.5, 1.5, fruits[i][3]);
    p.set(x + 2, 18, fruits[i][4]);
  }
  p.outline();
  return art(p, 0, 2);
}

export function paintPoco(): SpriteArt {
  const p = new Px(24, 34, 87);
  const s = R.pedra;
  p.shadow(12, 31, 11, 3, 75);
  p.ellipse(12, 26, 10, 5, s[1]);
  p.bricks(2, 20, 20, 8, s, 5, 3);
  p.ellipse(12, 20, 10, 4, s[4]);
  p.ellipse(12, 20, 7, 2.5, R.agua[1]);
  for (const x of [2, 20]) p.rect(x, 6, 2, 15, R.nogueira[2]);
  p.poly(
    [
      [0, 8],
      [12, 0],
      [24, 8],
    ],
    R.telha[2],
  );
  p.line(0, 8, 12, 0, R.telha[4]);
  p.rect(0, 7, 24, 2, R.telha[1]);
  p.rect(4, 10, 16, 1, R.nogueira[3]);
  p.rect(12, 11, 1, 6, R.palha[3]);
  p.rect(10, 16, 5, 4, R.carvalho[2]);
  p.outline();
  return art(p, 4, 2);
}

export function paintLotSign(): SpriteArt {
  const p = new Px(16, 18, 89);
  p.shadow(8, 16, 5, 2, 60);
  p.rect(7, 7, 2, 9, R.carvalho[1]);
  p.rect(2, 2, 12, 7, R.pinho[3]);
  p.frame(2, 2, 12, 7, R.carvalho[1]);
  p.rect(4, 4, 8, 1, R.carvalho[2]);
  p.rect(4, 6, 5, 1, R.carvalho[2]);
  p.outline();
  return art(p, 0, 1);
}

/** Adereços do jardim conforme o nível de arrumação. */
export function paintYard(kind: 'boxes' | 'flowers' | 'garden' | 'lantern' | 'pots'): SpriteArt {
  if (kind === 'boxes') {
    const p = new Px(30, 20, 95);
    p.shadow(15, 18, 13, 2, 70);
    p.planks(2, 8, 12, 10, R.pinho, 4);
    p.frame(2, 8, 12, 10, R.carvalho[1]);
    p.planks(14, 11, 11, 7, R.carvalho, 3);
    p.frame(14, 11, 11, 7, R.nogueira[1]);
    p.planks(6, 1, 10, 7, R.pinho, 3);
    p.frame(6, 1, 10, 7, R.carvalho[1]);
    for (const [x, c] of [
      [16, R.vinho],
      [19, R.azul],
      [22, R.verde],
    ] as const)
      p.rect(x, 6, 2, 5, c[3]);
    p.rect(25, 15, 4, 3, R.papel[3]);
    p.outline();
    return art(p, 0, 1);
  }
  if (kind === 'flowers') return flowerbed({ variant: 0, color: null, rot: 0, seed: 97 });
  if (kind === 'garden') {
    const p = new Px(30, 14, 99);
    p.rect(1, 3, 28, 10, R.nogueira[1]);
    p.frame(0, 2, 30, 12, R.carvalho[2]);
    for (let x = 3; x < 28; x += 4) {
      p.rect(x, 4, 2, 4, R.foliage[3]);
      p.set(x + 2, 5, R.foliage[4]);
      p.rect(x, 9, 2, 3, R.foliage[2]);
      p.set(x, 8, x % 8 === 3 ? R.laranja[3] : R.vinho[3]);
    }
    return art(p, 0, 0);
  }
  if (kind === 'pots') {
    const p = new Px(22, 16, 101);
    p.shadow(11, 14, 10, 2, 70);
    for (const [x, c] of [
      [1, 0xf2a0b4],
      [9, 0xf6e27a],
      [15, 0xe8504a],
    ] as const) {
      p.rect(x + 1, 9, 5, 5, R.terracota[2]);
      p.rect(x, 8, 7, 2, R.terracota[3]);
      p.blob(x + 3.5, 5, 3.5, 3, R.foliage);
      p.set(x + 2, 3, c);
      p.set(x + 4, 4, c);
      p.set(x + 3, 2, c);
    }
    p.outline();
    return art(p, 0, 1);
  }
  return lantern({ variant: 1, color: 'dourado', rot: 0, seed: 103 });
}

/** Pilha de cartas e pacotes ao lado do Correio (0 a 3). */
export function paintLetters(level: number): SpriteArt {
  const p = new Px(26, 18, 105);
  if (level > 0) {
    p.shadow(13, 16, 11, 2, 70);
    p.rect(3, 10, 10, 6, R.papel[3]);
    p.line(3, 10, 8, 13, R.papel[1]);
    p.line(12, 10, 8, 13, R.papel[1]);
  }
  if (level > 1) {
    p.planks(13, 7, 10, 9, R.pinho, 4);
    p.frame(13, 7, 10, 9, R.carvalho[1]);
    p.rect(17, 7, 2, 9, R.vinho[3]);
    p.rect(5, 6, 9, 5, R.papel[4]);
    p.set(12, 7, R.vinho[3]);
  }
  if (level > 2) {
    p.rect(8, 1, 9, 6, R.palha[3]);
    p.frame(8, 1, 9, 6, R.palha[1]);
    p.rect(1, 13, 7, 4, R.papel[4]);
    p.rect(19, 3, 6, 4, R.papel[2]);
  }
  if (level > 0) p.outline();
  return art(p, 0, 1);
}

/** Brilho suave para luzes noturnas. */
export function paintGlow(radius = 24): SpriteArt {
  const p = new Px(radius * 2, radius * 2);
  for (let y = 0; y < radius * 2; y++)
    for (let x = 0; x < radius * 2; x++) {
      const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
      if (d >= 1) continue;
      const a = Math.pow(1 - d, 2.2) * 150;
      const q = Math.floor(a / 12) * 12;
      if (q > 0) p.set(x, y, 0xffc866, q);
    }
  return art(p, 0, 0);
}

/** Baforada de fumaça / partícula. */
export function paintPuff(): SpriteArt {
  const p = new Px(8, 8);
  p.ellipse(4, 4, 3.5, 3.5, 0xeee6da, 150);
  p.ellipse(3.5, 3.5, 2, 2, 0xffffff, 190);
  return art(p, 0, 0);
}

export const CITY_RECIPES: Record<string, Recipe> = {
  tree_oak: oak,
  tree_pine: pine,
  tree_birch: birch,
  tree_fruit: fruit,
  bush,
  flowerbed,
  garden,
  rock,
  fence,
  bench,
  lantern,
  pathstone,
  signpost,
  haystack,
  statue,
  birdbath,
  smallbridge,
  chickens,
  // cenário fixo
  oak,
  pine,
  birch,
  fruit,
  flowers,
  reeds,
  stump,
  cart,
  hay: haystack,
};
