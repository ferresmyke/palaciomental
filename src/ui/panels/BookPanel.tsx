/**
 * Painel do livro: campos do modelo, páginas em blocos, projeto e aparência.
 * Tudo é editado no lugar e salvo automaticamente.
 */
import { useState } from 'react';
import { EMBLEMS } from '@/domain/catalog';
import * as ops from '@/domain/ops';
import { bookAddress, bookTasks, liveGoals, liveTemplates, projectProgress } from '@/domain/selectors';
import { FIELD_TYPE_LABEL, STATUS_LABEL, STATUS_SYMBOL, STATUSES, type Block, type BlockType, type Book, type ChecklistItem, type FieldDef, type FieldValue, type ID, type TaskStatus } from '@/domain/types';
import { humanDate, nextOccurrence } from '@/domain/util';
import { COVER_COLORS } from '@/game/art/palette';
import { run, runWithUndo } from '@/store/actions';
import { goToBook } from '@/store/nav';
import { ui } from '@/store/ui';
import { Attachments, BookCover, BookPicker, ChecklistEditor, RiskChip, TaskRow } from '../editors';
import { AutoInput, Chip, Empty, Field, Icon, InlineEdit, Menu, MenuItem, Panel, Progress, QuickAdd, Section, Swatches, useBlobUrl, useDb, useNow, useUi } from '../kit';

const BLOCK_LABEL: Record<BlockType, string> = {
  text: 'Texto',
  heading: 'Título',
  checklist: 'Checklist',
  link: 'Link',
  file: 'Arquivo',
  image: 'Imagem',
  table: 'Tabela',
  date: 'Data',
  bookref: 'Referência a livro',
};
const BLOCK_TYPES = Object.keys(BLOCK_LABEL) as BlockType[];

