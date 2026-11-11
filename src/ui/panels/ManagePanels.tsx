/**
 * Casas (criar, editar, ordenar, ocultar) e os diálogos de exclusão que exigem
 * decidir o destino do conteúdo.
 */
import { useState } from 'react';
import { HOUSE_MODELS, houseModel, THEMES, themeById } from '@/domain/catalog';
import { cityPlan } from '@/domain/city';
import { freeLots } from '@/domain/grid';
import * as ops from '@/domain/ops';
import { containers, contentCount, furnitureBooks, houseSummary, liveGoals, liveHouses, liveTemplates, tidy } from '@/domain/selectors';
import type { ID } from '@/domain/types';
import { plural } from '@/domain/util';
import { houseSprites, spritePreviewUrl } from '@/game/art/sprites';
import { doUndo, run, runWithUndo } from '@/store/actions';
import { goToHouse } from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { Chip, Empty, Field, InlineEdit, Panel, Section, Swatches, useDb, useNow } from '../kit';

function HousePreview({ modelId, color, themeId, size = 2 }: { modelId: string; color: string; themeId: string; size?: number }) {
  const a = houseSprites(modelId, color, themeId);
  const w = a.body.canvas.width * size;
  const h = a.body.canvas.height * size;
  const body = spritePreviewUrl(Object.assign(a.body, { key: a.key + ':b' }));
  const roof = spritePreviewUrl(Object.assign(a.roof, { key: a.key + ':r' }));
  return (
    <span className="house-preview" style={{ width: w, height: h }} aria-hidden="true">
      <img src={body} width={w} height={h} alt="" />
      <img src={roof} width={w} height={h} alt="" />
    </span>
  );
}

