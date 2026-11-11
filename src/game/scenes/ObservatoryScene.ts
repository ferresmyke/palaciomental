/**
 * Cena do Observatório: a luneta e o céu de constelações.
 * Objetivos são estrelas; o brilho vem do progresso dos projetos ligados e a
 * altura no céu indica o horizonte (perto da linha do horizonte = este trimestre).
 */
import Phaser from 'phaser';
import { goalProgress, liveGoals, type GoalState } from '@/domain/selectors';
import type { Db, Horizon, ID } from '@/domain/types';
import { hashString } from '@/domain/util';
import { dbStore, getDb } from '@/store/db';
import { gameApi, gameBus, type ObservatoryApi } from '@/store/gameApi';
import { ui, uiStore } from '@/store/ui';
import { R } from '../art/palette';
import { hash2, mix, Px } from '../art/px';
import { fixedSprite } from '../art/sprites';
import { CamControl, Labels, prefersReducedMotion, tex, type LabelSpec } from '../core';

export const SKY_H = 270;
const COL_W = 104;
const BANDS: Record<Horizon, [number, number]> = { long: [40, 86], year: [100, 144], quarter: [156, 194] };

export interface StarPos {
  id: ID;
  x: number;
  y: number;
  constellationId: ID;
  state: GoalState;
  ratio: number;
  title: string;
  /** Posição dentro da faixa: alterna o nome acima e abaixo da estrela. */
  slot: number;
}

export interface SkyLayout {
  width: number;
  columns: { id: ID; name: string; x: number }[];
  stars: StarPos[];
}

/** Posição das estrelas: uma coluna por constelação, altura pelo horizonte. Determinística. */
export function layoutSky(db: Db): SkyLayout {
  const cons = Object.values(db.constellations).sort((a, b) => a.order - b.order);
  const width = Math.max(480, cons.length * COL_W + 80);
  const step = (width - 80) / Math.max(1, cons.length);
  const columns = cons.map((c, i) => ({ id: c.id, name: c.name, x: 40 + step * (i + 0.5) }));
  const stars: StarPos[] = [];
  const goals = liveGoals(db);
  for (const col of columns)
    for (const horizon of ['long', 'year', 'quarter'] as Horizon[]) {
      const list = goals.filter((g) => g.constellationId === col.id && g.horizon === horizon);
      const [y0, y1] = BANDS[horizon];
      list.forEach((g, k) => {
        const h = hashString(g.id);
        const spread = Math.min(26, (step - 24) / Math.max(1, list.length));
        const x = col.x + (k - (list.length - 1) / 2) * spread + ((h % 9) - 4);
        // Estrelas vizinhas ficam em alturas diferentes para os nomes não se cobrirem.
        const y = y0 + ((k * 21 + ((h >> 4) % 5)) % (y1 - y0));
        const p = goalProgress(db, g);
        stars.push({ id: g.id, x, y, constellationId: col.id, state: p.state, ratio: p.ratio, title: g.title, slot: k });
      });
    }
  return { width, columns, stars };
}