function FieldEditor({ book, def }: { book: Book; def: FieldDef }) {
  const now = useNow();
  const value = book.fields[def.id];
  const set = (v: FieldValue, merge = true) => run(`Editar ${def.name}`, (d) => ops.setBookField(d, book.id, def.id, v), merge ? { merge: `campo:${book.id}:${def.id}` } : undefined);
  const str = typeof value === 'string' ? value : '';
  switch (def.type) {
    case 'longtext':
      return <AutoInput multiline value={str} label={def.name} onCommit={(v) => set(v)} />;
    case 'number':
    case 'currency':
      return (
        <div className="with-prefix">
          {def.type === 'currency' && <span className="prefix">R$</span>}
          <AutoInput
            value={typeof value === 'number' ? String(value).replace('.', ',') : ''}
            label={def.name}
            inputMode="decimal"
            onCommit={(v) => {
              const n = Number(v.replace(/\./g, '').replace(',', '.'));
              set(v.trim() && Number.isFinite(n) ? n : null);
            }}
          />
        </div>
      );
    case 'date':
    case 'recurring':
      return (
        <div className="with-prefix">
          <input className="field-input" type="date" value={str} aria-label={def.name} onChange={(e) => set(e.target.value || null, false)} />
          {def.type === 'recurring' && str && <span className="muted">próxima: {humanDate(nextOccurrence(str, now), now)}</span>}
        </div>
      );
    case 'select':
      return (
        <select className="field-input" value={str} aria-label={def.name} onChange={(e) => set(e.target.value || null, false)}>
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="chips" role="group" aria-label={def.name}>
          {def.options?.map((o) => (
            <button key={o.id} className={`chip toggle${arr.includes(o.id) ? ' on' : ''}`} aria-pressed={arr.includes(o.id)} onClick={() => set(arr.includes(o.id) ? arr.filter((x) => x !== o.id) : [...arr, o.id], false)}>
              {o.label}
            </button>
          ))}
          {!def.options?.length && <span className="muted">Adicione opções no modelo.</span>}
        </div>
      );
    }
    case 'checklist':
      return <ChecklistEditor items={Array.isArray(value) ? (value as ChecklistItem[]) : []} label={def.name} onChange={(items) => set(items)} />;
    case 'file':
    case 'image':
      return <Attachments ids={Array.isArray(value) ? (value as string[]) : []} images={def.type === 'image'} label={def.name} onChange={(ids) => set(ids, false)} />;
    case 'bookref':
      return <BookPicker value={typeof value === 'string' && value ? value : null} label={def.name} filter={(b) => b.id !== book.id} onChange={(id) => set(id, false)} />;
    case 'link':
      return (
        <div className="with-prefix">
          <AutoInput value={str} label={def.name} type="url" inputMode="url" placeholder="https://" onCommit={(v) => set(v)} />
          {str && (
            <a className="mini go" href={/^https?:/.test(str) ? str : `https://${str}`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${def.name}`}>
              ↗
            </a>
          )}
        </div>
      );
    default:
      return <AutoInput value={str} label={def.name} type={def.type === 'email' ? 'email' : def.type === 'phone' ? 'tel' : 'text'} onCommit={(v) => set(v)} />;
  }
}

function ImageBlock({ id, caption }: { id: ID | null; caption: string }) {
  const url = useBlobUrl(id);
  return url ? <img className="block-image" src={url} alt={caption || 'Imagem do livro'} /> : null;
}

function BlockEditor({ book, block, index }: { book: Book; block: Block; index: number }) {
  const upd = (patch: Partial<Block>, merge = true) => run('Editar página', (d) => ops.updateBlock(d, book.id, block.id, patch), merge ? { merge: `bloco:${block.id}` } : undefined);
  let body: React.ReactNode;
  switch (block.type) {
    case 'text':
      body = <AutoInput multiline rows={4} value={block.text} label="Texto" placeholder="Escreva aqui…" onCommit={(text) => upd({ text })} />;
      break;
    case 'heading':
      body = <AutoInput className="heading-input" value={block.text} label="Título" placeholder="Título" onCommit={(text) => upd({ text })} />;
      break;
    case 'checklist':
      body = <ChecklistEditor items={block.items} label="Checklist" onChange={(items) => upd({ items })} />;
      break;
    case 'link':
      body = (
        <div className="link-block">
          <AutoInput value={block.label} label="Nome do link" placeholder="Nome" onCommit={(label) => upd({ label })} />
          <AutoInput value={block.url} label="Endereço do link" type="url" placeholder="https://" onCommit={(url) => upd({ url })} />
          {block.url && (
            <a className="mini go" href={/^https?:/.test(block.url) ? block.url : `https://${block.url}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir link">
              ↗
            </a>
          )}
        </div>
      );
      break;
    case 'file':
    case 'image':
      body = (
        <>
          {block.type === 'image' && <ImageBlock id={block.attachmentId} caption={block.caption} />}
          <Attachments ids={block.attachmentId ? [block.attachmentId] : []} images={block.type === 'image'} single label={BLOCK_LABEL[block.type]} onChange={(ids) => upd({ attachmentId: ids[0] ?? null }, false)} />
          <AutoInput value={block.caption} label="Legenda" placeholder="Legenda (opcional)" onCommit={(caption) => upd({ caption })} />
        </>
      );
      break;
    case 'table': {
      const rows = block.rows;
      const setCell = (r: number, c: number, v: string) => upd({ rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)) });
      body = (
        <div className="table-block">
          <table>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <input value={cell} aria-label={`Linha ${r + 1}, coluna ${c + 1}`} onChange={(e) => setCell(r, c, e.target.value)} />
                    </td>
                  ))}
                  <td className="tools">
                    <button className="mini" aria-label={`Remover linha ${r + 1}`} disabled={rows.length <= 1} onClick={() => upd({ rows: rows.filter((_, i) => i !== r) }, false)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => upd({ rows: [...rows, rows[0].map(() => '')] }, false)}>
              + Linha
            </button>
            <button className="btn ghost" disabled={rows[0].length >= 6} onClick={() => upd({ rows: rows.map((r) => [...r, '']) }, false)}>
              + Coluna
            </button>
            <button className="btn ghost" disabled={rows[0].length <= 1} onClick={() => upd({ rows: rows.map((r) => r.slice(0, -1)) }, false)}>
              − Coluna
            </button>
          </div>
        </div>
      );
      break;
    }
    case 'date':
      body = (
        <div className="link-block">
          <AutoInput value={block.label} label="O que é esta data" placeholder="O que é" onCommit={(label) => upd({ label })} />
          <input className="field-input" type="date" value={block.date ?? ''} aria-label="Data" onChange={(e) => upd({ date: e.target.value || null }, false)} />
        </div>
      );
      break;
    case 'bookref':
      body = <BookPicker value={block.bookId} label="Livro referenciado" filter={(b) => b.id !== book.id} onChange={(bookId) => upd({ bookId }, false)} />;
      break;
  }
  return (
    <div className={`block block-${block.type}`}>
      <div className="block-tools">
        <span className="block-kind">{BLOCK_LABEL[block.type]}</span>
        <button className="mini" aria-label="Subir bloco" disabled={index === 0} onClick={() => run('Mover bloco', (d) => ops.moveBlock(d, book.id, block.id, index - 1))}>
          ↑
        </button>
        <button className="mini" aria-label="Descer bloco" disabled={index === book.blocks.length - 1} onClick={() => run('Mover bloco', (d) => ops.moveBlock(d, book.id, block.id, index + 1))}>
          ↓
        </button>
        <button className="mini" aria-label={`Remover bloco ${BLOCK_LABEL[block.type]}`} onClick={() => runWithUndo('Remover bloco', (d) => ops.removeBlock(d, book.id, block.id), 'Bloco removido.')}>
          ×
        </button>
      </div>
      {body}
    </div>
  );
}

