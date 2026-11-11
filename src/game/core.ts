/**
 * Peças comuns às cenas: texturas a partir dos sprites, câmera (zoom, arrasto, pinça),
 * rótulos em HTML (legíveis em qualquer zoom), luz por hora e o caminhante (avatar/vizinhos).
 */
import Phaser from 'phaser';
import type { Cell } from '@/domain/city';
import { TILE } from '@/domain/city';
import type { LightMode } from '@/domain/types';
import { uiStore } from '@/store/ui';
import { CHAR_H, CHAR_W } from './art/chars';
import type { Keyed } from './art/sprites';
import type { SpriteArt } from './art/px';

/** Garante a textura Phaser de um sprite (com quadros de animação, se houver). */
export function tex(scene: Phaser.Scene, a: Keyed): string {
  return texOf(scene, a.key, a);
}

export function texOf(scene: Phaser.Scene, key: string, a: SpriteArt): string {
  if (!scene.textures.exists(key)) {
    const t = scene.textures.addCanvas(key, a.canvas);
    if (t && a.frames > 1) {
      const fw = a.canvas.width / a.frames;
      for (let i = 0; i < a.frames; i++) t.add(i, 0, i * fw, 0, fw, a.canvas.height);
    }
  }
  return key;
}

export function replaceTex(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return key;
}

// ───────────────────────────── Luz por hora ─────────────────────────────

export interface Light {
  /** Cor multiplicada sobre a cena. */
  tint: number;
  /** 0 = dia, 1 = noite fechada. */
  night: number;
  label: string;
}

const KEYS: [number, number, number, string][] = [
  [0, 0x5a66a6, 1, 'noite'],
  [4.5, 0x5a66a6, 1, 'noite'],
  [6, 0xd9a9a0, 0.45, 'amanhecer'],
  [7.5, 0xfff1dc, 0, 'manhã'],
  [12, 0xffffff, 0, 'manhã'],
  [15, 0xfff0cf, 0, 'tarde'],
  [17.5, 0xffd9a0, 0.05, 'fim de tarde'],
  [18.8, 0xe8a98a, 0.4, 'anoitecer'],
  [20.2, 0x6e70ac, 0.9, 'noite'],
  [24, 0x5a66a6, 1, 'noite'],
];

function lerpColor(a: number, b: number, t: number): number {
  const c = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export function lightAtHour(hour: number): Light {
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const [h0, c0, n0] = KEYS[i];
    const [h1, c1, n1, label] = KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
      return { tint: lerpColor(c0, c1, t), night: n0 + (n1 - n0) * t, label: t < 0.5 ? KEYS[i][3] : label };
    }
  }
  return { tint: 0xffffff, night: 0, label: 'manhã' };
}

const MODE_HOUR: Record<Exclude<LightMode, 'auto'>, number> = { morning: 10, afternoon: 17.2, dusk: 19, night: 22 };

/** A luz segue o relógio do usuário, salvo quando ele fixa um horário nas configurações. */
export function currentLight(mode: LightMode): Light {
  const preview = uiStore.getState().lightPreview;
  if (preview !== null) return lightAtHour(preview);
  if (mode !== 'auto') return lightAtHour(MODE_HOUR[mode]);
  const d = new Date();
  return lightAtHour(d.getHours() + d.getMinutes() / 60);
}

// ───────────────────────────── Rótulos em HTML ─────────────────────────────

export interface LabelSpec {
  text: string;
  /** Posição no mundo (pixels). */
  x: number;
  y: number;
  cls?: string;
  badge?: string;
  badgeTitle?: string;
  onClick?: () => void;
}

/** Camada de rótulos por cima do canvas. É DOM da cena, não React. */
export class Labels {
  private el: HTMLDivElement;
  private items = new Map<string, { spec: LabelSpec; node: HTMLElement; sig: string }>();

