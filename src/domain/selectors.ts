/**
 * Leituras derivadas do banco. Tudo calculado: nada aqui é digitado pelo usuário.
 */
import { fieldText, TRASH_DAYS } from './ops';
import type { Book, Db, Furniture, Goal, House, ID, Task, Template } from './types';
import { addDays, diffDays, humanDate, nextOccurrence, plural, today } from './util';

const live = <T extends { trash?: unknown }>(x: T | undefined): x is T => !!x && !x.trash;

export function world(db: Db) {
  return db.meta.world;
}

export function liveHouses(db: Db, includeHidden = false): House[] {
  return Object.values(db.houses)
    .filter((h) => !h.trash && (includeHidden || !h.hidden))
    .sort((a, b) => a.order - b.order);
}

export function houseFurniture(db: Db, houseId: ID): Furniture[] {
  return Object.values(db.furniture)
    .filter((f) => f.houseId === houseId && !f.trash)
    .sort((a, b) => a.order - b.order);
}

export function containers(db: Db, houseId: ID): Furniture[] {
  return houseFurniture(db, houseId).filter((f) => f.kind === 'container');
}

export function essential(db: Db, houseId: ID, role: Furniture['role']): Furniture | undefined {
  return houseFurniture(db, houseId).find((f) => f.role === role);
}

const isOpenTask = (t: Task) => !t.trash && t.status !== 'done' && t.status !== 'archived';
const isShelved = (b: Book) => !b.trash && !b.archivedAt;

export function furnitureBooks(db: Db, furnitureId: ID): Book[] {
  const f = db.furniture[furnitureId];
  const list = Object.values(db.books).filter((b) => b.furnitureId === furnitureId && isShelved(b));
  const sort = f?.sort ?? 'manual';
  if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  if (sort === 'date') return list.sort((a, b) => b.createdAt - a.createdAt);
  if (sort === 'type')
    return list.sort(
      (a, b) =>
        (db.templates[a.templateId]?.name ?? '').localeCompare(db.templates[b.templateId]?.name ?? '', 'pt-BR') ||
        a.title.localeCompare(b.title, 'pt-BR'),
    );
  return list.sort((a, b) => a.order - b.order);
}

