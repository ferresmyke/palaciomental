/**
 * Sincronização bidirecional entre o Recanto e o Vault do Obsidian.
 *
 * Regras de ouro:
 *  - A identidade do livro é o `recanto_id` da nota; o caminho é só a localização atual.
 *  - Nunca apaga uma nota. Nunca sobrescreve uma alteração sem guardar a outra versão.
 *  - Se a nota e o livro mudaram desde a última sincronização, há conflito: o Obsidian (fonte do
 *    conteúdo documental) vence e a versão do Recanto é salva em uma cópia "(conflito Recanto ...)".
 *  - O Recanto manda na localização (casa e móvel); o Obsidian manda no texto e nas propriedades.
 */
import { produce } from 'immer';
import { archiveBook, createBook, OpError } from '@/domain/ops';
import { TPL_NOTE } from '@/domain/seed';
import type { Attachment, Book, Db, ID } from '@/domain/types';
import { newId, normalize, toISODate } from '@/domain/util';
import {
  addIdToText,
  applyParsedNote,
  attachmentTargets,
  dirFor,
  extractRegion,
  FOLDERS,
  hashText,
  locateFromPath,
  parseNote,
  renderNote,
  replaceRegion,
  sanitizeName,
  type ApplyHelpers,
  type ParsedNote,
} from './markdown';
import { basename, dirname, extOf, joinPath, stemOf, type VaultFs } from './vault';

export interface SyncDeps {
  vault: VaultFs;
  getDb(): Db;
  /** Executa uma alteração nos dados (não entra no desfazer). */
  commit(label: string, fn: (d: Db) => void): void;
  getBlob(id: ID): Promise<{ mime: string; data: ArrayBuffer } | undefined>;
  putBlob(b: { id: ID; mime: string; data: ArrayBuffer }): Promise<void>;
  now(): number;
}

export interface SyncConflict {
  id: ID;
  title: string;
  /** Cópia com a versão do Recanto. */
  copyPath: string;
  path: string;
}

