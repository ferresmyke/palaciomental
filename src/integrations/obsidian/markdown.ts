/**
 * Conversão entre livros do Recanto e notas Markdown do Obsidian.
 * O arquivo continua legível por quem nunca abriu o Recanto: propriedades YAML,
 * títulos, listas de tarefas, tabelas e links no formato convencional.
 */
import { changeBookTemplate } from '@/domain/ops';
import { TPL_NOTE } from '@/domain/seed';
import type { Block, Book, ChecklistItem, Db, FieldDef, FieldValue, ID, TaskStatus, Template } from '@/domain/types';
import { newId, toISODate } from '@/domain/util';
import { emitEntry, isDate, parseYaml, splitFrontmatter, type YamlEntry, type YamlValue } from './yaml';

export const FOLDERS = {
  inbox: '00 - Caixa de Entrada',
  areas: '10 - Áreas da Vida',
  system: '90 - Sistema/Recanto',
  attachments: '_Anexos',
} as const;

const BASE_KEYS = ['recanto_id', 'recanto_conflito_de', 'tipo', 'casa', 'movel', 'criado', 'atualizado', 'status', 'prazo', 'resumo'];
const STATUS_OUT: Partial<Record<TaskStatus, string>> = { planning: 'a_planejar', pending: 'pendente', doing: 'em_andamento', waiting: 'aguardando', done: 'concluido' };
const STATUS_IN: Record<string, TaskStatus> = { a_planejar: 'planning', pendente: 'pending', em_andamento: 'doing', aguardando: 'waiting', concluido: 'done', concluído: 'done' };
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

/** Hash de texto (cyrb53): detecta mudanças, não é criptografia. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')) + ':' + s.length;
}

/** Nome seguro para arquivo e pasta (Windows, macOS, Linux e Obsidian). */
export function sanitizeName(name: string): string {
  const s = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .trim();
  return s || 'Sem título';
}

/** Pasta onde o Recanto espera que a nota de um livro fique. */
export function dirFor(db: Db, b: Book): string {
  const house = b.houseId ? db.houses[b.houseId] : undefined;
  if (!house) return b.archivedAt ? `${FOLDERS.inbox}/Arquivo geral` : FOLDERS.inbox;
  const base = `${FOLDERS.areas}/${sanitizeName(house.name)}`;
  if (b.archivedAt) return `${base}/Baú`;
  const f = b.furnitureId ? db.furniture[b.furnitureId] : undefined;
  return f && !f.trash ? `${base}/${sanitizeName(f.name)}` : `${base}/Chão`;
}

/** Deduz casa e móvel a partir do caminho de uma nota nova criada no Obsidian. */
export function locateFromPath(db: Db, path: string): { houseId: ID | null; furnitureId: ID | null; archived: boolean } | null {
  const parts = path.split('/');
  if (parts[0] === FOLDERS.inbox) return { houseId: null, furnitureId: null, archived: parts[1] === 'Arquivo geral' };
  if (parts[0] !== FOLDERS.areas || parts.length < 3) return null;
  const house = Object.values(db.houses).find((h) => !h.trash && sanitizeName(h.name) === parts[1]);
  if (!house) return null;
  if (parts.length === 3) return { houseId: house.id, furnitureId: null, archived: false };
  if (parts[2] === 'Baú') return { houseId: house.id, furnitureId: null, archived: true };
  if (parts[2] === 'Chão') return { houseId: house.id, furnitureId: null, archived: false };
  const f = Object.values(db.furniture).find((x) => x.houseId === house.id && !x.trash && x.kind === 'container' && sanitizeName(x.name) === parts[2]);
  return { houseId: house.id, furnitureId: f?.id ?? null, archived: false };
}

// ───────────────────────────── Campos ↔ propriedades ─────────────────────────────

export interface RenderOpts {
  attachmentPath(id: ID): string | null;
  /** Propriedades já existentes no arquivo (as desconhecidas são preservadas). */
  existing?: YamlEntry[];
  now: number;
  /** Cópia gerada por um conflito: sem recanto_id, para o Recanto não confundir com o original. */
  conflictOf?: boolean;
}

export interface Rendered {
  text: string;
  /** O que representa o livro, sem partes voláteis ou geradas: base da detecção de mudanças. */
  content: string;
  /** Seção de tarefas geradas. */
  region: string;
  stem: string;
}

const wikiSafe = (s: string): string => s.replace(/[\]|[]/g, '').trim();

