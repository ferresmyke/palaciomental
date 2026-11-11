/**
 * Sprites do interior: móveis essenciais, móveis-contêiner, decoração, objetos de parede e tapetes.
 * Os móveis refletem dados reais (lombadas, livros abertos, avisos) recebidos em `state`.
 */
import type { RecipeOpts } from './cityArt';
import { R, ramp } from './palette';
import { art, darken, hash2, lighten, Px, strip, type Ramp, type SpriteArt } from './px';

type Recipe = (o: RecipeOpts) => SpriteArt;
type Face = (p: Px, x: number, y: number, w: number, h: number) => void;

interface BoxSpec {
  w: number;
  d: number;
  tall: number;
  top: number;
  ramp: Ramp;
  front?: Face;
  topDraw?: Face;
  /** Altura extra acima do tampo (ex.: chaminé do fogão). */
  extra?: number;
  above?: Face;
  legs?: boolean;
}

/** Móvel em forma de caixa na vista 3/4, com as quatro rotações. */
function boxy(o: RecipeOpts, s: BoxSpec): SpriteArt {
  const side = o.rot % 2 === 1;
  const cw = (side ? s.d : s.w) * 16;
  const topH = side ? (s.w - 1) * 16 + s.top : s.top;
  const extra = s.extra ?? 0;
  const ch = extra + topH + s.tall + 2;
  const p = new Px(cw, ch, o.seed);
  const r = s.ramp;
  const x = 1;
  const w = cw - 2;
  const ty = extra + 1;
  const fy = ty + topH;
  // tampo
  p.rect(x, ty, w, topH, r[3]);
  p.rect(x, ty, w, 1, r[4]);
  p.rect(x, ty, 1, topH, r[4]);
  p.rect(x + w - 1, ty, 1, topH, r[2]);
  // frente
  p.rect(x, fy, w, s.tall, r[2]);
  p.rect(x, fy, w, 1, r[1]);
  p.rect(x, fy, 1, s.tall, r[3]);
  p.rect(x + w - 1, fy, 1, s.tall, r[1]);
  if (!side && o.rot === 0) {
    s.topDraw?.(p, x, ty, w, topH);
    s.front?.(p, x, fy, w, s.tall);
    if (extra) s.above?.(p, x, 1, w, extra);
  } else if (!side) {
    // costas: tábuas lisas
    p.planks(x + 1, fy + 1, w - 2, s.tall - 2, r, 6, true, 2);
    s.topDraw?.(p, x, ty, w, topH);
    if (extra) s.above?.(p, x, 1, w, extra);
  } else {
    p.planks(x + 1, ty + 1, w - 2, topH - 1, r, 6, true, 3);
    p.planks(x + 1, fy + 1, w - 2, s.tall - 2, r, 5, false, 2);
    p.frame(x + 2, fy + 2, w - 4, s.tall - 4, r[1]);
    if (extra) p.rect(x + Math.floor(w / 2) - 2, 1, 4, extra, r[1]);
  }
  if (s.legs) {
    p.clear(x + 3, fy + s.tall - 3, w - 6, 3);
    p.rect(x + 3, fy + s.tall - 4, w - 6, 1, r[0]);
  }
  p.rect(x, fy + s.tall - 1, w, 1, r[0]);
  p.outline();
  return art(p, 0, 1);
}

const bookColors = ['ocre', 'azul', 'vinho', 'verde', 'cinza', 'rosa', 'musgo', 'terracota', 'ardosia', 'ebano'];

/** Lombadas numa prateleira. `null` é o espaço vazio com etiqueta de um livro em uso. */
function spines(p: Px, x: number, y: number, w: number, h: number, list: (string | null)[], seed: number): void {
  let cx = x;
  for (let i = 0; i < list.length && cx + 2 <= x + w; i++) {
    const name = list[i];
    const bw = 2 + (hash2(i, seed, 5) < 0.3 ? 1 : 0);
    if (cx + bw > x + w) break;
    if (name === null) {
      p.rect(cx, y + h - 1, bw, 1, R.papel[4]);
    } else {
      const r = ramp(name, 'ocre');
      const bh = h - Math.floor(hash2(i, seed, 9) * 3);
      p.rect(cx, y + h - bh, bw, bh, r[2]);
      p.rect(cx, y + h - bh, 1, bh, r[3]);
      p.rect(cx + bw - 1, y + h - bh, 1, bh, r[1]);
      p.set(cx, y + h - bh + 2, R.dourado[3]);
    }
    cx += bw + (hash2(i, seed, 13) < 0.15 ? 1 : 0);
  }
}

function spineList(o: RecipeOpts): (string | null)[] {
  const s = o.state?.spines;
  return Array.isArray(s) ? (s as (string | null)[]) : [];
}
const count = (o: RecipeOpts, key = 'count'): number => (typeof o.state?.[key] === 'number' ? (o.state[key] as number) : 0);

const shelf: Recipe = (o) => {
  const r = ramp(o.color);
  const list = spineList(o);
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 31,
    top: 5,
    ramp: r,
    front: (p, x, y, w, h) => {
      p.rect(x + 2, y + 2, w - 4, h - 4, darken(r[0], 0.3));
      const rows = 3;
      const rh = Math.floor((h - 4) / rows);
      const cap = Math.floor((w - 6) / 3) + 1;
      for (let i = 0; i < rows; i++) {
        const ry = y + 2 + i * rh;
        spines(p, x + 3, ry + 1, w - 6, rh - 2, list.slice(i * cap, (i + 1) * cap), o.seed + i);
        p.rect(x + 2, ry + rh - 1, w - 4, 1, r[3]);
      }
      if (o.variant === 1) {
        p.rect(x + 2, y + 1, w - 4, 2, r[3]);
        p.set(x + 2, y + 3, r[3]);
        p.set(x + w - 3, y + 3, r[3]);
        p.rect(x + Math.floor(w / 2) - 1, y, 3, 2, r[4]);
      }
    },
  });
};

const drawer: Recipe = (o) => {
  const r = ramp(o.color);
  const n = count(o);
  return boxy(o, {
    w: 1,
    d: 1,
    tall: 19,
    top: 5,
    ramp: r,
    front: (p, x, y, w, h) => {
      const rows = o.variant === 1 ? 3 : 4;
      const rh = Math.floor((h - 2) / rows);
      for (let i = 0; i < rows; i++) {
        const dy = y + 1 + i * rh;
        p.bevel(x + 1, dy, w - 2, rh - 1, r, 3);
        if (o.variant === 1) {
          p.rect(x + 4, dy + 1, 6, 2, R.papel[3]);
          p.rect(x + 6, dy + rh - 3, 2, 1, R.dourado[3]);
        } else p.rect(x + Math.floor(w / 2) - 1, dy + 1, 2, 1, R.dourado[3]);
      }
      if (n > 0) {
        p.rect(x + 3, y, 5, 1, R.papel[4]);
        if (n > 3) p.rect(x + 8, y, 3, 1, R.papel[2]);
      }
    },
  });
};

