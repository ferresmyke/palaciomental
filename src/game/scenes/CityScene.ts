/**
 * Cena da Cidade: terreno, praça, casas, vegetação, avatar, luz e vida ambiente.
 * A cena só reflete o modelo: toda mudança de dados chega pela loja.
 */
import Phaser from 'phaser';
import { catalogItem, findCatalogItem } from '@/domain/catalog';
import { cityPlan, findPath, HOUSE_FP, TILE, walkGrid, type Cell, type CityPlan, type Lot, type SiteId } from '@/domain/city';
import { citySolidCells, footprint, freeLots, placementsIn, validateCity } from '@/domain/grid';
import * as ops from '@/domain/ops';
import { houseActivity, inboxCount, liveHouses, tidy } from '@/domain/selectors';
import { CITY_SCOPE, type Db, type House, type ID, type Rot } from '@/domain/types';
import { hashString, rng } from '@/domain/util';
import { run } from '@/store/actions';
import { dbStore, getDb } from '@/store/db';
import { gameApi, gameBus, type CityApi } from '@/store/gameApi';
import { goToHouse, goToObservatory, goToSite } from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { fixedSprite, houseSprites, objectSprite, scenerySprite, siteSprites } from '../art/sprites';
import { paintCityGround, paintWater } from '../art/terrain';
import { CamControl, cellRect, currentLight, Labels, prefersReducedMotion, tex, texOf, Walker, type LabelSpec, type Light } from '../core';

interface HouseView {
  sig: string;
  lot: Lot;
  parts: Phaser.GameObjects.GameObject[];
  body: Phaser.GameObjects.Image;
  roof: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  smoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  level: number;
}

interface DecorView {
  sig: string;
  sprite: Phaser.GameObjects.Sprite;
  halo?: Phaser.GameObjects.Image;
}

const DEPTH = { water: -3000, ground: -2000, flat: -1000, overlay: 80000, light: 90000, glow: 90010, ui: 95000 };

export class CityScene extends Phaser.Scene {
  private plan!: CityPlan;
  private cam!: CamControl;
  private labels!: Labels;
  private avatar!: Walker;
  private villagers: { w: Walker; wait: number }[] = [];
  private houses = new Map<ID, HouseView>();
  private decor = new Map<ID, DecorView>();
  private lotSigns = new Map<string, Phaser.GameObjects.Image>();
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  private lightRect!: Phaser.GameObjects.Rectangle;
  private glows: Phaser.GameObjects.Image[] = [];
  private letters?: Phaser.GameObjects.Image;
  private ghost?: Phaser.GameObjects.Sprite;
  private light: Light = { tint: 0xffffff, night: 0, label: '' };
  private drag: { kind: 'decor' | 'house'; id: ID; moved: boolean } | null = null;
  private pointerCell: Cell = { x: 0, y: 0 };
  private hover: string | null = null;
  private grid: Uint8Array | null = null;
  private viewClock = 0;
  private lastRev = -1;
  private entering = false;

  constructor() {
    super('city');
  }

