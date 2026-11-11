/**
 * Painéis dos móveis: contêiner (livros conforme o tipo do móvel), mesa de trabalho,
 * quadro de avisos e baú.
 */
import { useMemo, useState } from 'react';
import * as ops from '@/domain/ops';
import { boardNotices, chestBooks, chestTasks, deskBooks, deskTasks, furnitureBooks, liveTemplates, looseItems, RISK_LABEL, RISK_SYMBOL } from '@/domain/selectors';
import { CONTAINER_LABEL, type Book, type ContainerType, type ID, type SortMode } from '@/domain/types';
import { humanDate, normalize } from '@/domain/util';
import { cssColor } from '@/game/art/palette';
import { run, runWithUndo } from '@/store/actions';
import { getDb } from '@/store/db';
import { ui } from '@/store/ui';
import { BookRow, TaskRow } from '../editors';
import { Chip, Empty, Field, InlineEdit, Menu, MenuItem, Paged, Panel, QuickAdd, Section, Segmented, useDb, useNow, useUi } from '../kit';

const PRESENTATION: Record<ContainerType, 'spines' | 'cards' | 'folders'> = { shelf: 'spines', cabinet: 'spines', bureau: 'spines', cork: 'cards', drawer: 'folders', box: 'folders' };
const SHELF_SIZE = 24;

function coverColor(db: ReturnType<typeof useDb>, b: Book): string {
  return b.cover.color ?? db.templates[b.templateId]?.cover.color ?? 'ocre';
}