const box: Recipe = (o) => {
  const r = o.variant === 1 ? R.palha : ramp(o.color, 'pinho');
  const n = count(o);
  return boxy(o, {
    w: 1,
    d: 1,
    tall: 8,
    top: 6,
    ramp: r,
    topDraw: (p, x, y, w, h) => {
      p.rect(x + 1, y + 1, w - 2, h - 1, darken(r[0], 0.25));
      for (let i = 0; i < Math.min(n, 4); i++) {
        p.rect(x + 2 + i * 3, y + 1 + (i % 2), 3, h - 2, i % 2 ? R.papel[3] : R.papel[4]);
        p.set(x + 3 + i * 3, y + 2 + (i % 2), R.vinho[3]);
      }
    },
    front: (p, x, y, w, h) => {
      if (o.variant !== 1) p.planks(x + 1, y + 1, w - 2, h - 2, r, 3);
      p.rect(x + 4, y + 2, 6, 3, R.papel[3]);
      p.rect(x + 5, y + 3, 4, 1, r[0]);
    },
  });
};

const cabinet: Recipe = (o) => {
  const r = ramp(o.color);
  const list = spineList(o);
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 29,
    top: 5,
    ramp: r,
    front: (p, x, y, w, h) => {
      const half = Math.floor(w / 2);
      for (let i = 0; i < 2; i++) {
        const dx = x + 1 + i * half;
        const dw = half - 1;
        p.bevel(dx, y + 1, dw, h - 4, r, 2);
        if (o.variant === 1) {
          p.rect(dx + 2, y + 3, dw - 4, 12, R.vidro[1]);
          spines(p, dx + 2, y + 4, dw - 4, 5, list.slice(i * 6, i * 6 + 3), o.seed + i);
          spines(p, dx + 2, y + 10, dw - 4, 5, list.slice(i * 6 + 3, i * 6 + 6), o.seed + i + 4);
          p.line(dx + 2, y + 8, dx + 5, y + 3, R.vidro[3]);
          p.bevel(dx + 2, y + 17, dw - 4, h - 22, r, 3);
        } else {
          p.frame(dx + 2, y + 3, dw - 4, 10, r[1]);
          p.frame(dx + 2, y + 15, dw - 4, h - 20, r[1]);
        }
        p.rect(i === 0 ? dx + dw - 3 : dx + 1, y + 13, 2, 2, R.dourado[3]);
      }
      p.clear(x + 2, y + h - 2, w - 4, 2);
      p.rect(x + 2, y + h - 3, w - 4, 1, r[0]);
    },
  });
};

const bureau: Recipe = (o) => {
  const r = ramp(o.color);
  const list = spineList(o);
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 13,
    top: 8,
    extra: 9,
    ramp: r,
    above: (p, x, y, w, h) => {
      p.rect(x, y, w, h, r[2]);
      p.rect(x, y, w, 1, r[4]);
      p.rect(x + 1, y + 2, w - 2, h - 2, darken(r[0], 0.25));
      spines(p, x + 2, y + 2, w - 4, h - 3, list.slice(0, 8), o.seed);
    },
    topDraw: (p, x, y, w) => {
      p.rect(x + 8, y + 2, 14, 5, R.papel[4]);
      p.rect(x + 14, y + 2, 1, 5, R.papel[1]);
      p.rect(x + 9, y + 4, 4, 1, r[1]);
      p.rect(x + 16, y + 4, 4, 1, r[1]);
      p.rect(x + w - 6, y + 2, 2, 3, R.ebano[2]);
    },
    front: (p, x, y, w, h) => {
      p.bevel(x + 2, y + 1, w - 4, 4, r, 3);
      p.rect(x + Math.floor(w / 2) - 1, y + 2, 3, 1, R.dourado[3]);
      p.rect(x + 5, y + 6, w - 10, h - 6, darken(r[0], 0.3));
    },
  });
};

function openBook(p: Px, x: number, y: number, cover: Ramp): void {
  p.rect(x, y, 11, 7, cover[2]);
  p.rect(x + 1, y, 9, 6, R.papel[4]);
  p.rect(x + 5, y, 1, 6, R.papel[1]);
  p.rect(x + 2, y + 2, 2, 1, R.papel[0]);
  p.rect(x + 2, y + 4, 3, 1, R.papel[0]);
  p.rect(x + 7, y + 2, 2, 1, R.papel[0]);
  p.rect(x + 7, y + 4, 2, 1, R.papel[0]);
}

const desk: Recipe = (o) => {
  const r = ramp(o.color);
  const open = Array.isArray(o.state?.open) ? (o.state.open as string[]) : [];
  const notes = count(o, 'tasks');
  return boxy(o, {
    w: 3,
    d: 2,
    tall: 12,
    top: 22,
    ramp: r,
    topDraw: (p, x, y, w, h) => {
      if (o.variant === 0) {
        p.rect(x + 12, y + 8, 22, 12, R.verde[1]);
        p.frame(x + 12, y + 8, 22, 12, R.dourado[1]);
      } else p.planks(x + 1, y + 1, w - 2, h - 1, r, 5, false, 3);
      open.slice(0, 3).forEach((c, i) => openBook(p, x + 3 + i * 14, y + 3 + (i === 1 ? 8 : 0) + (i === 2 ? 3 : 0), ramp(c, 'ocre')));
      if (!open.length) {
        p.rect(x + 16, y + 11, 9, 7, R.papel[4]);
        p.rect(x + 18, y + 13, 5, 1, r[1]);
        p.rect(x + 18, y + 15, 4, 1, r[1]);
      }
      for (let i = 0; i < Math.min(notes, 4); i++) {
        p.rect(x + w - 11, y + 12 - i * 2, 8, 6, i % 2 ? R.papel[3] : R.papel[4]);
        p.rect(x + w - 10, y + 14 - i * 2, 5, 1, R.papel[0]);
      }
      // tinteiro, pena e castiçal
      p.rect(x + 3, y + h - 6, 3, 3, R.ebano[2]);
      p.set(x + 3, y + h - 6, R.ebano[4]);
      p.line(x + 5, y + h - 7, x + 9, y + h - 12, R.branco[4]);
      p.rect(x + w - 5, y + 2, 2, 4, R.papel[4]);
      p.set(x + w - 5, y + 1, R.fogo[3]);
      p.rect(x + w - 6, y + 6, 4, 1, R.dourado[2]);
    },
    front: (p, x, y, w, h) => {
      p.bevel(x + 2, y + 1, 13, 5, r, 3);
      p.bevel(x + w - 15, y + 1, 13, 5, r, 3);
      p.rect(x + 7, y + 3, 3, 1, R.dourado[3]);
      p.rect(x + w - 10, y + 3, 3, 1, R.dourado[3]);
      p.clear(x + 16, y + 6, w - 32, h - 6);
      p.rect(x + 16, y + 5, w - 32, 1, r[0]);
      p.clear(x + 3, y + 8, 11, h - 8);
      p.clear(x + w - 14, y + 8, 11, h - 8);
      p.rect(x + 3, y + 7, 11, 1, r[0]);
      p.rect(x + w - 14, y + 7, 11, 1, r[0]);
    },
  });
};