  create(): void {
    const db = getDb();
    this.plan = cityPlan(db.meta.world?.expansion ?? 0);
    this.houses.clear();
    this.decor.clear();
    this.lotSigns.clear();
    this.villagers = [];
    this.glows = [];
    this.grid = null;
    this.drag = null;
    this.ghost = undefined;
    this.letters = undefined;
    this.entering = false;
    const W = this.plan.w * TILE;
    const H = this.plan.h * TILE;

    // Água animada por baixo, chão por cima (com a água recortada).
    const waterKey = 'water';
    if (!this.textures.exists(waterKey)) {
      const t = this.textures.addCanvas(waterKey, paintWater())!;
      for (let i = 0; i < 4; i++) t.add(i, 0, i * 32, 0, 32, 32);
    }
    const water = this.add.tileSprite(0, 0, W, H, waterKey, 0).setOrigin(0).setDepth(DEPTH.water);
    let wf = 0;
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        if (!prefersReducedMotion()) water.setFrame(++wf % 4);
      },
    });
    const groundKey = `ground-${this.plan.expansion}`;
    if (!this.textures.exists(groundKey)) this.textures.addCanvas(groundKey, paintCityGround(this.plan));
    this.add.image(0, 0, groundKey).setOrigin(0).setDepth(DEPTH.ground);

    this.buildScenery();
    this.buildSites();

    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);
    this.hoverG = this.add.graphics().setDepth(DEPTH.overlay + 1);
    this.lightRect = this.add.rectangle(-64, -64, W + 128, H + 128, 0xffffff).setOrigin(0).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Avatar: aparece de onde o usuário veio.
    const from = ui.get().cameFrom;
    let start: Cell = this.plan.sites.fonte.door;
    if (from?.kind === 'house') {
      const lot = this.lotOf(db.houses[from.houseId]);
      if (lot) start = lot.door;
    } else if (from?.kind === 'observatory') start = this.plan.sites.observatorio.door;
    const look = db.meta.world?.settings.avatar ?? { skin: 1, hair: 2, hairStyle: 0, shirt: 1, pants: 0 };
    this.avatar = new Walker(this, tex(this, fixedSprite.person(look)), start);
    this.avatar.face('down');
    this.avatar.speed = 96;
    this.avatar.maxTrip = 1.9;

    this.labels = new Labels(this);
    this.cam = new CamControl(this, { worldW: W, worldH: H, maxZoom: 5, busy: () => !!this.drag, onChange: () => (this.viewClock = 0) });
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x24402c);
    const startZoom = Phaser.Math.Clamp(Math.min(cam.width / (36 * TILE), cam.height / (21 * TILE)), this.cam.minZoom, 4);
    cam.setZoom(Math.max(this.cam.minZoom, startZoom));
    cam.centerOn(this.avatar.sprite.x, this.avatar.sprite.y - 20);

    this.sync(true);
    this.buildVillagers();
    this.bindInput();

    const unsubDb = dbStore.subscribe(() => this.sync(false));
    let prevUi = uiStore.getState();
    const unsubUi = uiStore.subscribe((s) => {
      if (s.reform !== prevUi.reform || s.selectedId !== prevUi.selectedId || s.selectedHouseId !== prevUi.selectedHouseId || s.placing !== prevUi.placing || s.movingHouseId !== prevUi.movingHouseId) {
        this.refreshGhost();
        this.drawOverlay();
        this.syncLabels();
      }
      if (s.lightPreview !== prevUi.lightPreview) this.applyLight();
      if (s.highlight !== prevUi.highlight && s.highlight?.kind === 'house') this.api.focusHouse(s.highlight.id);
      prevUi = s;
    });
    const offDrop = gameBus.on('reform:drop', (e) => this.externalPointer(e.clientX, e.clientY, true));
    const offMove = gameBus.on('reform:pointer', (e) => this.externalPointer(e.clientX, e.clientY, false));
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.applyLight() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubDb();
      unsubUi();
      offDrop();
      offMove();
      this.avatar.cancel();
      if (gameApi.city === this.api) gameApi.city = null;
    });
    gameApi.city = this.api;
    this.applyLight();
    cam.fadeIn(prefersReducedMotion() ? 0 : 220, 20, 14, 10);
    gameBus.emit('scene:ready', 'city');
  }

  // ───────────────────────────── Construção ─────────────────────────────

  private buildScenery(): void {
    for (const s of this.plan.scenery) {
      const a = scenerySprite(s.kind, s.seed);
      const flat = s.kind === 'flowers' || s.kind === 'reeds';
      const x = s.x * TILE - a.ox + s.ox;
      const y = (s.y + 1) * TILE + a.oy + s.oy;
      const img = this.add.image(x, y, tex(this, a)).setOrigin(0, 1);
      img.setDepth(flat ? DEPTH.flat + s.y : y - a.oy);
      if (s.kind === 'lantern' && a.hot) this.addGlow(x + a.hot.x, y - a.canvas.height + a.hot.y, 1);
    }
    // galinhas perto do poço
    const ch = objectSprite({ catalogId: 'chickens' });
    const hen = this.add.sprite(46 * TILE, 27 * TILE, tex(this, ch), 0).setOrigin(0, 1).setDepth(DEPTH.flat + 500);
    this.anims.remove('hens');
    this.anims.create({ key: 'hens', frames: [0, 1].map((f) => ({ key: ch.key, frame: f })), frameRate: 2, repeat: -1 });
    if (!prefersReducedMotion()) hen.play('hens');
  }

  private buildSites(): void {
    const { sites } = this.plan;
    const place = (a: ReturnType<typeof fixedSprite.quadro>, s: { x: number; y: number; h: number }) => {
      const y = (s.y + s.h) * TILE + a.oy;
      return this.add.sprite(s.x * TILE - a.ox, y, tex(this, a), 0).setOrigin(0, 1).setDepth(y - a.oy);
    };
    const f = place(fixedSprite.fountain(), sites.fonte);
    this.anims.remove('fountain');
    this.anims.create({ key: 'fountain', frames: [0, 1, 2].map((i) => ({ key: f.texture.key, frame: i })), frameRate: 6, repeat: -1 });
    if (!prefersReducedMotion()) f.play('fountain');
    place(fixedSprite.quadro(), sites.quadro);
    place(fixedSprite.mesa(), sites.mesa);
    place(fixedSprite.feira(), sites.feira);
    place(fixedSprite.poco(), sites.poco);
    for (const id of ['correio', 'observatorio'] as const) {
      const s = sites[id];
      const a = siteSprites(id);
      const y = (s.y + s.h) * TILE + a.body.oy;
      const x = s.x * TILE - a.body.ox;
      this.add.image(x, y, texOf(this, a.key + ':b', a.body)).setOrigin(0, 1).setDepth(y - a.body.oy);
      this.add.image(x, y, texOf(this, a.key + ':r', a.roof)).setOrigin(0, 1).setDepth(y - a.body.oy + 0.1);
      const glow = this.add.image(x, y, texOf(this, a.key + ':g', a.glow)).setOrigin(0, 1).setDepth(DEPTH.glow).setData('window', true);
      this.glows.push(glow);
      this.addGlow(x + a.body.canvas.width / 2, y - 14, 1.3);
    }
  }

  private addGlow(x: number, y: number, scale: number): Phaser.GameObjects.Image {
    const g = this.add
      .image(x, y, tex(this, fixedSprite.glow()))
      .setScale(scale)
      .setDepth(DEPTH.glow + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.glows.push(g);
    return g;
  }

  private lotOf(house: House | undefined): Lot | undefined {
    return house ? this.plan.lots.find((l) => l.id === house.lotId) : undefined;
  }

  private buildVillagers(): void {
    const reduce = prefersReducedMotion();
    const r = rng(77);
    const spots: Cell[] = [
      { x: 6, y: 30 },
      { x: 66, y: 30 },
      { x: 36, y: 20 },
      { x: 10, y: 19 },
      { x: 62, y: 19 },
      { x: 36, y: 44 },
      { x: 30, y: 30 },
      { x: 42, y: 31 },
    ];
    for (let i = 0; i < (reduce ? 0 : 3); i++) {
      const look = { skin: Math.floor(r() * 4), hair: Math.floor(r() * 7), hairStyle: Math.floor(r() * 3), shirt: 2 + Math.floor(r() * 6), pants: Math.floor(r() * 5) };
      const w = new Walker(this, tex(this, fixedSprite.person(look)), spots[i * 2]);
      w.speed = 30 + r() * 12;
      this.villagers.push({ w, wait: 1000 + r() * 4000 });
    }
    this.data.set('spots', spots);
  }

  // ───────────────────────────── Sincronização com os dados ─────────────────────────────

  private sync(force: boolean): void {
    const { db, rev } = dbStore.getState();
    if (!force && rev === this.lastRev) return;
    this.lastRev = rev;
    if ((db.meta.world?.expansion ?? 0) !== this.plan.expansion) {
      this.scene.restart();
      return;
    }
    this.grid = null;
    this.syncHouses(db);
    this.syncDecor(db);
    this.syncLots(db);
    this.syncLetters(db);
    this.syncLabels();
    this.drawOverlay();
    const look = db.meta.world?.settings;
    if (look) {
      const key = tex(this, fixedSprite.person(look.avatar));
      if (this.avatar.sprite.texture.key !== key) this.avatar.setTexture(key);
      this.avatar.sprite.setVisible(look.showAvatar);
    }
    this.applyLight();
  }

  private syncHouses(db: Db): void {
    const seen = new Set<ID>();
    const lit = this.light.night > 0.35;
    for (const h of liveHouses(db)) {
      const lot = this.lotOf(h);
      if (!lot) continue;
      seen.add(h.id);
      const level = tidy(db, h.id).level;
      const sig = `${h.modelId}|${h.color}|${h.themeId}|${h.lotId}|${level}`;
      const cur = this.houses.get(h.id);
      if (cur?.sig === sig) continue;
      cur?.parts.forEach((p) => p.destroy());
      cur?.smoke?.destroy();
      const a = houseSprites(h.modelId, h.color, h.themeId);
      const x = (lot.x + HOUSE_FP.dx) * TILE - a.body.ox;
      const y = (lot.y + HOUSE_FP.dy + HOUSE_FP.h) * TILE;
      const body = this.add.image(x, y, texOf(this, a.key + ':b', a.body)).setOrigin(0, 1).setDepth(y);
      const roof = this.add.image(x, y, texOf(this, a.key + ':r', a.roof)).setOrigin(0, 1).setDepth(y + 0.1);
      const glow = this.add.image(x, y, texOf(this, a.key + ':g', a.glow)).setOrigin(0, 1).setDepth(DEPTH.glow).setAlpha(0);
      const halo = this.add
        .image(x + a.body.canvas.width / 2, y - 16, tex(this, fixedSprite.glow()))
        .setScale(1.8, 1.1)
        .setDepth(DEPTH.glow + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      const parts: Phaser.GameObjects.GameObject[] = [body, roof, glow, halo];
      // Jardim conforme o nível de arrumação.
      const yard = (kind: Parameters<typeof fixedSprite.yard>[0], dx: number, dy: number) => {
        const s = fixedSprite.yard(kind);
        const yy = (lot.y + 4) * TILE + dy;
        parts.push(this.add.image(lot.x * TILE + dx, yy, tex(this, s)).setOrigin(0, 1).setDepth(kind === 'flowers' || kind === 'garden' ? DEPTH.flat + lot.y + 5 : yy));
      };
      if (level === 0) {
        yard('boxes', 6, 26);
        yard('boxes', 74, 22);
      }
      if (level >= 2) {
        yard('flowers', 6, 20);
        yard('garden', 72, 22);
      }
      if (level >= 3) {
        yard('pots', 22, 12);
        yard('lantern', 68, 14);
        const l = fixedSprite.yard('lantern');
        const g = this.addGlow(lot.x * TILE + 68 + (l.hot?.x ?? 8), (lot.y + 4) * TILE + 14 - l.canvas.height + (l.hot?.y ?? 6), 0.7);
        parts.push(g);
      }
      let smoke: HouseView['smoke'];
      if (level >= 1 && !prefersReducedMotion()) {
        smoke = this.add.particles(x + a.chimney.x, y - a.body.canvas.height + a.chimney.y, tex(this, fixedSprite.puff()), {
          speedY: { min: -11, max: -6 },
          speedX: { min: -2, max: 5 },
          lifespan: 3200,
          scale: { start: 0.5, end: 1.5 },
          alpha: { start: 0.55, end: 0 },
          frequency: 620,
        });
        smoke.setDepth(y + 1);
      }
      this.houses.set(h.id, { sig, lot, parts, body, roof, glow, halo, smoke, level });
      void lit;
    }
    for (const [id, v] of this.houses)
      if (!seen.has(id)) {
        v.parts.forEach((p) => p.destroy());
        v.smoke?.destroy();
        this.houses.delete(id);
      }
  }

  private syncDecor(db: Db): void {
    const seen = new Set<ID>();
    for (const p of placementsIn(db, CITY_SCOPE)) {
      const item = findCatalogItem(p.catalogId);
      if (!item) continue;
      seen.add(p.id);
      const sig = `${p.catalogId}|${p.x}|${p.y}|${p.rot}|${p.variant}|${p.color}`;
      const cur = this.decor.get(p.id);
      if (cur?.sig === sig) continue;
      cur?.sprite.destroy();
      cur?.halo?.destroy();
      const a = objectSprite({ catalogId: p.catalogId, variant: p.variant, color: p.color, rot: p.rot, seed: hashString(p.id) % 997 });
      const fp = footprint(item, p.rot);
      const x = p.x * TILE - a.ox + (fp.w * TILE - (a.canvas.width / a.frames - a.ox * 2)) / 2;
      const y = (p.y + fp.h) * TILE + a.oy;
      const sprite = this.add.sprite(Math.round(x), y, tex(this, a), 0).setOrigin(0, 1);
      sprite.setDepth(item.mount === 'ground' ? DEPTH.flat + p.y + 0.5 : y - a.oy);
      if (a.frames > 1 && !prefersReducedMotion()) {
        const key = `anim-${a.key}`;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: Array.from({ length: a.frames }, (_, i) => ({ key: a.key, frame: i })), frameRate: 2, repeat: -1 });
        sprite.play(key);
      }
      let halo: Phaser.GameObjects.Image | undefined;
      if (item.light && a.hot) {
        halo = this.addGlow(Math.round(x) + a.hot.x, y - a.canvas.height + a.hot.y, 0.9);
      }
      this.decor.set(p.id, { sig, sprite, halo });
    }
    for (const [id, v] of this.decor)
      if (!seen.has(id)) {
        v.sprite.destroy();
        if (v.halo) {
          this.glows = this.glows.filter((g) => g !== v.halo);
          v.halo.destroy();
        }
        this.decor.delete(id);
      }
  }

  private syncLots(db: Db): void {
    const free = new Set(freeLots(db, this.plan));
    for (const lot of this.plan.lots) {
      const has = this.lotSigns.get(lot.id);
      if (free.has(lot.id) && !has) {
        const a = fixedSprite.lotSign();
        const y = (lot.y + 4) * TILE;
        this.lotSigns.set(lot.id, this.add.image((lot.x + 1) * TILE + 4, y, tex(this, a)).setOrigin(0, 1).setDepth(y));
      } else if (!free.has(lot.id) && has) {
        has.destroy();
        this.lotSigns.delete(lot.id);
      }
    }
  }

  private syncLetters(db: Db): void {
    const n = inboxCount(db);
    const level = n === 0 ? 0 : n <= 2 ? 1 : n <= 6 ? 2 : 3;
    this.letters?.destroy();
    this.letters = undefined;
    if (level > 0) {
      const s = this.plan.sites.correio;
      const y = (s.y + s.h) * TILE + 12;
      this.letters = this.add.image((s.x + 3) * TILE - 2, y, tex(this, fixedSprite.letters(level))).setOrigin(0, 1).setDepth(y);
    }
  }

  private syncLabels(): void {
    const db = getDb();
    const s = ui.get();
    const specs: Record<string, LabelSpec> = {};
    const { sites } = this.plan;
    const inbox = inboxCount(db);
    specs['s:correio'] = { text: 'Correio', x: (sites.correio.x + 2) * TILE, y: sites.correio.y * TILE - 34, cls: 'site', badge: inbox ? `✉ ${inbox}` : undefined, badgeTitle: `${inbox} no Correio` };
    specs['s:obs'] = { text: 'Observatório', x: (sites.observatorio.x + 2.5) * TILE, y: sites.observatorio.y * TILE - 66, cls: 'site' };
    specs['s:mesa'] = { text: 'Mesa do Dia', x: (sites.mesa.x + 1) * TILE, y: sites.mesa.y * TILE - 16, cls: 'site minor' };
    specs['s:quadro'] = { text: 'Quadro da cidade', x: (sites.quadro.x + 1) * TILE, y: sites.quadro.y * TILE - 16, cls: 'site minor' };
    const now = Date.now();
    for (const h of liveHouses(db)) {
      const lot = this.lotOf(h);
      if (!lot) continue;
      const act = houseActivity(db, h.id, now);
      const t = tidy(db, h.id);
      // Sinalização contida: um selo só, com símbolo e texto.
      let badge: string | undefined;
      let title: string | undefined;
      if (act.overdue) {
        badge = `⚑ ${act.overdue}`;
        title = `${act.overdue} atrasada(s)`;
      } else if (act.dueToday) {
        badge = `◉ ${act.dueToday}`;
        title = `${act.dueToday} para hoje`;
      } else if (t.loose) {
        badge = `▫ ${t.loose}`;
        title = `${t.loose} solto(s)`;
      } else if (act.doing) {
        badge = `◐ ${act.doing}`;
        title = `${act.doing} em andamento`;
      }
      specs[`h:${h.id}`] = {
        text: h.name,
        x: (lot.x + 3.5) * TILE,
        y: (lot.y + 4) * TILE - 100,
        cls: `house ${act.state}${s.selectedHouseId === h.id ? ' selected' : ''}${this.hover === `h:${h.id}` ? ' hover' : ''}`,
        badge,
        badgeTitle: title,
      };
    }
    if (s.reform) {
      const free = new Set(freeLots(db, this.plan));
      for (const lot of this.plan.lots)
        if (free.has(lot.id))
          specs[`l:${lot.id}`] = {
            text: s.movingHouseId ? 'Mover para cá' : '+ Nova casa',
            x: (lot.x + 3.5) * TILE,
            y: (lot.y + 3) * TILE,
            cls: 'lot',
            onClick: () => this.clickLot(lot),
          };
    }
    this.labels.sync(specs);
  }

  private applyLight(): void {
    const mode = getDb().meta.world?.settings.light ?? 'auto';
    this.light = currentLight(mode);
    this.lightRect.setFillStyle(this.light.tint, 1);
    const n = this.light.night;
    for (const g of this.glows) g.setAlpha(g.getData('window') ? (n > 0.3 ? Math.min(1, n * 1.3) : 0) : n * 0.85);
    for (const v of this.houses.values()) {
      const on = n > 0.3 && v.level >= 1;
      v.glow.setAlpha(on ? Math.min(1, n * 1.3) : 0);
      v.halo.setAlpha(on ? n * 0.5 : 0);
    }
    document.documentElement.dataset.light = n > 0.6 ? 'night' : 'day';
  }

  // ───────────────────────────── Entrada ─────────────────────────────

  private bindInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const s = ui.get();
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.pointerCell = this.cellAt(w.x, w.y);
      if (s.reform && !s.placing && !s.movingHouseId) {
        const did = this.decorAt(w.x, w.y);
        if (did) {
          ui.select(did);
          this.drag = { kind: 'decor', id: did, moved: false };
          return;
        }
        const hid = this.houseAt(w.x, w.y);
        if (hid) {
          ui.selectHouse(hid);
          this.drag = { kind: 'house', id: hid, moved: false };
        }
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const c = this.cellAt(w.x, w.y);
      const changed = c.x !== this.pointerCell.x || c.y !== this.pointerCell.y;
      this.pointerCell = c;
      if (this.drag && p.isDown && changed) {
        this.drag.moved = true;
        this.drawOverlay();
      } else if (ui.get().placing && changed) this.drawOverlay();
      if (!p.isDown) this.updateHover(w.x, w.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const drag = this.drag;
      this.drag = null;
      if (drag?.moved) {
        this.finishDrag(drag, this.cellAt(w.x, w.y));
        return;
      }
      if (this.cam.moved || p.getDuration() > 600 || p.button === 2) return;
      this.click(w.x, w.y);
    });
  }

  /** Arrasto vindo do catálogo em HTML: posiciona o fantasma e solta. */
  private externalPointer(clientX: number, clientY: number, drop: boolean): void {
    const rect = this.game.canvas.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) return;
    const w = this.cameras.main.getWorldPoint(clientX - rect.left, clientY - rect.top);
    this.pointerCell = this.cellAt(w.x, w.y);
    if (drop) this.placeAt(this.pointerCell);
    else this.drawOverlay();
  }

  private cellAt(wx: number, wy: number): Cell {
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  private houseAt(wx: number, wy: number): ID | null {
    let best: ID | null = null;
    let bestY = -Infinity;
    for (const [id, v] of this.houses) {
      const b = v.body;
      if (wx >= b.x + 2 && wx <= b.x + b.width - 2 && wy <= b.y && wy >= b.y - b.height + 14 && b.y > bestY) {
        best = id;
        bestY = b.y;
      }
    }
    return best;
  }

  private siteAt(wx: number, wy: number): SiteId | null {
    for (const s of Object.values(this.plan.sites)) {
      const top = s.id === 'observatorio' ? 5 : s.id === 'correio' ? 3 : 1.4;
      if (wx >= s.x * TILE - 2 && wx <= (s.x + s.w) * TILE + 2 && wy <= (s.y + s.h) * TILE + 2 && wy >= (s.y - top) * TILE) return s.id;
    }
    return null;
  }

  private decorAt(wx: number, wy: number): ID | null {
    let best: ID | null = null;
    let bestD = -Infinity;
    for (const [id, v] of this.decor) {
      const b = v.sprite.getBounds();
      if (wx >= b.x && wx <= b.right && wy >= b.y && wy <= b.bottom && v.sprite.depth > bestD) {
        best = id;
        bestD = v.sprite.depth;
      }
    }
    return best;
  }

  private updateHover(wx: number, wy: number): void {
    const s = ui.get();
    let h: string | null = null;
    if (!s.placing) {
      const hid = this.houseAt(wx, wy);
      const sid = hid ? null : this.siteAt(wx, wy);
      const did = s.reform && !hid ? this.decorAt(wx, wy) : null;
      h = hid ? `h:${hid}` : sid && sid !== 'feira' && sid !== 'poco' ? `s:${sid}` : did ? `d:${did}` : null;
    }
    if (h === this.hover) return;
    this.hover = h;
    this.game.canvas.style.cursor = h ? 'pointer' : s.placing ? 'copy' : 'default';
    this.hoverG.clear();
    if (h?.startsWith('h:')) {
      const v = this.houses.get(h.slice(2));
      if (v) {
        this.hoverG.lineStyle(1, 0xfff1c9, 0.95);
        this.hoverG.strokeRoundedRect(v.body.x - 1.5, v.body.y - v.body.height + 12.5, v.body.width + 3, v.body.height - 9, 4);
      }
    } else if (h?.startsWith('s:')) {
      const st = this.plan.sites[h.slice(2) as SiteId];
      this.hoverG.lineStyle(1, 0xfff1c9, 0.9);
      this.hoverG.strokeEllipse((st.x + st.w / 2) * TILE, (st.y + st.h) * TILE - 2, st.w * TILE + 14, 14);
    } else if (h?.startsWith('d:')) {
      const b = this.decor.get(h.slice(2))?.sprite.getBounds();
      if (b) {
        this.hoverG.lineStyle(1, 0xfff1c9, 0.9);
        this.hoverG.strokeRect(b.x - 1.5, b.y - 1.5, b.width + 3, b.height + 3);
      }
    }
    this.syncLabels();
  }

  private click(wx: number, wy: number): void {
    const s = ui.get();
    const cell = this.cellAt(wx, wy);
    if (s.reform) {
      if (s.placing) return this.placeAt(cell);
      const lot = this.plan.lots.find((l) => cell.x >= l.x && cell.x < l.x + l.w && cell.y >= l.y && cell.y < l.y + l.h);
      if (s.movingHouseId && lot) return this.clickLot(lot);
      const did = this.decorAt(wx, wy);
      if (did) return ui.select(did);
      const hid = this.houseAt(wx, wy);
      if (hid) return ui.selectHouse(hid);
      if (lot && freeLots(getDb(), this.plan).includes(lot.id)) return this.clickLot(lot);
      return ui.select(null);
    }
    if (this.entering) return;
    const hid = this.houseAt(wx, wy);
    if (hid) {
      void goToHouse(hid);
      return;
    }
    const sid = this.siteAt(wx, wy);
    if (sid === 'correio') return void goToSite('correio', { type: 'correio' });
    if (sid === 'mesa') return void goToSite('mesa', { type: 'mesa' });
    if (sid === 'quadro') return void goToSite('quadro', { type: 'quadro' });
    if (sid === 'observatorio') return void goToObservatory();
    ui.closeAll();
    void this.api.walkToCell(cell);
  }

  private clickLot(lot: Lot): void {
    const s = ui.get();
    if (s.movingHouseId) {
      const id = s.movingHouseId;
      if (run('Mover casa', (d) => ops.moveHouse(d, id, lot.id)) !== undefined || getDb().houses[id]?.lotId === lot.id) ui.selectHouse(id);
      return;
    }
    ui.open({ type: 'newHouse', lotId: lot.id });
  }

  private placeAt(cell: Cell): void {
    const pl = ui.get().placing;
    if (!pl) return;
    const item = catalogItem(pl.catalogId);
    if (item.scope !== 'city') return;
    const fp = footprint(item, pl.rot);
    const x = cell.x - Math.floor((fp.w - 1) / 2);
    const y = cell.y - (fp.h - 1);
    run(`Inserir ${item.name.toLowerCase()}`, (d) => ops.placeObject(d, { scope: CITY_SCOPE, catalogId: pl.catalogId, x, y, rot: pl.rot, variant: pl.variant, color: pl.color }));
  }

  private finishDrag(drag: { kind: 'decor' | 'house'; id: ID }, cell: Cell): void {
    if (drag.kind === 'decor') {
      const p = getDb().placements[drag.id];
      if (!p) return;
      const fp = footprint(catalogItem(p.catalogId), p.rot);
      const x = cell.x - Math.floor((fp.w - 1) / 2);
      const y = cell.y - (fp.h - 1);
      if (x !== p.x || y !== p.y) run('Mover objeto', (d) => ops.movePlacement(d, drag.id, x, y));
    } else {
      const lot = this.plan.lots.find((l) => cell.x >= l.x && cell.x < l.x + l.w && cell.y >= l.y && cell.y < l.y + l.h);
      if (lot && getDb().houses[drag.id]?.lotId !== lot.id) run('Mover casa', (d) => ops.moveHouse(d, drag.id, lot.id));
    }
    this.drawOverlay();
  }

  // ───────────────────────────── Modo Reforma (cidade) ─────────────────────────────

  private refreshGhost(): void {
    const pl = ui.get().placing;
    this.ghost?.destroy();
    this.ghost = undefined;
    if (!pl) return;
    const item = findCatalogItem(pl.catalogId);
    if (!item || item.scope !== 'city') return;
    const a = objectSprite({ catalogId: pl.catalogId, variant: pl.variant, color: pl.color, rot: pl.rot });
    this.ghost = this.add.sprite(0, 0, tex(this, a), 0).setOrigin(0, 1).setAlpha(0.75).setDepth(DEPTH.ui).setData('art', a);
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const s = ui.get();
    const db = getDb();
    if (this.ghost) this.ghost.setVisible(false);
    if (!s.reform) return;
    const free = new Set(freeLots(db, this.plan));
    for (const lot of this.plan.lots) {
      const isFree = free.has(lot.id);
      g.lineStyle(1, isFree ? 0xd8f0a0 : 0xf3ecd6, isFree ? 0.85 : 0.3);
      g.strokeRect(lot.x * TILE + 0.5, lot.y * TILE + 0.5, lot.w * TILE - 1, lot.h * TILE - 1);
      if (isFree && (s.movingHouseId || this.drag?.kind === 'house')) {
        g.fillStyle(0xd8f0a0, 0.18);
        g.fillRect(lot.x * TILE, lot.y * TILE, lot.w * TILE, lot.h * TILE);
      }
    }
    const others = placementsIn(db, CITY_SCOPE);
    const preview = (catalogId: string, rot: Rot, ignore?: ID) => {
      const item = catalogItem(catalogId);
      const fp = footprint(item, rot);
      const x = this.pointerCell.x - Math.floor((fp.w - 1) / 2);
      const y = this.pointerCell.y - (fp.h - 1);
      const v = validateCity({ catalogId, x, y, rot }, others, this.plan, ignore);
      cellRect(g, x, y, fp.w, fp.h, v.ok ? 0x9be070 : 0xe0604a, 0.3);
      if (uiStore.getState().hint !== (v.ok ? null : (v.reason ?? null))) uiStore.setState({ hint: v.ok ? null : (v.reason ?? null) });
      return { x, y, fp, ok: v.ok };
    };
    if (s.placing && findCatalogItem(s.placing.catalogId)?.scope === 'city') {
      const r = preview(s.placing.catalogId, s.placing.rot);
      if (this.ghost) {
        const a = this.ghost.getData('art') as ReturnType<typeof objectSprite>;
        this.ghost
          .setVisible(true)
          .setPosition(r.x * TILE - a.ox + Math.round((r.fp.w * TILE - (a.canvas.width / a.frames - a.ox * 2)) / 2), (r.y + r.fp.h) * TILE + a.oy)
          .setTint(r.ok ? 0xffffff : 0xff8a7a);
      }
    }
    if (s.selectedId) {
      const p = db.placements[s.selectedId];
      if (p && p.scope === CITY_SCOPE) {
        const fp = footprint(catalogItem(p.catalogId), p.rot);
        cellRect(g, p.x, p.y, fp.w, fp.h, 0xfff1c9, 0.15);
        if (this.drag?.kind === 'decor' && this.drag.moved) preview(p.catalogId, p.rot, p.id);
      }
    }
    if (s.selectedHouseId) {
      const lot = this.lotOf(db.houses[s.selectedHouseId]);
      if (lot) cellRect(g, lot.x, lot.y, lot.w, lot.h, 0xfff1c9, 0.12);
    }
  }

  // ───────────────────────────── API de navegação ─────────────────────────────

  private walkable(): Uint8Array {
    if (!this.grid) {
      const db = getDb();
      this.grid = walkGrid({ plan: this.plan, occupiedLots: new Set(liveHouses(db).map((h) => h.lotId)), solidCells: citySolidCells(db, this.plan) });
    }
    return this.grid;
  }

  private async walkTo(cell: Cell): Promise<boolean> {
    const settings = getDb().meta.world?.settings;
    const route = findPath(this.walkable(), this.plan.w, this.plan.h, this.avatar.cell, cell);
    if (!route) return false;
    const instant = !settings?.showAvatar || settings.reduceMotion;
    const cam = this.cameras.main;
    if (!instant) cam.startFollow(this.avatar.sprite, true, 0.08, 0.08, 0, 18);
    const ok = await this.avatar.walk(route, instant);
    if (instant) this.cam.focus(this.avatar.sprite.x, this.avatar.sprite.y - 18);
    return ok;
  }

  private api: CityApi = {
    walkToCell: (cell) => this.walkTo(cell),
    walkToHouse: async (houseId) => {
      const lot = this.lotOf(getDb().houses[houseId]);
      if (!lot) return false;
      const ok = await this.walkTo(lot.door);
      if (ok) this.avatar.face('up');
      return ok;
    },
    walkToSite: async (site) => {
      const ok = await this.walkTo(this.plan.sites[site].door);
      if (ok) this.avatar.face(site === 'mesa' || site === 'feira' ? 'down' : 'up');
      return ok;
    },
    enterHouse: (houseId) =>
      new Promise<void>((resolve) => {
        const v = this.houses.get(houseId);
        if (!v || prefersReducedMotion()) return resolve();
        this.entering = true;
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.pan(v.body.x + v.body.width / 2, v.body.y - 36, 420, 'Sine.easeInOut', true);
        cam.zoomTo(Math.min(5, Math.max(cam.zoom * 1.5, 3.2)), 420, 'Sine.easeInOut', true);
        this.avatar.sprite.setVisible(false);
        this.tweens.add({ targets: v.roof, alpha: 0, duration: 380 });
        // Temporizadores reais: a entrada nunca fica presa se a taxa de quadros cair.
        window.setTimeout(() => {
          if (this.scene.isActive()) cam.fadeOut(140, 20, 14, 10);
          window.setTimeout(resolve, 150);
        }, 430);
      }),
    focusCell: (x, y) => this.cam.focus(x * TILE + TILE / 2, y * TILE + TILE / 2),
    focusHouse: (houseId) => {
      const lot = this.lotOf(getDb().houses[houseId]);
      if (lot) this.cam.focus((lot.x + 3.5) * TILE, (lot.y + 2.5) * TILE);
    },
    placeAvatarAtHouse: (houseId) => {
      const lot = this.lotOf(getDb().houses[houseId]);
      if (lot) this.avatar.teleport(lot.door);
    },
    placeAvatarAtSite: (site) => this.avatar.teleport(this.plan.sites[site].door),
    zoomBy: (f) => this.cam.zoomBy(f),
    panBy: (dx, dy) => this.cam.panBy(dx, dy),
  };

  // ───────────────────────────── Laço ─────────────────────────────

  update(_time: number, smoothed: number): void {
    // Tempo real (sem suavização): a viagem dura o mesmo em máquinas lentas.
    const delta = Math.min(250, this.game.loop.rawDelta || smoothed);
    this.avatar.update(delta);
    const spots = this.data.get('spots') as Cell[] | undefined;
    for (const v of this.villagers) {
      v.w.update(delta);
      if (v.w.moving) continue;
      v.wait -= delta;
      if (v.wait > 0 || !spots) continue;
      const target = spots[Math.floor(Math.random() * spots.length)];
      const route = findPath(this.walkable(), this.plan.w, this.plan.h, v.w.cell, target);
      v.wait = 2500 + Math.random() * 6000;
      if (route && route.length > 1) void v.w.walk(route);
    }
    this.labels.update();
    this.viewClock -= delta;
    if (this.viewClock <= 0) {
      this.viewClock = 150;
      const cam = this.cameras.main;
      const wv = cam.worldView;
      const cur = uiStore.getState();
      const a = this.avatar.cell;
      if (Math.abs(cur.view.x - wv.x) > 0.5 || Math.abs(cur.view.y - wv.y) > 0.5 || Math.abs(cur.view.w - wv.width) > 0.5 || cur.avatar?.x !== a.x || cur.avatar?.y !== a.y)
        uiStore.setState({ view: { x: wv.x, y: wv.y, w: wv.width, h: wv.height, worldW: this.plan.w * TILE, worldH: this.plan.h * TILE }, avatar: { x: a.x, y: a.y } });
    }
  }
}
