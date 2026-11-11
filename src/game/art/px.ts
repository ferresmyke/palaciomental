/**
 * Motor de pixel art procedural. Desenha em um buffer RGBA próprio e só no fim
 * vira canvas, para que os mesmos sprites sirvam ao Phaser e às prévias em React.
 * Toda a arte do Recanto é original e gerada por este código (ver docs/DESIGN_SYSTEM.md).
 */
import { rng } from '@/domain/util';

export type Color = number;
export type Ramp = readonly [Color, Color, Color, Color, Color];

export const INK: Color = 0x2a1c18;

export function mix(a: Color, b: Color, t: number): Color {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export const darken = (c: Color, t: number): Color => mix(c, 0x1a1420, t);
export const lighten = (c: Color, t: number): Color => mix(c, 0xfff4d6, t);

/** Ruído de valor 2D suave, determinístico. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class Px {
  readonly data: Uint8ClampedArray;
  rand: () => number;

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
    this.rand = rng(seed);
  }

  set(x: number, y: number, c: Color, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = (c >> 16) & 255;
      this.data[i + 1] = (c >> 8) & 255;
      this.data[i + 2] = c & 255;
      this.data[i + 3] = 255;
      return;
    }
    const da = this.data[i + 3];
    if (da === 0) {
      this.data[i] = (c >> 16) & 255;
      this.data[i + 1] = (c >> 8) & 255;
      this.data[i + 2] = c & 255;
      this.data[i + 3] = a;
      return;
    }
    const t = a / 255;
    this.data[i] = Math.round(this.data[i] + (((c >> 16) & 255) - this.data[i]) * t);
    this.data[i + 1] = Math.round(this.data[i + 1] + (((c >> 8) & 255) - this.data[i + 1]) * t);
    this.data[i + 2] = Math.round(this.data[i + 2] + ((c & 255) - this.data[i + 2]) * t);
    this.data[i + 3] = Math.max(da, a);
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  get(x: number, y: number): Color {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  clear(x: number, y: number, w = 1, h = 1): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        this.data[(j * this.w + i) * 4 + 3] = 0;
      }
  }

  rect(x: number, y: number, w: number, h: number, c: Color, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }

  frame(x: number, y: number, w: number, h: number, c: Color): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color, a = 255): void {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
  }

  /** Esfera/folhagem sombreada: luz vinda de cima à esquerda, com borda irregular. */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, rough = 0.12): void {
    const s = Math.floor(this.rand() * 1000);
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy + (hash2(x, y, s) - 0.5) * rough * 2;
        if (d > 1) continue;
        const lx = dx + 0.45;
        const ly = dy + 0.55;
        const l = lx * lx + ly * ly + (hash2(x, y, s + 7) - 0.5) * 0.35;
        const idx = l < 0.18 ? 4 : l < 0.55 ? 3 : l < 1.15 ? 2 : l < 1.9 ? 1 : 0;
        this.set(x, y, ramp[idx]);
      }
  }

  poly(points: [number, number][], c: Color, a = 255): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const sy = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c, a);
    }
  }

  /** Retângulo com volume: borda clara em cima/esquerda e escura embaixo/direita. */
  bevel(x: number, y: number, w: number, h: number, ramp: Ramp, base = 2): void {
    this.rect(x, y, w, h, ramp[base]);
    this.rect(x, y, w, 1, ramp[Math.min(4, base + 1)]);
    this.rect(x, y, 1, h, ramp[Math.min(4, base + 1)]);
    this.rect(x, y + h - 1, w, 1, ramp[Math.max(0, base - 1)]);
    this.rect(x + w - 1, y, 1, h, ramp[Math.max(0, base - 1)]);
  }

  /** Tábuas de madeira com veios. */
  planks(x: number, y: number, w: number, h: number, ramp: Ramp, size = 5, vertical = false, base = 2): void {
    this.rect(x, y, w, h, ramp[base]);
    const n = vertical ? w : h;
    for (let i = 0; i < n; i++) {
      const edge = i % size === size - 1;
      const tone = edge ? ramp[Math.max(0, base - 1)] : i % size === 0 ? ramp[Math.min(4, base + 1)] : -1;
      if (tone < 0) continue;
      if (vertical) this.rect(x + i, y, 1, h, tone);
      else this.rect(x, y + i, w, 1, tone);
    }
    const grains = Math.floor((w * h) / 22);
    for (let g = 0; g < grains; g++) {
      const gx = x + Math.floor(this.rand() * w);
      const gy = y + Math.floor(this.rand() * h);
      const len = 1 + Math.floor(this.rand() * 3);
      for (let k = 0; k < len; k++) {
        const px = vertical ? gx : gx + k;
        const py = vertical ? gy + k : gy;
        if (px < x + w && py < y + h) this.set(px, py, ramp[Math.max(0, base - 1)], 150);
      }
    }
  }

  /** Blocos de pedra ou tijolos. */
  bricks(x: number, y: number, w: number, h: number, ramp: Ramp, bw = 8, bh = 5): void {
    this.rect(x, y, w, h, ramp[1]);
    for (let j = 0; j * bh < h; j++) {
      const off = j % 2 ? Math.floor(bw / 2) : 0;
      for (let i = -1; i * bw < w + bw; i++) {
        const bx = x + i * bw - off;
        const by = y + j * bh;
        const tone = ramp[2 + Math.floor(hash2(i, j, bw * 31 + x) * 2.4)] ?? ramp[3];
        for (let yy = by; yy < by + bh - 1; yy++)
          for (let xx = bx; xx < bx + bw - 1; xx++) {
            if (xx < x || xx >= x + w || yy < y || yy >= y + h) continue;
            this.set(xx, yy, yy === by ? lighten(tone, 0.18) : tone);
          }
      }
    }
  }

  /** Pontilhado aleatório para textura. */
  speckle(x: number, y: number, w: number, h: number, colors: Color[], density: number, a = 255): void {
    const n = Math.floor(w * h * density);
    for (let i = 0; i < n; i++) {
      const px = x + Math.floor(this.rand() * w);
      const py = y + Math.floor(this.rand() * h);
      if (this.alpha(px, py)) this.set(px, py, colors[Math.floor(this.rand() * colors.length)], a);
    }
  }

  /** Contorno escuro de 1px em volta dos pixels opacos. */
  outline(c: Color = INK, a = 255): this {
    const src = new Uint8Array(this.w * this.h);
    for (let i = 0; i < src.length; i++) src[i] = this.data[i * 4 + 3] > 200 ? 1 : 0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
          const i = (y * this.w + x) * 4;
          this.data[i] = (c >> 16) & 255;
          this.data[i + 1] = (c >> 8) & 255;
          this.data[i + 2] = c & 255;
          this.data[i + 3] = a;
        }
      }
    return this;
  }

  /** Sombra de contato no chão, desenhada só onde ainda não há pixels. */
  shadow(cx: number, cy: number, rx: number, ry: number, a = 70): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && !this.alpha(x, y)) this.set(x, y, 0x1a1420, a);
      }
  }

  blit(src: Px, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3];
        if (!a) continue;
        const c = (src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2];
        this.set(dx + (flipX ? src.w - 1 - x : x), dy + y, c, a);
      }
  }

  /** Escurece (t>0) ou clareia (t<0) uma região já pintada. */
  tone(x: number, y: number, w: number, h: number, t: number): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (!this.alpha(i, j)) continue;
        const c = this.get(i, j);
        this.set(i, j, t > 0 ? darken(c, t) : lighten(c, -t));
      }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

/** Sprite pronto: o canto inferior esquerdo da área útil encosta no canto inferior esquerdo da pegada. */
export interface SpriteArt {
  canvas: HTMLCanvasElement;
  /** Quanto o desenho avança para a esquerda da pegada. */
  ox: number;
  /** Quanto o desenho desce abaixo da pegada. */
  oy: number;
  frames: number;
  /** Ponto de interesse (ex.: chaminé, chama) relativo ao canto superior esquerdo do sprite. */
  hot?: { x: number; y: number };
}

export function art(px: Px, ox = 0, oy = 0, frames = 1, hot?: { x: number; y: number }): SpriteArt {
  return { canvas: px.toCanvas(), ox, oy, frames, hot };
}

/** Junta quadros de animação lado a lado. */
export function strip(frames: Px[]): Px {
  const w = frames[0].w;
  const h = frames[0].h;
  const out = new Px(w * frames.length, h);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}