const chest: Recipe = (o) => {
  const r = ramp(o.color);
  const full = count(o) > 0;
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 11,
    top: 9,
    ramp: r,
    topDraw: (p, x, y, w, h) => {
      p.planks(x + 1, y + 1, w - 2, h - 1, r, 3, false, 3);
      if (o.variant === 0) for (const bx of [x + 5, x + w - 8]) p.rect(bx, y, 3, h, R.ferro[2]);
    },
    front: (p, x, y, w, h) => {
      p.planks(x + 1, y + 1, w - 2, h - 2, r, 4, false, 2);
      if (o.variant === 0)
        for (const bx of [x + 5, x + w - 8]) {
          p.rect(bx, y, 3, h, R.ferro[2]);
          p.rect(bx, y, 1, h, R.ferro[3]);
        }
      p.rect(x + Math.floor(w / 2) - 2, y, 4, 5, R.dourado[2]);
      p.rect(x + Math.floor(w / 2) - 1, y + 2, 2, 2, R.ebano[1]);
      if (full) p.rect(x + 2, y, 3, 1, R.papel[4]);
    },
  });
};

const workbench: Recipe = (o) => {
  const r = ramp(o.color);
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 13,
    top: 9,
    ramp: r,
    legs: true,
    topDraw: (p, x, y, w) => {
      void w;
      p.rect(x + 3, y + 3, 8, 2, R.carvalho[3]);
      p.rect(x + 10, y + 2, 4, 4, R.ferro[3]);
      p.rect(x + 17, y + 2, 9, 1, R.ferro[4]);
      p.rect(x + 17, y + 3, 9, 2, R.ferro[2]);
      p.rect(x + 25, y + 3, 3, 3, R.carvalho[2]);
      p.rect(x + w - 5, y + 5, 3, 3, R.ferro[2]);
    },
    front: (p, x, y, w) => {
      p.rect(x + 1, y + 1, w - 2, 3, r[3]);
      p.rect(x + 6, y + 5, 8, 4, R.pinho[2]);
      p.frame(x + 6, y + 5, 8, 4, R.pinho[0]);
    },
  });
};

const stove: Recipe = (o) => {
  const r = ramp(o.color, 'ferro');
  return boxy(o, {
    w: 2,
    d: 1,
    tall: 17,
    top: 6,
    extra: 14,
    ramp: r,
    above: (p, x, y, w, h) => {
      p.rect(x + w - 10, y, 5, h, r[2]);
      p.rect(x + w - 10, y, 1, h, r[3]);
      p.rect(x + w - 11, y + 4, 7, 1, r[1]);
      p.rect(x + 5, y + h - 5, 9, 5, R.ferro[1]);
      p.rect(x + 4, y + h - 6, 11, 1, R.ferro[3]);
      p.rect(x + 3, y + h - 4, 1, 2, R.ferro[3]);
      p.rect(x + 15, y + h - 4, 1, 2, R.ferro[3]);
    },
    topDraw: (p, x, y, w) => {
      p.ellipse(x + 9.5, y + 3, 5, 2, R.ferro[0]);
      p.ellipse(x + w - 8, y + 3, 4, 1.8, r[1]);
    },
    front: (p, x, y, w, h) => {
      p.bevel(x + 3, y + 3, 12, 9, r, 1);
      p.rect(x + 5, y + 5, 8, 5, R.fogo[1]);
      p.rect(x + 6, y + 6, 6, 4, R.fogo[2]);
      p.rect(x + 8, y + 7, 2, 3, R.fogo[4]);
      for (let i = 5; i < 13; i += 2) p.rect(x + i, y + 5, 1, 5, r[0]);
      p.bevel(x + w - 13, y + 3, 10, 9, r, 3);
      p.rect(x + w - 9, y + 7, 3, 1, R.dourado[3]);
      p.rect(x + 2, y + h - 3, w - 4, 1, r[0]);
    },
  });
};

const longtable: Recipe = (o) => {
  const r = ramp(o.color);
  return boxy(o, {
    w: 3,
    d: 1,
    tall: 9,
    top: 11,
    ramp: r,
    legs: true,
    topDraw: (p, x, y, w, h) => {
      p.planks(x + 1, y + 1, w - 2, h - 1, r, 4, false, 3);
      if (o.variant === 0)
        for (let i = 0; i < 3; i++) {
          const cx = x + 8 + i * 15;
          p.ellipse(cx, y + 5.5, 4, 3, R.papel[4]);
          p.ellipse(cx, y + 5.5, 2.3, 1.6, i === 1 ? R.palha[3] : R.vinho[3]);
          p.rect(cx + 5, y + 2, 2, 3, R.carvalho[1]);
          p.set(cx + 5, y + 2, R.papel[4]);
        }
    },
  });
};

const counter: Recipe = (o) => {
  const r = ramp(o.color);
  return boxy(o, {
    w: 3,
    d: 1,
    tall: 15,
    top: 8,
    ramp: r,
    topDraw: (p, x, y, w) => {
      p.rect(x + 4, y + 2, 10, 5, R.verde[1]);
      p.rect(x + 5, y + 2, 8, 4, R.papel[4]);
      p.rect(x + 9, y + 2, 1, 4, R.papel[1]);
      for (let i = 0; i < 3; i++) p.rect(x + 20 + i * 4, y + 5 - i, 3, 2 + i, R.dourado[3]);
      p.rect(x + w - 12, y + 1, 1, 5, R.dourado[1]);
      p.rect(x + w - 16, y + 1, 9, 1, R.dourado[2]);
      p.rect(x + w - 17, y + 3, 3, 1, R.dourado[3]);
      p.rect(x + w - 9, y + 3, 3, 1, R.dourado[3]);
    },
    front: (p, x, y, _w, h) => {
      for (let i = 0; i < 3; i++) {
        p.bevel(x + 2 + i * 15, y + 2, 13, h - 5, r, 2);
        p.frame(x + 4 + i * 15, y + 4, 9, h - 9, r[1]);
      }
    },
  });
};

// ───────────────────────────── Decoração de chão ─────────────────────────────