function AddBlock({ bookId, index }: { bookId: ID; index?: number }) {
  return (
    <div className="add-block" role="group" aria-label="Inserir bloco">
      <span className="muted">Inserir:</span>
      {BLOCK_TYPES.map((t) => (
        <button key={t} className="chip toggle" onClick={() => run(`Inserir ${BLOCK_LABEL[t].toLowerCase()}`, (d) => ops.addBlock(d, bookId, t, index))}>
          + {BLOCK_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

export function BookPanel({ id }: { id: ID }) {
  const db = useDb();
  const now = useNow();
  const place = useUi((s) => s.place);
  const [look, setLook] = useState(false);
  const book = db.books[id];
  if (!book) return <Panel title="Livro" label="Livro"><Empty>Este livro não existe mais.</Empty></Panel>;
  const tpl = db.templates[book.templateId];
  const addr = bookAddress(db, book);
  const visible = tpl?.fields.filter((f) => !f.hidden) ?? [];
  const hiddenWithData = tpl?.fields.filter((f) => f.hidden && book.fields[f.id] !== undefined && book.fields[f.id] !== null && book.fields[f.id] !== '') ?? [];
  const tasks = bookTasks(db, id);
  const progress = projectProgress(db, id);
  const goals = liveGoals(db).filter((g) => g.projectIds.includes(id));
  const here = (place.kind === 'house' && place.houseId === book.houseId) || (!book.houseId && place.kind === 'city');
  const inTrash = !!book.trash;

  return (
    <Panel
      label={`Livro ${book.title}`}
      kicker={
        <button className="crumbs" onClick={() => void goToBook(id)} title="Ir até lá" disabled={here && !book.furnitureId}>
          {addr.parts.slice(0, -1).join(' › ')}
        </button>
      }
      title={<InlineEdit value={book.title} label="Título do livro" onCommit={(title) => run('Renomear livro', (d) => ops.updateBook(d, id, { title }))} />}
      actions={
        <Menu label="Ações do livro">
          <MenuItem onClick={() => ui.push({ type: 'store', kind: 'book', id })}>Guardar em…</MenuItem>
          <MenuItem onClick={() => setLook(!look)}>Aparência da capa</MenuItem>
          {book.houseId && !book.archivedAt && <MenuItem onClick={() => run(book.pinnedOpen ? 'Tirar da mesa' : 'Deixar na mesa', (d) => ops.updateBook(d, id, { pinnedOpen: !book.pinnedOpen }))}>{book.pinnedOpen ? 'Tirar da mesa' : 'Deixar aberto na mesa'}</MenuItem>}
          <MenuItem onClick={() => runWithUndo(book.archivedAt ? 'Desarquivar livro' : 'Arquivar livro', (d) => ops.archiveBook(d, id, !book.archivedAt), book.archivedAt ? 'Livro de volta ao lugar.' : 'Livro arquivado no baú.')}>{book.archivedAt ? 'Desarquivar' : 'Arquivar no baú'}</MenuItem>
          {!book.houseId && !book.project && <MenuItem onClick={() => { const t = run('Transformar em tarefa', (d) => ops.bookToTask(d, id)); if (t) ui.open({ type: 'task', id: t }); }}>Transformar em tarefa</MenuItem>}
          <MenuItem danger onClick={() => { runWithUndo('Excluir livro', (d) => ops.deleteBook(d, id), 'Livro na lixeira por 30 dias.'); ui.back(); }}>Excluir</MenuItem>
        </Menu>
      }
    >
      {inTrash && <p className="notice">Este livro está na lixeira.</p>}
      <div className="book-head">
        <BookCover book={book} size="lg" />
        <div className="book-head-meta">
          <Field label="Modelo">
            <select className="field-input" value={book.templateId} onChange={(e) => run('Trocar modelo do livro', (d) => ops.changeBookTemplate(d, id, e.target.value))}>
              {liveTemplates(db).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="chips">
            {book.archivedAt && <Chip tone="muted" symbol="▣">Arquivado</Chip>}
            {!book.furnitureId && !book.archivedAt && <Chip tone="gold" symbol="▫" onClick={() => ui.push({ type: 'store', kind: 'book', id })}>Solto: guardar em…</Chip>}
            {book.pinnedOpen && <Chip symbol="◐">Aberto na mesa</Chip>}
            <button className="link small" onClick={() => ui.push({ type: 'templates', id: book.templateId })}>
              Editar modelo
            </button>
          </div>
        </div>
      </div>

      {look && (
        <Section title="Aparência">
          <Field label="Cor da capa">
            <Swatches options={COVER_COLORS} value={book.cover.color ?? tpl?.cover.color ?? null} label="Cor da capa" onChange={(color) => run('Mudar capa', (d) => ops.updateBook(d, id, { cover: { color } }))} />
          </Field>
          <Field label="Emblema">
            <div className="emblems" role="radiogroup" aria-label="Emblema">
              {EMBLEMS.map((e) => (
                <button key={e} role="radio" aria-checked={(book.cover.emblem ?? tpl?.cover.emblem) === e} aria-label={e} className={`emblem${(book.cover.emblem ?? tpl?.cover.emblem) === e ? ' on' : ''}`} onClick={() => run('Mudar emblema', (d) => ops.updateBook(d, id, { cover: { emblem: e } }))}>
                  <Icon name={e} size={18} tone="nogueira" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fita">
            <div className="btn-row">
              <Swatches options={['dourado', 'vinho', 'azul', 'verde']} value={book.cover.ribbon} label="Fita" onChange={(ribbon) => run('Mudar fita', (d) => ops.updateBook(d, id, { cover: { ribbon } }))} />
              <button className="btn ghost" onClick={() => run('Tirar fita', (d) => ops.updateBook(d, id, { cover: { ribbon: null } }))}>
                Sem fita
              </button>
            </div>
          </Field>
        </Section>
      )}

      {book.project && (
        <Section title="Projeto">
          <Progress ratio={progress.ratio} label={progress.total ? `${progress.done} de ${progress.total} tarefas (${Math.round(progress.ratio * 100)}%)` : 'Sem tarefas ainda'} />
          <div className="grid2">
            <Field label="Status">
              <select className="field-input" value={book.project.status} onChange={(e) => run('Mudar status do projeto', (d) => ops.updateBook(d, id, { project: { status: e.target.value as TaskStatus } }))}>
                {STATUSES.filter((s) => s !== 'archived').map((s) => (
                  <option key={s} value={s}>
                    {STATUS_SYMBOL[s]} {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo geral">
              <input className="field-input" type="date" value={book.project.dueDate ?? ''} onChange={(e) => run('Mudar prazo do projeto', (d) => ops.updateBook(d, id, { project: { dueDate: e.target.value || null } }))} />
            </Field>
          </div>
          {book.project.dueDate && <RiskChip task={{ dueDate: book.project.dueDate, status: book.project.status }} />}
          <Field label="Descrição">
            <AutoInput multiline value={book.project.description} label="Descrição do projeto" onCommit={(description) => run('Editar descrição', (d) => ops.updateBook(d, id, { project: { description } }), { merge: `desc:${id}` })} />
          </Field>
          {goals.length > 0 && (
            <div className="chips">
              {goals.map((g) => (
                <Chip key={g.id} symbol="✦" onClick={() => ui.push({ type: 'goal', id: g.id })}>
                  {g.title}
                </Chip>
              ))}
            </div>
          )}
        </Section>
      )}

      {visible.length > 0 && (
        <Section title={tpl?.name ?? 'Campos'}>
          {visible.map((def) => (
            <Field key={def.id} label={def.name} hint={def.type === 'recurring' ? 'Repete todo ano' : undefined}>
              <FieldEditor book={book} def={def} />
            </Field>
          ))}
        </Section>
      )}
      {hiddenWithData.length > 0 && (
        <details className="hidden-fields">
          <summary>
            {hiddenWithData.length} campo(s) removido(s) do modelo, com dados preservados
          </summary>
          {hiddenWithData.map((def) => (
            <p key={def.id}>
              <strong>{def.name}</strong> <span className="muted">({FIELD_TYPE_LABEL[def.type]})</span>: {ops.fieldText(db, def, book.fields[def.id])}
            </p>
          ))}
          <button className="link" onClick={() => ui.push({ type: 'templates', id: book.templateId })}>
            Recuperar no modelo
          </button>
        </details>
      )}

      <Section title={book.project ? 'Tarefas do projeto' : 'Tarefas ligadas'} count={tasks.length}>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        <QuickAdd placeholder="Nova tarefa neste livro" label="Nova tarefa neste livro" onAdd={(title) => run('Nova tarefa', (d) => ops.createTask(d, { title, bookId: id }))} />
      </Section>

      <Section title="Páginas" count={book.blocks.length}>
        {book.blocks.length === 0 && <Empty>Este livro ainda não tem páginas. Insira um bloco para começar.</Empty>}
        {book.blocks.map((b, i) => (
          <BlockEditor key={b.id} book={book} block={b} index={i} />
        ))}
        <AddBlock bookId={id} />
      </Section>
      <p className="stamp">
        Criado {humanDate(new Date(book.createdAt).toISOString().slice(0, 10), now)}
        {book.archivedAt ? ` · arquivado ${humanDate(new Date(book.archivedAt).toISOString().slice(0, 10), now)}` : ''}
      </p>
    </Panel>
  );
}
