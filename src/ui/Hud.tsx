/**
 * HUD: controles discretos nas bordas. O mundo ocupa a maior parte da tela.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import * as ops from '@/domain/ops';
import { bookAddress, houseSummary, inboxCount, liveHouses, looseItems, taskAddress } from '@/domain/selectors';
import { ROLE_LABEL } from '@/domain/types';
import { run } from '@/store/actions';
import { dbStore } from '@/store/db';
import { gameApi } from '@/store/gameApi';
import { goBack, goToHouse, goToObservatory, goToPlaza, leaveToCity } from '@/store/nav';
import { ui, type Panel } from '@/store/ui';
import { Icon, useDb, useNow, useUi } from './kit';
import { Minimap } from './Minimap';
import { tidyNext } from './panels/HousePanels';

const PANEL_NAME: Partial<Record<Panel['type'], string>> = {
  correio: 'Correio',
  mesa: 'Mesa do Dia',
  quadro: 'Quadro da cidade',
  ronda: 'Ronda semanal',
  goals: 'Objetivos',
  settings: 'Configurações',
  trash: 'Lixeira',
  templates: 'Modelos de livro',
  houses: 'Casas',
  newHouse: 'Nova casa',
  help: 'Atalhos',
};

function useCrumbs(): { text: string; go?: () => void }[] {
  const db = useDb();
  const place = useUi((s) => s.place);
  const panels = useUi((s) => s.panels);
  const world = db.meta.world?.name ?? 'Recanto';
  const top = panels[panels.length - 1];
  const out: { text: string; go?: () => void }[] = [{ text: world, go: () => void goToPlaza() }];
  const house = place.kind === 'house' ? db.houses[place.houseId] : undefined;
  let parts: string[] | null = null;
  let houseId = house?.id ?? null;
  if (top?.type === 'book' && db.books[top.id]) {
    const a = bookAddress(db, db.books[top.id]);
    parts = a.parts.slice(1);
    houseId = a.houseId;
  } else if (top?.type === 'task' && db.tasks[top.id]) {
    const a = taskAddress(db, db.tasks[top.id]);
    parts = a.parts.slice(1);
    houseId = a.houseId;
  } else if (top?.type === 'furniture' && db.furniture[top.id]) {
    const f = db.furniture[top.id];
    parts = [db.houses[f.houseId]?.name ?? '', f.name];
    houseId = f.houseId;
  } else if ((top?.type === 'desk' || top?.type === 'board' || top?.type === 'chest') && top.houseId && db.houses[top.houseId]) {
    parts = [db.houses[top.houseId].name, ROLE_LABEL[top.type]];
    houseId = top.houseId;
  } else if (top?.type === 'goal' && db.goals[top.id]) {
    const g = db.goals[top.id];
    parts = ['Observatório', db.constellations[g.constellationId]?.name ?? '', g.title];
    houseId = null;
  }
  if (parts) {
    parts.forEach((text, i) => out.push({ text, go: i === 0 && houseId ? () => void goToHouse(houseId!) : undefined }));
    return out;
  }
  if (house) out.push({ text: house.name });
  else if (place.kind === 'observatory') out.push({ text: 'Observatório' });
  else out.push({ text: 'Praça' });
  if (top && PANEL_NAME[top.type]) out.push({ text: PANEL_NAME[top.type]! });
  return out;
}

function HudButton({ icon, label, onClick, badge, active, kbd }: { icon: string; label: string; onClick: () => void; badge?: number; active?: boolean; kbd?: string }) {
  return (
    <button className={`hud-btn${active ? ' on' : ''}`} onClick={onClick} aria-label={label} title={kbd ? `${label} (${kbd})` : label} aria-pressed={active}>
      <Icon name={icon} size={18} tone="papel" />
      <span className="hud-btn-label">{label}</span>
      {!!badge && <span className="hud-badge">{badge}</span>}
    </button>
  );
}

function Capture() {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'task' | 'note'>('task');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const add = () => {
    const title = text.trim();
    if (!title) return;
    if (kind === 'task') run('Nova tarefa no Correio', (d) => ops.createTask(d, { title }));
    else run('Nova anotação no Correio', (d) => ops.createBook(d, { title }));
    setText('');
    ui.toast('Está no Correio.', 'ok', 'Ver', () => ui.open({ type: 'correio' }));
  };
  return (
    <div className="capture" role="dialog" aria-label="Novo item no Correio">
      <button className="chip toggle on" onClick={() => setKind(kind === 'task' ? 'note' : 'task')} title="Alternar entre tarefa e anotação">
        {kind === 'task' ? '○ Tarefa' : '✎ Anotação'}
      </button>
      <input
        ref={ref}
        value={text}
        placeholder="Anote e siga em frente. Você decide o lugar depois."
        aria-label="Novo item no Correio"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Tab') {
            e.preventDefault();
            setKind(kind === 'task' ? 'note' : 'task');
          }
        }}
      />
      <button className="btn" onClick={add} disabled={!text.trim()}>
        Guardar no Correio
      </button>
      <button className="icon-btn" aria-label="Fechar" onClick={() => ui.setCapture(false)}>
        ×
      </button>
    </div>
  );
}

export function Hud() {
  const db = useDb();
  const now = useNow();
  const place = useUi((s) => s.place);
  const panels = useUi((s) => s.panels);
  const reform = useUi((s) => s.reform);
  const capture = useUi((s) => s.capture);
  const saveError = useStore(dbStore, (s) => s.saveError);
  const crumbs = useCrumbs();
  const inbox = inboxCount(db);
  const houses = liveHouses(db);
  const house = place.kind === 'house' ? db.houses[place.houseId] : undefined;
  const loose = house ? looseItems(db, house.id).length : 0;
  const canBack = place.kind !== 'city' || panels.length > 0 || reform;
  const api = place.kind === 'city' ? gameApi.city : place.kind === 'house' ? gameApi.interior : null;
  return (
    <div className={`hud${reform ? ' reforming' : ''}`}>
      <nav className="hud-top-left" aria-label="Onde você está">
        {canBack && (
          <button className="hud-btn solo" onClick={goBack} aria-label="Voltar" title="Voltar (Esc)">
            ‹
          </button>
        )}
        <ol className="breadcrumbs">
          {crumbs.map((c, i) => (
            <li key={i}>
              {c.go && i < crumbs.length - 1 ? (
                <button onClick={c.go}>{c.text}</button>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.text}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="hud-top-right" role="toolbar" aria-label="Navegação principal">
        <HudButton icon="search" label="Buscar" kbd="/" onClick={() => ui.push({ type: 'search' })} />
        <HudButton icon="letter" label="Correio" badge={inbox} kbd="N anota" onClick={() => ui.open({ type: 'correio' })} />
        <HudButton icon="list" label="Mesa do Dia" kbd="M" onClick={() => ui.open({ type: 'mesa' })} />
        <HudButton icon="star" label="Objetivos" onClick={() => ui.open({ type: 'goals' })} />
        <HudButton icon="key" label="Casas" onClick={() => ui.open({ type: 'houses' })} />
        {place.kind !== 'observatory' && <HudButton icon="tool" label="Reforma" kbd="R" active={reform} onClick={() => ui.setReform(!reform)} />}
        <HudButton icon="gear" label="Configurações" onClick={() => ui.open({ type: 'settings' })} />
      </div>

      {capture && <Capture />}
      {reform && !capture && (
        <div className="reform-banner" role="status">
          <Icon name="tool" size={18} tone="papel" /> Modo Reforma ativo
          <button className="link" onClick={() => ui.setReform(false)}>
            Concluir (R)
          </button>
        </div>
      )}
      {house && !reform && !capture && (
        <div className="summary" role="status">
          <span>{houseSummary(db, house.id, now)}</span>
          {loose > 0 && (
            <button className="btn small" onClick={() => tidyNext(house.id)}>
              Arrumar um item
            </button>
          )}
        </div>
      )}
      {place.kind === 'city' && !houses.length && !panels.length && !reform && (
        <div className="summary first-house" role="status">
          <span>O Recanto está pronto para a sua primeira casa.</span>
          <button className="btn small" onClick={() => ui.open({ type: 'newHouse' })}>
            Criar minha primeira casa
          </button>
        </div>
      )}
      {place.kind === 'observatory' && !panels.length && (
        <div className="summary" role="status">
          <span>Cada estrela é um objetivo.</span>
          <button className="btn small" onClick={() => ui.open({ type: 'goals' })}>
            + Novo objetivo
          </button>
        </div>
      )}
      {saveError && (
        <div className="save-error" role="alert">
          {saveError} Exporte um backup em Configurações.
        </div>
      )}

      <div className="hud-bottom-left">
        {place.kind !== 'observatory' && (
          <div className="zoom" role="group" aria-label="Zoom">
            <button className="hud-btn solo" onClick={() => api?.zoomBy(1.25)} aria-label="Aproximar" title="Aproximar (+)">
              +
            </button>
            <button className="hud-btn solo" onClick={() => api?.zoomBy(1 / 1.25)} aria-label="Afastar" title="Afastar (−)">
              −
            </button>
          </div>
        )}
        {place.kind === 'city' ? (
          <>
            <button className="hud-btn" onClick={() => void goToPlaza()} title="Voltar à Praça (0)">
              <Icon name="leaf" size={18} tone="papel" />
              <span className="hud-btn-label always">Praça</span>
            </button>
            <button className="hud-btn" onClick={() => void goToObservatory()} title="Observatório (O)">
              <Icon name="tower" size={18} tone="papel" />
              <span className="hud-btn-label">Observatório</span>
            </button>
          </>
        ) : (
          <button className="hud-btn" onClick={() => void leaveToCity()} title="Voltar à cidade (Esc)">
            <Icon name="leaf" size={18} tone="papel" />
            <span className="hud-btn-label always">Voltar à cidade</span>
          </button>
        )}
      </div>
      {place.kind === 'city' && !reform && panels.length === 0 && (
        <div className="hud-bottom-right">
          <Minimap />
        </div>
      )}
    </div>
  );
}
