/**
 * YAML mínimo para as propriedades (frontmatter) das notas: textos, números, listas.
 * Propriedades que o Recanto não conhece são preservadas exatamente como estavam.
 */
export type YamlValue = string | number | boolean | null | YamlValue[];

export interface YamlEntry {
  key: string;
  /** undefined = estrutura que não interpretamos (mantida no texto original). */
  value: YamlValue | undefined;
  raw: string[];
}

export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { yaml: null, body: text };
  return { yaml: m[1], body: text.slice(m[0].length) };
}

function parseScalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s.startsWith('"')) {
    const end = s.lastIndexOf('"');
    if (end > 0) {
      try {
        return JSON.parse(s.slice(0, end + 1)) as string;
      } catch {
        return s.slice(1, end);
      }
    }
  }
  if (s.startsWith("'")) {
    const end = s.lastIndexOf("'");
    if (end > 0) return s.slice(1, end).replace(/''/g, "'");
  }
  const noComment = s.replace(/\s+#.*$/, '');
  if (noComment === 'true') return true;
  if (noComment === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(noComment) && !/^-?0\d/.test(noComment)) return Number(noComment);
  return noComment;
}

function splitInline(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === '\\' && q === '"') cur += s[++i] ?? '';
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out;
}

export function parseYaml(yaml: string): YamlEntry[] {
  const lines = yaml.split(/\r?\n/);
  const entries: YamlEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(?:"([^"]+)"|'([^']+)'|([^\s#:][^:]*?))\s*:(?:\s+(.*)|\s*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = (m[1] ?? m[2] ?? m[3]).trim();
    const rest = (m[4] ?? '').trim();
    const raw = [line];
    i++;
    const cont: string[] = [];
    while (i < lines.length && (/^\s+\S/.test(lines[i]) || /^-\s/.test(lines[i]) || lines[i].trim() === '')) {
      if (lines[i].trim() === '' && !(i + 1 < lines.length && /^\s+\S|^-\s/.test(lines[i + 1]))) break;
      cont.push(lines[i]);
      raw.push(lines[i]);
      i++;
    }
    let value: YamlValue | undefined;
    if (rest === '') {
      const items = cont.filter((c) => c.trim() !== '');
      if (!items.length) value = null;
      else if (items.every((c) => /^\s*-\s+/.test(c) || /^\s*-$/.test(c))) value = items.map((c) => parseScalar(c.replace(/^\s*-\s*/, '')));
      else value = undefined;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      value = splitInline(rest.slice(1, -1)).map(parseScalar);
    } else if (/^[|>][+-]?$/.test(rest)) {
      const body = cont.map((c) => c.replace(/^\s{1,4}/, ''));
      value = rest.startsWith('|') ? body.join('\n').replace(/\n+$/, '') : body.join(' ').trim();
    } else if (rest.startsWith('{')) value = undefined;
    else value = cont.length ? undefined : parseScalar(rest);
    entries.push({ key, value, raw });
  }
  return entries;
}

const SAFE = /^[\p{L}][\p{L}\p{N} _.()\-/]*$/u;
const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;

export function emitScalar(v: string | number | boolean | null, plain = false): string {
  if (v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (plain) return v;
  if (v !== '' && SAFE.test(v) && !RESERVED.test(v) && !/\s$/.test(v)) return v;
  return JSON.stringify(v);
}

export function emitKey(key: string): string {
  return /^[\p{L}_][\p{L}\p{N}_ -]*$/u.test(key) && !/\s$/.test(key) ? key : JSON.stringify(key);
}

/** Linhas de uma propriedade. Datas (AAAA-MM-DD) saem sem aspas para o Obsidian reconhecê-las. */
export function emitEntry(key: string, value: YamlValue): string[] {
  const k = emitKey(key);
  if (Array.isArray(value)) {
    if (!value.length) return [`${k}: []`];
    return [`${k}:`, ...value.map((x) => `  - ${emitScalar(x as string | number | boolean | null, isDate(x))}`)];
  }
  return [`${k}: ${emitScalar(value, isDate(value))}`.trimEnd()];
}

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