function titleOf(db: Db, id: ID | null | undefined): string | null {
  const b = id ? db.books[id] : undefined;
  return b && !b.trash ? b.title : null;
}

export function fieldToYaml(db: Db, def: FieldDef, value: FieldValue | undefined, attachmentPath: (id: ID) => string | null): YamlValue {
  const v = value ?? null;
  switch (def.type) {
    case 'number':
    case 'currency':
      return typeof v === 'number' ? v : null;
    case 'select':
      return typeof v === 'string' ? (def.options?.find((o) => o.id === v)?.label ?? null) : null;
    case 'multiselect':
      return Array.isArray(v) ? (v as string[]).map((id) => def.options?.find((o) => o.id === id)?.label).filter((x): x is string => !!x) : [];
    case 'checklist':
      return Array.isArray(v) ? (v as ChecklistItem[]).map((i) => `[${i.done ? 'x' : ' '}] ${i.text}`) : [];
    case 'file':
    case 'image':
      return Array.isArray(v) ? (v as string[]).map((id) => attachmentPath(id)).filter((p): p is string => !!p).map((p) => `[[${p}]]`) : [];
    case 'bookref': {
      const t = typeof v === 'string' ? titleOf(db, v) : null;
      return t ? `[[${wikiSafe(t)}]]` : null;
    }
    default:
      return typeof v === 'string' ? v : null;
  }
}

export interface ApplyHelpers {
  resolveBook(title: string, preferHouse: ID | null): ID | null;
  resolveAttachment(target: string): ID | null;
}

type Parsed = { value: FieldValue | null; addOptions?: string[] } | 'skip';

function wikiTarget(s: string): string {
  const m = /^\s*!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/.exec(s);
  return (m ? m[1] : s).trim();
}

export function yamlToField(def: FieldDef, v: YamlValue | undefined, h: ApplyHelpers, houseId: ID | null): Parsed {
  if (v === undefined) return 'skip';
  const asText = (): string | null => (v === null ? null : Array.isArray(v) ? v.map(String).join(', ') : String(v));
  switch (def.type) {
    case 'number':
    case 'currency': {
      if (v === null) return { value: null };
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? { value: n } : 'skip';
    }
    case 'date':
    case 'recurring': {
      if (v === null || v === '') return { value: null };
      const m = /^\d{4}-\d{2}-\d{2}/.exec(String(v));
      return m ? { value: m[0] } : 'skip';
    }
    case 'select': {
      const label = asText();
      if (!label) return { value: null };
      const o = def.options?.find((x) => x.label.toLowerCase() === label.toLowerCase());
      return o ? { value: o.id } : { value: label, addOptions: [label] };
    }
    case 'multiselect': {
      const labels = (Array.isArray(v) ? v.map(String) : v === null ? [] : String(v).split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
      return { value: labels, addOptions: labels.filter((l) => !def.options?.some((o) => o.label.toLowerCase() === l.toLowerCase())) };
    }
    case 'checklist': {
      const arr = Array.isArray(v) ? v.map(String) : v === null ? [] : [String(v)];
      return {
        value: arr.map((s) => {
          const m = /^\[([ xX])\]\s?(.*)$/.exec(s.trim());
          return { id: newId('ck'), text: m ? m[2] : s, done: m ? m[1].toLowerCase() === 'x' : false };
        }),
      };
    }
    case 'file':
    case 'image': {
      const arr = Array.isArray(v) ? v.map(String) : v === null ? [] : [String(v)];
      return { value: arr.map((s) => h.resolveAttachment(wikiTarget(s))).filter((x): x is ID => !!x) };
    }
    case 'bookref': {
      const t = asText();
      return { value: t ? h.resolveBook(wikiTarget(t), houseId) : null };
    }
    default:
      return { value: asText() };
  }
}

// ───────────────────────────── Blocos ↔ Markdown ─────────────────────────────

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function blockToMd(db: Db, b: Block, attachmentPath: (id: ID) => string | null): string | null {
  switch (b.type) {
    case 'text':
      return b.text.trim() || null;
    case 'heading':
      return b.text.trim() ? `## ${b.text.trim()}` : null;
    case 'checklist': {
      const lines = b.items.filter((i) => i.text.trim()).map((i) => `- [${i.done ? 'x' : ' '}] ${i.text.trim()}`);
      return lines.length ? lines.join('\n') : null;
    }
    case 'link':
      if (!b.url.trim()) return null;
      return /[\s()]/.test(b.url) ? `[${b.label || b.url}](<${b.url}>)` : `[${b.label || b.url}](${b.url})`;
    case 'file':
    case 'image': {
      const p = b.attachmentId ? attachmentPath(b.attachmentId) : null;
      if (!p) return null;
      return `${b.type === 'image' ? '!' : ''}[[${p}${b.caption ? `|${b.caption}` : ''}]]`;
    }
    case 'table': {
      if (!b.rows.length) return null;
      const w = Math.max(...b.rows.map((r) => r.length));
      const rows = b.rows.map((r) => `| ${Array.from({ length: w }, (_, i) => cell(r[i] ?? '')).join(' | ')} |`);
      rows.splice(1, 0, `| ${Array.from({ length: w }, () => '---').join(' | ')} |`);
      return rows.join('\n');
    }
    case 'date':
      return b.date ? `📅 ${b.date}${b.label ? ` ${b.label}` : ''}` : null;
    case 'bookref': {
      const t = titleOf(db, b.bookId);
      return t ? `[[${wikiSafe(t)}]]` : null;
    }
  }
}

const SEP_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const WIKI_LINE = /^(!?)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*$/;
const LINK_LINE = /^\[([^\]]*)\]\((?:<([^>]*)>|([^)\s]*))\)\s*$/;

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

