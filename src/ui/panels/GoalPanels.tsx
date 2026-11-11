/**
 * Objetivos e constelações: a "espiada" (lista) e o painel de uma estrela.
 */
import { useState } from 'react';
import * as ops from '@/domain/ops';
import { goalProgress, goalProjects, liveGoals, liveHouses, projectBooks, projectProgress } from '@/domain/selectors';
import { HORIZON_LABEL, HORIZONS, type Horizon, type ID } from '@/domain/types';
import { run, runWithUndo } from '@/store/actions';
import { goToGoal, goToObservatory } from '@/store/nav';
import { ui } from '@/store/ui';
import { BookPicker, BookRow, HouseSelect } from '../editors';
import { AutoInput, Chip, Empty, Field, InlineEdit, Menu, MenuItem, Panel, Progress, QuickAdd, Section, Segmented, useDb, useUi } from '../kit';

const STATE_TEXT = { nopath: '◌ Sem caminho', dormant: '☾ Adormecida', active: '✦ A caminho', done: '✓ Alcançada' } as const;

export function GoalsPanel() {
  const db = useDb();
  const place = useUi((s) => s.place);
  const cons = Object.values(db.constellations).sort((a, b) => a.order - b.order);
  const goals = liveGoals(db);
  return (
    <Panel label="Objetivos" icon="star" kicker="Uma espiada no céu" title="Objetivos">
      <p className="lede">Cada objetivo é uma estrela. O brilho vem do progresso dos projetos ligados a ela.</p>
      {place.kind !== 'observatory' && (
        <button className="btn ghost wide" onClick={() => void goToObservatory()}>
          Ir ao Observatório
        </button>
      )}
      {cons.map((c) => {
        const list = goals.filter((g) => g.constellationId === c.id);
        return (
          <Section
            key={c.id}
            title={<InlineEdit value={c.name} label="Nome da constelação" onCommit={(name) => run('Renomear constelação', (d) => ops.renameConstellation(d, c.id, name))} />}
            count={list.length}
            aside={
              <Menu label={`Ações da constelação ${c.name}`}>
                <MenuItem danger onClick={() => (list.length ? ui.push({ type: 'deleteConstellation', id: c.id }) : runWithUndo('Excluir constelação', (d) => ops.deleteConstellation(d, c.id, { mode: 'trash' }), 'Constelação excluída.'))}>
                  Excluir constelação…
                </MenuItem>
              </Menu>
            }
          >
            {list.map((g) => {
              const p = goalProgress(db, g);
              return (
                <button key={g.id} className={`row pick goal-${p.state}`} onClick={() => ui.push({ type: 'goal', id: g.id })}>
                  <span className="row-title">{g.title}</span>
                  <span className="row-meta">
                    <span>{HORIZON_LABEL[g.horizon]}</span>
                    <span>{p.state === 'active' ? `${Math.round(p.ratio * 100)}%` : STATE_TEXT[p.state]}</span>
                  </span>
                </button>
              );
            })}
            <QuickAdd placeholder={`Novo objetivo em ${c.name}`} label={`Novo objetivo em ${c.name}`} onAdd={(title) => { const id = run('Novo objetivo', (d) => ops.createGoal(d, { title, constellationId: c.id })); if (id) ui.push({ type: 'goal', id }); }} />
          </Section>
        );
      })}
      {!cons.length && <Empty>Nenhuma constelação ainda. Crie a primeira abaixo.</Empty>}
      <Section title="Nova constelação">
        <QuickAdd placeholder="Ex.: Ano de 2027" label="Nova constelação" onAdd={(name) => run('Nova constelação', (d) => ops.createConstellation(d, name))} />
      </Section>
    </Panel>
  );
}

