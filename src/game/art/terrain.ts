/**
 * Terreno da cidade e fundo dos interiores, pintados pixel a pixel a partir da planta.
 */
import type { CityPlan } from '@/domain/city';
import { T, TILE } from '@/domain/city';
import { ROOM_H, ROOM_W } from '@/domain/grid';
import { R, ramp } from './palette';
import { darken, hash2, lighten, mix, Px, vnoise, type Color, type Ramp } from './px';

function kindAt(plan: CityPlan, px: number, py: number): number {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return T.GRASS;
  return plan.terrain[y * plan.w + x];
}

const isPath = (k: number) => k === T.ROAD || k === T.HIGHROAD;
const isHigh = (k: number) => k === T.HIGH || k === T.HIGHROAD;

/** Chão da cidade. A água fica transparente: por baixo corre uma camada animada. */
export function paintCityGround(plan: CityPlan): HTMLCanvasElement {
  const W = plan.w * TILE;
  const H = plan.h * TILE;
  const p = new Px(W, H, 11 + plan.expansion);
  const kinds = new Uint8Array(W * H);
  const pcx = (plan.plaza.cx + 0.5) * TILE;
  const pcy = (plan.plaza.cy + 0.5) * TILE;
  // Classificação com bordas orgânicas: as fronteiras são deslocadas por ruído.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const raw = kindAt(plan, x, y);
      let k = raw;
      if (raw !== T.CLIFF && raw !== T.STAIRS && raw !== T.BRIDGE) {
        const wx = x + (vnoise(x / 7, y / 7, 3) - 0.5) * 6;
        const wy = y + (vnoise(x / 7, y / 7, 9) - 0.5) * 6;
        const warped = kindAt(plan, wx, wy);
        if (warped !== T.CLIFF && warped !== T.STAIRS && warped !== T.BRIDGE && isHigh(warped) === isHigh(raw)) k = warped;
      }
      // A praça é um círculo de verdade, não uma soma de células.
      if (k !== T.WATER && k !== T.CLIFF && k !== T.STAIRS && k !== T.BRIDGE && !isHigh(k)) {
        const pd = Math.hypot(x - pcx, y - pcy) + (vnoise(x / 5, y / 5, 15) - 0.5) * 3;
        const pr = plan.plaza.r * TILE;
        if (pd <= pr) k = T.PLAZA;
        else if (k === T.PLAZA) {
          const cx = Math.floor(x / TILE);
          const cy = Math.floor(y / TILE);
          k = (cx >= 35 && cx <= 37) || (cy >= 29 && cy <= 31) ? T.ROAD : T.GRASS;
        }
      }
      kinds[y * W + x] = k;
    }
  const K = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? T.GRASS : kinds[y * W + x]);
  const near = (x: number, y: number, r: number, test: (k: number) => boolean) =>
    test(K(x - r, y)) || test(K(x + r, y)) || test(K(x, y - r)) || test(K(x, y + r));

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = K(x, y);
      const h1 = hash2(x, y, 1);
      let c: Color;
      if (k === T.WATER) {
        // margem molhada dentro da água
        if (near(x, y, 1, (q) => q !== T.WATER && q !== T.BRIDGE)) p.set(x, y, 0x4a3d2c);
        else if (near(x, y, 2, (q) => q !== T.WATER && q !== T.BRIDGE)) p.set(x, y, 0x2a5a80, 190);
        else if (near(x, y, 4, (q) => q !== T.WATER && q !== T.BRIDGE) && h1 < 0.5) p.set(x, y, 0xcfe8ee, 70);
        continue;
      }
      if (k === T.GRASS || k === T.HIGH) {
        const g: Ramp = k === T.HIGH ? R.grassHigh : R.grass;
        const n = vnoise(x / 26, y / 26, 5) * 0.65 + vnoise(x / 9, y / 9, 6) * 0.35;
        c = n < 0.36 ? g[1] : n < 0.6 ? g[2] : g[3];
        if (h1 < 0.02) c = g[4];
        else if (h1 > 0.975) c = g[0];
        // tufos
        const tuft = hash2(Math.floor(x / 3), Math.floor(y / 4), 8);
        if (tuft < 0.07 && x % 3 === 1 && y % 4 < 2) c = g[y % 4 === 0 ? 4 : 1];
        if (near(x, y, 1, (q) => q === T.WATER)) c = 0x6b5a3a;
        else if (near(x, y, 2, (q) => q === T.WATER)) c = mix(g[1], 0x6b5a3a, 0.4);
        else if (near(x, y, 1, (q) => isPath(q) || q === T.PLAZA)) c = g[1];
        if (k === T.HIGH && (K(x - 2, y) === T.GRASS || K(x + 2, y) === T.GRASS || K(x, y - 2) === T.GRASS)) c = darken(R.pedraQuente[1], 0.15);
        else if (k === T.GRASS && (isHigh(K(x - 3, y)) || isHigh(K(x + 3, y)) || isHigh(K(x, y + 3)))) c = darken(c, 0.22);
      } else if (isPath(k)) {
        const n = vnoise(x / 11, y / 11, 12);
        c = n < 0.42 ? R.terra[2] : n < 0.72 ? R.terra[3] : mix(R.terra[3], R.terra[4], 0.5);
        if (h1 < 0.03) c = R.terra[1];
        else if (h1 > 0.975) c = R.terra[4];
        // pedrinhas
        const peb = hash2(Math.floor(x / 4), Math.floor(y / 3), 14);
        if (peb < 0.045 && x % 4 < 2 && y % 3 < 2) c = y % 3 === 0 ? R.pedraQuente[4] : R.pedraQuente[2];
        if (near(x, y, 1, (q) => q === T.GRASS || q === T.HIGH)) c = R.terra[0];
        else if (near(x, y, 2, (q) => q === T.GRASS || q === T.HIGH)) c = R.terra[1];
      } else if (k === T.PLAZA) {
        // calçamento em anéis concêntricos
        const dx = x - pcx;
        const dy = y - pcy;
        const dist = Math.hypot(dx, dy);
        const ring = Math.floor(dist / 7);
        const circ = Math.max(1, Math.floor((2 * Math.PI * (ring + 0.5) * 7) / 9));
        const ang = (Math.atan2(dy, dx) / (2 * Math.PI) + 0.5) * circ + (ring % 2) * 0.5;
        const stone = Math.floor(ang);
        const fa = ang - stone;
        const fr = dist / 7 - ring;
        const tone = hash2(stone, ring, 21);
        const base = ring % 5 === 4 ? R.pedra : R.pedraQuente;
        c = tone < 0.3 ? base[2] : tone < 0.75 ? base[3] : mix(base[3], base[4], 0.6);
        if (fr < 0.16 || fa < 0.1) c = base[1];
        else if (fr < 0.32) c = lighten(c, 0.12);
        if (h1 < 0.02) c = base[1];
        if (near(x, y, 1, (q) => q === T.GRASS)) c = R.pedraQuente[0];
      } else if (k === T.BRIDGE) {
        const cx = x % TILE;
        const col = Math.floor(x / TILE);
        const leftEdge = kindAt(plan, x - TILE, y) !== T.BRIDGE && kindAt(plan, x - TILE, y) !== T.ROAD;
        const rightEdge = kindAt(plan, x + TILE, y) !== T.BRIDGE && kindAt(plan, x + TILE, y) !== T.ROAD;
        const plank = y % 5;
        const tone = hash2(col, Math.floor(y / 5), 31);
        c = plank === 4 ? R.nogueira[1] : plank === 0 ? R.carvalho[4] : tone < 0.5 ? R.carvalho[2] : R.carvalho[3];
        if (h1 < 0.04) c = R.carvalho[1];
        if (leftEdge && cx < 3) c = cx === 2 ? R.nogueira[0] : y % 16 < 3 ? R.nogueira[3] : R.nogueira[2];
        if (rightEdge && cx > 12) c = cx === 13 ? R.nogueira[0] : y % 16 < 3 ? R.nogueira[3] : R.nogueira[2];
      } else if (k === T.STAIRS) {
        const step = y % 4;
        c = step === 0 ? R.pedraQuente[4] : step === 3 ? R.pedraQuente[1] : R.pedraQuente[3];
        if (h1 < 0.05) c = R.pedraQuente[2];
        const cx = x % TILE;
        if ((kindAt(plan, x - TILE, y) === T.CLIFF && cx < 2) || (kindAt(plan, x + TILE, y) === T.CLIFF && cx > 13)) c = R.pedraQuente[0];
      } else {
        // penhasco: face de rocha com estratos
        const ty = y - 10 * TILE;
        const strata = Math.floor((ty + vnoise(x / 9, 0, 41) * 5) / 6);
        const tone = hash2(Math.floor((x + strata * 5) / 9), strata, 43);
        c = tone < 0.35 ? R.pedraQuente[1] : tone < 0.8 ? R.pedraQuente[2] : R.pedraQuente[3];
        if ((ty + Math.floor(vnoise(x / 9, 0, 41) * 5)) % 6 === 0) c = R.pedraQuente[0];
        if ((x + strata * 5) % 9 === 0 && h1 < 0.7) c = R.pedraQuente[0];
        if (ty < 3 + Math.floor(hash2(x, 0, 44) * 3)) c = ty === 0 ? R.grassHigh[4] : R.grassHigh[2];
        if (ty > 27) c = darken(c, 0.35);
      }
      p.set(x, y, c);
    }

  // florzinhas espalhadas na grama
  const flowers: Color[] = [0xf6e27a, 0xffffff, 0xf2a0b4, 0xb7a0f0, 0xf6b06a];
  for (let i = 0; i < (W * H) / 900; i++) {
    const x = Math.floor(p.rand() * (W - 2));
    const y = Math.floor(p.rand() * (H - 2));
    if (K(x, y) !== T.GRASS && K(x, y) !== T.HIGH) continue;
    if (near(x, y, 3, (q) => q !== T.GRASS && q !== T.HIGH)) continue;
    const c = flowers[Math.floor(p.rand() * flowers.length)];
    p.set(x, y, c);
    if (p.rand() < 0.5) {
      p.set(x + 1, y, c);
      p.set(x, y + 1, R.grass[0]);
    }
  }
  // sombra do penhasco sobre o chão
  for (let x = 25 * TILE; x < 48 * TILE; x++) {
    if (kindAt(plan, x, 12 * TILE - 1) !== T.CLIFF) continue;
    for (let d = 0; d < 6; d++) {
      const y = 12 * TILE + d;
      p.set(x, y, 0x1a1420, 90 - d * 14);
    }
  }
  return p.toCanvas();
}

