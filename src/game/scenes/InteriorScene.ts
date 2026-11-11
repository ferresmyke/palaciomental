/**
 * Cena do Interior da Casa: móveis, decoração, itens soltos no chão, avatar e Modo Reforma.
 * Os móveis mostram dados reais: lombadas, livros abertos, avisos e conteúdo do baú.
 */
import Phaser from 'phaser';
import { catalogItem, findCatalogItem, themeById, type CatalogItem } from '@/domain/catalog';
import { findPath, TILE, type Cell } from '@/domain/city';
import { DOOR_CELLS, footprint, placementsIn, rectOf, ROOM_H, ROOM_W, validateInterior } from '@/domain/grid';
import * as ops from '@/domain/ops';
import { boardNotices, chestBooks, chestTasks, deskBooks, deskTasks, furnitureBooks, looseItems, type LooseItem } from '@/domain/selectors';
import type { Book, Db, Furniture, ID, Placement, Rot } from '@/domain/types';
import { hashString } from '@/domain/util';
import { blobUrl, run } from '@/store/actions';
import { dbStore, getDb } from '@/store/db';
import { gameApi, gameBus, type InteriorApi } from '@/store/gameApi';
import { leaveToCity } from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { pictureWithImage } from '../art/interiorArt';
import { fixedSprite, objectSprite, type Keyed } from '../art/sprites';
import { paintRoom, ROOM_PAD, WALL_H } from '../art/terrain';
import { CamControl, cellRect, currentLight, Labels, prefersReducedMotion, replaceTex, tex, Walker, type LabelSpec } from '../core';

interface View {
  sig: string;
  sprite: Phaser.GameObjects.Sprite;
  halo?: Phaser.GameObjects.Image;
  placement: Placement;
  item: CatalogItem;
}

interface LooseView {
  item: LooseItem;
  sprite: Phaser.GameObjects.Image;
  cell: Cell;
}

const WALL_Y = -33;
const DEPTH = { room: -100, rug: 5, wall: 10, floor: 100, overlay: 5000, light: 6000, glow: 6010, drag: 7000 };

export function bookColor(db: Db, b: Book): string {
  return b.cover.color ?? db.templates[b.templateId]?.cover.color ?? 'ocre';
}

export class InteriorScene extends Phaser.Scene {
  private houseId!: ID;
  private cam!: CamControl;
  private labels!: Labels;
  private avatar!: Walker;
  private views = new Map<ID, View>();
  private loose = new Map<ID, LooseView>();
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  private lightRect!: Phaser.GameObjects.Rectangle;
  private ghost?: Phaser.GameObjects.Sprite;
  private night = 0;
  private pointerCell: Cell = { x: 0, y: 0 };
  private drag: { kind: 'placement'; id: ID; moved: boolean } | { kind: 'loose'; id: ID; moved: boolean; sx: number; sy: number } | null = null;
  private hoverId: ID | null = null;
  private lastRev = -1;
  private pictures = new Map<string, Keyed>();
  private pulse = 0;
  private looseOverflow = 0;

  constructor() {
    super('house');
  }

  create(): void {
    const place = ui.get().place;
    const db = getDb();
    this.views.clear();
    this.loose.clear();
    this.drag = null;
    this.ghost = undefined;
    this.hoverId = null;
    if (place.kind !== 'house' || !db.houses[place.houseId]) {
      uiStore.setState({ place: { kind: 'city' } });
      return;
    }
    this.houseId = place.houseId;
    const house = db.houses[this.houseId];
    const theme = themeById(house.themeId);
    const roomKey = `room-${theme.wall}-${theme.floor}`;
    if (!this.textures.exists(roomKey)) this.textures.addCanvas(roomKey, paintRoom(theme.wall, theme.floor));
    this.add.image(-ROOM_PAD, -WALL_H, roomKey).setOrigin(0).setDepth(DEPTH.room);

    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);
    this.hoverG = this.add.graphics().setDepth(DEPTH.overlay + 1);
    const W = ROOM_W * TILE;
    const H = ROOM_H * TILE;
    this.lightRect = this.add
      .rectangle(-ROOM_PAD - 400, -WALL_H - 400, W + ROOM_PAD * 2 + 800, H + WALL_H + ROOM_PAD + 800, 0xffffff)
      .setOrigin(0)
      .setDepth(DEPTH.light)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    const look = db.meta.world?.settings.avatar ?? { skin: 1, hair: 2, hairStyle: 0, shirt: 1, pants: 0 };
    this.avatar = new Walker(this, tex(this, fixedSprite.person(look)), { x: 7, y: 8 }, DEPTH.floor);
    this.avatar.face('up');
    this.avatar.speed = 80;
    this.avatar.maxTrip = 0.9;