const plant: Recipe = (o) => {
  const pot = ramp(o.color, 'terracota');
  const p = new Px(16, 28, o.seed);
  p.shadow(8, 26, 6, 2, 70);
  p.rect(4, 19, 8, 7, pot[2]);
  p.rect(4, 19, 2, 7, pot[3]);
  p.rect(10, 19, 2, 7, pot[1]);
  p.rect(3, 18, 10, 2, pot[3]);
  p.rect(3, 18, 10, 1, pot[4]);
  p.clear(4, 25);
  p.clear(11, 25);
  if (o.variant === 0) {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.08 + 0.84 * (i / 8));
      p.line(8, 18, Math.round(8 + Math.cos(a) * 7), Math.round(16 + Math.sin(a) * 11), i % 2 ? R.foliage[3] : R.foliage[2]);
    }
    p.speckle(1, 4, 14, 13, [R.foliage[4]], 0.2);
  } else if (o.variant === 1) {
    p.rect(7, 9, 2, 10, R.nogueira[2]);
    p.blob(8, 8, 6, 6, R.foliage);
    p.blob(5, 11, 3, 3, R.foliage);
  } else if (o.variant === 2) {
    p.blob(8, 13, 5.5, 4.5, R.foliage);
    for (const [x, y, c] of [
      [5, 9, 0xf2a0b4],
      [9, 7, 0xf6e27a],
      [11, 11, 0xe8504a],
      [7, 12, 0xffffff],
    ] as const) {
      p.rect(x, y, 2, 2, c);
      p.set(x, y, lighten(c, 0.4));
    }
  } else {
    p.rect(6, 8, 4, 11, R.musgo[2]);
    p.rect(6, 8, 1, 11, R.musgo[4]);
    p.rect(9, 8, 1, 11, R.musgo[1]);
    p.rect(3, 11, 2, 5, R.musgo[2]);
    p.rect(3, 15, 3, 1, R.musgo[2]);
    p.rect(11, 10, 2, 4, R.musgo[2]);
    p.rect(10, 13, 2, 1, R.musgo[2]);
    p.set(7, 7, 0xf2a0b4);
  }
  p.outline();
  return art(p, 0, 1);
};

const lamp: Recipe = (o) => {
  const m = ramp(o.color, 'dourado');
  const p = new Px(16, 34, o.seed);
  p.shadow(8, 32, 5, 2, 70);
  p.rect(5, 30, 6, 2, m[1]);
  p.rect(7, 12, 2, 18, m[2]);
  p.rect(7, 12, 1, 18, m[3]);
  p.poly(
    [
      [5, 3],
      [11, 3],
      [14, 13],
      [2, 13],
    ],
    R.luz[3],
  );
  p.rect(5, 3, 6, 1, m[3]);
  p.rect(2, 12, 12, 1, R.luz[1]);
  p.line(5, 4, 3, 11, R.luz[4]);
  p.outline();
  return art(p, 0, 1, 1, { x: 8, y: 9 });
};

const chair: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 22, o.seed);
  p.shadow(8, 20, 6, 2, 70);
  const seat = () => {
    p.rect(3, 10, 10, 5, r[3]);
    p.rect(3, 10, 10, 1, r[4]);
    p.rect(3, 15, 10, 2, r[2]);
    p.rect(3, 17, 2, 3, r[1]);
    p.rect(11, 17, 2, 3, r[1]);
  };
  if (o.rot === 0) {
    p.rect(3, 2, 10, 8, r[2]);
    p.rect(3, 2, 10, 1, r[4]);
    p.rect(5, 4, 6, 4, r[1]);
    seat();
  } else if (o.rot === 2) {
    seat();
    p.rect(3, 3, 10, 12, r[2]);
    p.rect(3, 3, 10, 1, r[4]);
    p.planks(4, 5, 8, 9, r, 3, true, 2);
  } else {
    seat();
    const bx = o.rot === 1 ? 3 : 11;
    p.rect(bx, 2, 2, 14, r[2]);
    p.rect(bx, 2, 2, 1, r[4]);
  }
  p.outline();
  return art(p, 0, 1);
};

const armchair: Recipe = (o) => {
  const c = ramp(o.color, 'vinho');
  const p = new Px(16, 22, o.seed);
  p.shadow(8, 20, 7, 2, 70);
  const back = o.rot === 2;
  if (!back) p.rect(2, 3, 12, 9, c[2]);
  if (!back) p.rect(2, 3, 12, 2, c[3]);
  p.rect(3, 10, 10, 6, c[3]);
  p.rect(3, 10, 10, 1, c[4]);
  p.rect(1, 8, 3, 9, c[2]);
  p.rect(12, 8, 3, 9, c[1]);
  p.rect(1, 8, 3, 1, c[4]);
  p.rect(12, 8, 3, 1, c[3]);
  p.rect(2, 16, 12, 3, c[1]);
  if (back) {
    p.rect(2, 4, 12, 13, c[2]);
    p.rect(2, 4, 12, 2, c[3]);
    p.rect(4, 8, 8, 1, c[1]);
  }
  if (o.rot === 1) p.rect(1, 3, 4, 14, c[2]);
  if (o.rot === 3) p.rect(11, 3, 4, 14, c[1]);
  p.rect(2, 19, 2, 1, R.nogueira[1]);
  p.rect(12, 19, 2, 1, R.nogueira[1]);
  p.outline();
  return art(p, 0, 1);
};

const sidetable: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 22, o.seed);
  p.shadow(8, 20, 6, 2, 70);
  p.rect(7, 12, 2, 7, r[1]);
  p.rect(4, 18, 8, 2, r[1]);
  p.ellipse(8, 10, 6.5, 3.5, r[2]);
  p.ellipse(8, 9, 6.5, 3.2, r[3]);
  p.ellipse(7, 8.5, 4, 1.6, r[4]);
  if (o.variant === 1) {
    p.rect(6, 3, 4, 5, R.azul[3]);
    p.rect(6, 3, 1, 5, R.azul[4]);
    p.set(7, 1, 0xf2a0b4);
    p.set(9, 2, 0xf6e27a);
    p.set(8, 2, R.foliage[3]);
  }
  p.outline();
  return art(p, 0, 1);
};

const barrel: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 22, o.seed);
  p.shadow(8, 20, 6, 2, 70);
  p.ellipse(8, 11, 6, 9, r[2]);
  for (let x = 3; x < 13; x += 3) p.rect(x, 4, 1, 15, r[1]);
  p.rect(3, 4, 2, 14, r[3]);
  p.ellipse(8, 4, 5.5, 2.2, r[3]);
  p.ellipse(8, 4, 4, 1.3, r[1]);
  p.rect(2, 7, 12, 1, R.ferro[3]);
  p.rect(2, 15, 12, 1, R.ferro[2]);
  p.outline();
  return art(p, 0, 1);
};