/** Quadros da água animada (lado a lado). */
export function paintWater(frames = 4, size = 32): HTMLCanvasElement {
  const p = new Px(size * frames, size, 77);
  for (let f = 0; f < frames; f++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const t = (f / frames) * size;
        const wave = Math.sin(((x + t) / size) * Math.PI * 2 + y * 0.55) + Math.sin(((y * 2 + t) / size) * Math.PI * 2);
        let c: Color = R.agua[2];
        const band = (y + Math.round(Math.sin(((x + t) / size) * Math.PI * 4) * 1.5)) % 8;
        if (band === 0 && hash2(Math.floor((x + t) / 5), Math.floor(y / 8), 5) < 0.6) c = R.agua[3];
        if (wave > 1.55) c = R.agua[4];
        else if (wave < -1.3) c = R.agua[1];
        if (hash2((x + Math.floor(t)) % size, y, 9) < 0.012) c = 0xe8f6f8;
        p.set(f * size + x, y, c);
      }
  return p.toCanvas();
}

export const WALL_H = 40;
export const ROOM_PAD = 6;

const WALLS: Record<string, { ramp: Ramp; style: 'plain' | 'stone' | 'stripe' }> = {
  stone: { ramp: R.pedra, style: 'stone' },
  cream: { ramp: R.reboco, style: 'plain' },
  green: { ramp: [0x2c4a3c, 0x3d6350, 0x527d66, 0x6c977e, 0x8cb199], style: 'stripe' },
  sky: { ramp: [0x4a6a80, 0x648aa0, 0x82a8ba, 0xa4c4d0, 0xc8dee4], style: 'plain' },
  wine: { ramp: [0x4a2028, 0x652c36, 0x833c47, 0xa0535c, 0xbd7078], style: 'stripe' },
  lilac: { ramp: [0x4f4468, 0x6a5c88, 0x877aa6, 0xa79bc0, 0xc8bfd9], style: 'plain' },
};