function paintSky(width: number): HTMLCanvasElement {
  const p = new Px(width, SKY_H, 301);
  const top = 0x0a0e2a;
  const mid = 0x1c2052;
  const low = 0x4a3a70;
  const glow = 0x8a5a78;
  for (let y = 0; y < SKY_H; y++)
    for (let x = 0; x < width; x++) {
      const t = y / 205;
      const d = (hash2(x, y, 3) - 0.5) * 0.06;
      const k = Math.min(1, Math.max(0, t + d));
      let c = k < 0.55 ? mix(top, mid, Math.floor((k / 0.55) * 7) / 7) : k < 0.9 ? mix(mid, low, Math.floor(((k - 0.55) / 0.35) * 6) / 6) : mix(low, glow, Math.floor(((k - 0.9) / 0.1) * 3) / 3);
      // via láctea
      const band = Math.abs(y - (70 + Math.sin(x / 90) * 26 + x * 0.05)) / 26;
      if (band < 1 && hash2(x, y, 5) < 0.2 * (1 - band)) c = mix(c, 0x9aa8e8, 0.25);
      p.set(x, y, c);
    }
  // estrelas de fundo
  for (let i = 0; i < width * 1.1; i++) {
    const x = Math.floor(p.rand() * width);
    const y = Math.floor(p.rand() * 200);
    const b = p.rand();
    p.set(x, y, b > 0.9 ? 0xffffff : b > 0.5 ? 0xb8c4f0 : 0x6a78b8);
  }
  // colinas, vila ao longe e luzes
  for (let x = 0; x < width; x++) {
    const far = 204 + Math.sin(x / 47) * 6 + Math.sin(x / 19 + 2) * 3;
    const near = 218 + Math.sin(x / 31 + 1) * 5 + Math.sin(x / 11) * 2;
    for (let y = Math.floor(far); y < SKY_H; y++) p.set(x, y, y < near ? 0x1a2040 : 0x0e1428);
    if (x % 23 === 7) {
      const hy = Math.floor(near) - 6;
      p.rect(x, hy, 9, 7, 0x0b0f20);
      p.poly(
        [
          [x - 1, hy],
          [x + 4.5, hy - 5],
          [x + 10, hy],
        ],
        0x0b0f20,
      );
      if (hash2(x, 1, 7) < 0.75) p.rect(x + 2, hy + 2, 2, 2, R.luz[2]);
      if (hash2(x, 2, 7) < 0.4) p.rect(x + 6, hy + 3, 1, 2, R.luz[3]);
    }
    if (x % 37 === 11) {
      const ty = Math.floor(near) - 9;
      p.blob(x, ty, 5, 6, [0x0a0e1c, 0x0c1122, 0x0e1428, 0x101830, 0x121c36], 0.2);
    }
  }
  // varanda do observatório
  p.bricks(0, 250, width, 20, R.pedra, 12, 5);
  p.tone(0, 250, width, 20, 0.45);
  p.rect(0, 248, width, 3, 0x3a3e52);
  p.rect(0, 248, width, 1, 0x5a5f78);
  for (let x = 6; x < width; x += 18) {
    p.rect(x, 236, 3, 12, 0x2a2e42);
    p.rect(x, 236, 1, 12, 0x4a4f68);
  }
  p.rect(0, 234, width, 3, 0x33374c);
  p.rect(0, 234, width, 1, 0x5a5f78);
  return p.toCanvas();
}

function paintTelescope(): HTMLCanvasElement {
  const p = new Px(96, 96, 303);
  const g = R.dourado;
  // tripé
  p.line(40, 60, 22, 94, R.nogueira[2]);
  p.line(41, 60, 23, 94, R.nogueira[3]);
  p.line(44, 60, 58, 94, R.nogueira[1]);
  p.line(45, 60, 59, 94, R.nogueira[2]);
  p.line(42, 60, 42, 94, R.nogueira[2]);
  p.rect(38, 56, 9, 6, R.ferro[2]);
  // tubo
  for (let i = 0; i < 62; i++) {
    const x = 14 + i;
    const y = 70 - i * 0.78;
    const w = 5 + (i / 62) * 5;
    for (let t = -w; t <= w; t++) {
      const k = (t + w) / (2 * w);
      p.set(Math.round(x + t * 0.62), Math.round(y + t * 0.78), k < 0.25 ? g[4] : k < 0.6 ? g[3] : k < 0.85 ? g[2] : g[1]);
    }
    if (i % 20 === 12) for (let t = -w - 1; t <= w + 1; t++) p.set(Math.round(x + t * 0.62), Math.round(y + t * 0.78), g[0]);
  }
  p.ellipse(77, 21, 7, 9, R.vidro[1]);
  p.ellipse(76, 20, 4, 6, R.vidro[3]);
  p.rect(8, 70, 8, 6, R.ferro[1]);
  p.outline(0x0a0c18);
  return p.toCanvas();
}

export class ObservatoryScene extends Phaser.Scene {
  private cam!: CamControl;
  private labels!: Labels;
  private layout!: SkyLayout;
  private g!: Phaser.GameObjects.Graphics;
  private glows = new Map<ID, Phaser.GameObjects.Image>();
  private hover: ID | null = null;
  private lastRev = -1;
  private width = 0;

  constructor() {
    super('observatory');
  }

