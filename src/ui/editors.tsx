/**
 * Editores reutilizados por livros, tarefas e painéis: checklist, anexos,
 * seletor de livro, etiquetas e linhas de lista.
 */
import { useMemo, useRef, useState } from 'react';
import * as ops from '@/domain/ops';
import { bookAddress, bookFieldSummary, liveHouses, RISK_LABEL, RISK_SYMBOL, taskAddress, taskRisk } from '@/domain/selectors';
import { PRIORITY_LABEL, PRIORITY_SYMBOL, STATUS_LABEL, STATUS_SYMBOL, type Book, type ChecklistItem, type ID, type Task } from '@/domain/types';
import { formatBytes, humanDate, newId, normalize } from '@/domain/util';
import { cssColor } from '@/game/art/palette';
import { addFiles, blobUrl, run } from '@/store/actions';
import { goToBook, goToTask } from '@/store/nav';
import { ui } from '@/store/ui';
import { Chip, Icon, onEnter, useBlobUrl, useDb, useNow } from './kit';

export function ChecklistEditor({ items, onChange, label }: { items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void; label: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { id: newId('ck'), text: t, done: false }]);
    setText('');
  };
  return (
    <div className="checklist" aria-label={label}>
      {items.map((it, i) => (
        <div key={it.id} className={`check-row${it.done ? ' done' : ''}`}>
          <input type="checkbox" checked={it.done} aria-label={`Concluir: ${it.text}`} onChange={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} />
          <input className="check-text" value={it.text} aria-label="Item da checklist" onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} />
          <button className="mini" aria-label="Subir item" disabled={i === 0} onClick={() => onChange(swap(items, i, i - 1))}>
            ↑
          </button>
          <button className="mini" aria-label="Descer item" disabled={i === items.length - 1} onClick={() => onChange(swap(items, i, i + 1))}>
            ↓
          </button>
          <button className="mini" aria-label={`Remover: ${it.text}`} onClick={() => onChange(items.filter((x) => x.id !== it.id))}>
            ×
          </button>
        </div>
      ))}
      <div className="check-row add">
        <span className="check-plus" aria-hidden="true">
          +
        </span>
        <input className="check-text" value={text} placeholder="Novo item" aria-label="Novo item da checklist" onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(add)} onBlur={add} />
      </div>
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const out = arr.slice();
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

function Thumb({ id, name }: { id: ID; name: string }) {
  const url = useBlobUrl(id);
  return url ? <img className="thumb" src={url} alt={name} /> : <span className="thumb" />;
}

async function openAttachment(id: ID, name: string, download: boolean): Promise<void> {
  const url = await blobUrl(id);
  if (!url) return ui.toast('Este arquivo não está mais disponível neste navegador.', 'error');
  const a = document.createElement('a');
  a.href = url;
  if (download) a.download = name;
  else a.target = '_blank';
  a.rel = 'noopener';
  a.click();
}

/** Lista de anexos com envio, abertura, download e remoção. */
export function Attachments({ ids, onChange, images, label, single }: { ids: ID[]; onChange: (ids: ID[]) => void; images?: boolean; label: string; single?: boolean }) {
  const db = useDb();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added = await addFiles([...files]);
    setBusy(false);
    if (added.length) onChange(single ? [added[0]] : [...ids, ...added]);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="attachments" aria-label={label}>
      {ids.map((id) => {
        const a = db.attachments[id];
        if (!a) return null;
        const isImg = a.mime.startsWith('image/');
        return (
          <div key={id} className="attachment">
            {isImg ? <Thumb id={id} name={a.name} /> : <span className="file-ico" aria-hidden="true">▤</span>}
            <button className="link" onClick={() => void openAttachment(id, a.name, false)} title="Abrir">
              {a.name}
            </button>
            <span className="muted">{formatBytes(a.size)}</span>
            <button className="mini" aria-label={`Baixar ${a.name}`} title="Baixar" onClick={() => void openAttachment(id, a.name, true)}>
              ⤓
            </button>
            <button className="mini" aria-label={`Remover ${a.name}`} title="Remover" onClick={() => onChange(ids.filter((x) => x !== id))}>
              ×
            </button>
          </div>
        );
      })}
      <input ref={input} type="file" hidden multiple={!single} accept={images ? 'image/*' : undefined} onChange={(e) => void pick(e.target.files)} aria-label={label} />
      <button className="btn ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Guardando…' : images ? '+ Imagem' : '+ Arquivo'}
      </button>
    </div>
  );
}