export interface SyncReport {
  /** Notas novas criadas a partir de livros. */
  created: number;
  /** Livros que mudaram no Recanto e foram atualizados no Vault. */
  exported: number;
  /** Notas alteradas no Obsidian e trazidas para o Recanto. */
  imported: number;
  /** Notas criadas no Obsidian e que viraram livros. */
  newNotes: number;
  /** Notas movidas por mudança de casa ou móvel no Recanto. */
  moved: number;
  conflicts: SyncConflict[];
  warnings: string[];
  total: number;
  summary: string;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const stamp = (t: number): string => {
  const d = new Date(t);
  return `${toISODate(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

function attachmentIdsOf(db: Db, b: Book): ID[] {
  const out = new Set<ID>();
  for (const bl of b.blocks) if ((bl.type === 'file' || bl.type === 'image') && bl.attachmentId) out.add(bl.attachmentId);
  const tpl = db.templates[b.templateId];
  for (const def of tpl?.fields ?? []) {
    if (def.hidden || (def.type !== 'file' && def.type !== 'image')) continue;
    const v = b.fields[def.id];
    if (Array.isArray(v)) for (const id of v as string[]) out.add(id);
  }
  return [...out];
}

function resolveTitle(db: Db, title: string, preferHouse: ID | null, selfId: ID | null): ID | null {
  const target = title.includes('/') ? stemOf(title) : title;
  const n = normalize(target);
  const matches = Object.values(db.books).filter((b) => !b.trash && b.id !== selfId && normalize(b.title) === n);
  if (!matches.length) return null;
  return (matches.find((b) => b.houseId === preferHouse) ?? matches[0]).id;
}

export async function syncVault(deps: SyncDeps): Promise<SyncReport> {
  const { vault } = deps;
  const rep: SyncReport = { created: 0, exported: 0, imported: 0, newNotes: 0, moved: 0, conflicts: [], warnings: [], total: 0, summary: '' };
  const warn = (m: string) => rep.warnings.length < 40 && rep.warnings.push(m);

  const entries = await vault.list();
  const lc = new Set(entries.map((e) => e.path.toLowerCase()));
  const paths = new Set(entries.map((e) => e.path));
  const has = (p: string) => lc.has(p.toLowerCase());
  const track = (p: string) => (paths.add(p), lc.add(p.toLowerCase()));
  const untrack = (p: string) => (paths.delete(p), lc.delete(p.toLowerCase()));

  const fileIndex = new Map<string, string>();
  for (const e of entries) {
    if (/\.md$/i.test(e.path)) continue;
    fileIndex.set(e.path.toLowerCase(), e.path);
    const b = basename(e.path).toLowerCase();
    if (!fileIndex.has(b)) fileIndex.set(b, e.path);
  }

  const uniquePath = (dir: string, stem: string, ext: string, ignore?: string): string => {
    let p = joinPath(dir, `${stem}.${ext}`);
    for (let n = 2; has(p) && p.toLowerCase() !== ignore?.toLowerCase(); n++) p = joinPath(dir, `${stem} (${n}).${ext}`);
    return p;
  };

  // ── Lê todas as notas do Vault ──
  interface FileNote {
    path: string;
    text: string;
    parsed: ParsedNote;
  }
  const byId = new Map<ID, FileNote>();
  const idless: FileNote[] = [];
  for (const e of entries) {
    if (!/\.md$/i.test(e.path) || e.size > 2_000_000 || e.path.startsWith(`${FOLDERS.system}/`)) continue;
    let text: string;
    try {
      text = await vault.readText(e.path);
    } catch {
      warn(`Não foi possível ler ${e.path}.`);
      continue;
    }
    const parsed = parseNote(text);
    if (parsed.conflictOf) continue;
    const fn: FileNote = { path: e.path, text, parsed };
    if (parsed.id) {
      if (byId.has(parsed.id)) warn(`A nota ${e.path} repete o recanto_id de ${byId.get(parsed.id)!.path} e foi ignorada. Apague a cópia ou troque o recanto_id.`);
      else byId.set(parsed.id, fn);
    } else idless.push(fn);
  }

  // ── Anexos ──
  const ensureAttachmentFiles = async (ids: ID[]): Promise<void> => {
    for (const id of ids) {
      const att = deps.getDb().attachments[id];
      if (!att) continue;
      if (att.vaultPath && has(att.vaultPath)) continue;
      const blob = await deps.getBlob(id);
      if (!blob) {
        warn(`O anexo "${att.name}" não está mais neste navegador e não foi enviado ao Vault.`);
        continue;
      }
      const ext = extOf(att.name);
      const target = uniquePath(FOLDERS.attachments, sanitizeName(att.name.replace(/\.[^.]+$/, '')), ext || 'bin');
      await vault.writeBytes(target, new Uint8Array(blob.data));
      track(target);
      deps.commit('Registrar anexo no Vault', (d) => {
        if (d.attachments[id]) d.attachments[id].vaultPath = target;
      });
    }
  };

  const ingestAttachments = async (targets: string[]): Promise<Map<string, ID>> => {
    const map = new Map<string, ID>();
    for (const t of targets) {
      const path = fileIndex.get(t.toLowerCase()) ?? fileIndex.get(basename(t).toLowerCase());
      if (!path) continue;
      const known = Object.values(deps.getDb().attachments).find((a) => a.vaultPath === path);
      if (known) {
        map.set(t, known.id);
        continue;
      }
      try {
        const bytes = await vault.readBytes(path);
        const id = newId('anx');
        const mime = MIME[extOf(path)] ?? 'application/octet-stream';
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        await deps.putBlob({ id, mime, data });
        const att: Attachment = { id, name: basename(path), mime, size: bytes.byteLength, createdAt: deps.now(), vaultPath: path };
        deps.commit('Trazer anexo do Vault', (d) => {
          d.attachments[id] = att;
        });
        map.set(t, id);
      } catch {
        warn(`Não foi possível ler o anexo ${path}.`);
      }
    }
    return map;
  };

  const helpers = (selfId: ID | null, amap: Map<string, ID>): ApplyHelpers => ({
    resolveBook: (t, house) => resolveTitle(deps.getDb(), t, house, selfId),
    resolveAttachment: (t) => amap.get(t) ?? amap.get(t.toLowerCase()) ?? null,
  });

  const attachmentPath = (db: Db) => (id: ID) => db.attachments[id]?.vaultPath ?? null;

  const renderCurrent = async (id: ID, existing: ParsedNote['entries'] | undefined, conflictOf = false) => {
    await ensureAttachmentFiles(attachmentIdsOf(deps.getDb(), deps.getDb().books[id]));
    const db = deps.getDb();
    return renderNote(db, db.books[id], { attachmentPath: attachmentPath(db), existing, now: deps.now(), conflictOf });
  };

  const setNote = (id: ID, path: string, hash: string, rendered: { content: string; region: string }, dir: string) =>
    deps.commit('Registrar ligação com a nota', (d) => {
      const b = d.books[id];
      if (b) b.note = { path, dir, hash, rhash: hashText(rendered.content), ghash: hashText(rendered.region), syncedAt: deps.now() };
    });

  /** Traz o conteúdo do arquivo para o livro e registra o estado sincronizado. */
  const importFile = async (id: ID, path: string, text: string, parsed: ParsedNote, title: string | null): Promise<void> => {
    const amap = await ingestAttachments(attachmentTargets(text));
    let warns: string[] = [];
    deps.commit('Importar nota do Obsidian', (d) => {
      warns = applyParsedNote(d, id, parsed, helpers(id, amap), title);
    });
    warns.forEach(warn);
    const db = deps.getDb();
    const b = db.books[id];
    const rend = renderNote(db, b, { attachmentPath: attachmentPath(db), existing: parsed.entries, now: deps.now() });
    let finalText = text;
    if (extractRegion(text) !== rend.region) {
      finalText = replaceRegion(text, rend.region);
      await vault.writeText(path, finalText);
    }
    setNote(id, path, hashText(finalText), rend, dirFor(db, b));
  };

  /** Escreve a nota completa do livro em `target` (e remove o arquivo antigo, se o caminho mudou). */
  const writeFull = async (id: ID, target: string, old: FileNote | null): Promise<void> => {
    const rend = await renderCurrent(id, old?.parsed.entries);
    await vault.writeText(target, rend.text);
    track(target);
    if (old && old.path.toLowerCase() !== target.toLowerCase()) {
      await vault.remove(old.path);
      untrack(old.path);
    }
    const db = deps.getDb();
    setNote(id, target, hashText(rend.text), rend, dirFor(db, db.books[id]));
  };

  // ── Livros → notas ──
  const books = Object.values(deps.getDb().books).filter((b) => !b.trash);
  rep.total = books.length;
  for (const b0 of books) {
    try {
      const db = deps.getDb();
      let book = db.books[b0.id];
      const dir = dirFor(db, book);
      const stem = sanitizeName(book.title);
      let found = byId.get(book.id) ?? null;
      const prev = book.note;

      if (!found) {
        if (prev) warn(`A nota de "${book.title}" não está mais no Vault (apagada ou movida para fora). Foi recriada.`);
        const target = uniquePath(dir, stem, 'md');
        await writeFull(book.id, target, null);
        rep.created++;
        continue;
      }

      // Renomeada no Obsidian? O nome do arquivo passa a ser o título do livro.
      if (prev && basename(found.path) !== basename(prev.path) && stemOf(found.path) !== book.title) {
        const newTitle = stemOf(found.path);
        deps.commit('Renomear livro pelo Obsidian', (d) => {
          if (d.books[book.id]) d.books[book.id].title = newTitle;
        });
        rep.imported++;
        book = deps.getDb().books[book.id];
      }

      const fHash = hashText(found.text);
      const rend = await renderCurrent(book.id, found.parsed.entries);
      book = deps.getDb().books[book.id];

      if (!prev) {
        // Nota com o mesmo id, mas sem ligação registrada (outro navegador, cópia antiga restaurada...).
        const scratch = produce(deps.getDb(), (d) => {
          applyParsedNote(d, book.id, found!.parsed, {
            resolveBook: (t, h) => resolveTitle(d as Db, t, h, book.id),
            resolveAttachment: (t) => Object.values((d as Db).attachments).find((a) => a.vaultPath && (a.vaultPath === t || basename(a.vaultPath).toLowerCase() === basename(t).toLowerCase()))?.id ?? null,
          }, null);
        });
        const sRend = renderNote(scratch, scratch.books[book.id], { attachmentPath: attachmentPath(scratch), existing: found.parsed.entries, now: deps.now() });
        if (hashText(sRend.content) === hashText(rend.content)) {
          await importFile(book.id, found.path, found.text, found.parsed, null);
          continue;
        }
        await resolveConflict(book, found, rend);
        continue;
      }

      const fileChanged = fHash !== prev.hash;
      const contentChanged = hashText(rend.content) !== prev.rhash;
      const regionChanged = hashText(rend.region) !== prev.ghash;
      const relocated = prev.dir !== dir;
      const wantedStem = sanitizeName(book.title);

      if (fileChanged && contentChanged) {
        await resolveConflict(book, found, rend);
      } else if (fileChanged) {
        await importFile(book.id, found.path, found.text, found.parsed, null);
        rep.imported++;
      } else if (contentChanged || relocated) {
        const targetDir = relocated ? dir : dirname(found.path);
        let target = joinPath(targetDir, `${wantedStem}.md`);
        if (target.toLowerCase() !== found.path.toLowerCase()) target = uniquePath(targetDir, wantedStem, 'md', found.path);
        else target = found.path;
        await guardedWrite(found, async () => writeFull(book.id, target, found));
        if (relocated) rep.moved++;
        else rep.exported++;
      } else if (regionChanged) {
        const text = replaceRegion(found.text, rend.region);
        await guardedWrite(found, async () => {
          await vault.writeText(found!.path, text);
          const db2 = deps.getDb();
          setNote(book.id, found!.path, hashText(text), rend, dirFor(db2, db2.books[book.id]));
        });
        rep.exported++;
      } else if (basename(found.path) !== basename(prev.path) || found.path !== prev.path) {
        const db2 = deps.getDb();
        setNote(book.id, found.path, fHash, rend, prev.dir === dir ? prev.dir : dirFor(db2, db2.books[book.id]));
      }
    } catch (e) {
      warn(`"${b0.title}": ${(e as Error).message}`);
    }
  }

  /** Confere que o arquivo não mudou durante a sincronização antes de sobrescrevê-lo. */
  async function guardedWrite(found: FileNote, fn: () => Promise<void>): Promise<void> {
    const now = await vault.readText(found.path);
    if (hashText(now) !== hashText(found.text)) throw new OpError('A nota mudou durante a sincronização e foi deixada como está. Sincronize de novo.');
    await fn();
  }

  async function resolveConflict(book: Book, found: FileNote, _rend: { content: string }): Promise<void> {
    const copyRend = await renderCurrent(book.id, undefined, true);
    const copyPath = uniquePath(dirname(found.path), `${sanitizeName(book.title)} (conflito Recanto ${stamp(deps.now())})`, 'md');
    await vault.writeText(copyPath, copyRend.text);
    track(copyPath);
    await importFile(book.id, found.path, found.text, found.parsed, null);
    rep.conflicts.push({ id: book.id, title: book.title, copyPath, path: found.path });
  }

  // ── Notas novas criadas no Obsidian ──
  for (const n of idless) {
    if (!(n.path.startsWith(`${FOLDERS.inbox}/`) || n.path.startsWith(`${FOLDERS.areas}/`))) continue;
    try {
      const db = deps.getDb();
      const loc = locateFromPath(db, n.path) ?? { houseId: null, furnitureId: null, archived: false };
      const tipo = n.parsed.entries.find((e) => e.key === 'tipo')?.value;
      const tpl = typeof tipo === 'string' ? Object.values(db.templates).find((t) => !t.trash && t.name.toLowerCase() === tipo.trim().toLowerCase()) : undefined;
      let id = '';
      deps.commit('Criar livro a partir de nota do Obsidian', (d) => {
        id = createBook(d, { title: stemOf(n.path), templateId: tpl?.id ?? TPL_NOTE, houseId: loc.houseId, furnitureId: loc.furnitureId });
        if (loc.archived) archiveBook(d, id);
      });
      const text = addIdToText(n.text, id);
      await vault.writeText(n.path, text);
      await importFile(id, n.path, text, parseNote(text), stemOf(n.path));
      rep.newNotes++;
    } catch (e) {
      warn(`${n.path}: ${(e as Error).message}`);
    }
  }

  // ── Notas órfãs (livro excluído de vez) ──
  const known = deps.getDb().books;
  const orphans = [...byId.keys()].filter((id) => !known[id]).length;
  if (orphans) warn(`${orphans} nota(s) do Vault apontam para livros que não existem mais no Recanto. Foram deixadas como estão.`);

  await writeSystemFiles(deps, vault);

  rep.summary = [
    rep.created && `${rep.created} nota(s) criada(s)`,
    rep.exported + rep.moved && `${rep.exported + rep.moved} atualizada(s) no Vault`,
    rep.imported && `${rep.imported} trazida(s) do Obsidian`,
    rep.newNotes && `${rep.newNotes} nota(s) nova(s) viraram livros`,
    rep.conflicts.length && `${rep.conflicts.length} conflito(s) resolvido(s) sem perda`,
  ]
    .filter(Boolean)
    .join(' · ') || 'Tudo em dia';
  return rep;
}

// ───────────────────────────── Índice e guia para agentes de IA ─────────────────────────────

export function renderIndex(db: Db): string {
  const link = (b: Book) => `[[${b.title.replace(/[\]|[]/g, '')}]]${db.templates[b.templateId] ? ` — ${db.templates[b.templateId].name}` : ''}${b.project ? ` (projeto, ${b.project.status === 'done' ? 'concluído' : 'em aberto'})` : ''}`;
  const live = Object.values(db.books).filter((b) => !b.trash);
  const out: string[] = ['# Recanto — Índice', '', '_Gerado pelo Recanto a cada sincronização. Não edite este arquivo._', ''];
  const loose = live.filter((b) => !b.houseId && !b.archivedAt);
  out.push('## Correio (soltos, ainda sem lugar)', ...(loose.length ? loose.map((b) => `- ${link(b)}`) : ['_Vazio._']), '');
  for (const h of Object.values(db.houses).filter((x) => !x.trash).sort((a, b) => a.order - b.order)) {
    out.push(`## ${h.name}`, '');
    const here = live.filter((b) => b.houseId === h.id);
    const furn = Object.values(db.furniture).filter((f) => f.houseId === h.id && !f.trash && f.kind === 'container').sort((a, b) => a.order - b.order);
    for (const f of furn) {
      const list = here.filter((b) => b.furnitureId === f.id && !b.archivedAt);
      out.push(`### ${f.name}`, ...(list.length ? list.map((b) => `- ${link(b)}`) : ['_Vazio._']), '');
    }
    const floor = here.filter((b) => !b.furnitureId && !b.archivedAt);
    if (floor.length) out.push('### Chão (ainda sem móvel)', ...floor.map((b) => `- ${link(b)}`), '');
    const chest = here.filter((b) => b.archivedAt);
    if (chest.length) out.push('### Baú (arquivados)', ...chest.map((b) => `- ${link(b)}`), '');
  }
  return out.join('\n');
}