const crate: Recipe = (o) => {
  const r = ramp(o.color, 'pinho');
  return boxy(o, {
    w: 1,
    d: 1,
    tall: 10,
    top: 6,
    ramp: r,
    topDraw: (p, x, y, w, h) => p.planks(x + 1, y + 1, w - 2, h - 1, r, 3, true, 3),
    front: (p, x, y, w, h) => {
      p.planks(x + 1, y + 1, w - 2, h - 2, r, 3);
      p.line(x + 2, y + 2, x + w - 3, y + h - 3, r[1]);
      p.frame(x + 1, y + 1, w - 2, h - 2, r[1]);
    },
  });
};

const candle: Recipe = (o) => {
  const m = ramp(o.color, 'dourado');
  const p = new Px(16, 28, o.seed);
  p.shadow(8, 26, 4, 2, 70);
  p.rect(5, 24, 6, 2, m[1]);
  p.rect(7, 12, 2, 12, m[2]);
  p.rect(3, 11, 10, 1, m[3]);
  for (const x of [3, 7, 11]) {
    p.rect(x, 6 + (x === 7 ? -2 : 0), 2, 5 + (x === 7 ? 2 : 0), R.papel[4]);
    p.set(x, 4 + (x === 7 ? -2 : 0), R.fogo[3]);
    p.set(x, 5 + (x === 7 ? -2 : 0), R.fogo[2]);
  }
  p.outline();
  return art(p, 0, 1, 1, { x: 8, y: 4 });
};

const globe: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 24, o.seed);
  p.shadow(8, 22, 5, 2, 70);
  p.rect(5, 20, 6, 2, r[1]);
  p.rect(7, 16, 2, 4, r[2]);
  p.ellipse(8, 9, 6, 6, R.agua[2]);
  p.ellipse(7, 8, 4, 4, R.agua[3]);
  p.rect(5, 6, 3, 2, R.foliage[3]);
  p.rect(8, 9, 4, 3, R.foliage[3]);
  p.rect(6, 11, 2, 2, R.foliage[2]);
  p.line(3, 13, 12, 3, R.dourado[2]);
  p.outline();
  return art(p, 0, 1);
};

const bookpile: Recipe = (o) => {
  const n = o.variant === 1 ? 6 : 3;
  const p = new Px(16, 6 + n * 3, o.seed);
  p.shadow(8, p.h - 2, 6, 2, 70);
  for (let i = 0; i < n; i++) {
    const c = ramp(bookColors[(i * 3 + o.seed) % bookColors.length], 'ocre');
    const x = 3 + ((i * 7 + o.seed) % 3) - 1;
    const y = p.h - 5 - i * 3;
    p.rect(x, y, 10, 3, c[2]);
    p.rect(x, y, 10, 1, c[3]);
    p.rect(x + 9, y + 1, 1, 1, R.papel[4]);
  }
  p.outline();
  return art(p, 0, 1);
};

const cat: Recipe = (o) => {
  const c = ramp(o.color, 'laranja');
  const frames = [0, 1].map((f) => {
    const p = new Px(16, 14, o.seed);
    p.shadow(8, 12, 6, 1.5, 60);
    if (o.variant === 0) {
      p.ellipse(8, 9, 5.5, 3 - f * 0.4, c[2]);
      p.ellipse(7, 8, 4, 2, c[3]);
      p.ellipse(4, 9, 2.5, 2.2, c[3]);
      p.set(3, 7, c[2]);
      p.set(5, 7, c[2]);
      p.rect(11, 11, 3, 1, c[1]);
      p.set(3, 10, c[0]);
    } else {
      p.ellipse(8, 9, 3.5, 4, c[2]);
      p.ellipse(8, 4.5, 3, 2.6, c[3]);
      p.set(6, 2, c[2]);
      p.set(10, 2, c[2]);
      p.set(7, 4, 0x2a3a1a);
      p.set(9, 4, 0x2a3a1a);
      p.rect(11 + f, 10, 3, 1, c[1]);
      p.set(13 + f, 9, c[1]);
      p.rect(7, 8, 2, 4, c[4]);
    }
    p.outline();
    return p;
  });
  return art(strip(frames), 0, 1, 2);
};

const anvil: Recipe = (o) => {
  const p = new Px(16, 18, o.seed);
  p.shadow(8, 16, 6, 2, 70);
  p.rect(5, 10, 6, 6, R.nogueira[2]);
  p.rect(5, 10, 6, 1, R.nogueira[4]);
  p.rect(2, 4, 12, 4, R.ferro[2]);
  p.rect(2, 4, 12, 1, R.ferro[4]);
  p.rect(0, 5, 3, 2, R.ferro[3]);
  p.rect(5, 8, 6, 2, R.ferro[1]);
  p.outline();
  return art(p, 0, 1);
};

const safe: Recipe = (o) => {
  const r = ramp(o.color, 'ferro');
  return boxy(o, {
    w: 1,
    d: 1,
    tall: 17,
    top: 5,
    ramp: r,
    front: (p, x, y, w, h) => {
      p.bevel(x + 2, y + 2, w - 4, h - 5, r, 3);
      p.ellipse(x + w / 2, y + h / 2 - 1, 2.5, 2.5, R.dourado[2]);
      p.set(x + Math.floor(w / 2), y + Math.floor(h / 2) - 2, R.dourado[4]);
      p.rect(x + w - 5, y + 4, 1, 6, R.dourado[3]);
      p.rect(x + 2, y + h - 2, 2, 2, r[0]);
      p.rect(x + w - 4, y + h - 2, 2, 2, r[0]);
    },
  });
};

const weights: Recipe = (o) => {
  const p = new Px(32, 22, o.seed);
  p.shadow(16, 20, 14, 2, 70);
  p.rect(3, 8, 26, 2, R.nogueira[2]);
  p.rect(3, 15, 26, 2, R.nogueira[1]);
  for (const x of [3, 27]) p.rect(x, 5, 2, 15, R.nogueira[2]);
  for (let i = 0; i < 3; i++) {
    const x = 6 + i * 8;
    for (const y of [4, 11]) {
      p.rect(x, y, 2, 4, R.ferro[i === 1 ? 3 : 2]);
      p.rect(x + 2, y + 1, 3, 2, R.ferro[4]);
      p.rect(x + 5, y, 2, 4, R.ferro[i === 1 ? 3 : 2]);
    }
  }
  p.outline();
  return art(p, 0, 1);
};