/** Seletor de livro por busca (referências sem cópia). */
export function BookPicker({ value, onChange, label, filter, placeholder = 'Buscar livro…' }: { value: ID | null; onChange: (id: ID | null) => void; label: string; filter?: (b: Book) => boolean; placeholder?: string }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const current = value ? db.books[value] : undefined;
  const results = useMemo(() => {
    if (!open) return [];
    const n = normalize(q);
    return Object.values(db.books)
      .filter((b) => !b.trash && (!filter || filter(b)) && (!n || normalize(b.title).includes(n)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
  }, [db, q, open, filter]);
  if (current && !current.trash)
    return (
      <div className="ref-chip">
        <button className="link" onClick={() => ui.push({ type: 'book', id: current.id })}>
          {current.title}
        </button>
        <span className="muted">{bookAddress(db, current).parts.slice(1, -1).join(' › ')}</span>
        <button className="mini" aria-label="Remover referência" onClick={() => onChange(null)}>
          ×
        </button>
      </div>
    );
  return (
    <div className="picker">
      <input value={q} placeholder={placeholder} aria-label={label} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {open && results.length > 0 && (
        <div className="picker-list" role="listbox">
          {results.map((b) => (
            <button key={b.id} role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => (onChange(b.id), setQ(''), setOpen(false))}>
              <strong>{b.title}</strong>
              <span className="muted">{bookAddress(db, b).parts.slice(1, -1).join(' › ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const TAG_COLORS = ['ocre', 'azul', 'vinho', 'verde', 'rosa', 'cinza', 'musgo', 'terracota'];

export function TagPicker({ value, onChange }: { value: ID[]; onChange: (ids: ID[]) => void }) {
  const db = useDb();
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    const id = run('Criar etiqueta', (d) => ops.createTag(d, t, TAG_COLORS[Object.keys(d.tags).length % TAG_COLORS.length]));
    if (id && !value.includes(id)) onChange([...value, id]);
    setText('');
  };
  const others = Object.values(db.tags).filter((t) => !value.includes(t.id));
  return (
    <div className="tags">
      {value.map((id) => {
        const t = db.tags[id];
        if (!t) return null;
        return (
          <span key={id} className="tag" style={{ background: cssColor(t.color, 4), borderColor: cssColor(t.color, 1) }}>
            # {t.name}
            <button className="mini" aria-label={`Tirar etiqueta ${t.name}`} onClick={() => onChange(value.filter((x) => x !== id))}>
              ×
            </button>
          </span>
        );
      })}
      <input className="tag-input" list="tag-options" value={text} placeholder="+ etiqueta" aria-label="Adicionar etiqueta" onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(add)} onBlur={add} />
      <datalist id="tag-options">
        {others.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
    </div>
  );
}

export function HouseSelect({ value, onChange, label, allowNone = 'Correio (sem casa)' }: { value: ID | null; onChange: (id: ID | null) => void; label: string; allowNone?: string | null }) {
  const db = useDb();
  return (
    <select className="field-input" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">{allowNone}</option>}
      {liveHouses(db, true).map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
  );
}

export function RiskChip({ task }: { task: Pick<Task, 'dueDate' | 'status'> }) {
  const now = useNow();
  const r = taskRisk(task, now);
  if (r === 'none') return null;
  return (
    <Chip tone={r === 'overdue' ? 'alert' : 'gold'} symbol={RISK_SYMBOL[r]} title="Risco de atraso, calculado pelo prazo">
      {RISK_LABEL[r]}
    </Chip>
  );
}

/** Linha de tarefa para listas: concluir, abrir, ver prazo, risco e endereço. */
export function TaskRow({ task, showAddress, travel }: { task: Task; showAddress?: boolean; travel?: boolean }) {
  const db = useDb();
  const now = useNow();
  const done = task.status === 'done';
  const hl = ui.get().highlight;
  return (
    <div className={`row task-row${done ? ' done' : ''}${hl?.id === task.id ? ' highlight' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        onChange={() => run(done ? 'Reabrir tarefa' : 'Concluir tarefa', (d) => ops.updateTask(d, task.id, { status: done ? 'pending' : 'done' }))}
      />
      <button className="row-main" onClick={() => ui.push({ type: 'task', id: task.id })}>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          <span title={`Status: ${STATUS_LABEL[task.status]}`}>
            {STATUS_SYMBOL[task.status]} {STATUS_LABEL[task.status]}
          </span>
          {task.priority !== 'normal' && (
            <span title={`Prioridade: ${PRIORITY_LABEL[task.priority]}`}>
              {PRIORITY_SYMBOL[task.priority]} {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {task.dueDate && <span>◷ {humanDate(task.dueDate, now)}</span>}
          {task.checklist.length > 0 && (
            <span>
              ☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
        </span>
        {showAddress && <span className="row-address">{taskAddress(db, task).parts.slice(1, -1).join(' › ')}</span>}
      </button>
      <RiskChip task={task} />
      {travel && (
        <button className="mini go" title="Ir até lá" aria-label={`Ir até ${task.title}`} onClick={() => void goToTask(task.id)}>
          ➜
        </button>
      )}
    </div>
  );
}

export function BookCover({ book, size = 'md' }: { book: Book; size?: 'sm' | 'md' | 'lg' }) {
  const db = useDb();
  const tpl = db.templates[book.templateId];
  const color = book.cover.color ?? tpl?.cover.color ?? 'ocre';
  const emblem = book.cover.emblem ?? tpl?.cover.emblem ?? 'book';
  return (
    <span className={`cover ${size}`} style={{ background: cssColor(color, 2), borderColor: cssColor(color, 0), boxShadow: `inset 3px 0 0 ${cssColor(color, 3)}` }} aria-hidden="true">
      <Icon name={emblem} size={size === 'lg' ? 27 : size === 'sm' ? 9 : 18} tone="papel" />
      {book.cover.ribbon && <span className="ribbon" style={{ background: cssColor(book.cover.ribbon, 3) }} />}
    </span>
  );
}

export function BookRow({ book, showAddress, travel, extra }: { book: Book; showAddress?: boolean; travel?: boolean; extra?: React.ReactNode }) {
  const db = useDb();
  const tpl = db.templates[book.templateId];
  const hl = ui.get().highlight;
  return (
    <div className={`row book-row${hl?.id === book.id ? ' highlight' : ''}`}>
      <BookCover book={book} size="sm" />
      <button className="row-main" onClick={() => ui.push({ type: 'book', id: book.id })}>
        <span className="row-title">{book.title}</span>
        <span className="row-meta">
          <span>{tpl?.name ?? 'Livro'}</span>
          {bookFieldSummary(db, book) && <span>{bookFieldSummary(db, book)}</span>}
        </span>
        {showAddress && <span className="row-address">{bookAddress(db, book).parts.slice(1, -1).join(' › ')}</span>}
      </button>
      {extra}
      {travel && (
        <button className="mini go" title="Ir até lá" aria-label={`Ir até ${book.title}`} onClick={() => void goToBook(book.id)}>
          ➜
        </button>
      )}
    </div>
  );
}