  constructor(private scene: Phaser.Scene) {
    const parent = scene.game.canvas.parentElement!;
    this.el = document.createElement('div');
    this.el.className = 'world-labels';
    parent.appendChild(this.el);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Substitui o conjunto de rótulos (os que sumirem são removidos). */
  sync(specs: Record<string, LabelSpec>): void {
    for (const [id, item] of this.items)
      if (!specs[id]) {
        item.node.remove();
        this.items.delete(id);
      }
    for (const [id, spec] of Object.entries(specs)) {
      const sig = `${spec.text}|${spec.cls ?? ''}|${spec.badge ?? ''}|${spec.badgeTitle ?? ''}|${spec.onClick ? 1 : 0}`;
      let item = this.items.get(id);
      if (!item) {
        const node = document.createElement(spec.onClick ? 'button' : 'div');
        this.el.appendChild(node);
        item = { spec, node, sig: '' };
        this.items.set(id, item);
      }
      item.spec = spec;
      if (item.sig !== sig) {
        item.sig = sig;
        item.node.className = `world-label ${spec.cls ?? ''}`;
        item.node.textContent = '';
        const name = document.createElement('span');
        name.textContent = spec.text;
        item.node.appendChild(name);
        if (spec.badge) {
          const b = document.createElement('span');
          b.className = 'world-badge';
          b.textContent = spec.badge;
          if (spec.badgeTitle) b.title = spec.badgeTitle;
          item.node.appendChild(b);
        }
        item.node.onclick = spec.onClick ?? null;
      }
    }
    this.update();
  }

  update(): void {
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    for (const { spec, node } of this.items.values()) {
      const sx = (spec.x - cx) * z + cam.width / 2;
      const sy = (spec.y - cy) * z + cam.height / 2;
      const hidden = sx < -80 || sy < -30 || sx > cam.width + 80 || sy > cam.height + 30;
      node.style.display = hidden ? 'none' : '';
      if (!hidden) node.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    }
    this.el.dataset.zoom = z < 1.6 ? 'far' : z < 2.6 ? 'mid' : 'near';
  }

  destroy(): void {
    this.el.remove();
    this.items.clear();
  }
}

// ───────────────────────────── Câmera ─────────────────────────────

export interface CamOptions {
  worldW: number;
  worldH: number;
  maxZoom: number;
  /** Margem em volta do mundo quando ele é menor que a tela. */
  pad?: number;
  /** A cena avisa se um gesto já está em uso (arrastando um objeto, por exemplo). */
  busy?: () => boolean;
  onChange?: () => void;
}

/** Zoom com roda, arrasto com botão direito (ou esquerdo no vazio), pinça no toque. */
export class CamControl {
  minZoom = 1;
  dragging = false;
  /** Verdadeiro quando o último gesto foi arrasto (para não virar clique). */
  moved = false;
  private last = { x: 0, y: 0 };
  private start = { x: 0, y: 0 };
  private pinch = 0;
  private armed = false;

  constructor(
    private scene: Phaser.Scene,
    private o: CamOptions,
  ) {
    const input = scene.input;
    input.addPointer(1);
    const cam = scene.cameras.main;
    this.fit();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, this.fit, this));

    input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomAt(p.x, p.y, dy > 0 ? 1 / 1.15 : 1.15);
    });
    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.moved = false;
      this.armed = true;
      this.last = { x: p.x, y: p.y };
      this.start = { x: p.x, y: p.y };
      this.pinch = 0;
    });
    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = input.pointer1;
      const p2 = input.pointer2;
      if (p1?.isDown && p2?.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinch > 0 && d > 0) this.zoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, d / this.pinch);
        this.pinch = d;
        this.moved = true;
        return;
      }
      if (!p.isDown || !this.armed) return;
      if (this.o.busy?.()) return;
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      if (!this.dragging && Math.hypot(p.x - this.start.x, p.y - this.start.y) < 7) return;
      this.dragging = true;
      this.moved = true;
      cam.stopFollow();
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.last = { x: p.x, y: p.y };
      this.o.onChange?.();
    });
    const end = () => {
      this.dragging = false;
      this.armed = false;
      this.pinch = 0;
    };
    input.on('pointerup', end);
    input.on('pointerupoutside', end);
  }

  /** Recalcula os limites de zoom para o tamanho atual da tela. */
  fit = (): void => {
    const cam = this.scene.cameras.main;
    const pad = this.o.pad ?? 0;
    const cover = Math.max(cam.width / this.o.worldW, cam.height / this.o.worldH);
    const contain = Math.min(cam.width / (this.o.worldW + pad * 2), cam.height / (this.o.worldH + pad * 2));
    this.minZoom = pad ? contain * 0.9 : cover;
    if (pad) cam.removeBounds();
    else cam.setBounds(0, 0, this.o.worldW, this.o.worldH);
    if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
    this.o.onChange?.();
  };

  zoomAt(sx: number, sy: number, factor: number): void {
    const cam = this.scene.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    const z = Phaser.Math.Clamp(cam.zoom * factor, this.minZoom, Math.max(this.minZoom, this.o.maxZoom));
    if (z === cam.zoom) return;
    cam.setZoom(z);
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.o.onChange?.();
  }

  zoomBy(factor: number): void {
    const cam = this.scene.cameras.main;
    this.zoomAt(cam.width / 2, cam.height / 2, factor);
  }

  panBy(dx: number, dy: number): void {
    const cam = this.scene.cameras.main;
    cam.stopFollow();
    this.scene.tweens.add({ targets: cam, scrollX: cam.scrollX + dx / cam.zoom, scrollY: cam.scrollY + dy / cam.zoom, duration: 140, onUpdate: () => this.o.onChange?.() });
  }

  /** Centraliza suavemente em um ponto do mundo. */
  focus(x: number, y: number, zoom?: number, ms = 450): void {
    const cam = this.scene.cameras.main;
    cam.stopFollow();
    const reduce = prefersReducedMotion();
    if (zoom) cam.zoomTo(Phaser.Math.Clamp(zoom, this.minZoom, Math.max(this.minZoom, this.o.maxZoom)), reduce ? 0 : ms, 'Sine.easeInOut', true);
    cam.pan(x, y, reduce ? 0 : ms, 'Sine.easeInOut', true, () => this.o.onChange?.());
  }
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduce';
}