export function floorBooks(db: Db, houseId: ID): Book[] {
  return Object.values(db.books)
    .filter((b) => b.houseId === houseId && !b.furnitureId && isShelved(b))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function floorTasks(db: Db, houseId: ID): Task[] {
  return Object.values(db.tasks)
    .filter((t) => t.houseId === houseId && !t.bookId && !t.onDesk && isOpenTask(t))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface LooseItem {
  kind: 'book' | 'task';
  id: ID;
  title: string;
  createdAt: number;
}

/** Itens soltos de uma casa (no chão) ou do Correio (houseId = null). */
export function looseItems(db: Db, houseId: ID | null): LooseItem[] {
  const out: LooseItem[] = [];
  for (const b of Object.values(db.books))
    if (b.houseId === houseId && !b.furnitureId && isShelved(b)) out.push({ kind: 'book', id: b.id, title: b.title, createdAt: b.createdAt });
  for (const t of Object.values(db.tasks))
    if (t.houseId === houseId && isOpenTask(t) && (houseId === null || (!t.bookId && !t.onDesk)))
      out.push({ kind: 'task', id: t.id, title: t.title, createdAt: t.createdAt });
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export function inboxCount(db: Db): number {
  return looseItems(db, null).length;
}

export function houseTasks(db: Db, houseId: ID): Task[] {
  return Object.values(db.tasks).filter((t) => t.houseId === houseId && !t.trash);
}

export function bookTasks(db: Db, bookId: ID): Task[] {
  return Object.values(db.tasks)
    .filter((t) => t.bookId === bookId && !t.trash)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Livros "abertos na mesa": fixados pelo usuário ou com tarefa em andamento. */
export function deskBooks(db: Db, houseId: ID): Book[] {
  const active = new Set<ID>();
  for (const t of Object.values(db.tasks)) if (t.bookId && !t.trash && t.status === 'doing') active.add(t.bookId);
  return Object.values(db.books)
    .filter((b) => b.houseId === houseId && isShelved(b) && (b.pinnedOpen || active.has(b.id)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deskTasks(db: Db, houseId: ID): Task[] {
  return Object.values(db.tasks)
    .filter((t) => t.houseId === houseId && t.onDesk && !t.bookId && isOpenTask(t))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function chestBooks(db: Db, houseId: ID | null): Book[] {
  return Object.values(db.books)
    .filter((b) => b.houseId === houseId && !b.trash && !!b.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}

export function chestTasks(db: Db, houseId: ID | null): Task[] {
  return Object.values(db.tasks)
    .filter((t) => t.houseId === houseId && !t.trash && (t.status === 'done' || t.status === 'archived'))
    .sort((a, b) => (b.completedAt ?? b.archivedAt ?? 0) - (a.completedAt ?? a.archivedAt ?? 0));
}

// ───────────────────────────── Prazos e risco ─────────────────────────────

export type Risk = 'overdue' | 'today' | 'soon' | 'none';

export const RISK_LABEL: Record<Risk, string> = { overdue: 'Atrasada', today: 'Vence hoje', soon: 'Prazo próximo', none: '' };
export const RISK_SYMBOL: Record<Risk, string> = { overdue: '⚑', today: '◉', soon: '◔', none: '' };

/** Risco de atraso: calculado do prazo e do status, separado de status e prioridade. */
export function taskRisk(t: Pick<Task, 'dueDate' | 'status'>, now: number = Date.now()): Risk {
  if (!t.dueDate || t.status === 'done' || t.status === 'archived') return 'none';
  const d = diffDays(today(now), t.dueDate);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'none';
}

// ───────────────────────────── Progresso ─────────────────────────────

export interface Progress {
  done: number;
  total: number;
  ratio: number;
}

/** Progresso do projeto: tarefas concluídas sobre o total de tarefas válidas. */
export function projectProgress(db: Db, bookId: ID): Progress {
  let done = 0;
  let total = 0;
  for (const t of Object.values(db.tasks)) {
    if (t.bookId !== bookId || t.trash) continue;
    if (t.status === 'archived' && !t.completedAt) continue;
    total++;
    if (t.status === 'done' || (t.status === 'archived' && t.completedAt)) done++;
  }
  const b = db.books[bookId];
  if (total === 0) return { done: 0, total: 0, ratio: b?.project?.status === 'done' ? 1 : 0 };
  return { done, total, ratio: done / total };
}

export type GoalState = 'nopath' | 'dormant' | 'active' | 'done';

export function goalProjects(db: Db, g: Goal): Book[] {
  return g.projectIds.map((id) => db.books[id]).filter((b): b is Book => live(b) && !!b.project);
}

/** Progresso do objetivo: média do progresso dos projetos ligados. */
export function goalProgress(db: Db, g: Goal): { ratio: number; state: GoalState; projects: number } {
  const projects = goalProjects(db, g);
  if (g.dormant) return { ratio: 0, state: 'dormant', projects: projects.length };
  if (!projects.length) return { ratio: 0, state: 'nopath', projects: 0 };
  const ratio = projects.reduce((s, b) => s + projectProgress(db, b.id).ratio, 0) / projects.length;
  return { ratio, state: ratio >= 1 ? 'done' : 'active', projects: projects.length };
}

// ───────────────────────────── Arrumação ─────────────────────────────

export const TIDY_LABELS = ['Em arrumação', 'Acolhedora', 'Organizada', 'Esmerada'] as const;

export interface Tidy {
  total: number;
  stored: number;
  loose: number;
  index: number;
  level: 0 | 1 | 2 | 3;
  label: string;
}

/**
 * Índice de arrumação = itens guardados / total de itens da casa.
 * Fórmula e limiares documentados em docs/DATA_MODEL.md.
 */
export function tidy(db: Db, houseId: ID): Tidy {
  let total = 0;
  let stored = 0;
  for (const b of Object.values(db.books)) {
    if (b.houseId !== houseId || !isShelved(b)) continue;
    total++;
    if (b.furnitureId && live(db.furniture[b.furnitureId])) stored++;
  }
  for (const t of Object.values(db.tasks)) {
    if (t.houseId !== houseId || !isOpenTask(t)) continue;
    total++;
    if (t.bookId || t.onDesk) stored++;
  }
  const loose = total - stored;
  const index = total === 0 ? 1 : stored / total;
  let level: Tidy['level'];
  if (total === 0) level = 1;
  else if (loose === 0) level = 3;
  else if (index >= 0.85 || loose <= 1) level = 2;
  else if (index >= 0.6 || loose <= 3) level = 1;
  else level = 0;
  return { total, stored, loose, index, level, label: TIDY_LABELS[level] };
}

export type ActivityState = 'tranquila' | 'movimentada' | 'urgencia';

export interface Activity {
  open: number;
  doing: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  state: ActivityState;
  nextDue: Task | null;
}

export function houseActivity(db: Db, houseId: ID, now: number = Date.now()): Activity {
  const a: Activity = { open: 0, doing: 0, overdue: 0, dueToday: 0, dueSoon: 0, state: 'tranquila', nextDue: null };
  for (const t of Object.values(db.tasks)) {
    if (t.houseId !== houseId || !isOpenTask(t)) continue;
    a.open++;
    if (t.status === 'doing') a.doing++;
    const r = taskRisk(t, now);
    if (r === 'overdue') a.overdue++;
    else if (r === 'today') a.dueToday++;
    else if (r === 'soon') a.dueSoon++;
    if (t.dueDate && r !== 'overdue' && (!a.nextDue || t.dueDate < a.nextDue.dueDate!)) a.nextDue = t;
  }
  if (a.overdue > 0 || a.dueToday > 0) a.state = 'urgencia';
  else if (a.doing > 0 || a.open >= 4) a.state = 'movimentada';
  return a;
}

/** Linha de resumo ao entrar na casa. Voz do app: curta, calma, direta. */
export function houseSummary(db: Db, houseId: ID, now: number = Date.now()): string {
  const loose = looseItems(db, houseId).length;
  const a = houseActivity(db, houseId, now);
  const parts: string[] = [];
  if (loose) parts.push(`${plural(loose, 'item solto', 'itens soltos')}.`);
  if (a.overdue) parts.push(`${plural(a.overdue, 'atrasada', 'atrasadas')}.`);
  if (a.nextDue?.dueDate) parts.push(`1 prazo ${prazoWhen(a.nextDue.dueDate, now)}.`);
  if (!parts.length) return 'Tudo no lugar.';
  return parts.join(' ');
}

function prazoWhen(date: string, now: number): string {
  const h = humanDate(date, now);
  if (h === 'hoje' || h === 'amanhã' || h === 'ontem') return h;
  if (/^\d/.test(h)) return `em ${h}`;
  return h === 'sábado' || h === 'domingo' ? `no ${h}` : `na ${h}`;
}

// ───────────────────────────── Endereço ─────────────────────────────

export interface Address {
  parts: string[];
  houseId: ID | null;
  furnitureId: ID | null;
  bookId: ID | null;
  text: string;
}

function mkAddress(db: Db, parts: string[], houseId: ID | null, furnitureId: ID | null, bookId: ID | null): Address {
  const full = [world(db)?.name ?? 'Recanto', ...parts];
  return { parts: full, houseId, furnitureId, bookId, text: full.join(' › ') };
}

/** Endereço lógico de um livro: casa › móvel › livro. Nunca depende de status ou urgência. */
export function bookAddress(db: Db, b: Book): Address {
  const house = b.houseId ? db.houses[b.houseId] : undefined;
  const furn = b.furnitureId ? db.furniture[b.furnitureId] : undefined;
  const parts: string[] = [];
  if (!house) parts.push(b.archivedAt ? 'Arquivo geral' : 'Correio');
  else {
    parts.push(house.name);
    if (b.archivedAt) parts.push('Baú');
    else parts.push(live(furn) ? furn.name : 'Chão');
  }
  parts.push(b.title);
  return mkAddress(db, parts, house?.id ?? null, live(furn) ? furn.id : null, b.id);
}

export function taskAddress(db: Db, t: Task): Address {
  const b = t.bookId ? db.books[t.bookId] : undefined;
  if (live(b)) {
    const a = bookAddress(db, b);
    return mkAddress(db, [...a.parts.slice(1), t.title], a.houseId, a.furnitureId, b.id);
  }
  const house = t.houseId ? db.houses[t.houseId] : undefined;
  if (!house) return mkAddress(db, [t.status === 'archived' ? 'Arquivo geral' : 'Correio', t.title], null, null, null);
  const where = t.status === 'done' || t.status === 'archived' ? 'Baú' : t.onDesk ? 'Mesa de trabalho' : 'Chão';
  return mkAddress(db, [house.name, where, t.title], house.id, null, null);
}

// ───────────────────────────── Mesa do Dia ─────────────────────────────

export type AgendaSection = 'today' | 'week' | 'overdue' | 'urgent' | 'doing' | 'waiting' | 'done';

export const AGENDA_LABEL: Record<AgendaSection, string> = {
  today: 'Hoje',
  week: 'Próximos sete dias',
  overdue: 'Atrasadas',
  urgent: 'Urgentes',
  doing: 'Em andamento',
  waiting: 'Aguardando terceiros',
  done: 'Concluídas',
};

export const AGENDA_SECTIONS: AgendaSection[] = ['today', 'week', 'overdue', 'urgent', 'doing', 'waiting', 'done'];

export interface AgendaFilter {
  houseId?: ID | null;
  tagId?: ID | null;
}

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;

export function agenda(db: Db, now: number = Date.now(), filter: AgendaFilter = {}): Record<AgendaSection, Task[]> {
  const out: Record<AgendaSection, Task[]> = { today: [], week: [], overdue: [], urgent: [], doing: [], waiting: [], done: [] };
  const t0 = today(now);
  const t7 = addDays(t0, 7);
  for (const t of Object.values(db.tasks)) {
    if (t.trash || t.status === 'archived') continue;
    if (filter.houseId && t.houseId !== filter.houseId) continue;
    if (filter.tagId && !t.tagIds.includes(filter.tagId)) continue;
    if (t.status === 'done') {
      out.done.push(t);
      continue;
    }
    if (t.dueDate) {
      if (t.dueDate < t0) out.overdue.push(t);
      else if (t.dueDate === t0) out.today.push(t);
      else if (t.dueDate <= t7) out.week.push(t);
    }
    if (t.priority === 'critical' || t.priority === 'high') out.urgent.push(t);
    if (t.status === 'doing') out.doing.push(t);
    if (t.status === 'waiting') out.waiting.push(t);
  }
  const byDue = (a: Task, b: Task) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt;
  for (const k of AGENDA_SECTIONS) out[k].sort(byDue);
  out.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return out;
}

// ───────────────────────────── Ronda semanal ─────────────────────────────

export interface RondaCard {
  houseId: ID | null;
  name: string;
  loose: LooseItem[];
  overdue: Task[];
  stalled: Book[];
}

const STALL_DAYS = 14;

/** Projetos parados: com tarefas abertas e nenhuma atividade há duas semanas. */
export function stalledProjects(db: Db, houseId: ID, now: number = Date.now()): Book[] {
  const limit = now - STALL_DAYS * 86400000;
  return Object.values(db.books).filter((b) => {
    if (b.houseId !== houseId || !isShelved(b) || !b.project || b.project.status === 'done') return false;
    const tasks = bookTasks(db, b.id);
    const last = tasks.reduce((m, t) => Math.max(m, t.updatedAt), b.updatedAt);
    return last < limit;
  });
}

export function rondaCards(db: Db, now: number = Date.now()): RondaCard[] {
  const cards: RondaCard[] = [];
  const inbox = looseItems(db, null);
  if (inbox.length) cards.push({ houseId: null, name: 'Correio', loose: inbox, overdue: [], stalled: [] });
  for (const h of liveHouses(db)) {
    const overdue = houseTasks(db, h.id).filter((t) => taskRisk(t, now) === 'overdue');
    cards.push({ houseId: h.id, name: h.name, loose: looseItems(db, h.id), overdue, stalled: stalledProjects(db, h.id, now) });
  }
  return cards;
}

export function weekSummary(db: Db, now: number = Date.now()): { doneLastWeek: Task[]; dueNextWeek: Task[] } {
  const from = now - 7 * 86400000;
  const t0 = today(now);
  const t7 = addDays(t0, 7);
  const doneLastWeek = Object.values(db.tasks).filter((t) => !t.trash && t.completedAt !== null && t.completedAt >= from);
  const dueNextWeek = Object.values(db.tasks).filter((t) => isOpenTask(t) && !!t.dueDate && t.dueDate >= t0 && t.dueDate <= t7);
  return { doneLastWeek, dueNextWeek };
}

// ───────────────────────────── Quadro de avisos ─────────────────────────────

export interface Notice {
  kind: 'task' | 'project' | 'date';
  id: ID;
  title: string;
  date: string;
  risk: Risk;
}

export function boardNotices(db: Db, houseId: ID, now: number = Date.now()): Notice[] {
  const out: Notice[] = [];
  for (const t of Object.values(db.tasks))
    if (t.houseId === houseId && isOpenTask(t) && t.dueDate) out.push({ kind: 'task', id: t.id, title: t.title, date: t.dueDate, risk: taskRisk(t, now) });
  for (const b of Object.values(db.books)) {
    if (b.houseId !== houseId || !isShelved(b)) continue;
    if (b.project?.dueDate && b.project.status !== 'done')
      out.push({ kind: 'project', id: b.id, title: b.title, date: b.project.dueDate, risk: taskRisk({ dueDate: b.project.dueDate, status: b.project.status }, now) });
    const tpl = db.templates[b.templateId];
    for (const def of tpl?.fields ?? []) {
      if (def.hidden || def.type !== 'recurring') continue;
      const v = b.fields[def.id];
      if (typeof v !== 'string' || !v) continue;
      const next = nextOccurrence(v, now);
      if (diffDays(today(now), next) <= 30) out.push({ kind: 'date', id: b.id, title: `${def.name}: ${b.title}`, date: next, risk: taskRisk({ dueDate: next, status: 'pending' }, now) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ───────────────────────────── Lixeira ─────────────────────────────

export interface TrashEntry {
  batchId: ID;
  deletedAt: number;
  kind: 'house' | 'furniture' | 'book' | 'task' | 'goal' | 'template';
  label: string;
  count: number;
  daysLeft: number;
}

const KIND_RANK: TrashEntry['kind'][] = ['house', 'furniture', 'template', 'book', 'task', 'goal'];

export function trashEntries(db: Db, now: number = Date.now()): TrashEntry[] {
  const map = new Map<ID, TrashEntry>();
  const add = (kind: TrashEntry['kind'], label: string, e: { trash?: { batchId: ID; deletedAt: number } }) => {
    if (!e.trash) return;
    const cur = map.get(e.trash.batchId);
    const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((now - e.trash.deletedAt) / 86400000));
    if (!cur) map.set(e.trash.batchId, { batchId: e.trash.batchId, deletedAt: e.trash.deletedAt, kind, label, count: 1, daysLeft });
    else {
      cur.count++;
      if (KIND_RANK.indexOf(kind) < KIND_RANK.indexOf(cur.kind)) {
        cur.kind = kind;
        cur.label = label;
      }
    }
  };
  for (const h of Object.values(db.houses)) add('house', h.name, h);
  for (const f of Object.values(db.furniture)) add('furniture', f.name, f);
  for (const t of Object.values(db.templates)) add('template', t.name, t);
  for (const b of Object.values(db.books)) add('book', b.title, b);
  for (const t of Object.values(db.tasks)) add('task', t.title, t);
  for (const g of Object.values(db.goals)) add('goal', g.title, g);
  return [...map.values()].sort((a, b) => b.deletedAt - a.deletedAt);
}

// ───────────────────────────── Diversos ─────────────────────────────

export function liveTemplates(db: Db): Template[] {
  return Object.values(db.templates)
    .filter((t) => !t.trash)
    .sort((a, b) => Number(b.system) - Number(a.system) || a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'pt-BR'));
}

export function projectBooks(db: Db): Book[] {
  return Object.values(db.books).filter((b) => isShelved(b) && !!b.project);
}

export function liveGoals(db: Db): Goal[] {
  return Object.values(db.goals)
    .filter((g) => !g.trash)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function bookFieldSummary(db: Db, b: Book): string {
  const tpl = db.templates[b.templateId];
  if (!tpl) return '';
  const bits: string[] = [];
  for (const def of tpl.fields) {
    if (def.hidden || def.type === 'longtext' || def.type === 'checklist') continue;
    const text = fieldText(db, def, b.fields[def.id]);
    if (text) bits.push(text);
    if (bits.length >= 2) break;
  }
  return bits.join(' · ');
}

/** Conta quantos itens seriam afetados ao excluir uma casa ou móvel. */
export function contentCount(db: Db, target: { houseId?: ID; furnitureId?: ID }): { books: number; tasks: number } {
  let books = 0;
  let tasks = 0;
  for (const b of Object.values(db.books)) {
    if (b.trash) continue;
    if (target.furnitureId ? b.furnitureId === target.furnitureId : b.houseId === target.houseId) books++;
  }
  if (target.houseId) for (const t of Object.values(db.tasks)) if (!t.trash && t.houseId === target.houseId) tasks++;
  return { books, tasks };
}