    this.labels = new Labels(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x17110f);
    this.cam = new CamControl(this, { worldW: W + ROOM_PAD * 2, worldH: H + WALL_H + ROOM_PAD, maxZoom: 7, pad: 14, busy: () => !!this.drag });
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);

    this.sync(true);
    this.bindInput();

    const unsubDb = dbStore.subscribe(() => this.sync(false));
    let prev = uiStore.getState();
    const unsubUi = uiStore.subscribe((s) => {
      if (s.reform !== prev.reform || s.selectedId !== prev.selectedId || s.placing !== prev.placing) {
        this.refreshGhost();
        this.drawOverlay();
        this.syncLabels();
      }
      if (s.highlight !== prev.highlight) this.syncLabels();
      if (s.lightPreview !== prev.lightPreview) this.sync(true);
      if (s.panels !== prev.panels) this.drawOverlay();
      if (s.panels.length > 0 !== prev.panels.length > 0 || s.reform !== prev.reform) this.fitCamera();
      prev = s;
    });
    const offDrop = gameBus.on('reform:drop', (e) => this.externalPointer(e.clientX, e.clientY, true));
    const offMove = gameBus.on('reform:pointer', (e) => this.externalPointer(e.clientX, e.clientY, false));
    const offItemMove = gameBus.on('item:pointer', (e) => this.externalItem(e.clientX, e.clientY, false));
    const offItemDrop = gameBus.on('item:drop', (e) => this.externalItem(e.clientX, e.clientY, true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubDb();
      unsubUi();
      offDrop();
      offMove();
      offItemMove();
      offItemDrop();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.avatar.cancel();
      if (gameApi.interior === this.api) gameApi.interior = null;
    });
    gameApi.interior = this.api;
    cam.fadeIn(prefersReducedMotion() ? 0 : 260, 20, 14, 10);
    gameBus.emit('scene:ready', 'house');
  }

  private fitCamera = (): void => {
    const cam = this.cameras.main;
    const narrow = cam.width < 720;
    const st = ui.get();
    const side = st.panels.length > 0 || st.reform;
    const usableW = narrow || !side ? cam.width : Math.max(360, cam.width - 400);
    const z = Math.min(usableW / (ROOM_W * TILE + 28), (cam.height - (narrow ? 230 : 190)) / (ROOM_H * TILE + WALL_H + 24));
    cam.setZoom(Phaser.Math.Clamp(z, 1.2, 6));
    const cx = (ROOM_W * TILE) / 2 + (cam.width - usableW) / 2 / cam.zoom;
    // Reserva espaço em cima para o resumo da casa e embaixo para os controles.
    cam.centerOn(cx, (ROOM_H * TILE - WALL_H) / 2 + ROOM_PAD / 2 - (narrow ? 10 : 22) / cam.zoom);
  };

  // ───────────────────────────── Sincronização ─────────────────────────────

  private furnitureState(db: Db, f: Furniture, now: number): Record<string, unknown> | undefined {
    if (f.kind === 'container') {
      const onDesk = new Set(deskBooks(db, f.houseId).map((b) => b.id));
      const books = furnitureBooks(db, f.id);
      if (f.containerType === 'drawer' || f.containerType === 'box') return { count: books.length };
      return { spines: books.slice(0, 30).map((b) => (onDesk.has(b.id) ? null : bookColor(db, b))) };
    }
    if (f.role === 'desk') return { open: deskBooks(db, f.houseId).slice(0, 3).map((b) => bookColor(db, b)), tasks: deskTasks(db, f.houseId).length };
    if (f.role === 'board') {
      const notices = boardNotices(db, f.houseId, now);
      return { count: Math.min(8, notices.length), urgent: Math.min(8, notices.filter((n) => n.risk === 'overdue' || n.risk === 'today').length) };
    }
    return { count: chestBooks(db, f.houseId).length + chestTasks(db, f.houseId).length > 0 ? 1 : 0 };
  }

  private spriteFor(db: Db, p: Placement, item: CatalogItem, now: number): Keyed {
    const f = p.furnitureId ? db.furniture[p.furnitureId] : undefined;
    let state = f ? this.furnitureState(db, f, now) : undefined;
    if (item.recipe === 'window') state = { night: this.night > 0.5 };
    if (item.acceptsImage && p.imageId) {
      const key = `pic:${p.imageId}:${p.color}`;
      const ready = this.pictures.get(key);
      if (ready) return ready;
      void this.loadPicture(key, p.imageId, p.color);
    }
    return objectSprite({ catalogId: p.catalogId, variant: p.variant, color: p.color, rot: p.rot, state, seed: hashString(p.id) % 997 });
  }

  private async loadPicture(key: string, imageId: ID, color: string | null): Promise<void> {
    if (this.pictures.has(key) || this.data.get(key)) return;
    this.data.set(key, true);
    const url = await blobUrl(imageId);
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (!this.scene.isActive()) return;
      const a = pictureWithImage(color, img, 1);
      replaceTex(this, key, a.canvas);
      this.pictures.set(key, Object.assign(a, { key }));
      this.sync(true);
    };
    img.src = url;
  }

  private sync(force: boolean): void {
    const { db, rev } = dbStore.getState();
    if (!force && rev === this.lastRev) return;
    this.lastRev = rev;
    const house = db.houses[this.houseId];
    if (!house || house.trash) {
      void leaveToCity();
      return;
    }
    const settings = db.meta.world?.settings;
    const light = currentLight(settings?.light ?? 'auto');
    this.night = light.night;
    // Dentro de casa a luz é mais quente e nunca tão escura quanto lá fora.
    const c = Phaser.Display.Color.IntegerToColor(light.tint);
    const soft = Phaser.Display.Color.GetColor(Math.round(c.red + (255 - c.red) * 0.45), Math.round(c.green + (245 - c.green) * 0.42), Math.round(c.blue + (225 - c.blue) * 0.4));
    this.lightRect.setFillStyle(soft, 1);

    const now = Date.now();
    const seen = new Set<ID>();
    for (const p of placementsIn(db, this.houseId)) {
      const item = findCatalogItem(p.catalogId);
      if (!item) continue;
      seen.add(p.id);
      const a = this.spriteFor(db, p, item, now);
      const sig = `${a.key}|${p.x}|${p.y}|${p.rot}`;
      const cur = this.views.get(p.id);
      if (cur?.sig === sig) {
        cur.placement = p;
        continue;
      }
      cur?.sprite.destroy();
      cur?.halo?.destroy();
      const fp = footprint(item, p.rot);
      const fw = a.canvas.width / a.frames;
      const x = p.x * TILE + Math.round((fp.w * TILE - fw) / 2);
      let sprite: Phaser.GameObjects.Sprite;
      if (item.mount === 'wall') {
        sprite = this.add.sprite(x, WALL_Y, tex(this, a), 0).setOrigin(0, 0).setDepth(DEPTH.wall);
      } else {
        const y = (p.y + fp.h) * TILE + a.oy;
        sprite = this.add.sprite(x, y, tex(this, a), 0).setOrigin(0, 1);
        sprite.setDepth(item.mount === 'rug' ? DEPTH.rug + p.y * 0.01 : DEPTH.floor + (p.y + fp.h) * TILE);
      }
      if (a.frames > 1 && !prefersReducedMotion()) {
        const key = `anim-${a.key}`;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: Array.from({ length: a.frames }, (_, i) => ({ key: a.key, frame: i })), frameRate: item.recipe === 'fireplace' ? 7 : 2, repeat: -1 });
        sprite.play(key);
      }
      let halo: Phaser.GameObjects.Image | undefined;
      const litFire = item.recipe !== 'fireplace' || p.variant === 0;
      if (item.light && a.hot && litFire && item.recipe !== 'window') {
        halo = this.add
          .image(sprite.x + a.hot.x, sprite.y - (item.mount === 'wall' ? 0 : a.canvas.height) + a.hot.y, tex(this, fixedSprite.glow()))
          .setDepth(DEPTH.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(item.recipe === 'fireplace' ? 1.5 : 1);
      }
      this.views.set(p.id, { sig, sprite, halo, placement: p, item });
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.sprite.destroy();
        v.halo?.destroy();
        this.views.delete(id);
      }
    for (const v of this.views.values()) v.halo?.setAlpha(0.25 + this.night * 0.6);
    this.syncLoose(db);
    if (settings) {
      const key = tex(this, fixedSprite.person(settings.avatar));
      if (this.avatar.sprite.texture.key !== key) this.avatar.setTexture(key);
      this.avatar.sprite.setVisible(settings.showAvatar);
    }
    this.syncLabels();
    this.drawOverlay();
  }

  private blocked(): Uint8Array {
    const grid = new Uint8Array(ROOM_W * ROOM_H).fill(1);
    for (const v of this.views.values()) {
      if (v.item.mount !== 'floor' || !v.item.solid) continue;
      const r = rectOf(v.placement);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_H) grid[y * ROOM_W + x] = 0;
    }
    return grid;
  }

  private syncLoose(db: Db): void {
    const items = looseItems(db, this.houseId);
    const grid = this.blocked();
    for (const d of DOOR_CELLS) grid[d.y * ROOM_W + d.x] = 0;
    const cells: Cell[] = [];
    for (let y = 1; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (grid[y * ROOM_W + x]) cells.push({ x, y });
    cells.sort((a, b) => Math.hypot(a.x - 6.5, a.y - 6.2) + ((a.x * 7 + a.y * 13) % 5) * 0.3 - (Math.hypot(b.x - 6.5, b.y - 6.2) + ((b.x * 7 + b.y * 13) % 5) * 0.3));
    const theme = themeById(db.houses[this.houseId].themeId);
    const seen = new Set<ID>();
    const shown = items.slice(0, cells.length);
    this.looseOverflow = items.length - shown.length;
    shown.forEach((it, i) => {
      seen.add(it.id);
      const cell = cells[i];
      const a = it.kind === 'book' ? fixedSprite.loose('book', bookColor(db, db.books[it.id]), hashString(it.id)) : fixedSprite.loose(theme.loose, null, hashString(it.id));
      const cur = this.loose.get(it.id);
      const x = cell.x * TILE;
      const y = (cell.y + 1) * TILE;
      if (cur) {
        cur.item = it;
        cur.cell = cell;
        if (this.drag?.kind !== 'loose' || this.drag.id !== it.id) cur.sprite.setPosition(x, y).setDepth(DEPTH.floor + y - 2);
        cur.sprite.setTexture(tex(this, a));
      } else {
        const sprite = this.add.image(x, y, tex(this, a)).setOrigin(0, 1).setDepth(DEPTH.floor + y - 2);
        this.loose.set(it.id, { item: it, sprite, cell });
      }
    });
    for (const [id, v] of this.loose)
      if (!seen.has(id)) {
        v.sprite.destroy();
        this.loose.delete(id);
      }
  }

  private syncLabels(): void {
    const db = getDb();
    const s = ui.get();
    const specs: Record<string, LabelSpec> = {};
    let hl: ID | null = null;
    if (s.highlight?.kind === 'furniture') hl = s.highlight.id;
    if (s.highlight?.kind === 'book') hl = db.books[s.highlight.id]?.furnitureId ?? null;
    for (const [id, v] of this.views) {
      const f = v.placement.furnitureId ? db.furniture[v.placement.furnitureId] : undefined;
      if (!f) continue;
      const b = v.sprite.getBounds();
      const n = f.kind === 'container' ? furnitureBooks(db, f.id).length : 0;
      specs[id] = {
        text: f.name,
        x: b.centerX,
        y: b.y + 1,
        cls: `furn ${f.kind}${hl === f.id ? ' highlight' : ''}${s.selectedId === id ? ' selected' : ''}${this.hoverId === id ? ' hover' : ''}`,
        badge: n ? String(n) : undefined,
        badgeTitle: n ? `${n} livro(s)` : undefined,
      };
    }
    if (this.looseOverflow > 0) specs['more'] = { text: `+${this.looseOverflow} soltos`, x: 7 * TILE, y: 7.4 * TILE, cls: 'furn essential' };
    specs['door'] = { text: 'Sair', x: 7 * TILE, y: ROOM_H * TILE + ROOM_PAD + 14, cls: 'door', onClick: () => void leaveToCity() };
    this.labels.sync(specs);
  }

  // ───────────────────────────── Entrada ─────────────────────────────

  private bindInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.pointerCell = this.cellAt(w.x, w.y);
      const s = ui.get();
      if (s.reform) {
        if (s.placing) return;
        const id = this.viewAt(w.x, w.y);
        if (id) {
          ui.select(id);
          this.drag = { kind: 'placement', id, moved: false };
        }
        return;
      }
      const lid = this.looseAt(w.x, w.y);
      if (lid) this.drag = { kind: 'loose', id: lid, moved: false, sx: p.x, sy: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const c = this.cellAt(w.x, w.y);
      const changed = c.x !== this.pointerCell.x || c.y !== this.pointerCell.y;
      this.pointerCell = c;
      if (this.drag?.kind === 'loose' && p.isDown) {
        if (!this.drag.moved && Math.hypot(p.x - this.drag.sx, p.y - this.drag.sy) > 6) {
          this.drag.moved = true;
          const v = this.loose.get(this.drag.id);
          if (v) uiStore.setState({ dragItem: { kind: v.item.kind, id: v.item.id } });
        }
        if (this.drag.moved) {
          this.loose.get(this.drag.id)?.sprite.setPosition(w.x - 8, w.y + 8).setDepth(DEPTH.drag);
          this.drawOverlay(w.x, w.y);
        }
        return;
      }
      if (this.drag?.kind === 'placement' && p.isDown && changed) {
        this.drag.moved = true;
        this.drawOverlay();
      } else if (ui.get().placing && changed) this.drawOverlay();
      if (!p.isDown) this.updateHover(w.x, w.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const drag = this.drag;
      this.drag = null;
      if (drag?.kind === 'loose') {
        if (drag.moved) this.dropLoose(drag.id, w.x, w.y);
        else this.openLoose(drag.id);
        return;
      }
      if (drag?.kind === 'placement' && drag.moved) {
        this.movePlacementTo(drag.id, this.cellAt(w.x, w.y));
        return;
      }
      if (this.cam.moved || p.getDuration() > 600 || p.button === 2) return;
      this.click(w.x, w.y);
    });
  }

  private externalPointer(clientX: number, clientY: number, drop: boolean): void {
    const w = this.clientToWorld(clientX, clientY);
    if (!w) return;
    this.pointerCell = this.cellAt(w.x, w.y);
    if (drop) this.placeAt(this.pointerCell);
    else this.drawOverlay();
  }

  /** Item arrastado de um painel HTML (ex.: lista do chão) até um móvel. */
  private externalItem(clientX: number, clientY: number, drop: boolean): void {
    const w = this.clientToWorld(clientX, clientY);
    const d = ui.get().dragItem;
    if (!w || !d) return;
    if (!drop) return this.drawOverlay(w.x, w.y);
    const target = this.containerAt(w.x, w.y);
    if (target) this.storeItem(d.kind, d.id, target);
    this.drawOverlay();
  }

  private clientToWorld(clientX: number, clientY: number): Phaser.Math.Vector2 | null {
    const rect = this.game.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    return this.cameras.main.getWorldPoint(clientX - rect.left, clientY - rect.top);
  }

  private cellAt(wx: number, wy: number): Cell {
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  private viewAt(wx: number, wy: number, filter?: (v: View) => boolean): ID | null {
    let best: ID | null = null;
    let bestD = -Infinity;
    for (const [id, v] of this.views) {
      if (filter && !filter(v)) continue;
      const b = v.sprite.getBounds();
      if (wx >= b.x && wx <= b.right && wy >= b.y && wy <= b.bottom && v.sprite.depth > bestD) {
        best = id;
        bestD = v.sprite.depth;
      }
    }
    return best;
  }

  private looseAt(wx: number, wy: number): ID | null {
    for (const [id, v] of this.loose) {
      const b = v.sprite.getBounds();
      if (wx >= b.x && wx <= b.right && wy >= b.y && wy <= b.bottom) return id;
    }
    return null;
  }

  /** Móvel que aceita o item arrastado sob o ponteiro. */
  private containerAt(wx: number, wy: number): View | null {
    const kind = ui.get().dragItem?.kind;
    const id = this.viewAt(wx, wy, (v) => {
      const f = v.placement.furnitureId ? getDb().furniture[v.placement.furnitureId] : undefined;
      if (!f) return false;
      return kind === 'task' ? f.role === 'desk' : f.kind === 'container';
    });
    return id ? this.views.get(id)! : null;
  }

  private updateHover(wx: number, wy: number): void {
    const s = ui.get();
    const id = s.placing ? null : (this.looseAt(wx, wy) ?? this.viewAt(wx, wy, (v) => s.reform || !!v.placement.furnitureId));
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.game.canvas.style.cursor = id ? 'pointer' : s.placing ? 'copy' : 'default';
    this.hoverG.clear();
    const b = id ? (this.views.get(id)?.sprite ?? this.loose.get(id)?.sprite)?.getBounds() : null;
    if (b) {
      this.hoverG.lineStyle(1, 0xfff1c9, 0.95);
      this.hoverG.strokeRect(b.x - 1.5, b.y - 1.5, b.width + 3, b.height + 3);
    }
    this.syncLabels();
  }

  private click(wx: number, wy: number): void {
    const s = ui.get();
    const cell = this.cellAt(wx, wy);
    if (s.reform) {
      if (s.placing) return this.placeAt(cell);
      ui.select(this.viewAt(wx, wy));
      return;
    }
    if (wy > ROOM_H * TILE - 3 && wx > 6 * TILE - 4 && wx < 8 * TILE + 4) return void leaveToCity();
    const id = this.viewAt(wx, wy, (v) => !!v.placement.furnitureId);
    if (id) {
      const v = this.views.get(id)!;
      const f = getDb().furniture[v.placement.furnitureId!];
      this.openFurniture(f);
      void this.api.walkToFurniture(f.id);
      return;
    }
    if (cell.x >= 0 && cell.y >= 0 && cell.x < ROOM_W && cell.y < ROOM_H) {
      ui.closeAll();
      void this.walkTo(cell);
    }
  }

  private openFurniture(f: Furniture): void {
    if (f.kind === 'container') ui.open({ type: 'furniture', id: f.id });
    else if (f.role === 'desk') ui.open({ type: 'desk', houseId: f.houseId });
    else if (f.role === 'board') ui.open({ type: 'board', houseId: f.houseId });
    else ui.open({ type: 'chest', houseId: f.houseId });
  }

  private openLoose(id: ID): void {
    const v = this.loose.get(id);
    if (!v) return;
    ui.open(v.item.kind === 'book' ? { type: 'book', id } : { type: 'task', id });
    void this.walkTo(v.cell);
  }

  private dropLoose(id: ID, wx: number, wy: number): void {
    const v = this.loose.get(id);
    const target = this.containerAt(wx, wy);
    uiStore.setState({ dragItem: null });
    if (v && target) this.storeItem(v.item.kind, id, target);
    else if (v) {
      v.sprite.setPosition(v.cell.x * TILE, (v.cell.y + 1) * TILE).setDepth(DEPTH.floor + (v.cell.y + 1) * TILE - 2);
      const any = this.viewAt(wx, wy, (x) => !!x.placement.furnitureId);
      if (any) ui.toast(v.item.kind === 'task' ? 'Tarefas avulsas ficam na mesa de trabalho ou dentro de um livro.' : 'Livros ficam em estantes, gaveteiros, murais e caixas.', 'info');
    }
    this.drawOverlay();
  }

  private storeItem(kind: 'book' | 'task', id: ID, target: View): void {
    const f = getDb().furniture[target.placement.furnitureId!];
    if (kind === 'book') run('Guardar livro', (d) => ops.moveBook(d, id, { houseId: f.houseId, furnitureId: f.id }));
    else run('Guardar tarefa na mesa', (d) => ops.moveTask(d, id, { houseId: f.houseId, onDesk: true }));
    uiStore.setState({ dragItem: null });
    ui.highlight({ kind: 'furniture', id: f.id }, 1600);
    if (!prefersReducedMotion()) this.tweens.add({ targets: target.sprite, scaleY: 1.06, duration: 90, yoyo: true });
  }

  // ───────────────────────────── Modo Reforma (interior) ─────────────────────────────

  private anchor(item: CatalogItem, rot: Rot): { x: number; y: number; w: number; h: number } {
    const fp = footprint(item, rot);
    const x = this.pointerCell.x - Math.floor((fp.w - 1) / 2);
    const y = item.mount === 'wall' ? 0 : this.pointerCell.y - (fp.h - 1);
    return { x, y, w: fp.w, h: fp.h };
  }

  private placeAt(cell: Cell): void {
    const pl = ui.get().placing;
    if (!pl) return;
    const item = catalogItem(pl.catalogId);
    if (item.scope !== 'interior') return;
    this.pointerCell = cell;
    const a = this.anchor(item, pl.rot);
    const id = run(`Inserir ${item.name.toLowerCase()}`, (d) => ops.placeObject(d, { scope: this.houseId, catalogId: pl.catalogId, x: a.x, y: a.y, rot: pl.rot, variant: pl.variant, color: pl.color }));
    if (id && item.kind === 'container') ui.select(id);
  }

  private movePlacementTo(id: ID, cell: Cell): void {
    const p = getDb().placements[id];
    if (!p) return;
    this.pointerCell = cell;
    const a = this.anchor(catalogItem(p.catalogId), p.rot);
    if (a.x !== p.x || a.y !== p.y) run('Mover objeto', (d) => ops.movePlacement(d, id, a.x, a.y));
    this.drawOverlay();
  }

  private refreshGhost(): void {
    const pl = ui.get().placing;
    this.ghost?.destroy();
    this.ghost = undefined;
    if (!pl) return;
    const item = findCatalogItem(pl.catalogId);
    if (!item || item.scope !== 'interior') return;
    const a = objectSprite({ catalogId: pl.catalogId, variant: pl.variant, color: pl.color, rot: pl.rot });
    this.ghost = this.add.sprite(0, 0, tex(this, a), 0).setAlpha(0.75).setDepth(DEPTH.drag).setData('art', a).setVisible(false);
  }

  private drawOverlay(dragX?: number, dragY?: number): void {
    const g = this.overlay;
    g.clear();
    const s = ui.get();
    const db = getDb();
    if (this.ghost) this.ghost.setVisible(false);
    // Arrumar: destaca os móveis que aceitam o item arrastado.
    if (s.dragItem && !s.reform) {
      const over = dragX !== undefined && dragY !== undefined ? this.containerAt(dragX, dragY) : null;
      for (const v of this.views.values()) {
        const f = v.placement.furnitureId ? db.furniture[v.placement.furnitureId] : undefined;
        if (!f) continue;
        const accepts = s.dragItem.kind === 'task' ? f.role === 'desk' : f.kind === 'container';
        if (!accepts) continue;
        const b = v.sprite.getBounds();
        g.lineStyle(1, v === over ? 0xfff1c9 : 0x9be070, v === over ? 1 : 0.8);
        g.strokeRect(b.x - 1.5, b.y - 1.5, b.width + 3, b.height + 3);
        if (v === over) {
          g.fillStyle(0xfff1c9, 0.25);
          g.fillRect(b.x, b.y, b.width, b.height);
        }
      }
      return;
    }
    if (!s.reform) return;
    // grade
    g.lineStyle(1, 0xfff1c9, 0.16);
    for (let x = 0; x <= ROOM_W; x++) g.lineBetween(x * TILE, 0, x * TILE, ROOM_H * TILE);
    for (let y = 0; y <= ROOM_H; y++) g.lineBetween(0, y * TILE, ROOM_W * TILE, y * TILE);
    for (let x = 0; x <= ROOM_W; x++) g.lineBetween(x * TILE, WALL_Y, x * TILE, WALL_Y + 20);
    const others = placementsIn(db, this.houseId);
    const preview = (catalogId: string, rot: Rot, ignore?: ID) => {
      const item = catalogItem(catalogId);
      const a = this.anchor(item, rot);
      const v = validateInterior({ catalogId, x: a.x, y: a.y, rot }, others, ignore);
      const color = v.ok ? 0x9be070 : 0xe0604a;
      if (item.mount === 'wall') {
        g.fillStyle(color, 0.3);
        g.fillRect(a.x * TILE, WALL_Y, a.w * TILE, 20);
        g.lineStyle(1, color, 0.95);
        g.strokeRect(a.x * TILE + 0.5, WALL_Y + 0.5, a.w * TILE - 1, 19);
      } else cellRect(g, a.x, a.y, a.w, a.h, color, 0.3);
      const hint = v.ok ? null : (v.reason ?? null);
      if (uiStore.getState().hint !== hint) uiStore.setState({ hint });
      return { a, ok: v.ok, item };
    };
    if (s.placing && findCatalogItem(s.placing.catalogId)?.scope === 'interior') {
      const r = preview(s.placing.catalogId, s.placing.rot);
      if (this.ghost) {
        const art = this.ghost.getData('art') as Keyed;
        const fw = art.canvas.width / art.frames;
        const x = r.a.x * TILE + Math.round((r.a.w * TILE - fw) / 2);
        if (r.item.mount === 'wall') this.ghost.setOrigin(0, 0).setPosition(x, WALL_Y);
        else this.ghost.setOrigin(0, 1).setPosition(x, (r.a.y + r.a.h) * TILE + art.oy);
        this.ghost.setVisible(true).setTint(r.ok ? 0xffffff : 0xff8a7a);
      }
    }
    if (s.selectedId) {
      const v = this.views.get(s.selectedId);
      if (v) {
        const b = v.sprite.getBounds();
        g.lineStyle(1, 0xfff1c9, 1);
        g.strokeRect(b.x - 1.5, b.y - 1.5, b.width + 3, b.height + 3);
        const r = rectOf(v.placement);
        if (v.item.mount !== 'wall') cellRect(g, r.x, r.y, r.w, r.h, 0xfff1c9, 0.14);
        if (this.drag?.kind === 'placement' && this.drag.moved) preview(v.placement.catalogId, v.placement.rot, v.placement.id);
      }
    }
  }

  // ───────────────────────────── Avatar ─────────────────────────────

  private async walkTo(cell: Cell): Promise<boolean> {
    const settings = getDb().meta.world?.settings;
    const route = findPath(this.blocked(), ROOM_W, ROOM_H, this.avatar.cell, cell);
    if (!route) return false;
    return this.avatar.walk(route, !settings?.showAvatar || settings.reduceMotion);
  }

  private api: InteriorApi = {
    walkToFurniture: async (furnitureId) => {
      const v = [...this.views.values()].find((x) => x.placement.furnitureId === furnitureId);
      if (!v) return false;
      const r = rectOf(v.placement);
      const grid = this.blocked();
      const cands: Cell[] = [];
      if (v.item.mount === 'wall') for (let x = r.x; x < r.x + r.w; x++) cands.push({ x, y: 0 }, { x, y: 1 });
      else {
        for (let x = r.x; x < r.x + r.w; x++) cands.push({ x, y: r.y + r.h });
        for (let y = r.y; y < r.y + r.h; y++) cands.push({ x: r.x - 1, y }, { x: r.x + r.w, y });
        for (let x = r.x; x < r.x + r.w; x++) cands.push({ x, y: r.y - 1 });
      }
      const free = cands.find((c) => c.x >= 0 && c.y >= 0 && c.x < ROOM_W && c.y < ROOM_H && grid[c.y * ROOM_W + c.x]) ?? { x: Math.min(ROOM_W - 1, r.x), y: Math.min(ROOM_H - 1, r.y + r.h) };
      const ok = await this.walkTo(free);
      if (ok) {
        this.avatar.face(free.y >= r.y + r.h || v.item.mount === 'wall' ? 'up' : free.x < r.x ? 'right' : free.x >= r.x + r.w ? 'left' : 'down');
        if (!prefersReducedMotion()) this.tweens.add({ targets: this.avatar.sprite, y: this.avatar.sprite.y - 2, duration: 110, yoyo: true });
      }
      return ok;
    },
    walkToDoor: async () => {
      const ok = await this.walkTo({ x: 7, y: 8 });
      if (ok && !prefersReducedMotion()) {
        this.avatar.face('down');
        await new Promise<void>((r) => {
          this.cameras.main.fadeOut(160, 20, 14, 10);
          window.setTimeout(r, 170);
        });
      }
      return ok;
    },
    zoomBy: (f) => this.cam.zoomBy(f),
    panBy: (dx, dy) => this.cam.panBy(dx, dy),
  };

  update(_time: number, smoothed: number): void {
    // Tempo real (sem suavização): a viagem dura o mesmo em máquinas lentas.
    const delta = Math.min(250, this.game.loop.rawDelta || smoothed);
    if (!this.avatar) return;
    this.avatar.update(delta);
    this.labels.update();
    // realce pulsante do móvel em destaque
    const h = ui.get().highlight;
    if (h && (h.kind === 'furniture' || h.kind === 'book')) {
      const fid = h.kind === 'furniture' ? h.id : getDb().books[h.id]?.furnitureId;
      const v = [...this.views.values()].find((x) => x.placement.furnitureId === fid);
      this.pulse += delta;
      if (v && !ui.get().reform && !ui.get().dragItem) {
        const b = v.sprite.getBounds();
        this.overlay.clear();
        this.overlay.lineStyle(1, 0xfff1c9, 0.55 + Math.sin(this.pulse / 160) * 0.4);
        this.overlay.strokeRect(b.x - 2.5, b.y - 2.5, b.width + 5, b.height + 5);
      }
    } else if (this.pulse) {
      this.pulse = 0;
      this.drawOverlay();
    }
  }
}