// ───────────────────────────── Caminhante ─────────────────────────────

/** Personagem que anda por uma rota de células. Usado pelo avatar e pelos vizinhos. */
export class Walker {
  sprite: Phaser.GameObjects.Sprite;
  cell: Cell;
  private route: Cell[] = [];
  private done: ((ok: boolean) => void) | null = null;
  private dir: 'down' | 'up' | 'side' = 'down';
  speed = 78;

  constructor(
    private scene: Phaser.Scene,
    texKey: string,
    cell: Cell,
    private depthOffset = 0,
  ) {
    this.cell = { ...cell };
    const p = Walker.pos(cell);
    this.sprite = scene.add.sprite(p.x, p.y, texKey, 0).setOrigin(0.5, 1);
    this.ensureAnims(texKey);
    this.sprite.setDepth(p.y + depthOffset);
  }

  static pos(c: Cell): { x: number; y: number } {
    return { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE - 2 };
  }

  private ensureAnims(key: string): void {
    const a = this.scene.anims;
    const mk = (name: string, from: number) => {
      if (a.exists(`${key}-${name}`)) return;
      a.create({ key: `${key}-${name}`, frames: [0, 1, 2, 3].map((i) => ({ key, frame: from + i })), frameRate: 8, repeat: -1 });
    };
    mk('down', 0);
    mk('up', 4);
    mk('side', 8);
  }

  setTexture(key: string): void {
    this.ensureAnims(key);
    this.sprite.setTexture(key, 0);
    this.dir = 'down';
  }

  teleport(cell: Cell): void {
    this.cancel();
    this.cell = { ...cell };
    const p = Walker.pos(cell);
    this.sprite.setPosition(p.x, p.y).setDepth(p.y + this.depthOffset);
    this.stand();
  }

  /** Duração máxima de uma viagem (s): a narrativa nunca atrasa uma consulta rápida. */
  maxTrip = 0;
  private baseSpeed = 0;

  /** Anda pela rota; resolve true ao chegar e false se for interrompido. */
  walk(route: Cell[], instant = false): Promise<boolean> {
    this.cancel();
    if (!route.length) return Promise.resolve(true);
    if (!this.baseSpeed) this.baseSpeed = this.speed;
    this.speed = this.baseSpeed;
    if (this.maxTrip > 0) {
      let len = 0;
      for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y) * TILE;
      this.speed = Math.max(this.baseSpeed, len / this.maxTrip);
    }
    if (instant || prefersReducedMotion()) {
      this.teleport(route[route.length - 1]);
      return Promise.resolve(true);
    }
    this.route = route.slice(1);
    return new Promise((resolve) => {
      this.done = resolve;
      if (!this.route.length) this.finish(true);
    });
  }

  cancel(): void {
    if (this.done) this.finish(false);
    this.route = [];
  }

  get moving(): boolean {
    return this.route.length > 0;
  }

  private finish(ok: boolean): void {
    const d = this.done;
    this.done = null;
    this.route = [];
    this.stand();
    d?.(ok);
  }

  private stand(): void {
    this.sprite.anims.stop();
    this.sprite.setFrame(this.dir === 'down' ? 0 : this.dir === 'up' ? 4 : 8);
  }

  face(dir: 'down' | 'up' | 'left' | 'right'): void {
    this.dir = dir === 'left' || dir === 'right' ? 'side' : dir;
    this.sprite.setFlipX(dir === 'left');
    this.stand();
  }

  update(dt: number): void {
    if (!this.route.length) return;
    let budget = (this.speed * dt) / 1000;
    while (budget > 0 && this.route.length) {
      const target = Walker.pos(this.route[0]);
      const dx = target.x - this.sprite.x;
      const dy = target.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      const dir: 'down' | 'up' | 'side' = Math.abs(dx) > Math.abs(dy) * 0.9 ? 'side' : dy < 0 ? 'up' : 'down';
      if (dir !== this.dir || !this.sprite.anims.isPlaying) {
        this.dir = dir;
        this.sprite.play(`${this.sprite.texture.key}-${dir}`, true);
      }
      if (dir === 'side') this.sprite.setFlipX(dx < 0);
      else this.sprite.setFlipX(false);
      if (dist <= budget) {
        this.sprite.setPosition(target.x, target.y);
        this.cell = this.route.shift()!;
        budget -= dist;
      } else {
        this.sprite.x += (dx / dist) * budget;
        this.sprite.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    this.sprite.setDepth(this.sprite.y + this.depthOffset);
    if (!this.route.length) this.finish(true);
  }

  destroy(): void {
    this.cancel();
    this.sprite.destroy();
  }
}

export const CHAR = { w: CHAR_W, h: CHAR_H };

/** Contorno de seleção/realce em volta de um retângulo de células. */
export function cellRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, fill = 0.22): void {
  g.fillStyle(color, fill);
  g.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
  g.lineStyle(1, color, 0.95);
  g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, w * TILE - 1, h * TILE - 1);
}
