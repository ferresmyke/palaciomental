/**
 * Painéis da Praça: Correio (caixa de entrada), Mesa do Dia (modo lista completo),
 * Quadro da cidade (indicadores), busca universal e Ronda semanal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ops from '@/domain/ops';
import { search, type SearchResult } from '@/domain/search';
import {
  agenda,
  AGENDA_LABEL,
  AGENDA_SECTIONS,
  containers,
  furnitureBooks,
  goalProgress,
  houseActivity,
  inboxCount,
  liveGoals,
  liveHouses,
  looseItems,
  rondaCards,
  tidy,
  weekSummary,
  type AgendaSection,
} from '@/domain/selectors';
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_SYMBOL, type ID, type Priority } from '@/domain/types';
import { addDays, plural, today } from '@/domain/util';
import { run, runWithUndo } from '@/store/actions';
import { gameApi } from '@/store/gameApi';
import { goToBook, goToFurniture, goToGoal, goToHouse, goToObservatory, goToTask } from '@/store/nav';
import { ui } from '@/store/ui';
import { BookRow, HouseSelect, TaskRow } from '../editors';
import { Chip, Empty, Panel, Progress, QuickAdd, Section, Segmented, useDb, useNow, useUi } from '../kit';
import { tidyNext } from './HousePanels';

// ───────────────────────────── Correio ─────────────────────────────

export function CorreioPanel() {
  const db = useDb();
  const items = looseItems(db, null);
  const [kind, setKind] = useState<'task' | 'note'>('task');
  return (
    <Panel label="Correio" icon="letter" kicker={`${db.meta.world?.name ?? 'Recanto'} › Praça`} title="Correio">
      <p className="lede">Anote sem decidir onde guardar. Classificar é opcional e pode ficar para depois.</p>
      <Segmented label="Tipo de anotação" value={kind} onChange={setKind} options={[{ value: 'task', label: 'Tarefa', symbol: '○' }, { value: 'note', label: 'Anotação', symbol: '✎' }]} />
      <QuickAdd
        autoFocus
        placeholder={kind === 'task' ? 'O que precisa ser feito?' : 'O que você quer guardar?'}
        label="Novo item no Correio"
        onAdd={(title) => (kind === 'task' ? run('Nova tarefa no Correio', (d) => ops.createTask(d, { title })) : run('Nova anotação no Correio', (d) => ops.createBook(d, { title })))}
      />
      <Section title="Aguardando um lugar" count={items.length} aside={items.length > 0 ? <button className="btn" onClick={() => tidyNext(null)}>Arrumar um item</button> : undefined}>
        {!items.length && <Empty>Correio vazio. A praça agradece.</Empty>}
        {items.map((it) => (
          <div key={it.id} className="inbox-item">
            {it.kind === 'task' ? <TaskRow task={db.tasks[it.id]} /> : <BookRow book={db.books[it.id]} />}
            <div className="inbox-actions">
              <HouseSelect
                value={null}
                label={`Casa para ${it.title}`}
                allowNone="Levar para a casa…"
                onChange={(houseId) => {
                  if (!houseId) return;
                  if (it.kind === 'task') run('Classificar tarefa', (d) => ops.moveTask(d, it.id, { houseId }));
                  else run('Classificar livro', (d) => ops.moveBook(d, it.id, { houseId, furnitureId: null }));
                  ui.toast(`Levado para ${db.houses[houseId]?.name}. Está no chão, pronto para guardar.`, 'ok');
                }}
              />
              <button className="btn ghost" onClick={() => ui.push({ type: 'store', kind: it.kind, id: it.id })}>
                Guardar em…
              </button>
            </div>
          </div>
        ))}
      </Section>
      <button className="btn ghost wide" onClick={() => ui.push({ type: 'chest', houseId: null })}>
        Arquivo geral
      </button>
    </Panel>
  );
}

// ───────────────────────────── Mesa do Dia ─────────────────────────────

function Places() {
  const db = useDb();
  const houses = liveHouses(db, true);
  const inbox = inboxCount(db);
  return (
    <>
      <button className="row pick" onClick={() => ui.push({ type: 'correio' })}>
        <span className="row-title">Correio</span>
        <span className="row-meta">{plural(inbox, 'item aguardando', 'itens aguardando')}</span>
      </button>
      {!houses.length && <Empty>Nenhuma casa ainda. Crie a primeira no botão Casas.</Empty>}
      {houses.map((h) => {
        const loose = looseItems(db, h.id);
        return (
          <details key={h.id} className="place">
            <summary>
              <strong>{h.name}</strong>
              <span className="muted">
                {tidy(db, h.id).label}
                {h.hidden ? ' · oculta' : ''}
              </span>
            </summary>
            <div className="place-body">
              <div className="btn-row">
                <button className="btn ghost" onClick={() => void goToHouse(h.id)}>
                  Ir até lá
                </button>
                <button className="btn ghost" onClick={() => ui.push({ type: 'desk', houseId: h.id })}>
                  Mesa de trabalho
                </button>
                <button className="btn ghost" onClick={() => ui.push({ type: 'board', houseId: h.id })}>
                  Quadro de avisos
                </button>
                <button className="btn ghost" onClick={() => ui.push({ type: 'chest', houseId: h.id })}>
                  Baú
                </button>
              </div>
              {containers(db, h.id).map((f) => (
                <button key={f.id} className="row pick" onClick={() => ui.push({ type: 'furniture', id: f.id })}>
                  <span className="row-title">{f.name}</span>
                  <span className="row-meta">{plural(furnitureBooks(db, f.id).length, 'livro', 'livros')}</span>
                </button>
              ))}
              {loose.length > 0 && (
                <button className="row pick" onClick={() => tidyNext(h.id)}>
                  <span className="row-title">No chão</span>
                  <span className="row-meta">{plural(loose.length, 'item solto', 'itens soltos')} · arrumar um item</span>
                </button>
              )}
            </div>
          </details>
        );
      })}
    </>
  );
}

export function MesaPanel() {
  const db = useDb();
  const now = useNow();
  const [tab, setTab] = useState<'tarefas' | 'lugares' | 'objetivos'>('tarefas');
  const [houseId, setHouseId] = useState<ID | null>(null);
  const [tagId, setTagId] = useState<ID | null>(null);
  const [open, setOpen] = useState<Record<AgendaSection, boolean>>({ today: true, week: true, overdue: true, urgent: false, doing: true, waiting: true, done: false });
  const ag = useMemo(() => agenda(db, now, { houseId, tagId }), [db, now, houseId, tagId]);
  const tags = Object.values(db.tags);
  const goals = liveGoals(db);
  return (
    <Panel label="Mesa do Dia" icon="list" wide kicker={`${db.meta.world?.name ?? 'Recanto'} › Praça`} title="Mesa do Dia">
      <Segmented label="Seção da Mesa do Dia" value={tab} onChange={setTab} options={[{ value: 'tarefas', label: 'Tarefas' }, { value: 'lugares', label: 'Lugares' }, { value: 'objetivos', label: 'Objetivos' }]} />
      {tab === 'tarefas' && (
        <>
          <div className="toolbar">
            <HouseSelect value={houseId} label="Filtrar por casa" allowNone="Todas as casas" onChange={setHouseId} />
            <select className="field-input" value={tagId ?? ''} aria-label="Filtrar por etiqueta" onChange={(e) => setTagId(e.target.value || null)}>
              <option value="">Todas as etiquetas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  # {t.name}
                </option>
              ))}
            </select>
            <button className="btn ghost" onClick={() => ui.push({ type: 'ronda' })}>
              Ronda semanal
            </button>
          </div>
          <QuickAdd placeholder="Nova tarefa (vai para o Correio)" label="Nova tarefa" onAdd={(title) => run('Nova tarefa', (d) => ops.createTask(d, { title, houseId }))} />
          {AGENDA_SECTIONS.map((sec) => (
            <section key={sec} className={`agenda agenda-${sec}`}>
              <button className="agenda-head" aria-expanded={open[sec]} onClick={() => setOpen({ ...open, [sec]: !open[sec] })}>
                <span>
                  {open[sec] ? '▾' : '▸'} {AGENDA_LABEL[sec]}
                </span>
                <span className="count">{ag[sec].length}</span>
              </button>
              {open[sec] && (ag[sec].length ? ag[sec].slice(0, 60).map((t) => <TaskRow key={t.id} task={t} showAddress travel />) : <Empty>Nada aqui.</Empty>)}
            </section>
          ))}
        </>
      )}
      {tab === 'lugares' && <Places />}
      {tab === 'objetivos' && (
        <>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => ui.push({ type: 'goals' })}>
              Gerenciar objetivos
            </button>
            <button className="btn ghost" onClick={() => void goToObservatory()}>
              Ir ao Observatório
            </button>
          </div>
          {!goals.length && <Empty>Nenhum objetivo ainda.</Empty>}
          {goals.map((g) => {
            const p = goalProgress(db, g);
            return (
              <button key={g.id} className="row pick" onClick={() => ui.push({ type: 'goal', id: g.id })}>
                <span className="row-title">{g.title}</span>
                <span className="row-meta">
                  {db.constellations[g.constellationId]?.name} · {p.state === 'nopath' ? '◌ sem caminho' : p.state === 'dormant' ? '☾ adormecida' : `${Math.round(p.ratio * 100)}%`}
                </span>
              </button>
            );
          })}
        </>
      )}
    </Panel>
  );
}

// ───────────────────────────── Quadro da cidade ─────────────────────────────

export function QuadroPanel() {
  const db = useDb();
  const now = useNow();
  const houses = liveHouses(db);
  const inbox = inboxCount(db);
  let loose = 0;
  let overdue = 0;
  for (const h of houses) {
    loose += tidy(db, h.id).loose;
    overdue += houseActivity(db, h.id, now).overdue;
  }
  return (
    <Panel label="Quadro da cidade" icon="tower" kicker={`${db.meta.world?.name ?? 'Recanto'} › Praça`} title="Quadro da cidade">
      <p className="lede">
        {inbox + loose === 0 ? 'Tudo no lugar.' : `${plural(inbox + loose, 'item solto', 'itens soltos')}.`} {overdue ? `${plural(overdue, 'atrasada', 'atrasadas')}.` : ''}
      </p>
      <div className="btn-row">
        <button className="btn" onClick={() => ui.push({ type: 'search' })}>
          Buscar
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'mesa' })}>
          Mesa do Dia
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'houses' })}>
          Casas
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'goals' })}>
          Objetivos
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'map' })}>
          Conexões
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'obsidian' })}>
          Obsidian
        </button>
      </div>
      <Section title="Casas" count={houses.length}>
        {!houses.length && <Empty>Nenhuma casa ainda.</Empty>}
        {houses.map((h, i) => {
          const t = tidy(db, h.id);
          const a = houseActivity(db, h.id, now);
          return (
            <div key={h.id} className="row">
              <button className="row-main" onClick={() => void goToHouse(h.id)}>
                <span className="row-title">
                  {i < 6 && <kbd>{i + 1}</kbd>} {h.name}
                </span>
                <span className="row-meta">
                  <span>{t.label}</span>
                  {t.loose > 0 && <span>▫ {plural(t.loose, 'solto', 'soltos')}</span>}
                  {a.doing > 0 && <span>◐ {a.doing} em andamento</span>}
                </span>
              </button>
              {a.overdue > 0 && (
                <Chip tone="alert" symbol="⚑">
                  {plural(a.overdue, 'atrasada', 'atrasadas')}
                </Chip>
              )}
            </div>
          );
        })}
      </Section>
      <button className="row pick" onClick={() => ui.push({ type: 'correio' })}>
        <span className="row-title">Correio</span>
        <span className="row-meta">{plural(inbox, 'item aguardando', 'itens aguardando')}</span>
      </button>
    </Panel>
  );
}

// ───────────────────────────── Busca ─────────────────────────────

function travel(r: SearchResult): void {
  if (r.kind === 'book') void goToBook(r.id);
  else if (r.kind === 'task') void goToTask(r.id);
  else if (r.kind === 'goal') void goToGoal(r.id);
  else if (r.kind === 'furniture') void goToFurniture(r.id);
  else void goToHouse(r.id);
}

export function SearchPanel() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(db, q), [db, q]);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);
  return (
    <div className="search-modal" role="dialog" aria-label="Busca universal">
      <div className="search-box">
        <input
          ref={input}
          value={q}
          placeholder="Buscar em todo o Recanto…"
          aria-label="Buscar"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel(Math.min(results.length - 1, sel + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel(Math.max(0, sel - 1)));
            if (e.key === 'Enter' && results[sel]) travel(results[sel]);
          }}
        />
        <button className="icon-btn" aria-label="Fechar busca" onClick={() => ui.back()}>
          ×
        </button>
      </div>
      <div className="search-results" role="listbox" aria-label="Resultados">
        {q.trim() && !results.length && <Empty>Nada encontrado para “{q}”.</Empty>}
        {!q.trim() && <Empty>Procure por nome, conteúdo, campos, etiquetas ou objetivos. Enter leva você até lá.</Empty>}
        {results.map((r, i) => (
          <button key={`${r.kind}-${r.id}`} role="option" aria-selected={i === sel} className={`result${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => travel(r)}>
            <span className="result-type">{r.typeLabel}</span>
            <span className="result-main">
              <strong>{r.title}</strong>
              <span className="row-address">{r.address}</span>
              {r.snippet && <span className="snippet">{r.snippet}</span>}
            </span>
            <span className="go" aria-hidden="true">
              ➜
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── Ronda semanal ─────────────────────────────

export function RondaPanel() {
  const db = useDb();
  const now = useNow();
  const [step, setStep] = useState(0);
  const cards = useMemo(() => rondaCards(db, now), [db, now]);
  const place = useUi((s) => s.place);
  const total = cards.length + 1;
  const card = cards[step];
  useEffect(() => {
    if (card?.houseId && place.kind === 'city') gameApi.city?.focusHouse(card.houseId);
    else if (card && !card.houseId && place.kind === 'city') gameApi.city?.focusCell(28, 25);
  }, [card?.houseId, step, place.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = weekSummary(db, now);
  const postpone = (id: ID) => runWithUndo('Adiar tarefa', (d) => ops.updateTask(d, id, { dueDate: addDays(today(now), 7) }), 'Adiada para daqui a uma semana.');
  const priority = (id: ID, p: Priority) => run('Mudar prioridade', (d) => ops.updateTask(d, id, { priority: p }));
  return (
    <Panel
      label="Ronda semanal"
      icon="leaf"
      kicker={`Ronda semanal · ${Math.min(step + 1, total)} de ${total}`}
      title={card ? card.name : 'A semana'}
      footer={
        <div className="btn-row spread">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            ‹ Anterior
          </button>
          <button className="btn ghost" onClick={() => ui.closeAll()}>
            Parar por aqui
          </button>
          {step < total - 1 ? (
            <button className="btn" onClick={() => setStep(step + 1)}>
              Próxima ›
            </button>
          ) : (
            <button className="btn" onClick={() => ui.closeAll()}>
              Concluir
            </button>
          )}
        </div>
      }
    >
      {card ? (
        <>
          {!card.loose.length && !card.overdue.length && !card.stalled.length && <Empty>Tudo no lugar por aqui.</Empty>}
          {card.loose.length > 0 && (
            <Section title="Itens soltos" count={card.loose.length}>
              {card.loose.slice(0, 12).map((it) => (
                <div key={it.id} className="ronda-item">
                  <button className="link" onClick={() => ui.push(it.kind === 'book' ? { type: 'book', id: it.id } : { type: 'task', id: it.id })}>
                    {it.title}
                  </button>
                  <div className="btn-row">
                    <button className="btn" onClick={() => ui.push({ type: 'store', kind: it.kind, id: it.id })}>
                      Guardar
                    </button>
                    {it.kind === 'task' && (
                      <button className="btn ghost" onClick={() => postpone(it.id)}>
                        Adiar
                      </button>
                    )}
                    <button className="btn ghost" onClick={() => (it.kind === 'book' ? runWithUndo('Arquivar livro', (d) => ops.archiveBook(d, it.id), 'Arquivado.') : runWithUndo('Arquivar tarefa', (d) => ops.updateTask(d, it.id, { status: 'archived' }), 'Arquivada.'))}>
                      Arquivar
                    </button>
                  </div>
                </div>
              ))}
            </Section>
          )}
          {card.overdue.length > 0 && (
            <Section title="Atrasadas" count={card.overdue.length}>
              {card.overdue.map((t) => (
                <div key={t.id} className="ronda-item">
                  <TaskRow task={t} />
                  <div className="btn-row">
                    <button className="btn ghost" onClick={() => postpone(t.id)}>
                      Adiar uma semana
                    </button>
                    <button className="btn ghost" onClick={() => runWithUndo('Arquivar tarefa', (d) => ops.updateTask(d, t.id, { status: 'archived' }), 'Arquivada.')}>
                      Arquivar
                    </button>
                    <select className="field-input" value={t.priority} aria-label={`Prioridade de ${t.title}`} onChange={(e) => priority(t.id, e.target.value as Priority)}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_SYMBOL[p]} {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </Section>
          )}
          {card.stalled.length > 0 && (
            <Section title="Projetos parados" count={card.stalled.length}>
              {card.stalled.map((b) => (
                <BookRow
                  key={b.id}
                  book={b}
                  extra={
                    <button className="btn ghost" onClick={() => runWithUndo('Arquivar projeto', (d) => ops.archiveBook(d, b.id), 'Projeto arquivado.')}>
                      Arquivar
                    </button>
                  }
                />
              ))}
            </Section>
          )}
        </>
      ) : (
        <>
          <Section title="Semana que passou" count={week.doneLastWeek.length}>
            {!week.doneLastWeek.length && <Empty>Nenhuma tarefa concluída nos últimos sete dias.</Empty>}
            {week.doneLastWeek.slice(0, 20).map((t) => (
              <TaskRow key={t.id} task={t} showAddress />
            ))}
          </Section>
          <Section title="Semana que vem" count={week.dueNextWeek.length}>
            {!week.dueNextWeek.length && <Empty>Nenhum prazo nos próximos sete dias.</Empty>}
            {week.dueNextWeek.map((t) => (
              <TaskRow key={t.id} task={t} showAddress />
            ))}
          </Section>
          <Progress ratio={1} label="Ronda feita. Até a próxima." />
        </>
      )}
    </Panel>
  );
}