export function HousesPanel() {
  const db = useDb();
  const houses = liveHouses(db, true);
  const plan = cityPlan(db.meta.world?.expansion ?? 0);
  const free = freeLots(db, plan).length;
  const move = (i: number, dir: number) => {
    const ids = houses.map((h) => h.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run('Reordenar casas', (d) => ops.reorderHouses(d, ids));
  };
  return (
    <Panel label="Casas" icon="key" kicker={db.meta.world?.name ?? 'Recanto'} title="Casas">
      <p className="lede">Cada casa é uma área da vida. A ordem define os atalhos 1 a 6.</p>
      {!houses.length && <Empty>Nenhuma casa ainda. Crie a primeira.</Empty>}
      {houses.map((h, i) => (
        <div key={h.id} className={`row${h.hidden ? ' dim' : ''}`}>
          <button className="row-main" onClick={() => ui.push({ type: 'house', id: h.id })}>
            <span className="row-title">
              {i < 6 && !h.hidden && <kbd>{i + 1}</kbd>} {h.name}
            </span>
            <span className="row-meta">
              <span>{themeById(h.themeId).area}</span>
              <span>{h.hidden ? 'Oculta' : tidy(db, h.id).label}</span>
            </span>
          </button>
          <button className="mini" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button className="mini" aria-label={`Descer ${h.name}`} disabled={i === houses.length - 1} onClick={() => move(i, 1)}>
            ↓
          </button>
          {!h.hidden && (
            <button className="mini go" aria-label={`Ir até ${h.name}`} title="Ir até lá" onClick={() => void goToHouse(h.id)}>
              ➜
            </button>
          )}
        </div>
      ))}
      <button className="btn wide" onClick={() => ui.push({ type: 'newHouse' })}>
        + Nova casa
      </button>
      <Section title="Terrenos">
        <p className="muted">
          {plural(free, 'terreno livre', 'terrenos livres')} de {plan.lots.length}.
        </p>
        <button className="btn ghost" onClick={() => runWithUndo('Ampliar a cidade', (d) => ops.expandCity(d), 'A cidade cresceu: novos terrenos ao sul.')}>
          Liberar mais terrenos
        </button>
      </Section>
    </Panel>
  );
}

export function NewHousePanel({ lotId }: { lotId?: string }) {
  const db = useDb();
  const [themeId, setThemeId] = useState('simples');
  const [modelId, setModelId] = useState(themeById('simples').model);
  const [name, setName] = useState('');
  const model = houseModel(modelId);
  const plan = cityPlan(db.meta.world?.expansion ?? 0);
  const free = freeLots(db, plan);
  const lot = lotId && free.includes(lotId) ? lotId : ops.suggestLot(db);
  const create = () => {
    const id = run('Nova casa', (d) => ops.createHouse(d, { name, themeId, modelId, lotId: lot }));
    if (!id) return;
    ui.closeAll();
    ui.toast(`A casa ${name.trim()} está pronta, já mobiliada.`, 'ok');
    void goToHouse(id);
  };
  return (
    <Panel label="Nova casa" icon="plus" kicker="Uma nova área da vida" title="Nova casa" footer={<button className="btn wide" disabled={!name.trim()} onClick={create}>Criar casa</button>}>
      <Field label="Nome" hint="A casa é uma área da vida, não uma pessoa ou um projeto.">
        <input className="field-input" value={name} autoFocus placeholder="Ex.: Jardim, Viagens, Família" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
      </Field>
      <Field label="Tema do interior">
        <div className="chips" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={themeId === t.id} className={`chip toggle${themeId === t.id ? ' on' : ''}`} title={t.desc} onClick={() => (setThemeId(t.id), setModelId(t.model))}>
              {t.name}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Modelo da casa">
        <div className="model-grid" role="radiogroup" aria-label="Modelo da casa">
          {HOUSE_MODELS.map((m) => (
            <button key={m.id} role="radio" aria-checked={modelId === m.id} className={`model${modelId === m.id ? ' on' : ''}`} title={m.desc} onClick={() => setModelId(m.id)}>
              <HousePreview modelId={m.id} color={m.colors.includes(themeById(themeId).color) ? themeById(themeId).color : m.colors[0]} themeId={themeId} size={1} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </Field>
      <p className="muted">
        {model.desc} {lot ? `Terreno sugerido: ${lot}. Você pode mover a casa depois, no Modo Reforma.` : 'Não há terreno livre: um novo trecho da cidade será aberto.'}
      </p>
    </Panel>
  );
}

export function HousePanel({ id }: { id: ID }) {
  const db = useDb();
  const now = useNow();
  const h = db.houses[id];
  if (!h || h.trash) return <Panel title="Casa" label="Casa"><Empty>Esta casa não existe mais.</Empty></Panel>;
  const model = houseModel(h.modelId);
  const t = tidy(db, id);
  const c = contentCount(db, { houseId: id });
  return (
    <Panel label={`Casa ${h.name}`} icon={themeById(h.themeId).emblem} kicker={`${db.meta.world?.name ?? 'Recanto'} › Casa`} title={<InlineEdit value={h.name} label="Nome da casa" onCommit={(name) => run('Renomear casa', (d) => ops.updateHouse(d, id, { name }))} />}>
      <div className="house-card">
        <HousePreview modelId={h.modelId} color={h.color} themeId={h.themeId} />
        <div>
          <div className="chips">
            <Chip tone={t.level >= 2 ? 'ok' : t.level === 0 ? 'gold' : undefined}>{t.label}</Chip>
            {h.hidden && <Chip tone="muted">Oculta</Chip>}
          </div>
          <p>{houseSummary(db, id, now)}</p>
          <p className="muted">
            {plural(c.books, 'livro', 'livros')} · {plural(c.tasks, 'tarefa', 'tarefas')}
          </p>
        </div>
      </div>
      <div className="btn-row">
        {!h.hidden && (
          <button className="btn" onClick={() => void goToHouse(id)}>
            Entrar
          </button>
        )}
        <button className="btn ghost" onClick={() => { ui.closeAll(); uiStore.setState({ place: uiStore.getState().place.kind === 'city' ? uiStore.getState().place : { kind: 'city' }, reform: true, movingHouseId: id, selectedHouseId: id }); ui.toast('Escolha um terreno livre no mapa.', 'info'); }}>
          Mover de terreno
        </button>
        <button className="btn ghost" onClick={() => run(h.hidden ? 'Mostrar casa' : 'Ocultar casa', (d) => ops.updateHouse(d, id, { hidden: !h.hidden }))}>{h.hidden ? 'Mostrar' : 'Ocultar'}</button>
      </div>
      <Section title="Aparência">
        <Field label="Tema do interior">
          <select className="field-input" value={h.themeId} onChange={(e) => run('Trocar tema da casa', (d) => ops.updateHouse(d, id, { themeId: e.target.value }))}>
            {THEMES.map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modelo">
          <select className="field-input" value={h.modelId} onChange={(e) => run('Trocar modelo da casa', (d) => ops.updateHouse(d, id, { modelId: e.target.value }))}>
            {HOUSE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cor do telhado">
          <Swatches options={model.colors} value={h.color} label="Cor do telhado" onChange={(color) => run('Mudar cor do telhado', (d) => ops.updateHouse(d, id, { color }))} />
        </Field>
      </Section>
      <Section title="Interior">
        <div className="btn-row">
          <button
            className="btn ghost"
            onClick={() =>
              ui.confirm({
                title: 'Restaurar a disposição inicial?',
                body: 'Os móveis voltam aos lugares de origem e a decoração volta ao padrão do tema. Livros e móveis são mantidos. Dá para desfazer.',
                confirmLabel: 'Restaurar',
                onConfirm: () => runWithUndo('Restaurar disposição inicial', (d) => ops.restoreDefaultLayout(d, id), 'Disposição inicial restaurada.'),
              })
            }
          >
            Restaurar a disposição inicial
          </button>
        </div>
      </Section>
      <button className="btn danger wide" onClick={() => ui.push({ type: 'deleteHouse', id })}>
        Excluir casa…
      </button>
    </Panel>
  );
}

// ───────────────────────────── Exclusões com destino ─────────────────────────────

function Choice({ checked, onChange, title, children }: { checked: boolean; onChange: () => void; title: string; children?: React.ReactNode }) {
  return (
    <label className={`choice${checked ? ' on' : ''}`}>
      <input type="radio" checked={checked} onChange={onChange} />
      <span>
        <strong>{title}</strong>
        {children}
      </span>
    </label>
  );
}

export function DeleteHousePanel({ id }: { id: ID }) {
  const db = useDb();
  const h = db.houses[id];
  const others = liveHouses(db, true).filter((x) => x.id !== id);
  const [mode, setMode] = useState<'move' | 'archive' | 'trash'>(others.length ? 'move' : 'archive');
  const [target, setTarget] = useState<ID>(others[0]?.id ?? '');
  if (!h) return null;
  const c = contentCount(db, { houseId: id });
  const empty = c.books + c.tasks === 0;
  const confirm = () => {
    const dest: ops.ContentDest = empty ? { mode: 'trash' } : mode === 'move' ? { mode: 'move', houseId: target } : { mode };
    const batch = run('Excluir casa', (d) => ops.deleteHouse(d, id, dest));
    if (!batch) return;
    ui.closeAll();
    uiStore.setState({ selectedHouseId: null });
    ui.toast(`Casa ${h.name} na lixeira por 30 dias.`, 'ok', 'Desfazer', () => doUndo());
  };
  return (
    <Panel label="Excluir casa" icon="trash" kicker="Excluir casa" title={h.name} footer={<div className="btn-row spread"><button className="btn ghost" onClick={() => ui.back()}>Cancelar</button><button className="btn danger" disabled={!empty && mode === 'move' && !target} onClick={confirm}>Excluir casa</button></div>}>
      {empty ? (
        <p className="lede">Esta casa está vazia. Ela vai para a lixeira e pode ser restaurada por 30 dias.</p>
      ) : (
        <>
          <p className="lede">
            Esta casa guarda <strong>{plural(c.books, 'livro', 'livros')}</strong> e <strong>{plural(c.tasks, 'tarefa', 'tarefas')}</strong>. Para onde vai esse conteúdo?
          </p>
          {others.length > 0 && (
            <Choice checked={mode === 'move'} onChange={() => setMode('move')} title="Mover para outra casa">
              <select className="field-input" value={target} aria-label="Casa de destino" onChange={(e) => (setTarget(e.target.value), setMode('move'))}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <span className="muted">Os livros chegam ao chão da casa escolhida, prontos para guardar.</span>
            </Choice>
          )}
          <Choice checked={mode === 'archive'} onChange={() => setMode('archive')} title="Arquivar">
            <span className="muted">Tudo vai para o Arquivo geral, no Correio, e continua consultável.</span>
          </Choice>
          <Choice checked={mode === 'trash'} onChange={() => setMode('trash')} title={`Excluir junto (${c.books + c.tasks} itens)`}>
            <span className="muted">Casa e conteúdo vão para a lixeira e podem ser restaurados juntos por 30 dias.</span>
          </Choice>
        </>
      )}
    </Panel>
  );
}

export function DeleteFurniturePanel({ id }: { id: ID }) {
  const db = useDb();
  const f = db.furniture[id];
  const others = f ? containers(db, f.houseId).filter((x) => x.id !== id) : [];
  const [mode, setMode] = useState<'move' | 'floor' | 'archive' | 'trash'>(others.length ? 'move' : 'floor');
  const [target, setTarget] = useState<ID>(others[0]?.id ?? '');
  if (!f) return null;
  const n = furnitureBooks(db, id).length;
  const confirm = () => {
    const dest: ops.ContentDest = n === 0 ? { mode: 'trash' } : mode === 'move' ? { mode: 'move', furnitureId: target } : { mode };
    const batch = run('Excluir móvel', (d) => ops.deleteFurniture(d, id, dest));
    if (!batch) return;
    ui.closeAll();
    uiStore.setState({ selectedId: null });
    ui.toast(`${f.name} na lixeira por 30 dias.`, 'ok', 'Desfazer', () => doUndo());
  };
  return (
    <Panel label="Excluir móvel" icon="trash" kicker="Excluir móvel" title={f.name} footer={<div className="btn-row spread"><button className="btn ghost" onClick={() => ui.back()}>Cancelar</button><button className="btn danger" onClick={confirm}>Excluir móvel</button></div>}>
      {n === 0 ? (
        <p className="lede">Este móvel está vazio. Ele vai para a lixeira e pode ser restaurado por 30 dias.</p>
      ) : (
        <>
          <p className="lede">
            Este móvel guarda <strong>{plural(n, 'livro', 'livros')}</strong>. Para onde eles vão?
          </p>
          {others.length > 0 && (
            <Choice checked={mode === 'move'} onChange={() => setMode('move')} title="Mover para outro móvel">
              <select className="field-input" value={target} aria-label="Móvel de destino" onChange={(e) => (setTarget(e.target.value), setMode('move'))}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Choice>
          )}
          <Choice checked={mode === 'floor'} onChange={() => setMode('floor')} title="Deixar no chão da casa">
            <span className="muted">Ficam soltos, prontos para guardar em outro lugar.</span>
          </Choice>
          <Choice checked={mode === 'archive'} onChange={() => setMode('archive')} title="Arquivar no baú" />
          <Choice checked={mode === 'trash'} onChange={() => setMode('trash')} title={`Excluir junto (${n} livros)`}>
            <span className="muted">Móvel e livros vão para a lixeira por 30 dias.</span>
          </Choice>
        </>
      )}
    </Panel>
  );
}

export function DeleteTemplatePanel({ id }: { id: ID }) {
  const db = useDb();
  const t = db.templates[id];
  const others = liveTemplates(db).filter((x) => x.id !== id);
  const [target, setTarget] = useState('tpl_note');
  if (!t) return null;
  const n = Object.values(db.books).filter((b) => b.templateId === id && !b.trash).length;
  return (
    <Panel
      label="Excluir modelo"
      icon="trash"
      kicker="Excluir modelo de livro"
      title={t.name}
      footer={
        <div className="btn-row spread">
          <button className="btn ghost" onClick={() => ui.back()}>
            Cancelar
          </button>
          <button className="btn danger" onClick={() => { if (run('Excluir modelo', (d) => ops.deleteTemplate(d, id, target))) { ui.back(); ui.toast(`Modelo ${t.name} na lixeira por 30 dias.`, 'ok'); } }}>
            Excluir modelo
          </button>
        </div>
      }
    >
      <p className="lede">
        {n ? (
          <>
            <strong>{plural(n, 'livro usa', 'livros usam')}</strong> este modelo. Qual modelo eles passam a usar?
          </>
        ) : (
          'Nenhum livro usa este modelo.'
        )}
      </p>
      {n > 0 && (
        <>
          <select className="field-input" value={target} aria-label="Modelo de destino" onChange={(e) => setTarget(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <p className="muted">Nada se perde: os campos preenchidos viram texto na primeira página de cada livro.</p>
        </>
      )}
    </Panel>
  );
}

export function DeleteConstellationPanel({ id }: { id: ID }) {
  const db = useDb();
  const c = db.constellations[id];
  const others = Object.values(db.constellations).filter((x) => x.id !== id);
  const [mode, setMode] = useState<'move' | 'trash'>(others.length ? 'move' : 'trash');
  const [target, setTarget] = useState<ID>(others[0]?.id ?? '');
  if (!c) return null;
  const n = liveGoals(db).filter((g) => g.constellationId === id).length;
  return (
    <Panel
      label="Excluir constelação"
      icon="trash"
      kicker="Excluir constelação"
      title={c.name}
      footer={
        <div className="btn-row spread">
          <button className="btn ghost" onClick={() => ui.back()}>
            Cancelar
          </button>
          <button className="btn danger" onClick={() => { run('Excluir constelação', (d) => ops.deleteConstellation(d, id, mode === 'move' ? { mode, constellationId: target } : { mode })); ui.back(); }}>
            Excluir constelação
          </button>
        </div>
      }
    >
      <p className="lede">
        Esta constelação tem <strong>{plural(n, 'objetivo', 'objetivos')}</strong>. Para onde eles vão?
      </p>
      {others.length > 0 && (
        <Choice checked={mode === 'move'} onChange={() => setMode('move')} title="Mover para outra constelação">
          <select className="field-input" value={target} aria-label="Constelação de destino" onChange={(e) => (setTarget(e.target.value), setMode('move'))}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Choice>
      )}
      <Choice checked={mode === 'trash'} onChange={() => setMode('trash')} title={`Excluir os objetivos (${n})`}>
        <span className="muted">Eles vão para a lixeira e podem ser restaurados por 30 dias.</span>
      </Choice>
    </Panel>
  );
}

export function RestoreDestPanel({ items }: { items: { kind: 'book' | 'task'; id: ID }[] }) {
  const db = useDb();
  return (
    <Panel label="Onde guardar" icon="key" kicker="Restaurado da lixeira" title="Onde guardar?">
      <p className="lede">O endereço original destes itens não existe mais. Eles estão soltos até você escolher um lugar.</p>
      {items.map((it) => {
        const title = it.kind === 'book' ? db.books[it.id]?.title : db.tasks[it.id]?.title;
        if (!title) return null;
        return (
          <div key={it.id} className="row">
            <button className="row-main" onClick={() => ui.push(it.kind === 'book' ? { type: 'book', id: it.id } : { type: 'task', id: it.id })}>
              <span className="row-title">{title}</span>
              <span className="row-meta">{it.kind === 'book' ? 'Livro' : 'Tarefa'}</span>
            </button>
            <button className="btn" onClick={() => ui.push({ type: 'store', kind: it.kind, id: it.id })}>
              Guardar em…
            </button>
          </div>
        );
      })}
    </Panel>
  );
}