const fireplace: Recipe = (o) => {
  const s = ramp(o.color, 'pedra');
  const lit = o.variant === 0;
  const frames = [0, 1, 2].map((f) => {
    const p = new Px(32, 48, o.seed);
    p.bricks(1, 8, 30, 38, s, 7, 4);
    p.rect(1, 8, 2, 38, s[3]);
    p.rect(29, 8, 2, 38, s[1]);
    p.bricks(6, 1, 20, 8, s, 7, 4);
    p.rect(0, 16, 32, 3, R.nogueira[3]);
    p.rect(0, 16, 32, 1, R.nogueira[4]);
    p.rect(0, 18, 32, 1, R.nogueira[1]);
    p.rect(6, 24, 20, 22, 0x15100e);
    p.ellipse(16, 25, 10, 5, 0x15100e);
    p.rect(8, 42, 16, 3, R.nogueira[1]);
    p.rect(10, 40, 12, 2, R.nogueira[2]);
    if (lit) {
      const hgt = [11, 13, 10][f];
      for (let x = 10; x < 22; x++) {
        const hh = Math.round(hgt * (1 - Math.abs(x - 15.5 + (f - 1)) / 7) + hash2(x, f, 9) * 3);
        for (let y = 0; y < hh; y++) {
          const k = y / Math.max(1, hh);
          p.set(x, 41 - y, k < 0.3 ? R.fogo[4] : k < 0.6 ? R.fogo[3] : k < 0.85 ? R.fogo[2] : R.fogo[1]);
        }
      }
    }
    p.rect(5, 12, 3, 4, R.papel[4]);
    p.set(6, 11, R.fogo[3]);
    p.rect(21, 11, 6, 5, R.dourado[1]);
    p.rect(22, 12, 4, 3, R.azul[3]);
    p.outline();
    return p;
  });
  return art(strip(frames), 0, 1, 3, { x: 16, y: 34 });
};

const easel: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 30, o.seed);
  p.shadow(8, 28, 6, 2, 70);
  p.line(4, 28, 7, 3, r[2]);
  p.line(12, 28, 9, 3, r[1]);
  p.rect(7, 2, 2, 3, r[2]);
  p.rect(2, 5, 12, 14, R.papel[4]);
  p.frame(2, 5, 12, 14, r[1]);
  if (o.variant === 0) {
    p.rect(3, 6, 10, 6, R.agua[4]);
    p.rect(3, 12, 10, 6, R.grass[3]);
    p.poly(
      [
        [4, 13],
        [8, 8],
        [12, 13],
      ],
      R.pedra[2],
    );
    p.ellipse(11, 8, 1.2, 1.2, R.luz[3]);
  } else if (o.variant === 1) {
    p.rect(3, 6, 10, 12, R.vinho[1]);
    p.ellipse(8, 10, 2.5, 2.5, 0xe2aa7c);
    p.rect(5, 13, 6, 5, R.azul[2]);
    p.rect(6, 7, 4, 2, R.nogueira[1]);
  }
  p.rect(2, 19, 12, 2, r[3]);
  p.outline();
  return art(p, 0, 1);
};

const bed: Recipe = (o) => {
  const c = ramp(o.color, 'azul');
  const p = new Px(16, 38, o.seed);
  p.rect(1, 1, 14, 6, R.carvalho[2]);
  p.rect(1, 1, 14, 1, R.carvalho[4]);
  p.rect(1, 7, 14, 28, R.papel[3]);
  p.rect(3, 8, 10, 6, R.papel[4]);
  p.rect(3, 13, 10, 1, R.papel[1]);
  p.rect(1, 16, 14, 17, c[2]);
  p.rect(1, 16, 14, 2, c[4]);
  p.rect(1, 16, 2, 17, c[3]);
  p.rect(13, 16, 2, 17, c[1]);
  for (let y = 21; y < 32; y += 4) p.rect(3, y, 10, 1, c[1]);
  p.rect(1, 33, 14, 3, R.carvalho[2]);
  p.rect(1, 35, 14, 1, R.carvalho[0]);
  p.outline();
  return art(p, 0, 2);
};

// ───────────────────────────── Parede ─────────────────────────────

const noticeColors = [R.papel, R.ocre, R.rosa, R.azul, R.verde];

function pinned(p: Px, x: number, y: number, w: number, h: number, n: number, urgent: number, seed: number): void {
  const cols = Math.max(1, Math.floor(w / 6));
  for (let i = 0; i < Math.min(n, cols * 2); i++) {
    const cx = x + (i % cols) * 6 + (hash2(i, seed, 3) < 0.5 ? 0 : 1);
    const cy = y + Math.floor(i / cols) * 7 + (hash2(i, seed, 4) < 0.5 ? 0 : 1);
    const c = noticeColors[(i + seed) % noticeColors.length];
    p.rect(cx, cy, 5, 5, c[4]);
    p.rect(cx + 1, cy + 2, 3, 1, c[1]);
    p.rect(cx + 1, cy + 3, 2, 1, c[1]);
    p.set(cx + 2, cy, i < urgent ? 0xd03a30 : R.ferro[3]);
    if (i < urgent) p.set(cx + 4, cy, 0xd03a30);
  }
  void h;
}

const board: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(32, 20, o.seed);
  p.rect(1, 1, 30, 18, r[1]);
  p.rect(1, 1, 30, 1, r[3]);
  const slate = o.variant === 1;
  p.rect(3, 3, 26, 14, slate ? 0x2c3a36 : R.cortica[3]);
  if (!slate) p.speckle(3, 3, 26, 14, [R.cortica[2], R.cortica[4]], 0.15);
  pinned(p, 4, 3, 24, 14, count(o), count(o, 'urgent'), o.seed);
  p.outline();
  return art(p, 0, 0);
};

const cork: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(32, 20, o.seed);
  p.rect(1, 1, 30, 18, r[2]);
  p.rect(1, 1, 30, 1, r[4]);
  p.rect(2, 2, 28, 16, R.cortica[2]);
  p.speckle(2, 2, 28, 16, [R.cortica[1], R.cortica[4]], 0.2);
  const list = spineList(o).filter((s): s is string => s !== null);
  for (let i = 0; i < Math.min(list.length, 8); i++) {
    const c = ramp(list[i], 'ocre');
    const cx = 3 + (i % 4) * 7;
    const cy = 3 + Math.floor(i / 4) * 8;
    p.rect(cx, cy, 6, 6, R.papel[4]);
    p.rect(cx, cy, 6, 2, c[2]);
    p.rect(cx + 1, cy + 3, 4, 1, R.papel[0]);
    p.set(cx + 3, cy, R.dourado[4]);
  }
  p.outline();
  return art(p, 0, 0);
};