export function parseBlocks(body: string, h: ApplyHelpers, houseId: ID | null): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) blocks.push({ id: newId('bl'), type: 'text', text });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') {
      if (!para.length || !/^\s*```/.test(para[para.length - 1] ?? '')) {
        flush();
        continue;
      }
    }
    if (/^```/.test(t)) {
      para.push(line);
      for (i++; i < lines.length; i++) {
        para.push(lines[i]);
        if (/^```/.test(lines[i].trim())) break;
      }
      continue;
    }
    let m = /^(#{1,6})\s+(.*)$/.exec(t);
    if (m) {
      flush();
      blocks.push({ id: newId('bl'), type: 'heading', text: m[2].trim() });
      continue;
    }
    if (/^[-*]\s+\[[ xX]\]/.test(t)) {
      flush();
      const items: ChecklistItem[] = [];
      for (; i < lines.length; i++) {
        const mm = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/.exec(lines[i]);
        if (!mm) break;
        items.push({ id: newId('ck'), text: mm[2].trim(), done: mm[1].toLowerCase() === 'x' });
      }
      i--;
      blocks.push({ id: newId('bl'), type: 'checklist', items });
      continue;
    }
    if (t.startsWith('|') && t.length > 1) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) if (!SEP_ROW.test(lines[i].trim())) rows.push(splitRow(lines[i]));
      i--;
      const w = Math.max(1, ...rows.map((r) => r.length));
      blocks.push({ id: newId('bl'), type: 'table', rows: rows.map((r) => Array.from({ length: w }, (_, k) => r[k] ?? '')) });
      continue;
    }
    m = /^📅\s*(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(t);
    if (m) {
      flush();
      blocks.push({ id: newId('bl'), type: 'date', date: m[1], label: m[2].trim() });
      continue;
    }
    m = LINK_LINE.exec(t);
    if (m) {
      flush();
      const url = m[2] ?? m[3] ?? '';
      blocks.push({ id: newId('bl'), type: 'link', url, label: m[1] === url ? '' : m[1] });
      continue;
    }
    m = WIKI_LINE.exec(t);
    if (m) {
      const target = m[2].trim();
      const att = h.resolveAttachment(target);
      if (att) {
        flush();
        const image = !!m[1] || IMAGE_EXT.has((/\.([^./]+)$/.exec(target)?.[1] ?? '').toLowerCase());
        blocks.push({ id: newId('bl'), type: image ? 'image' : 'file', attachmentId: att, caption: m[3] ?? '' });
        continue;
      }
      const book = h.resolveBook(target, houseId);
      if (book) {
        flush();
        blocks.push({ id: newId('bl'), type: 'bookref', bookId: book });
        continue;
      }
    }
    para.push(line);
  }
  flush();
  return blocks;
}

// ───────────────────────────── Seção de tarefas geradas ─────────────────────────────

const REGION_RE = /\r?\n?<!-- recanto:tarefas[^>]*-->[\s\S]*?<!-- \/recanto:tarefas -->\r?\n?/;

export function renderRegion(db: Db, book: Book): string {
  const tasks = Object.values(db.tasks)
    .filter((t) => t.bookId === book.id && !t.trash && t.status !== 'archived')
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!tasks.length) return '';
  const lines = tasks.map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.dueDate ? ` 📅 ${t.dueDate}` : ''}${t.status === 'doing' ? ' ◐' : ''}`);
  return ['<!-- recanto:tarefas (gerado pelo Recanto; edite as tarefas no app) -->', '## Tarefas no Recanto', ...lines, '<!-- /recanto:tarefas -->'].join('\n');
}

export const extractRegion = (text: string): string => (REGION_RE.exec(text)?.[0] ?? '').trim();
export const stripRegion = (text: string): string => text.replace(REGION_RE, '\n');

/** Troca só a seção gerada, sem mexer no resto do arquivo. */
export function replaceRegion(text: string, region: string): string {
  if (REGION_RE.test(text)) return text.replace(REGION_RE, region ? `\n${region}\n` : '\n').replace(/\n{3,}/g, '\n\n');
  return region ? `${text.replace(/\s+$/, '')}\n\n${region}\n` : text;
}

// ───────────────────────────── Gerar a nota ─────────────────────────────

const dateOf = (t: number): string => toISODate(new Date(t));

export function renderNote(db: Db, book: Book, o: RenderOpts): Rendered {
  const tpl: Template | undefined = db.templates[book.templateId];
  const house = book.houseId ? db.houses[book.houseId] : undefined;
  const furn = book.furnitureId ? db.furniture[book.furnitureId] : undefined;
  const known = new Set(BASE_KEYS);
  const fm: string[] = [];
  const push = (k: string, v: YamlValue) => fm.push(...emitEntry(k, v));
  if (o.conflictOf) push('recanto_conflito_de', book.id);
  else push('recanto_id', book.id);
  if (tpl) push('tipo', tpl.name);
  push('casa', house?.name ?? 'Correio');
  if (house) push('movel', book.archivedAt ? 'Baú' : furn && !furn.trash ? furn.name : 'Chão');
  push('criado', dateOf(book.createdAt));
  const atualizado = emitEntry('atualizado', dateOf(o.now));
  if (book.project) {
    const st = STATUS_OUT[book.project.status];
    if (st) push('status', st);
    if (book.project.dueDate) push('prazo', book.project.dueDate);
    if (book.project.description.trim()) push('resumo', book.project.description.trim());
  }
  for (const def of tpl?.fields ?? []) {
    if (def.hidden) continue;
    known.add(def.name);
    push(def.name, fieldToYaml(db, def, book.fields[def.id], o.attachmentPath));
  }
  const preserved: string[] = [];
  for (const e of o.existing ?? []) if (!known.has(e.key)) preserved.push(...e.raw);

  const chunks: string[] = [`# ${book.title}`];
  for (const b of book.blocks) {
    const md = blockToMd(db, b, o.attachmentPath);
    if (md) chunks.push(md);
  }
  const bodyMain = chunks.join('\n\n');
  const region = renderRegion(db, book);
  const head = (extra: string[]) => `---\n${[...fm, ...extra].join('\n')}\n---\n\n`;
  const withAt = [...fm.slice(0, fm.findIndex((l) => l.startsWith('criado:')) + 1), ...atualizado, ...fm.slice(fm.findIndex((l) => l.startsWith('criado:')) + 1)];
  const text = `---\n${[...withAt, ...preserved].join('\n')}\n---\n\n${bodyMain}\n${region ? `\n${region}\n` : ''}`;
  return { text, content: head([]) + bodyMain, region, stem: sanitizeName(book.title) };
}

// ───────────────────────────── Ler a nota ─────────────────────────────

export interface ParsedNote {
  id: string | null;
  conflictOf: string | null;
  entries: YamlEntry[];
  body: string;
}

export function parseNote(text: string): ParsedNote {
  const { yaml, body } = splitFrontmatter(text);
  const entries = yaml ? parseYaml(yaml) : [];
  const str = (k: string) => {
    const v = entries.find((e) => e.key === k)?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return { id: str('recanto_id'), conflictOf: str('recanto_conflito_de'), entries, body };
}

/** Alvos de anexos (arquivos que não são notas) citados na nota. */
export function attachmentTargets(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (/\.[A-Za-z0-9]{2,5}$/.test(t) && !/\.md$/i.test(t)) out.add(t);
  }
  return [...out];
}

function bodyForBlocks(body: string, titles: string[]): string {
  let s = stripRegion(body).replace(/\r\n/g, '\n');
  // O primeiro título "# ..." só é descartado quando repete o nome da nota; senão é conteúdo.
  const m = /^\s*#\s+(.+?)[ \t]*(?:\n|$)/.exec(s);
  if (m && titles.some((t) => t.trim().toLowerCase() === m[1].trim().toLowerCase())) s = s.slice(m[0].length);
  return s;
}

/**
 * Aplica o conteúdo de uma nota a um livro. Roda dentro de um comando (rascunho do Immer).
 * Devolve avisos para o relatório de sincronização.
 */
export function applyParsedNote(d: Db, bookId: ID, p: ParsedNote, h: ApplyHelpers, title: string | null): string[] {
  const warnings: string[] = [];
  const b = d.books[bookId];
  if (!b) return warnings;
  const oldTitle = b.title;
  if (title && title !== b.title) b.title = title;
  const tipo = p.entries.find((e) => e.key === 'tipo')?.value;
  if (typeof tipo === 'string') {
    const tpl = Object.values(d.templates).find((t) => !t.trash && t.name.toLowerCase() === tipo.trim().toLowerCase());
    if (tpl && tpl.id !== b.templateId) {
      try {
        changeBookTemplate(d, bookId, tpl.id);
      } catch (e) {
        warnings.push(`${b.title}: não foi possível trocar o tipo para ${tipo} (${(e as Error).message})`);
      }
    }
  }
  const tpl = d.templates[b.templateId];
  for (const def of tpl?.fields ?? []) {
    if (def.hidden) continue;
    const e = p.entries.find((x) => x.key === def.name);
    if (!e) {
      if (b.fields[def.id] !== undefined) b.fields[def.id] = null;
      continue;
    }
    const r = yamlToField(def, e.value, h, b.houseId);
    if (r === 'skip') {
      warnings.push(`${b.title}: o valor de "${def.name}" não pôde ser lido e foi mantido como estava.`);
      continue;
    }
    if (r.addOptions?.length) {
      def.options = def.options ?? [];
      const ids = new Map<string, string>();
      for (const label of r.addOptions) {
        const id = newId('op');
        def.options.push({ id, label });
        ids.set(label, id);
      }
      if (typeof r.value === 'string' && ids.has(r.value)) r.value = ids.get(r.value)!;
      if (Array.isArray(r.value)) r.value = (r.value as string[]).map((x) => ids.get(x) ?? def.options!.find((o) => o.label.toLowerCase() === x.toLowerCase())?.id ?? x);
      if (tpl) tpl.version++;
    } else if (def.type === 'multiselect' && Array.isArray(r.value))
      r.value = (r.value as string[]).map((x) => def.options?.find((o) => o.label.toLowerCase() === x.toLowerCase())?.id ?? x);
    b.fields[def.id] = r.value;
  }
  if (b.project) {
    const st = p.entries.find((e) => e.key === 'status')?.value;
    if (typeof st === 'string' && STATUS_IN[st.trim().toLowerCase()]) b.project.status = STATUS_IN[st.trim().toLowerCase()];
    const pz = p.entries.find((e) => e.key === 'prazo')?.value;
    b.project.dueDate = isDate(pz) ? pz : pz === null ? null : b.project.dueDate;
    const rs = p.entries.find((e) => e.key === 'resumo')?.value;
    if (typeof rs === 'string') b.project.description = rs;
  }
  b.blocks = parseBlocks(bodyForBlocks(p.body, [b.title, oldTitle]), h, b.houseId);
  b.updatedAt = Date.now();
  return warnings;
}

/** Cria o texto de um arquivo que já existia, acrescentando recanto_id e preservando todo o resto. */
export function addIdToText(text: string, id: ID, extra: Record<string, string> = {}): string {
  const { yaml, body } = splitFrontmatter(text);
  const lines = [`recanto_id: ${id}`, ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`)];
  const kept = yaml ? yaml.split(/\r?\n/).filter((l) => !/^recanto_id\s*:/.test(l)) : [];
  return `---\n${[...lines, ...kept].join('\n')}\n---\n${yaml === null ? '\n' : ''}${body}`;
}

export const IMAGE_EXTENSIONS = IMAGE_EXT;
export { TPL_NOTE };