export function GoalPanel({ id }: { id: ID }) {
  const db = useDb();
  const place = useUi((s) => s.place);
  const [houseId, setHouseId] = useState<ID | null>(null);
  const g = db.goals[id];
  if (!g) return <Panel title="Objetivo" label="Objetivo"><Empty>Este objetivo não existe mais.</Empty></Panel>;
  const p = goalProgress(db, g);
  const projects = goalProjects(db, g);
  const cons = Object.values(db.constellations).sort((a, b) => a.order - b.order);
  const defaultHouse = houseId ?? db.constellations[g.constellationId]?.houseId ?? liveHouses(db)[0]?.id ?? null;
  const upd = (patch: Parameters<typeof ops.updateGoal>[2], label = 'Editar objetivo', merge?: string) => run(label, (d) => ops.updateGoal(d, id, patch), merge ? { merge } : undefined);
  const linkable = projectBooks(db).some((b) => !g.projectIds.includes(b.id));
  return (
    <Panel
      label={`Objetivo ${g.title}`}
      icon="star"
      kicker={
        <button className="crumbs" onClick={() => void goToGoal(id)} disabled={place.kind === 'observatory'} title="Ver no céu">
          {db.meta.world?.name ?? 'Recanto'} › Observatório › {db.constellations[g.constellationId]?.name}
        </button>
      }
      title={<InlineEdit value={g.title} label="Título do objetivo" onCommit={(title) => upd({ title }, 'Renomear objetivo')} />}
      actions={
        <Menu label="Ações do objetivo">
          <MenuItem onClick={() => upd({ dormant: !g.dormant }, g.dormant ? 'Reacender objetivo' : 'Adormecer objetivo')}>{g.dormant ? 'Reacender' : 'Deixar adormecer'}</MenuItem>
          <MenuItem danger onClick={() => { runWithUndo('Excluir objetivo', (d) => ops.deleteGoal(d, id), 'Objetivo na lixeira por 30 dias.'); ui.back(); }}>Excluir</MenuItem>
        </Menu>
      }
    >
      <div className="chips">
        <Chip tone={p.state === 'done' ? 'ok' : p.state === 'active' ? 'gold' : 'muted'}>{STATE_TEXT[p.state]}</Chip>
        {g.dormant && (
          <button className="link" onClick={() => upd({ dormant: false }, 'Reacender objetivo')}>
            Reacender
          </button>
        )}
      </div>
      {p.state !== 'nopath' && p.state !== 'dormant' && <Progress ratio={p.ratio} label={`${Math.round(p.ratio * 100)}% · ${projects.length} projeto(s)`} />}
      <Field label="Horizonte">
        <Segmented<Horizon> label="Horizonte" value={g.horizon} onChange={(horizon) => upd({ horizon }, 'Mudar horizonte')} options={HORIZONS.map((h) => ({ value: h, label: HORIZON_LABEL[h] }))} />
      </Field>
      <Field label="Constelação">
        <select className="field-input" value={g.constellationId} onChange={(e) => upd({ constellationId: e.target.value }, 'Mover objetivo de constelação')}>
          {cons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descrição">
        <AutoInput multiline value={g.description} label="Descrição do objetivo" onCommit={(description) => upd({ description }, 'Editar descrição', `gdesc:${id}`)} />
      </Field>
      <Section title="Projetos ligados" count={projects.length}>
        {!projects.length && <Empty>Esta estrela ainda não tem caminho. Trace um abaixo.</Empty>}
        {projects.map((b) => (
          <div key={b.id}>
            <BookRow
              book={b}
              showAddress
              extra={
                <button className="mini" aria-label={`Desligar ${b.title}`} title="Desligar do objetivo" onClick={() => run('Desligar projeto', (d) => ops.linkProject(d, id, b.id, false))}>
                  ×
                </button>
              }
            />
            <Progress ratio={projectProgress(db, b.id).ratio} label={`${Math.round(projectProgress(db, b.id).ratio * 100)}%`} />
          </div>
        ))}
      </Section>
      <Section title="Traçar caminho">
        <p className="muted">Crie um projeto novo em uma casa, ou ligue um projeto que já existe.</p>
        <HouseSelect value={defaultHouse} label="Casa do novo projeto" allowNone={null} onChange={setHouseId} />
        <QuickAdd
          placeholder="Nome do novo projeto"
          label="Novo projeto para este objetivo"
          onAdd={(title) => {
            if (!defaultHouse) return ui.toast('Crie uma casa primeiro para guardar o projeto.', 'error');
            const b = run('Traçar caminho', (d) => ops.tracePath(d, id, { title, houseId: defaultHouse }));
            if (b) ui.toast('Projeto criado e ligado ao objetivo.', 'ok');
          }}
        />
        {linkable && <BookPicker value={null} label="Ligar projeto existente" placeholder="Ligar um projeto existente…" filter={(b) => !!b.project && !b.archivedAt && !g.projectIds.includes(b.id)} onChange={(bookId) => bookId && run('Ligar projeto', (d) => ops.linkProject(d, id, bookId))} />}
      </Section>
    </Panel>
  );
}