/** Estante: lombadas em prateleiras, paginadas para suportar centenas de livros. */
function Spines({ books, activeIds }: { books: Book[]; activeIds: Set<ID> }) {
  const db = useDb();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(books.length / SHELF_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = books.slice(cur * SHELF_SIZE, (cur + 1) * SHELF_SIZE);
  const hl = useUi((s) => s.highlight);
  return (
    <div className="shelf-view">
      <div className="shelf-rows">
        {[0, 1, 2].map((r) => (
          <div key={r} className="shelf-row">
            {slice.slice(r * 8, r * 8 + 8).map((b) =>
              activeIds.has(b.id) ? (
                <button key={b.id} className="spine gap" title={`${b.title} (aberto na mesa)`} onClick={() => ui.push({ type: 'book', id: b.id })}>
                  <span className="gap-label">{b.title}</span>
                </button>
              ) : (
                <button
                  key={b.id}
                  className={`spine${hl?.id === b.id ? ' highlight' : ''}`}
                  style={{ background: cssColor(coverColor(db, b), 2), borderColor: cssColor(coverColor(db, b), 0), height: `${78 + (b.title.length % 4) * 6}px` }}
                  title={b.title}
                  onClick={() => ui.push({ type: 'book', id: b.id })}
                >
                  <span>{b.title}</span>
                  {b.cover.ribbon && <i className="spine-ribbon" style={{ background: cssColor(b.cover.ribbon, 3) }} />}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            ‹ Anterior
          </button>
          <span>
            Prateleiras {cur + 1} de {pages}
          </span>
          <button className="btn ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}

function Cards({ books }: { books: Book[] }) {
  const db = useDb();
  return (
    <div className="cork-view">
      <Paged
        items={books}
        size={30}
        render={(b) => (
          <button key={b.id} className="cork-card" style={{ borderTopColor: cssColor(coverColor(db, b), 2) }} onClick={() => ui.push({ type: 'book', id: b.id })}>
            <i aria-hidden="true" />
            <strong>{b.title}</strong>
            <span>{db.templates[b.templateId]?.name}</span>
          </button>
        )}
      />
    </div>
  );
}

function Folders({ books, box }: { books: Book[]; box: boolean }) {
  const db = useDb();
  return (
    <div className={`folder-view${box ? ' box' : ''}`}>
      <Paged
        items={books}
        size={40}
        render={(b) => (
          <button key={b.id} className="folder" onClick={() => ui.push({ type: 'book', id: b.id })}>
            <i style={{ background: cssColor(coverColor(db, b), 3) }} aria-hidden="true" />
            <strong>{b.title}</strong>
            <span>{db.templates[b.templateId]?.name}</span>
          </button>
        )}
      />
    </div>
  );
}

export function FurniturePanel({ id }: { id: ID }) {
  const db = useDb();
  const [view, setView] = useState<'movel' | 'lista'>('movel');
  const [filter, setFilter] = useState('');
  const [tplId, setTplId] = useState('');
  const f = db.furniture[id];
  const all = useMemo(() => (f ? furnitureBooks(db, id) : []), [db, id, f]);
  if (!f || f.trash) return <Panel title="Móvel" label="Móvel"><Empty>Este móvel não existe mais.</Empty></Panel>;
  const house = db.houses[f.houseId];
  const n = normalize(filter);
  const books = n ? all.filter((b) => normalize(b.title).includes(n)) : all;
  const active = new Set(deskBooks(db, f.houseId).map((b) => b.id));
  const type = f.containerType ?? 'shelf';
  const loose = looseItems(db, f.houseId).filter((i) => i.kind === 'book');
  const mode = PRESENTATION[type];
  return (
    <Panel
      label={`Móvel ${f.name}`}
      icon="book"
      kicker={`${db.meta.world?.name ?? 'Recanto'} › ${house?.name ?? ''}`}
      title={<InlineEdit value={f.name} label="Nome do móvel" onCommit={(name) => run('Renomear móvel', (d) => ops.renameFurniture(d, id, name))} />}
      actions={
        <Menu label="Ações do móvel">
          <MenuItem onClick={() => { ui.setReform(true); const p = ops.placementOfFurniture(db, id); if (p) ui.select(p.id); }}>Mover ou girar (Modo Reforma)</MenuItem>
          <MenuItem danger onClick={() => ui.push({ type: 'deleteFurniture', id })}>Excluir móvel…</MenuItem>
        </Menu>
      }
    >
      <div className="grid2">
        <Field label="Tipo do móvel" hint="Só muda a aparência. Os livros continuam aqui.">
          <select className="field-input" value={type} onChange={(e) => run('Trocar tipo do móvel', (d) => ops.setContainerType(d, id, e.target.value as ContainerType))}>
            {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((t) => (
              <option key={t} value={t}>
                {CONTAINER_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordem dos livros">
          <select className="field-input" value={f.sort} onChange={(e) => run('Mudar ordenação', (d) => ops.setFurnitureSort(d, id, e.target.value as SortMode))}>
            <option value="manual">Manual</option>
            <option value="name">Por nome</option>
            <option value="date">Mais recentes</option>
            <option value="type">Por modelo</option>
          </select>
        </Field>
      </div>
      <div className="toolbar">
        <Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'movel', label: CONTAINER_LABEL[type] }, { value: 'lista', label: 'Lista' }]} />
        {all.length > 8 && <input className="field-input" value={filter} placeholder="Filtrar…" aria-label="Filtrar livros deste móvel" onChange={(e) => setFilter(e.target.value)} />}
      </div>
      <Section title="Livros" count={all.length}>
        {!all.length && <Empty>Vazio por enquanto. Crie um livro ou arraste um item solto até aqui.</Empty>}
        {view === 'movel' && mode === 'spines' && <Spines books={books} activeIds={active} />}
        {view === 'movel' && mode === 'cards' && <Cards books={books} />}
        {view === 'movel' && mode === 'folders' && <Folders books={books} box={type === 'box'} />}
        {view === 'lista' && (
          <Paged
            items={books}
            render={(b, i) => (
              <BookRow
                key={b.id}
                book={b}
                extra={
                  f.sort === 'manual' && !n ? (
                    <>
                      <button className="mini" aria-label={`Subir ${b.title}`} disabled={i === 0} onClick={() => run('Reordenar livro', (d) => ops.reorderBook(d, b.id, i - 1))}>
                        ↑
                      </button>
                      <button className="mini" aria-label={`Descer ${b.title}`} disabled={i === books.length - 1} onClick={() => run('Reordenar livro', (d) => ops.reorderBook(d, b.id, i + 1))}>
                        ↓
                      </button>
                    </>
                  ) : undefined
                }
              />
            )}
          />
        )}
      </Section>
      <Section title="Novo livro">
        <div className="btn-row">
          <select className="field-input" value={tplId} aria-label="Modelo do novo livro" onChange={(e) => setTplId(e.target.value)}>
            <option value="">Modelo: Nota</option>
            {liveTemplates(db).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <QuickAdd
          placeholder="Título do novo livro"
          label="Novo livro neste móvel"
          onAdd={(title) => {
            const b = run('Novo livro', (d) => ops.createBook(d, { title, templateId: tplId || undefined, furnitureId: id }));
            if (b) ui.highlight({ kind: 'book', id: b }, 2000);
          }}
        />
      </Section>
      {loose.length > 0 && (
        <Section title="Soltos nesta casa" count={loose.length}>
          {loose.slice(0, 6).map((it) => (
            <div key={it.id} className="row">
              <button className="row-main" onClick={() => ui.push({ type: 'book', id: it.id })}>
                <span className="row-title">{it.title}</span>
              </button>
              <button className="btn ghost" onClick={() => run('Guardar livro', (d) => ops.moveBook(d, it.id, { houseId: f.houseId, furnitureId: id }))}>
                Guardar aqui
              </button>
            </div>
          ))}
        </Section>
      )}
    </Panel>
  );
}

/** Próximo item solto da casa: leva direto ao "Guardar em…". */
export function tidyNext(houseId: ID | null): void {
  const next = looseItems(getDb(), houseId)[0];
  if (!next) return ui.toast('Nada solto por aqui. Tudo no lugar.', 'ok');
  ui.open({ type: 'store', kind: next.kind, id: next.id });
}

export function DeskPanel({ houseId }: { houseId: ID }) {
  const db = useDb();
  const house = db.houses[houseId];
  const books = deskBooks(db, houseId);
  const tasks = deskTasks(db, houseId);
  const loose = looseItems(db, houseId);
  if (!house) return null;
  return (
    <Panel label="Mesa de trabalho" icon="note" kicker={`${db.meta.world?.name ?? 'Recanto'} › ${house.name}`} title="Mesa de trabalho">
      <p className="lede">O que está ativo nesta casa: livros abertos e tarefas avulsas.</p>
      <Section title="Livros abertos" count={books.length}>
        {!books.length && <Empty>Nenhum livro aberto. Um livro vem para a mesa quando tem tarefa em andamento, ou quando você o deixa aberto.</Empty>}
        {books.map((b) => (
          <BookRow key={b.id} book={b} />
        ))}
      </Section>
      <Section title="Tarefas na mesa" count={tasks.length}>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        <QuickAdd placeholder="Nova tarefa na mesa" label="Nova tarefa na mesa" onAdd={(title) => run('Nova tarefa', (d) => ops.createTask(d, { title, houseId, onDesk: true }))} />
      </Section>
      {loose.length > 0 && (
        <Section title="No chão" count={loose.length} aside={<button className="btn" onClick={() => tidyNext(houseId)}>Arrumar um item</button>}>
          {loose.slice(0, 8).map((it) => (
            <div key={it.id} className="row">
              <button className="row-main" onClick={() => ui.push(it.kind === 'book' ? { type: 'book', id: it.id } : { type: 'task', id: it.id })}>
                <span className="row-title">{it.title}</span>
                <span className="row-meta">{it.kind === 'book' ? 'Livro' : 'Tarefa'}</span>
              </button>
              <button className="btn ghost" onClick={() => ui.push({ type: 'store', kind: it.kind, id: it.id })}>
                Guardar em…
              </button>
            </div>
          ))}
        </Section>
      )}
    </Panel>
  );
}

export function BoardPanel({ houseId }: { houseId: ID }) {
  const db = useDb();
  const now = useNow();
  const house = db.houses[houseId];
  const notices = boardNotices(db, houseId, now);
  if (!house) return null;
  return (
    <Panel label="Quadro de avisos" icon="list" kicker={`${db.meta.world?.name ?? 'Recanto'} › ${house.name}`} title="Quadro de avisos">
      <p className="lede">Prazos e datas desta casa. Informação, sem drama.</p>
      {!notices.length && <Empty>Nenhum prazo por aqui.</Empty>}
      {notices.map((n) => (
        <div key={`${n.kind}-${n.id}-${n.date}`} className="row">
          <button className="row-main" onClick={() => ui.push(n.kind === 'task' ? { type: 'task', id: n.id } : { type: 'book', id: n.id })}>
            <span className="row-title">{n.title}</span>
            <span className="row-meta">
              <span>◷ {humanDate(n.date, now)}</span>
              <span>{n.kind === 'task' ? 'Tarefa' : n.kind === 'project' ? 'Projeto' : 'Data'}</span>
            </span>
          </button>
          {n.risk !== 'none' && (
            <Chip tone={n.risk === 'overdue' ? 'alert' : 'gold'} symbol={RISK_SYMBOL[n.risk]}>
              {n.kind === 'date' ? (n.risk === 'today' ? 'É hoje' : 'Chegando') : RISK_LABEL[n.risk]}
            </Chip>
          )}
        </div>
      ))}
    </Panel>
  );
}

export function ChestPanel({ houseId }: { houseId: ID | null }) {
  const db = useDb();
  const [filter, setFilter] = useState('');
  const house = houseId ? db.houses[houseId] : undefined;
  const n = normalize(filter);
  const books = chestBooks(db, houseId).filter((b) => !n || normalize(b.title).includes(n));
  const tasks = chestTasks(db, houseId).filter((t) => !n || normalize(t.title).includes(n));
  return (
    <Panel label="Baú" icon="key" kicker={`${db.meta.world?.name ?? 'Recanto'} › ${house?.name ?? 'Correio'}`} title={houseId ? 'Baú' : 'Arquivo geral'}>
      <p className="lede">Arquivados e histórico. Nada importante é descartado.</p>
      {(books.length + tasks.length > 8 || filter) && <input className="field-input" value={filter} placeholder="Filtrar o baú…" aria-label="Filtrar o baú" onChange={(e) => setFilter(e.target.value)} />}
      <Section title="Livros arquivados" count={books.length}>
        {!books.length && <Empty>Nenhum livro arquivado.</Empty>}
        <Paged
          items={books}
          render={(b) => (
            <BookRow
              key={b.id}
              book={b}
              extra={
                <button className="btn ghost" onClick={() => runWithUndo('Desarquivar livro', (d) => ops.archiveBook(d, b.id, false), 'Livro de volta ao lugar.')}>
                  Desarquivar
                </button>
              }
            />
          )}
        />
      </Section>
      <Section title="Tarefas concluídas e arquivadas" count={tasks.length}>
        {!tasks.length && <Empty>Nenhuma tarefa no histórico.</Empty>}
        <Paged items={tasks} render={(t) => <TaskRow key={t.id} task={t} />} />
      </Section>
    </Panel>
  );
}