const GUIDE = `# Recanto — Guia para quem lê este Vault (pessoas e agentes de IA)

Este Vault é mantido em conjunto com o **Recanto**, um aplicativo de organização pessoal em forma de vila.
Aqui estão as regras para ler e editar com segurança.

## Como as pastas se organizam
- \`00 - Caixa de Entrada/\`: o **Correio**. Notas ainda sem casa. Crie uma nota aqui e ela vira um livro no Correio.
- \`10 - Áreas da Vida/<Casa>/<Móvel>/\`: cada **casa** é uma área da vida (Oficina, Lar, Tesouraria, Ginásio, Hospedaria, Ateliê, ou as que o usuário criou); cada **móvel** (estante, gaveteiro...) é uma categoria.
  - \`Chão/\`: livros da casa que ainda não têm móvel. \`Baú/\`: livros arquivados.
- \`_Anexos/\`: imagens e arquivos usados pelas notas.
- \`90 - Sistema/Recanto/\`: arquivos gerados (índice e este guia). Não edite.
- Outras pastas do Vault (conhecimento, referências...) não são tocadas pelo Recanto.

## Identidade das notas
- Cada nota do Recanto tem \`recanto_id\` nas propriedades. **Não altere nem apague esse valor.** O nome do arquivo e a pasta podem mudar; o id é a identidade.
- As propriedades \`casa\` e \`movel\` mostram onde o livro está no Recanto (informativas). Para mover um livro de lugar, use o aplicativo.
- \`tipo\` é o modelo do livro (Pessoa, Contrato, Projeto, Nota...). Os demais campos do modelo viram propriedades.
- Livros do tipo Projeto têm \`status\` (a_planejar, pendente, em_andamento, aguardando, concluido), \`prazo\` e \`resumo\`.

## O que pode ser editado aqui
- O texto, os títulos, as listas de tarefas (\`- [ ]\`), tabelas, links e as propriedades: tudo isso é trazido de volta para o Recanto na próxima sincronização.
- A seção entre \`<!-- recanto:tarefas -->\` e \`<!-- /recanto:tarefas -->\` é **gerada** a partir das tarefas do aplicativo. Não edite.
- Links \`[[Outra nota]]\` criam conexões entre livros e aparecem no Mapa de Conexões.

## Conflitos
Se uma nota mudou nos dois lados entre duas sincronizações, o Recanto mantém a versão do Obsidian e guarda a do aplicativo em uma cópia \`... (conflito Recanto data).md\`. Nada é apagado.
`;

async function writeSystemFiles(deps: SyncDeps, vault: VaultFs): Promise<void> {
  const files: [string, string][] = [
    [`${FOLDERS.system}/ÍNDICE.md`, renderIndex(deps.getDb())],
    [`${FOLDERS.system}/LEIA-ME para agentes de IA.md`, GUIDE],
  ];
  for (const [path, text] of files) {
    let cur: string | null = null;
    try {
      cur = await vault.readText(path);
    } catch {
      cur = null;
    }
    if (cur !== text) await vault.writeText(path, text);
  }
}
