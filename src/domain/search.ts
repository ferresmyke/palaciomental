/**
 * Busca universal: nome, descrição e conteúdo, incluindo campos de modelos personalizados.
 */
import { fieldText } from './ops';
import { bookAddress, taskAddress } from './selectors';
import type { Db, ID } from './types';
import { normalize } from './util';

export interface SearchResult {
  kind: 'house' | 'furniture' | 'book' | 'task' | 'goal';
  id: ID;
  title: string;
  typeLabel: string;
  address: string;
  snippet: string;
  score: number;
  houseId: ID | null;
  furnitureId: ID | null;
}

function scoreOf(title: string, body: string, terms: string[]): { score: number; where: 'title' | 'body' | null } {
  const nt = normalize(title);
  const nb = normalize(body);
  let score = 0;
  let where: 'title' | 'body' | null = null;
  for (const term of terms) {
    const it = nt.indexOf(term);
    if (it >= 0) {
      score += it === 0 ? 12 : 8;
      where = 'title';
      continue;
    }
    if (nb.includes(term)) {
      score += 3;
      where ??= 'body';
      continue;
    }
    return { score: 0, where: null };
  }
  return { score, where };
}

function snippetOf(body: string, terms: string[]): string {
  const nb = normalize(body);
  for (const term of terms) {
    const i = nb.indexOf(term);
    if (i < 0) continue;
    const start = Math.max(0, i - 30);
    const text = body.slice(start, i + term.length + 50).replace(/\s+/g, ' ');
    return (start > 0 ? '…' : '') + text + (i + term.length + 50 < body.length ? '…' : '');
  }
  return '';
}

export function search(db: Db, query: string, limit = 40): SearchResult[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out: SearchResult[] = [];
  const worldName = db.meta.world?.name ?? 'Recanto';

  for (const h of Object.values(db.houses)) {
    if (h.trash || h.hidden) continue;
    const { score } = scoreOf(h.name, '', terms);
    if (score) out.push({ kind: 'house', id: h.id, title: h.name, typeLabel: 'Casa', address: `${worldName} › ${h.name}`, snippet: '', score: score + 2, houseId: h.id, furnitureId: null });
  }
  for (const f of Object.values(db.furniture)) {
    if (f.trash || f.kind !== 'container') continue;
    const house = db.houses[f.houseId];
    if (!house || house.trash) continue;
    const { score } = scoreOf(f.name, '', terms);
    if (score) out.push({ kind: 'furniture', id: f.id, title: f.name, typeLabel: 'Móvel', address: `${worldName} › ${house.name} › ${f.name}`, snippet: '', score: score + 1, houseId: house.id, furnitureId: f.id });
  }
  for (const b of Object.values(db.books)) {
    if (b.trash) continue;
    const tpl = db.templates[b.templateId];
    const bits: string[] = [];
    for (const def of tpl?.fields ?? []) {
      if (def.hidden) continue;
      const text = fieldText(db, def, b.fields[def.id]);
      if (text) bits.push(`${def.name}: ${text}`);
    }
    if (b.project?.description) bits.push(b.project.description);
    for (const bl of b.blocks) {
      if (bl.type === 'text' || bl.type === 'heading') bits.push(bl.text);
      else if (bl.type === 'checklist') bits.push(bl.items.map((i) => i.text).join(' '));
      else if (bl.type === 'link') bits.push(`${bl.label} ${bl.url}`);
      else if (bl.type === 'table') bits.push(bl.rows.map((r) => r.join(' ')).join(' '));
      else if (bl.type === 'file' || bl.type === 'image') bits.push(`${bl.caption} ${bl.attachmentId ? (db.attachments[bl.attachmentId]?.name ?? '') : ''}`);
      else if (bl.type === 'date') bits.push(bl.label);
    }
    const body = bits.join(' · ');
    const { score, where } = scoreOf(b.title, body, terms);
    if (!score) continue;
    const a = bookAddress(db, b);
    out.push({
      kind: 'book',
      id: b.id,
      title: b.title,
      typeLabel: tpl?.name ?? 'Livro',
      address: a.text,
      snippet: where === 'body' ? snippetOf(body, terms) : '',
      score: score - (b.archivedAt ? 2 : 0),
      houseId: a.houseId,
      furnitureId: a.furnitureId,
    });
  }
  for (const t of Object.values(db.tasks)) {
    if (t.trash) continue;
    const body = [t.description, t.notes, t.checklist.map((c) => c.text).join(' '), t.links.map((l) => `${l.label} ${l.url}`).join(' '), t.tagIds.map((id) => db.tags[id]?.name ?? '').join(' ')].join(' · ');
    const { score, where } = scoreOf(t.title, body, terms);
    if (!score) continue;
    const a = taskAddress(db, t);
    out.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      typeLabel: 'Tarefa',
      address: a.text,
      snippet: where === 'body' ? snippetOf(body, terms) : '',
      score: score - (t.status === 'done' || t.status === 'archived' ? 2 : 0),
      houseId: a.houseId,
      furnitureId: a.furnitureId,
    });
  }
  for (const g of Object.values(db.goals)) {
    if (g.trash) continue;
    const { score, where } = scoreOf(g.title, g.description, terms);
    if (!score) continue;
    const c = db.constellations[g.constellationId];
    out.push({
      kind: 'goal',
      id: g.id,
      title: g.title,
      typeLabel: 'Objetivo',
      address: `${worldName} › Observatório › ${c?.name ?? 'Constelação'} › ${g.title}`,
      snippet: where === 'body' ? snippetOf(g.description, terms) : '',
      score,
      houseId: null,
      furnitureId: null,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'pt-BR')).slice(0, limit);
}