  create(): void {
    this.glows.clear();
    this.hover = null;
    this.layout = layoutSky(getDb());
    this.width = this.layout.width;
    const key = `sky-${this.width}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintSky(this.width));
    this.add.image(0, 0, key).setOrigin(0).setDepth(-10);
    if (!this.textures.exists('telescope')) this.textures.addCanvas('telescope', paintTelescope());
    this.add.image(8, SKY_H - 2, 'telescope').setOrigin(0, 1).setDepth(50);
    this.g = this.add.graphics().setDepth(10);
    this.labels = new Labels(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x0a0e2a);
    // Céu e varanda continuam além da área útil, para a cena caber inteira em qualquer tela.
    const ext = this.add.graphics().setDepth(-11);
    ext.fillStyle(0x0a0e2a, 1).fillRect(-2000, -1600, this.width + 4000, 1600);
    ext.fillStyle(0x0a0e2a, 1).fillRect(-2000, 0, 2000, 234);
    ext.fillStyle(0x0a0e2a, 1).fillRect(this.width, 0, 2000, 234);
    ext.fillStyle(0x1e2130, 1).fillRect(-2000, 234, this.width + 4000, 1600);
    ext.fillStyle(0x33374c, 1).fillRect(-2000, 234, this.width + 4000, 3);
    for (let i = 0; i < 900; i++) {
      const x = -2000 + ((i * 7919) % (this.width + 4000));
      const y = -1600 + ((i * 104729) % 1600);
      ext.fillStyle(i % 9 === 0 ? 0xffffff : 0x8a96d0, 1).fillRect(x, y, 1, 1);
    }
    this.cam = new CamControl(this, { worldW: this.width, worldH: SKY_H, maxZoom: 8, pad: 6 });
    cam.setZoom(Math.max(this.cam.minZoom, Math.min(cam.width / (this.width + 12), cam.height / (SKY_H + 12))));
    cam.centerOn(this.width / 2, SKY_H / 2);
    this.sync(true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const w = p.positionToCamera(cam) as Phaser.Math.Vector2;
      const id = this.starAt(w.x, w.y);
      if (id !== this.hover) {
        this.hover = id;
        this.game.canvas.style.cursor = id ? 'pointer' : 'default';
        this.syncLabels();
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.cam.moved || p.button === 2) return;
      const w = p.positionToCamera(cam) as Phaser.Math.Vector2;
      const id = this.starAt(w.x, w.y);
      if (id) ui.open({ type: 'goal', id });
      else ui.closeAll();
    });
    const unsubDb = dbStore.subscribe(() => this.sync(false));
    let prev = uiStore.getState();
    const unsubUi = uiStore.subscribe((s) => {
      if (s.highlight !== prev.highlight || s.panels !== prev.panels) this.syncLabels();
      prev = s;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubDb();
      unsubUi();
      if (gameApi.observatory === this.api) gameApi.observatory = null;
    });
    gameApi.observatory = this.api;
    cam.fadeIn(prefersReducedMotion() ? 0 : 300, 8, 10, 24);
    gameBus.emit('scene:ready', 'observatory');
  }

  private starAt(x: number, y: number): ID | null {
    let best: ID | null = null;
    let bd = 11;
    for (const s of this.layout.stars) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  }

  private sync(force: boolean): void {
    const { db, rev } = dbStore.getState();
    if (!force && rev === this.lastRev) return;
    this.lastRev = rev;
    this.layout = layoutSky(db);
    if (this.layout.width !== this.width) {
      this.scene.restart();
      return;
    }
    const g = this.g;
    g.clear();
    // faixas de horizonte
    for (const y of [91, 149]) {
      g.lineStyle(1, 0x8fa3d9, 0.12);
      for (let x = 0; x < this.width; x += 6) g.lineBetween(x, y, x + 2, y);
    }
    // linhas das constelações
    for (const col of this.layout.columns) {
      const stars = this.layout.stars.filter((s) => s.constellationId === col.id && s.state !== 'dormant').sort((a, b) => a.y - b.y || a.x - b.x);
      g.lineStyle(1, 0x9fb2ea, 0.32);
      for (let i = 0; i + 1 < stars.length; i++) g.lineBetween(stars[i].x, stars[i].y, stars[i + 1].x, stars[i + 1].y);
    }
    const seen = new Set<ID>();
    for (const s of this.layout.stars) {
      seen.add(s.id);
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      let glowAlpha = 0;
      if (s.state === 'dormant') {
        g.fillStyle(0x6a74a8, 0.55);
        g.fillRect(x, y, 1, 1);
        g.fillStyle(0x6a74a8, 0.25);
        g.fillRect(x - 1, y, 3, 1);
      } else if (s.state === 'nopath') {
        g.fillStyle(0xaab4e0, 0.75);
        g.fillRect(x - 1, y - 1, 2, 2);
        g.lineStyle(1, 0xaab4e0, 0.35);
        g.strokeCircle(x, y, 5);
      } else {
        const ray = 2 + Math.round(s.ratio * 5);
        const col = s.state === 'done' ? 0xfff2b0 : 0xf4f6ff;
        g.fillStyle(col, 0.55 + s.ratio * 0.45);
        g.fillRect(x - ray, y, ray * 2 + 1, 1);
        g.fillRect(x, y - ray, 1, ray * 2 + 1);
        g.fillStyle(0xffffff, 1);
        g.fillRect(x - 1, y - 1, 3, 3);
        if (s.state === 'done') {
          g.fillStyle(0xfff2b0, 0.9);
          g.fillRect(x - 2, y - 2, 1, 1);
          g.fillRect(x + 2, y - 2, 1, 1);
          g.fillRect(x - 2, y + 2, 1, 1);
          g.fillRect(x + 2, y + 2, 1, 1);
        }
        glowAlpha = 0.25 + s.ratio * 0.6;
      }
      let glow = this.glows.get(s.id);
      if (!glow) {
        glow = this.add.image(x, y, tex(this, fixedSprite.glow())).setBlendMode(Phaser.BlendModes.ADD).setDepth(9).setTint(0xcfd8ff);
        this.glows.set(s.id, glow);
        if (!prefersReducedMotion()) this.tweens.add({ targets: glow, scale: { from: 0.9, to: 1.1 }, duration: 1500 + (hashString(s.id) % 900), yoyo: true, repeat: -1 });
      }
      glow.setPosition(x + 0.5, y + 0.5).setAlpha(glowAlpha).setScale(0.35 + s.ratio * 0.5);
    }
    for (const [id, glow] of this.glows)
      if (!seen.has(id)) {
        glow.destroy();
        this.glows.delete(id);
      }
    this.syncLabels();
  }

  private syncLabels(): void {
    const specs: Record<string, LabelSpec> = {};
    const s = ui.get();
    const open = s.panels.find((p) => p.type === 'goal');
    const selected = open?.type === 'goal' ? open.id : null;
    for (const col of this.layout.columns) specs[`c:${col.id}`] = { text: col.name, x: col.x, y: 20, cls: 'constellation' };
    for (const st of this.layout.stars) {
      const hot = this.hover === st.id || selected === st.id || s.highlight?.id === st.id;
      const mark = st.state === 'nopath' ? '◌' : st.state === 'dormant' ? '☾' : st.state === 'done' ? '✓' : `${Math.round(st.ratio * 100)}%`;
      const full = `${st.title}: ${st.state === 'nopath' ? 'sem caminho' : st.state === 'dormant' ? 'adormecida' : st.state === 'done' ? 'alcançada' : `${Math.round(st.ratio * 100)}%`}`;
      specs[`g:${st.id}`] = { text: st.title, x: st.x, y: st.y, anchor: st.x > this.width - 130 ? 'left' : 'right', title: full, cls: `star ${st.state}${hot ? ' hover' : ''}`, badge: mark };
    }
    specs['b:long'] = { text: 'Longo prazo', x: 34, y: 62, cls: 'band' };
    specs['b:year'] = { text: 'Este ano', x: 34, y: 124, cls: 'band' };
    specs['b:quarter'] = { text: 'Este trimestre', x: 34, y: 180, cls: 'band' };
    this.labels.sync(specs);
  }

  private api: ObservatoryApi = {
    focusGoal: (goalId) => {
      const s = this.layout.stars.find((x) => x.id === goalId);
      if (s) this.cam.focus(s.x, s.y);
    },
  };

  update(): void {
    this.labels?.update();
  }
}