const picture: Recipe = (o) => {
  const f = ramp(o.color, 'dourado');
  const p = new Px(16, 16, o.seed);
  p.rect(1, 2, 14, 12, f[2]);
  p.rect(1, 2, 14, 1, f[4]);
  p.rect(1, 13, 14, 1, f[0]);
  p.rect(3, 4, 10, 8, R.papel[3]);
  if (o.variant === 0) {
    p.rect(3, 4, 10, 4, R.agua[4]);
    p.rect(3, 8, 10, 4, R.grass[3]);
    p.poly(
      [
        [4, 9],
        [7, 5],
        [11, 9],
      ],
      R.pedra[2],
    );
    p.set(11, 5, R.luz[3]);
  } else if (o.variant === 1) {
    p.rect(3, 4, 10, 8, R.verde[1]);
    p.ellipse(8, 7, 2, 2, 0xe2aa7c);
    p.rect(6, 9, 4, 3, R.vinho[2]);
  } else {
    p.rect(3, 4, 10, 8, R.papel[4]);
    p.rect(7, 8, 2, 4, R.azul[3]);
    for (const [x, y, c] of [
      [6, 6, 0xe8504a],
      [9, 5, 0xf6e27a],
      [8, 7, 0xf2a0b4],
    ] as const)
      p.rect(x, y, 2, 2, c);
  }
  p.outline();
  return art(p, 0, 0);
};

/** Quadro com imagem do usuário: a miniatura entra na moldura. */
export function pictureWithImage(color: string | null, image: CanvasImageSource, seed = 1): SpriteArt {
  const base = picture({ variant: 0, color, rot: 0, seed });
  const ctx = base.canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 3, 4, 10, 8);
  return base;
}

const clock: Recipe = (o) => {
  const f = ramp(o.color, 'nogueira');
  const p = new Px(16, 20, o.seed);
  p.rect(4, 12, 8, 6, f[2]);
  p.rect(7, 13, 2, 4, R.dourado[3]);
  p.ellipse(8, 7, 6, 6, f[2]);
  p.ellipse(8, 7, 4.5, 4.5, R.papel[4]);
  p.rect(8, 4, 1, 4, R.ebano[1]);
  p.rect(8, 7, 3, 1, R.ebano[1]);
  p.outline();
  return art(p, 0, 0);
};

const windowWall: Recipe = (o) => {
  const c = ramp(o.color, 'ocre');
  const night = !!o.state?.night;
  const p = new Px(32, 22, o.seed);
  p.rect(3, 1, 26, 19, R.nogueira[1]);
  p.rect(5, 3, 22, 15, night ? 0x1c2a4a : R.agua[4]);
  if (night) {
    p.set(9, 6, 0xffffff);
    p.set(20, 5, 0xfff0b0);
    p.set(23, 10, 0xffffff);
    p.ellipse(13, 8, 2, 2, 0xf4f0d8);
  } else {
    p.rect(5, 13, 22, 5, R.grass[3]);
    p.ellipse(11, 7, 4, 2, 0xffffff);
    p.ellipse(21, 9, 3, 1.5, 0xffffff);
    p.blob(22, 13, 3, 3, R.foliage);
  }
  p.rect(15, 3, 2, 15, R.nogueira[2]);
  p.rect(5, 10, 22, 1, R.nogueira[2]);
  p.rect(2, 19, 28, 2, R.nogueira[3]);
  if (o.variant === 0) {
    p.rect(1, 0, 30, 2, R.nogueira[2]);
    for (let y = 2; y < 18; y++) {
      const wdt = y < 10 ? 6 : 4;
      p.rect(3, y, wdt, 1, y % 3 === 0 ? c[1] : c[2]);
      p.rect(29 - wdt, y, wdt, 1, y % 3 === 0 ? c[1] : c[2]);
      p.set(3, y, c[3]);
    }
  }
  p.outline();
  return art(p, 0, 0);
};

const walllamp: Recipe = (o) => {
  const m = ramp(o.color, 'dourado');
  const p = new Px(16, 16, o.seed);
  p.rect(7, 9, 2, 5, m[2]);
  p.rect(5, 13, 6, 1, m[1]);
  p.rect(5, 3, 6, 6, R.luz[3]);
  p.rect(6, 4, 4, 4, R.luz[4]);
  p.rect(4, 2, 8, 1, m[2]);
  p.rect(4, 9, 8, 1, m[1]);
  p.outline();
  return art(p, 0, 0, 1, { x: 8, y: 6 });
};

const wallmap: Recipe = (o) => {
  const f = ramp(o.color, 'nogueira');
  const p = new Px(32, 20, o.seed);
  p.rect(1, 1, 30, 2, f[2]);
  p.rect(1, 17, 30, 2, f[1]);
  p.rect(2, 3, 28, 14, R.papel[3]);
  p.blob(10, 9, 5, 3.5, R.musgo, 0.3);
  p.blob(21, 11, 6, 3, R.musgo, 0.3);
  p.line(6, 14, 14, 12, R.agua[2]);
  p.line(14, 12, 26, 6, R.vinho[2], 200);
  p.set(26, 6, R.vinho[3]);
  p.rect(25, 13, 3, 3, R.papel[1]);
  p.outline();
  return art(p, 0, 0);
};

const toolrack: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(32, 20, o.seed);
  p.planks(1, 2, 30, 16, r, 5, false, 2);
  p.frame(1, 2, 30, 16, r[0]);
  p.rect(4, 4, 6, 3, R.ferro[3]);
  p.rect(6, 7, 2, 9, R.carvalho[3]);
  p.rect(12, 5, 9, 2, R.ferro[4]);
  p.rect(12, 7, 9, 1, R.ferro[1]);
  p.rect(20, 5, 3, 4, R.carvalho[3]);
  p.rect(25, 4, 2, 11, R.ferro[3]);
  p.rect(24, 13, 4, 3, R.vinho[2]);
  p.rect(13, 10, 2, 6, R.ferro[2]);
  p.rect(12, 9, 4, 2, R.ferro[4]);
  p.outline();
  return art(p, 0, 0);
};

const banner: Recipe = (o) => {
  const c = ramp(o.color, 'vinho');
  const p = new Px(16, 22, o.seed);
  p.rect(2, 1, 12, 2, R.dourado[2]);
  p.poly(
    [
      [3, 3],
      [13, 3],
      [13, 17],
      [8, 21],
      [3, 17],
    ],
    c[2],
  );
  p.rect(3, 3, 2, 14, c[3]);
  p.rect(11, 3, 2, 14, c[1]);
  p.ellipse(8, 10, 2.5, 2.5, R.dourado[3]);
  p.outline();
  return art(p, 0, 0);
};

const wallshelf: Recipe = (o) => {
  const r = ramp(o.color);
  const p = new Px(16, 14, o.seed);
  p.rect(1, 10, 14, 2, r[3]);
  p.rect(1, 12, 14, 1, r[1]);
  p.rect(3, 12, 1, 2, r[1]);
  p.rect(12, 12, 1, 2, r[1]);
  if (o.variant === 0)
    for (const [x, c] of [
      [2, R.terracota],
      [7, R.azul],
      [11, R.verde],
    ] as const) {
      p.rect(x, 6, 3, 4, c[2]);
      p.rect(x, 5, 3, 1, R.cortica[3]);
    }
  else spines(p, 2, 3, 12, 7, ['vinho', 'azul', 'ocre', 'verde'], o.seed);
  p.outline();
  return art(p, 0, 0);
};

