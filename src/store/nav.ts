/**
 * Navegação e viagem: leva o usuário (e o avatar) até casas, móveis, livros e objetivos.
 * Conversa com as cenas apenas pelo contrato de gameApi.
 */
import type { SiteId } from '@/domain/city';
import { liveHouses } from '@/domain/selectors';
import type { ID } from '@/domain/types';
import { getDb } from './db';
import { gameApi, gameBus } from './gameApi';
import { ui, uiStore, type Panel, type Place } from './ui';

let token = 0;

function waitScene(kind: Place['kind'], ms = 5000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve();
    }, ms);
    const off = gameBus.on('scene:ready', (k) => {
      if (k !== kind) return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

async function setPlace(place: Place): Promise<void> {
  const cur = uiStore.getState().place;
  if (JSON.stringify(cur) === JSON.stringify(place)) return;
  const ready = waitScene(place.kind);
  uiStore.setState({
    place,
    cameFrom: cur,
    panels: [],
    reform: false,
    selectedId: null,
    selectedHouseId: null,
    placing: null,
    movingHouseId: null,
    hint: null,
    dragItem: null,
  });
  await ready;
}

function begin(): number {
  uiStore.setState({ traveling: true });
  return ++token;
}

function end(my: number): boolean {
  const mine = my === token;
  if (mine) uiStore.setState({ traveling: false });
  return mine;
}

async function ensureCity(): Promise<void> {
  if (uiStore.getState().place.kind !== 'city') await setPlace({ kind: 'city' });
}

/** Sai da casa (ou do Observatório) de volta para a cidade. */
export async function leaveToCity(): Promise<void> {
  const my = begin();
  ui.closeAll();
  if (uiStore.getState().place.kind === 'house') await gameApi.interior?.walkToDoor();
  if (my === token) await setPlace({ kind: 'city' });
  end(my);
}

export async function goToPlaza(): Promise<void> {
  const my = begin();
  ui.closeAll();
  await ensureCity();
  if (my === token) await gameApi.city?.walkToSite('fonte');
  end(my);
}

export async function goToSite(site: SiteId, panel?: Panel): Promise<void> {
  const my = begin();
  ui.closeAll();
  await ensureCity();
  if (my === token) await gameApi.city?.walkToSite(site);
  if (end(my) && panel) ui.open(panel);
}

export async function goToHouse(houseId: ID): Promise<boolean> {
  const place = uiStore.getState().place;
  if (place.kind === 'house' && place.houseId === houseId) return true;
  const house = getDb().houses[houseId];
  if (!house || house.trash) return false;
  const my = begin();
  ui.closeAll();
  await ensureCity();
  if (my !== token) return false;
  await gameApi.city?.walkToHouse(houseId);
  if (my !== token) return false;
  await gameApi.city?.enterHouse(houseId);
  if (my !== token) return false;
  await setPlace({ kind: 'house', houseId });
  return end(my);
}

export async function goToObservatory(): Promise<boolean> {
  if (uiStore.getState().place.kind === 'observatory') return true;
  const my = begin();
  ui.closeAll();
  await ensureCity();
  if (my !== token) return false;
  await gameApi.city?.walkToSite('observatorio');
  if (my !== token) return false;
  await setPlace({ kind: 'observatory' });
  return end(my);
}

export async function goToFurniture(furnitureId: ID, open = true): Promise<boolean> {
  const f = getDb().furniture[furnitureId];
  if (!f || f.trash) return false;
  if (!(await goToHouse(f.houseId))) return false;
  const my = begin();
  await gameApi.interior?.walkToFurniture(furnitureId);
  if (!end(my)) return false;
  if (open) {
    if (f.kind === 'container') ui.open({ type: 'furniture', id: f.id });
    else if (f.role === 'desk') ui.open({ type: 'desk', houseId: f.houseId });
    else if (f.role === 'board') ui.open({ type: 'board', houseId: f.houseId });
    else ui.open({ type: 'chest', houseId: f.houseId });
  }
  return true;
}

function essentialId(houseId: ID, role: 'desk' | 'board' | 'chest'): ID | undefined {
  return Object.values(getDb().furniture).find((f) => f.houseId === houseId && f.role === role && !f.trash)?.id;
}

/** Viagem até um livro: o avatar anda até a casa, abre o móvel e o livro fica em destaque. */
export async function goToBook(bookId: ID): Promise<void> {
  const b = getDb().books[bookId];
  if (!b || b.trash) return;
  if (!b.houseId) {
    await goToSite('correio', b.archivedAt ? { type: 'chest', houseId: null } : { type: 'correio' });
  } else if (b.archivedAt) {
    const chest = essentialId(b.houseId, 'chest');
    if (chest) await goToFurniture(chest);
    else await goToHouse(b.houseId);
  } else if (b.furnitureId && getDb().furniture[b.furnitureId] && !getDb().furniture[b.furnitureId].trash) {
    if (!(await goToFurniture(b.furnitureId))) return;
  } else if (!(await goToHouse(b.houseId))) return;
  ui.push({ type: 'book', id: bookId });
  ui.highlight({ kind: 'book', id: bookId });
}

export async function goToTask(taskId: ID): Promise<void> {
  const t = getDb().tasks[taskId];
  if (!t || t.trash) return;
  if (t.bookId && getDb().books[t.bookId] && !getDb().books[t.bookId].trash) {
    await goToBook(t.bookId);
  } else if (t.houseId) {
    const role = t.status === 'done' || t.status === 'archived' ? 'chest' : t.onDesk ? 'desk' : null;
    const fid = role ? essentialId(t.houseId, role) : undefined;
    if (fid) await goToFurniture(fid);
    else if (!(await goToHouse(t.houseId))) return;
  } else await goToSite('correio', { type: 'correio' });
  ui.push({ type: 'task', id: taskId });
  ui.highlight({ kind: 'task', id: taskId });
}

export async function goToGoal(goalId: ID): Promise<void> {
  if (!(await goToObservatory())) return;
  ui.open({ type: 'goal', id: goalId });
  ui.highlight({ kind: 'goal', id: goalId });
  gameApi.observatory?.focusGoal(goalId);
}

/** Viagem rápida pelos atalhos 1–6 (ordem das casas). */
export function goToHouseByIndex(index: number): void {
  const h = liveHouses(getDb())[index];
  if (h) void goToHouse(h.id);
}

/** Botão voltar: fecha o painel de cima; sem painéis, sai para a cidade. */
export function goBack(): void {
  const s = uiStore.getState();
  if (s.dialog) return ui.closeDialog();
  if (s.capture) return ui.setCapture(false);
  if (s.panels.length) return ui.back();
  if (s.placing || s.selectedId || s.selectedHouseId || s.movingHouseId) return ui.select(null);
  if (s.reform) return ui.setReform(false);
  if (s.place.kind !== 'city') void leaveToCity();
}
