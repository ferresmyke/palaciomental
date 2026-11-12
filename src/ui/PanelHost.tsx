import { ui, type Panel } from '@/store/ui';
import { useUi } from './kit';
import { BookPanel } from './panels/BookPanel';
import { CorreioPanel, MesaPanel, QuadroPanel, RondaPanel, SearchPanel } from './panels/CityPanels';
import { GoalPanel, GoalsPanel } from './panels/GoalPanels';
import { BoardPanel, ChestPanel, DeskPanel, FurniturePanel } from './panels/HousePanels';
import { DeleteConstellationPanel, DeleteFurniturePanel, DeleteHousePanel, DeleteTemplatePanel, HousePanel, HousesPanel, NewHousePanel, RestoreDestPanel } from './panels/ManagePanels';
import { StorePanel } from './panels/StorePanel';
import { HelpPanel, SettingsPanel, TemplatesPanel, TrashPanel } from './panels/SystemPanels';
import { MapPanel } from './panels/MapPanel';
import { ObsidianPanel } from './panels/ObsidianPanel';
import { TaskPanel } from './panels/TaskPanel';

function render(p: Panel) {
  switch (p.type) {
    case 'book':
      return <BookPanel key={p.id} id={p.id} />;
    case 'task':
      return <TaskPanel key={p.id} id={p.id} />;
    case 'furniture':
      return <FurniturePanel key={p.id} id={p.id} />;
    case 'desk':
      return <DeskPanel houseId={p.houseId} />;
    case 'board':
      return <BoardPanel houseId={p.houseId} />;
    case 'chest':
      return <ChestPanel houseId={p.houseId} />;
    case 'house':
      return <HousePanel key={p.id} id={p.id} />;
    case 'houses':
      return <HousesPanel />;
    case 'newHouse':
      return <NewHousePanel lotId={p.lotId} />;
    case 'correio':
      return <CorreioPanel />;
    case 'mesa':
      return <MesaPanel />;
    case 'quadro':
      return <QuadroPanel />;
    case 'search':
      return <SearchPanel />;
    case 'ronda':
      return <RondaPanel />;
    case 'goals':
      return <GoalsPanel />;
    case 'goal':
      return <GoalPanel key={p.id} id={p.id} />;
    case 'settings':
      return <SettingsPanel />;
    case 'trash':
      return <TrashPanel />;
    case 'templates':
      return <TemplatesPanel key={p.id ?? 'all'} id={p.id} />;
    case 'store':
      return <StorePanel key={p.id} kind={p.kind} id={p.id} />;
    case 'deleteHouse':
      return <DeleteHousePanel id={p.id} />;
    case 'deleteFurniture':
      return <DeleteFurniturePanel id={p.id} />;
    case 'deleteTemplate':
      return <DeleteTemplatePanel id={p.id} />;
    case 'deleteConstellation':
      return <DeleteConstellationPanel id={p.id} />;
    case 'restoreDest':
      return <RestoreDestPanel items={p.items} />;
    case 'obsidian':
      return <ObsidianPanel />;
    case 'map':
      return <MapPanel key={p.id ?? 'all'} id={p.id} />;
    case 'help':
      return <HelpPanel />;
  }
}

export function PanelHost() {
  const panels = useUi((s) => s.panels);
  const top = panels[panels.length - 1];
  if (!top) return null;
  if (top.type === 'search')
    return (
      <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && ui.back()}>
        {render(top)}
      </div>
    );
  return render(top);
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="link"
              onClick={() => {
                t.action?.();
                ui.dismissToast(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button className="mini" aria-label="Dispensar aviso" onClick={() => ui.dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Dialog() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  return (
    <div className="scrim center" onPointerDown={(e) => e.target === e.currentTarget && ui.closeDialog()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={d.title}>
        <h2>{d.title}</h2>
        {d.body && <p>{d.body}</p>}
        <div className="btn-row spread">
          <button className="btn ghost" autoFocus onClick={() => ui.closeDialog()}>
            Cancelar
          </button>
          <button
            className={`btn${d.danger ? ' danger' : ''}`}
            onClick={() => {
              ui.closeDialog();
              d.onConfirm();
            }}
          >
            {d.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