// ───────────────────────────── Tapetes ─────────────────────────────

function rugRect(o: RecipeOpts, w: number, h: number, fringe: boolean): SpriteArt {
  const side = o.rot % 2 === 1;
  const cw = side ? h : w;
  const ch = side ? w : h;
  const c = ramp(o.color, 'vinho');
  const p = new Px(cw, ch, o.seed);
  p.rect(1, 1, cw - 2, ch - 2, c[2]);
  p.frame(1, 1, cw - 2, ch - 2, c[0]);
  p.frame(3, 3, cw - 6, ch - 6, c[4]);
  if (o.variant === 1) {
    for (let i = 6; i < (side ? ch : cw) - 6; i += 6)
      if (side) p.rect(4, i, cw - 8, 2, c[1]);
      else p.rect(i, 4, 2, ch - 8, c[1]);
  } else if (cw > 20 && ch > 20) {
    const cx = cw / 2;
    const cy = ch / 2;
    p.poly(
      [
        [cx, cy - 9],
        [cx + 14, cy],
        [cx, cy + 9],
        [cx - 14, cy],
      ],
      c[1],
    );
    p.poly(
      [
        [cx, cy - 5],
        [cx + 8, cy],
        [cx, cy + 5],
        [cx - 8, cy],
      ],
      R.dourado[3],
    );
    for (const [x, y] of [
      [6, 6],
      [cw - 8, 6],
      [6, ch - 8],
      [cw - 8, ch - 8],
    ])
      p.rect(x, y, 2, 2, R.dourado[3]);
  }
  p.speckle(1, 1, cw - 2, ch - 2, [c[1], c[3]], 0.06);
  if (fringe)
    for (let i = 2; i < (side ? cw : ch) - 2; i += 2) {
      if (side) {
        p.set(i, 0, R.papel[3]);
        p.set(i, ch - 1, R.papel[3]);
      } else {
        p.set(0, i, R.papel[3]);
        p.set(cw - 1, i, R.papel[3]);
      }
    }
  return art(p, 0, 0);
}

const rug: Recipe = (o) => rugRect(o, 80, 64, true);
const runner: Recipe = (o) => rugRect({ ...o, variant: 1 }, 64, 16, true);
const mat: Recipe = (o) => rugRect({ ...o, variant: 1 }, 32, 16, false);
const ruground: Recipe = (o) => {
  const c = ramp(o.color, 'vinho');
  const p = new Px(32, 32, o.seed);
  p.ellipse(16, 16, 15, 15, c[0]);
  p.ellipse(16, 16, 14, 14, c[2]);
  p.ellipse(16, 16, 11, 11, c[4]);
  p.ellipse(16, 16, 10, 10, c[2]);
  p.ellipse(16, 16, 5, 5, R.dourado[3]);
  p.ellipse(16, 16, 3.5, 3.5, c[1]);
  p.speckle(2, 2, 28, 28, [c[1], c[3]], 0.05);
  return art(p, 0, 0);
};

// ───────────────────────────── Itens soltos ─────────────────────────────

/** Itens soltos no chão: livros com a cor da capa e tarefas conforme o tema da casa. */
export function paintLoose(kind: string, color: string | null, seed: number): SpriteArt {
  const p = new Px(16, 16, seed);
  p.shadow(8, 13, 6, 2, 70);
  if (kind === 'book') {
    const c = ramp(color, 'ocre');
    p.rect(3, 5, 10, 7, c[2]);
    p.rect(3, 5, 10, 1, c[4]);
    p.rect(3, 5, 2, 7, c[1]);
    p.rect(4, 12, 9, 1, R.papel[4]);
    p.rect(7, 7, 4, 2, R.dourado[3]);
  } else if (kind === 'crate') {
    p.planks(3, 5, 10, 8, R.pinho, 3);
    p.frame(3, 5, 10, 8, R.carvalho[1]);
    p.rect(4, 3, 3, 3, R.ferro[3]);
    p.rect(9, 2, 2, 4, R.carvalho[3]);
  } else if (kind === 'basket') {
    p.ellipse(8, 9, 5.5, 4, R.palha[2]);
    p.ellipse(8, 7, 5.5, 2.2, R.palha[4]);
    p.ellipse(8, 7, 4, 1.4, R.vinho[3]);
    for (let x = 4; x < 13; x += 2) p.set(x, 10, R.palha[0]);
  } else if (kind === 'papers') {
    p.rect(3, 6, 9, 7, R.papel[2]);
    p.rect(4, 4, 9, 7, R.papel[4]);
    p.rect(5, 6, 6, 1, R.papel[0]);
    p.rect(5, 8, 5, 1, R.papel[0]);
    p.rect(10, 9, 2, 2, R.vinho[3]);
  } else if (kind === 'bag') {
    p.ellipse(8, 9, 5, 4.5, R.azul[2]);
    p.ellipse(7, 8, 3, 2.5, R.azul[3]);
    p.rect(6, 3, 4, 2, R.azul[1]);
    p.rect(7, 2, 2, 1, R.palha[3]);
  } else if (kind === 'parcel') {
    p.rect(3, 5, 10, 8, R.cortica[3]);
    p.rect(3, 5, 10, 1, R.cortica[4]);
    p.rect(7, 5, 2, 8, R.vinho[3]);
    p.rect(3, 8, 10, 1, R.vinho[3]);
  } else if (kind === 'letter') {
    p.rect(3, 6, 10, 7, R.papel[4]);
    p.line(3, 6, 8, 10, R.papel[1]);
    p.line(12, 6, 8, 10, R.papel[1]);
    p.rect(7, 9, 2, 2, R.vinho[3]);
  } else {
    p.rect(3, 6, 10, 4, R.papel[4]);
    p.rect(3, 9, 10, 1, R.papel[1]);
    p.ellipse(3, 8, 1.5, 2, R.papel[2]);
    p.ellipse(12.5, 8, 1.5, 2, R.papel[2]);
    p.rect(7, 6, 2, 4, R.vinho[3]);
  }
  p.outline();
  return art(p, 0, 0);
}

export const INTERIOR_RECIPES: Record<string, Recipe> = {
  desk,
  board,
  chest,
  shelf,
  drawer,
  cork,
  box,
  cabinet,
  bureau,
  plant,
  lamp,
  chair,
  armchair,
  sidetable,
  barrel,
  crate,
  candle,
  globe,
  bookpile,
  cat,
  workbench,
  anvil,
  stove,
  longtable,
  safe,
  counter,
  weights,
  fireplace,
  easel,
  bed,
  picture,
  clock,
  window: windowWall,
  walllamp,
  wallmap,
  toolrack,
  banner,
  wallshelf,
  rug,
  ruground,
  runner,
  mat,
};
