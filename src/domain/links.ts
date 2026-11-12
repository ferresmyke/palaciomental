/**
 * Conexões entre livros: referências (blocos e campos) e [[wikilinks]] no texto.
 * Os links são só leitura derivada: nada aqui é copiado nem guardado à parte.
 */
import type { Book, Db, ID, Task } from './types';
import { normalize } from './util';

const WIKI = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export interface TitleIndex {
  byTitle: Map<string, Book[]>;
}

export function titleIndex(db: Db): TitleIndex {
  const byTitle = new Map<string, Book[]>();
  for (const b of Object.values(db.books)) {
    if (b.trash) continue;
    const k = normalize(b.title);
    byTitle.set(k, [...(byTitle.get(k) ?? []), b]);
  }
  return { byTitle };
}

export function resolveWikilink(idx: TitleIndex, title: string, from: Book): Book | null {
  const t = title.includes('/') ? title.slice(title.lastIndexOf('/') + 1) : title;
  const list = idx.byTitle.get(normalize(t.replace(/\.md$/i, ''))) ?? [];
  const others = list.filter((b) => b.id !== from.id);
  return others.find((b) => b.houseId === from.houseId) ?? others[0] ?? null;
}

/** Livros que este livro cita. */
export function outLinks(db: Db, b: Book, idx: TitleIndex = titleIndex(db)): Book[] {
  const ids = new Set<ID>();
  const add = (id: ID | null | undefined) => {
    const x = id ? db.books[id] : undefined;
    if (x && !x.trash && x.id !== b.id) ids.add(x.id);
  };
  const scan = (text: string) => {
    for (const m of text.matchAll(WIKI)) add(resolveWikilink(idx, m[1].trim(), b)?.id);
  };
  for (const bl of b.blocks) {
    if (bl.type === 'bookref') add(bl.bookId);
    else if (bl.type === 'text' || bl.type === 'heading') scan(bl.text);
    else if (bl.type === 'checklist') bl.items.forEach((i) => scan(i.text));
  }
  const tpl = db.templates[b.templateId];
  for (const def of tpl?.fields ?? []) {
    if (def.hidden) continue;
    const v = b.fields[def.id];
    if (def.type === 'bookref' && typeof v === 'string') add(v);
    else if ((def.type === 'text' || def.type === 'longtext') && typeof v === 'string') scan(v);
  }
  return [...ids].map((id) => db.books[id]);
}

export interface BookLinks {
  out: Book[];
  back: Book[];
  /** Tarefas que referenciam este livro. */
  tasks: Task[];
}

export function bookLinks(db: Db, id: ID): BookLinks {
  const b = db.books[id];
  if (!b) return { out: [], back: [], tasks: [] };
  const idx = titleIndex(db);
  const back: Book[] = [];
  for (const o of Object.values(db.books)) {
    if (o.trash || o.id === id) continue;
    if (outLinks(db, o, idx).some((x) => x.id === id)) back.push(o);
  }
  const tasks = Object.values(db.tasks).filter((t) => !t.trash && t.refs.includes(id));
  return { out: outLinks(db, b, idx), back, tasks };
}

export interface GraphNode {
  id: ID;
  title: string;
  houseId: ID | null;
  degree: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: { a: ID; b: ID }[];
  truncated: boolean;
}

export const MAX_GRAPH_NODES = 120;

/** Grafo de conexões: em volta de um livro (até `depth` passos) ou o Recanto inteiro. */
export function buildGraph(db: Db, centerId: ID | null, depth = 2): Graph {
  const idx = titleIndex(db);
  const adj = new Map<ID, Set<ID>>();
  const edgeKeys = new Set<string>();
  const link = (a: ID, b: ID) => {
    if (a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    edgeKeys.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  };
  for (const b of Object.values(db.books)) if (!b.trash) for (const o of outLinks(db, b, idx)) link(b.id, o.id);
  let keep: Set<ID>;
  if (centerId && db.books[centerId]) {
    keep = new Set([centerId]);
    let frontier = [centerId];
    for (let d = 0; d < depth; d++) {
      const next: ID[] = [];
      for (const id of frontier) for (const n of adj.get(id) ?? []) if (!keep.has(n)) (keep.add(n), next.push(n));
      frontier = next;
    }
  } else keep = new Set(adj.keys());
  let ids = [...keep];
  let truncated = false;
  if (ids.length > MAX_GRAPH_NODES) {
    truncated = true;
    ids = ids.sort((a, b) => (a === centerId ? -1 : b === centerId ? 1 : (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0))).slice(0, MAX_GRAPH_NODES);
  }
  const set = new Set(ids);
  const edges = [...edgeKeys].map((k) => k.split('|') as [ID, ID]).filter(([a, b]) => set.has(a) && set.has(b)).map(([a, b]) => ({ a, b }));
  const nodes = ids.map((id) => ({ id, title: db.books[id].title, houseId: db.books[id].houseId, degree: adj.get(id)?.size ?? 0 }));
  return { nodes, edges, truncated };
}

/** Posições por força (Fruchterman-Reingold), determinísticas. Coordenadas em [0, w] × [0, h]. */
export function layoutGraph(g: Graph, w: number, h: number, centerId: ID | null): Map<ID, { x: number; y: number }> {
  const n = g.nodes.length;
  const pos = new Map<ID, { x: number; y: number; dx: number; dy: number }>();
  g.nodes.forEach((node, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = node.id === centerId ? 0 : Math.min(w, h) * 0.32;
    pos.set(node.id, { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, dx: 0, dy: 0 });
  });
  const k = Math.sqrt((w * h) / Math.max(1, n)) * 0.75;
  let temp = Math.min(w, h) / 6;
  for (let it = 0; it < 220; it++) {
    for (const p of pos.values()) (p.dx = 0), (p.dy = 0);
    const list = [...pos.entries()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [, p] = list[i];
        const [, q] = list[j];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) (dx = 0.1 * (i - j)), (dy = 0.1), (d = Math.hypot(dx, dy));
        const f = (k * k) / d;
        p.dx += (dx / d) * f;
        p.dy += (dy / d) * f;
        q.dx -= (dx / d) * f;
        q.dy -= (dy / d) * f;
      }
    for (const e of g.edges) {
      const p = pos.get(e.a)!;
      const q = pos.get(e.b)!;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      p.dx -= (dx / d) * f;
      p.dy -= (dy / d) * f;
      q.dx += (dx / d) * f;
      q.dy += (dy / d) * f;
    }
    for (const [id, p] of pos) {
      // gravidade suave ao centro, para componentes soltos não fugirem
      p.dx += (w / 2 - p.x) * 0.06;
      p.dy += (h / 2 - p.y) * 0.06;
      const d = Math.max(0.01, Math.hypot(p.dx, p.dy));
      const m = Math.min(d, temp);
      if (id !== centerId) {
        p.x += (p.dx / d) * m;
        p.y += (p.dy / d) * m;
      }
      p.x = Math.min(w - 40, Math.max(40, p.x));
      p.y = Math.min(h - 24, Math.max(24, p.y));
    }
    temp *= 0.985;
  }
  return new Map([...pos].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}