/**
 * Fundo do interior: parede do fundo, piso e rodapés. O cômodo tem ROOM_W×ROOM_H células.
 * A origem do piso fica em (ROOM_PAD, WALL_H).
 */
export function paintRoom(wall: string, floor: string, wood = 'carvalho'): HTMLCanvasElement {
  const fw = ROOM_W * TILE;
  const fh = ROOM_H * TILE;
  const W = fw + ROOM_PAD * 2;
  const H = WALL_H + fh + ROOM_PAD;
  const p = new Px(W, H, 5);
  const wr = (WALLS[wall] ?? WALLS.cream).ramp;
  const style = (WALLS[wall] ?? WALLS.cream).style;
  const trim = ramp(wood);
  // moldura externa (espessura das paredes vista de cima)
  p.rect(0, 0, W, H, 0x241a18);
  p.rect(1, 1, W - 2, H - 2, darken(trim[0], 0.25));
  // parede do fundo
  const wx = ROOM_PAD;
  if (style === 'stone') p.bricks(wx, 3, fw, WALL_H - 3, wr, 10, 6);
  else {
    p.rect(wx, 3, fw, WALL_H - 3, wr[3]);
    for (let y = 3; y < WALL_H; y++)
      for (let x = 0; x < fw; x++) {
        const n = vnoise(x / 14, y / 10, 3);
        if (n > 0.62) p.set(wx + x, y, wr[4]);
        else if (n < 0.3) p.set(wx + x, y, mix(wr[3], wr[2], 0.6));
        if (style === 'stripe' && x % 8 === 0) p.set(wx + x, y, wr[2]);
        if (style === 'stripe' && x % 8 === 4 && y % 6 === 2) p.set(wx + x, y, wr[4]);
      }
  }
  // sanca, lambri e rodapé
  p.rect(wx, 3, fw, 2, trim[1]);
  p.rect(wx, 5, fw, 1, trim[3]);
  p.rect(wx, 6, fw, 1, darken(wr[2], 0.25));
  const pan = WALL_H - 13;
  p.planks(wx, pan, fw, 11, trim, 7, true, 2);
  p.rect(wx, pan, fw, 1, trim[4]);
  p.rect(wx, pan + 1, fw, 1, trim[1]);
  p.rect(wx, WALL_H - 2, fw, 2, trim[0]);
  // piso
  const fy = WALL_H;
  if (floor === 'checker') {
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) {
        const a = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
        let c: Color = a ? R.pedraQuente[4] : R.pedraQuente[2];
        if (x % 8 === 0 || y % 8 === 0) c = darken(c, 0.18);
        if (hash2(x, y, 2) < 0.04) c = darken(c, 0.08);
        p.set(wx + x, fy + y, c);
      }
  } else {
    const fr = ramp(wood);
    for (let row = 0; row * 8 < fh; row++) {
      const off = Math.floor(hash2(row, 0, 4) * 30);
      for (let y = 0; y < 8 && row * 8 + y < fh; y++)
        for (let x = 0; x < fw; x++) {
          const board = Math.floor((x + off) / 30);
          const t = hash2(board, row, 6);
          let c: Color = t < 0.3 ? fr[2] : t < 0.75 ? mix(fr[2], fr[3], 0.6) : fr[3];
          if (y === 7) c = fr[1];
          else if (y === 0) c = lighten(c, 0.1);
          if ((x + off) % 30 === 0) c = fr[1];
          if (hash2(x >> 2, row * 8 + y, 7) < 0.05) c = darken(c, 0.12);
          p.set(wx + x, fy + row * 8 + y, c);
        }
    }
  }
  // sombra da parede sobre o piso e cantos
  for (let d = 0; d < 7; d++) p.rect(wx, fy + d, fw, 1, 0x1a1420, 80 - d * 11);
  for (let d = 0; d < 4; d++) {
    p.rect(wx + d, fy, 1, fh, 0x1a1420, 50 - d * 12);
    p.rect(wx + fw - 1 - d, fy, 1, fh, 0x1a1420, 34 - d * 8);
  }
  // paredes laterais e da frente (vistas de cima), com a porta
  p.rect(1, 1, ROOM_PAD - 1, H - 2, trim[0]);
  p.rect(W - ROOM_PAD, 1, ROOM_PAD - 1, H - 2, trim[0]);
  p.rect(2, 1, 2, H - 2, trim[1]);
  p.rect(W - ROOM_PAD + 1, 1, 2, H - 2, trim[1]);
  p.rect(1, H - ROOM_PAD, W - 2, ROOM_PAD - 1, trim[0]);
  p.rect(1, H - ROOM_PAD + 1, W - 2, 2, trim[1]);
  const dx = wx + 6 * TILE;
  p.rect(dx, H - ROOM_PAD, 2 * TILE, ROOM_PAD, R.pedraQuente[3]);
  p.rect(dx, H - ROOM_PAD, 2 * TILE, 1, R.pedraQuente[4]);
  p.rect(dx, H - 2, 2 * TILE, 2, R.pedraQuente[1]);
  p.rect(dx - 1, H - ROOM_PAD, 1, ROOM_PAD, trim[3]);
  p.rect(dx + 2 * TILE, H - ROOM_PAD, 1, ROOM_PAD, trim[3]);
  // capacho
  p.rect(dx + 5, fy + fh - 7, 22, 6, R.palha[2]);
  p.frame(dx + 5, fy + fh - 7, 22, 6, R.palha[0]);
  p.rect(dx + 8, fy + fh - 5, 16, 1, R.palha[4]);
  return p.toCanvas();
}
