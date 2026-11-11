/**
 * Modo Reforma: catálogo lateral, propriedades do objeto selecionado e lista de objetos.
 * Tudo aqui tem alternativa por teclado e por botões, sem depender de arrastar.
 */
import { useMemo, useState } from 'react';
import { CATALOG, CATEGORY_LABEL, catalogItem, findCatalogItem, type CatalogItem } from '@/domain/catalog';
import { cityPlan } from '@/domain/city';
import { footprint, placementsIn, validatePlacement } from '@/domain/grid';
import * as ops from '@/domain/ops';
import { CITY_SCOPE, CONTAINER_LABEL, type ContainerType, type ID, type Placement, type Rot } from '@/domain/types';
import { normalize } from '@/domain/util';
import { objectSprite, spritePreviewUrl } from '@/game/art/sprites';
import { doRedo, doUndo, run, runWithUndo } from '@/store/actions';
import { dbStore, getDb } from '@/store/db';
import { gameBus } from '@/store/gameApi';
import { ui, uiStore } from '@/store/ui';
import { useStore } from 'zustand';
import { Attachments } from './editors';
import { Empty, Field, InlineEdit, Section, Swatches, useDb, useUi } from './kit';

function ItemPreview({ item, variant = 0, color, rot = 0, max = 44 }: { item: CatalogItem; variant?: number; color?: string | null; rot?: number; max?: number }) {
  const a = objectSprite({ catalogId: item.id, variant, color: color ?? item.colors[0] ?? null, rot });
  const w = a.canvas.width / a.frames;
  const h = a.canvas.height;
  const s = Math.max(1, Math.min(3, Math.floor(max / Math.max(w, h))));
  const k = Math.min(1, max / (Math.max(w, h) * s));
  return <img className="px-preview" src={spritePreviewUrl(a)} width={w * s * k} height={h * s * k} alt="" />;
}

/** Move o objeto selecionado uma célula; se não couber, só avisa na dica. */
export function nudgeSelected(dx: number, dy: number): void {
  const id = ui.get().selectedId;
  const p = id ? getDb().placements[id] : undefined;
  if (!p) return;
  const item = catalogItem(p.catalogId);
  const x = p.x + dx;
  const y = item.mount === 'wall' ? 0 : p.y + dy;
  const plan = p.scope === CITY_SCOPE ? cityPlan(getDb().meta.world?.expansion ?? 0) : null;
  const v = validatePlacement(getDb(), p.scope, { catalogId: p.catalogId, x, y, rot: p.rot }, plan, p.id);
  if (!v.ok) return void uiStore.setState({ hint: v.reason ?? 'Não cabe aqui.' });
  uiStore.setState({ hint: null });
  run('Mover objeto', (d) => ops.movePlacement(d, p.id, x, y), { merge: `nudge:${p.id}` });
}

export function rotateSelected(): void {
  const s = ui.get();
  if (s.placing) {
    const item = findCatalogItem(s.placing.catalogId);
    if (item?.rotatable) uiStore.setState({ placing: { ...s.placing, rot: ((s.placing.rot + 1) % 4) as Rot } });
    return;
  }
  if (s.selectedId) run('Girar objeto', (d) => ops.rotatePlacement(d, s.selectedId!));
}

export function duplicateSelected(): void {
  const id = ui.get().selectedId;
  if (!id) return;
  const n = run('Duplicar objeto', (d) => ops.duplicatePlacement(d, id));
  if (n) ui.select(n);
}

export function removeSelected(): void {
  const id = ui.get().selectedId;
  const p = id ? getDb().placements[id] : undefined;
  if (!p) return;
  const f = p.furnitureId ? getDb().furniture[p.furnitureId] : undefined;
  if (f?.kind === 'essential') return ui.toast('Este móvel é essencial: você pode mover e mudar a aparência, mas não remover.', 'info');
  if (f) return ui.push({ type: 'deleteFurniture', id: f.id });
  runWithUndo('Remover objeto', (d) => ops.removePlacement(d, p.id), 'Objeto removido.');
  ui.select(null);
}

function ObjectProps({ p }: { p: Placement }) {
  const db = useDb();
  const item = catalogItem(p.catalogId);
  const f = p.furnitureId ? db.furniture[p.furnitureId] : undefined;
  const essential = f?.kind === 'essential';
  return (
    <Section title="Objeto selecionado">
      <div className="reform-selected">
        <ItemPreview item={item} variant={p.variant} color={p.color} rot={p.rot} max={64} />
        <div>
          {f ? <InlineEdit className="strong" value={f.name} label="Nome do móvel" onCommit={(name) => run('Renomear móvel', (d) => ops.renameFurniture(d, f.id, name))} /> : <strong>{item.name}</strong>}
          <div className="muted">{essential ? 'Móvel essencial' : f ? CONTAINER_LABEL[f.containerType!] : CATEGORY_LABEL[item.category]}</div>
        </div>
      </div>
      {f?.kind === 'container' && (
        <Field label="Tipo" hint="Só muda a aparência. Os livros continuam no mesmo móvel e no mesmo endereço.">
          <select className="field-input" value={f.containerType} onChange={(e) => run('Trocar tipo do móvel', (d) => ops.setContainerType(d, f.id, e.target.value as ContainerType))}>
            {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((t) => (
              <option key={t} value={t}>
                {CONTAINER_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {item.variants.length > 1 && (
        <Field label="Variação">
          <select className="field-input" value={p.variant} onChange={(e) => run('Mudar variação', (d) => ops.setPlacementLook(d, p.id, { variant: Number(e.target.value) }))}>
            {item.variants.map((v, i) => (
              <option key={v} value={i}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      )}
      {item.colors.length > 0 && (
        <Field label="Cor">
          <Swatches options={item.colors} value={p.color ?? item.colors[0]} label="Cor do objeto" onChange={(color) => run('Mudar cor', (d) => ops.setPlacementLook(d, p.id, { color }))} />
        </Field>
      )}
      {item.acceptsImage && (
        <Field label="Imagem do quadro" hint="Escolha uma imagem sua para exibir na moldura.">
          <Attachments ids={p.imageId ? [p.imageId] : []} images single label="Imagem do quadro" onChange={(ids) => run('Mudar imagem do quadro', (d) => ops.setPlacementLook(d, p.id, { imageId: ids[0] ?? null }))} />
        </Field>
      )}
      <div className="nudge" role="group" aria-label="Mover objeto">
        <button className="btn ghost" aria-label="Mover para a esquerda" onClick={() => nudgeSelected(-1, 0)}>
          ←
        </button>
        <button className="btn ghost" aria-label="Mover para cima" onClick={() => nudgeSelected(0, -1)}>
          ↑
        </button>
        <button className="btn ghost" aria-label="Mover para baixo" onClick={() => nudgeSelected(0, 1)}>
          ↓
        </button>
        <button className="btn ghost" aria-label="Mover para a direita" onClick={() => nudgeSelected(1, 0)}>
          →
        </button>
      </div>
      <div className="btn-row">
        <button className="btn ghost" disabled={!item.rotatable} onClick={rotateSelected} title="Girar (G)">
          ⟳ Girar
        </button>
        <button className="btn ghost" disabled={essential} onClick={duplicateSelected} title="Duplicar (D)">
          ⧉ Duplicar
        </button>
        <button className="btn danger" disabled={essential} onClick={removeSelected} title="Remover (Delete)">
          Remover
        </button>
      </div>
      {essential && <p className="muted">Móvel essencial: sustenta uma função do app. Pode ser movido e mudar de aparência, mas não removido.</p>}
      {f?.kind === 'container' && <p className="muted">Mover ou girar o móvel não muda o endereço dos livros.</p>}
    </Section>
  );
}

function HouseProps({ id }: { id: ID }) {
  const db = useDb();
  const h = db.houses[id];
  const moving = useUi((s) => s.movingHouseId === id);
  if (!h) return null;
  return (
    <Section title="Casa selecionada">
      <InlineEdit className="strong" value={h.name} label="Nome da casa" onCommit={(name) => run('Renomear casa', (d) => ops.updateHouse(d, id, { name }))} />
      <div className="btn-row">
        <button className={`btn${moving ? '' : ' ghost'}`} aria-pressed={moving} onClick={() => uiStore.setState({ movingHouseId: moving ? null : id })}>
          {moving ? 'Escolha um terreno livre…' : 'Mover de terreno'}
        </button>
        <button className="btn ghost" onClick={() => ui.push({ type: 'house', id })}>
          Tema, modelo e cores
        </button>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => run('Ocultar casa', (d) => ops.updateHouse(d, id, { hidden: true }))}>
          Ocultar
        </button>
        <button className="btn danger" onClick={() => ui.push({ type: 'deleteHouse', id })}>
          Excluir…
        </button>
      </div>
      <p className="muted">Você também pode arrastar a casa até um terreno livre.</p>
    </Section>
  );
}

export function ReformDock() {
  const db = useDb();
  const place = useUi((s) => s.place);
  const selectedId = useUi((s) => s.selectedId);
  const selectedHouseId = useUi((s) => s.selectedHouseId);
  const placing = useUi((s) => s.placing);
  const hint = useUi((s) => s.hint);
  const canUndo = useStore(dbStore, (s) => s.undoStack.length > 0);
  const canRedo = useStore(dbStore, (s) => s.redoStack.length > 0);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [tab, setTab] = useState<'catalogo' | 'objetos'>('catalogo');
  const scope = place.kind === 'house' ? 'interior' : 'city';
  const scopeId = place.kind === 'house' ? place.houseId : CITY_SCOPE;
  const items = useMemo(() => {
    const n = normalize(q);
    return CATALOG.filter((i) => i.scope === scope && i.kind !== 'essential' && (!cat || i.category === cat) && (!n || normalize(i.name).includes(n)));
  }, [q, cat, scope]);
  const cats = useMemo(() => [...new Set(CATALOG.filter((i) => i.scope === scope && i.kind !== 'essential').map((i) => i.category))], [scope]);
  const placements = placementsIn(db, scopeId);
  const selected = selectedId ? db.placements[selectedId] : undefined;
  const placingItem = placing ? findCatalogItem(placing.catalogId) : undefined;

  const begin = (item: CatalogItem, e: React.PointerEvent) => {
    const cur = ui.get().placing;
    ui.startPlacing({ catalogId: item.id, variant: cur?.catalogId === item.id ? cur.variant : 0, color: cur?.catalogId === item.id ? cur.color : (item.colors[0] ?? null), rot: 0 });
    // Arrastar do catálogo até a cena: acompanha o ponteiro e solta no lugar.
    const sx = e.clientX;
    const sy = e.clientY;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) dragged = true;
      if (dragged) gameBus.emit('reform:pointer', { clientX: ev.clientX, clientY: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragged) return;
      const overDock = (ev.target as HTMLElement | null)?.closest?.('.reform-dock');
      if (!overDock) gameBus.emit('reform:drop', { clientX: ev.clientX, clientY: ev.clientY });
      ui.startPlacing(null);
    };
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (place.kind === 'observatory') return null;
  return (
    <aside className="reform-dock" aria-label="Modo Reforma">
      <header className="panel-head">
        <div className="panel-title">
          <div className="kicker">{scope === 'city' ? 'Cidade' : db.houses[scopeId]?.name}</div>
          <h2>Modo Reforma</h2>
        </div>
        <button className="icon-btn" disabled={!canUndo} onClick={doUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
          ↶
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={doRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
          ↷
        </button>
        <button className="btn" onClick={() => ui.setReform(false)} title="Sair do Modo Reforma (R)">
          Concluir
        </button>
      </header>
      <div className="panel-body">
        <p className={`reform-hint${hint ? ' warn' : ''}`} role="status">
          {hint ?? (placing ? 'Clique na cena para colocar. Esc para parar.' : 'Tudo é salvo automaticamente. Nada aqui tem custo.')}
        </p>
        {selected && selected.scope === scopeId && <ObjectProps p={selected} />}
        {selectedHouseId && scope === 'city' && <HouseProps id={selectedHouseId} />}
        {placing && placingItem && (
          <Section title={`Inserindo: ${placingItem.name}`} aside={<button className="btn ghost" onClick={() => ui.startPlacing(null)}>Parar</button>}>
            <div className="reform-selected">
              <ItemPreview item={placingItem} variant={placing.variant} color={placing.color} rot={placing.rot} max={64} />
              <div className="grow">
                {placingItem.variants.length > 1 && (
                  <select className="field-input" value={placing.variant} aria-label="Variação" onChange={(e) => uiStore.setState({ placing: { ...placing, variant: Number(e.target.value) } })}>
                    {placingItem.variants.map((v, i) => (
                      <option key={v} value={i}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {placingItem.colors.length > 0 && <Swatches options={placingItem.colors} value={placing.color} label="Cor" onChange={(color) => uiStore.setState({ placing: { ...placing, color } })} />}
                {placingItem.rotatable && (
                  <button className="btn ghost" onClick={rotateSelected}>
                    ⟳ Girar (G)
                  </button>
                )}
              </div>
            </div>
          </Section>
        )}
        <div className="segmented" role="tablist" aria-label="Seções da reforma">
          <button role="tab" aria-selected={tab === 'catalogo'} className={tab === 'catalogo' ? 'on' : ''} onClick={() => setTab('catalogo')}>
            Catálogo
          </button>
          <button role="tab" aria-selected={tab === 'objetos'} className={tab === 'objetos' ? 'on' : ''} onClick={() => setTab('objetos')}>
            Objetos aqui ({placements.length})
          </button>
        </div>
        {tab === 'catalogo' ? (
          <>
            <input className="field-input" value={q} placeholder="Buscar no catálogo…" aria-label="Buscar no catálogo" onChange={(e) => setQ(e.target.value)} />
            <div className="chips">
              <button className={`chip toggle${!cat ? ' on' : ''}`} onClick={() => setCat('')}>
                Tudo
              </button>
              {cats.map((c) => (
                <button key={c} className={`chip toggle${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
                  {CATEGORY_LABEL[c] ?? c}
                </button>
              ))}
            </div>
            <div className="catalog-grid">
              {items.map((item) => {
                const fp = footprint(item, 0);
                return (
                  <button key={item.id} className={`catalog-item${placing?.catalogId === item.id ? ' on' : ''}`} title={`${item.name} (${fp.w}×${fp.h})`} onPointerDown={(e) => begin(item, e)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ui.startPlacing({ catalogId: item.id, variant: 0, color: item.colors[0] ?? null, rot: 0 })}>
                    <span className="catalog-thumb">
                      <ItemPreview item={item} />
                    </span>
                    <span className="catalog-name">{item.name}</span>
                  </button>
                );
              })}
              {!items.length && <Empty>Nada no catálogo com esse nome.</Empty>}
            </div>
          </>
        ) : (
          <div className="object-list">
            {!placements.length && <Empty>Nenhum objeto por aqui ainda.</Empty>}
            {placements.map((p) => {
              const item = findCatalogItem(p.catalogId);
              const f = p.furnitureId ? db.furniture[p.furnitureId] : undefined;
              return (
                <button key={p.id} className={`row pick${selectedId === p.id ? ' suggested' : ''}`} onClick={() => ui.select(p.id)}>
                  <span className="row-title">{f?.name ?? item?.name ?? 'Objeto'}</span>
                  <span className="row-meta">{f ? (f.kind === 'essential' ? 'Essencial' : CONTAINER_LABEL[f.containerType!]) : 'Decoração'}</span>
                </button>
              );
            })}
          </div>
        )}
        {scope === 'city' ? (
          <Section title="Cidade">
            <div className="btn-row">
              <button className="btn ghost" onClick={() => ui.push({ type: 'newHouse' })}>
                + Nova casa
              </button>
              <button className="btn ghost" onClick={() => runWithUndo('Ampliar a cidade', (d) => ops.expandCity(d), 'A cidade cresceu: novos terrenos ao sul.')}>
                Liberar mais terrenos
              </button>
            </div>
          </Section>
        ) : (
          <Section title="Esta casa">
            <div className="btn-row">
              <button className="btn ghost" onClick={() => ui.push({ type: 'house', id: scopeId })}>
                Tema e aparência
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  ui.confirm({
                    title: 'Restaurar a disposição inicial?',
                    body: 'Os móveis voltam aos lugares de origem e a decoração volta ao padrão do tema. Livros e móveis são mantidos. Dá para desfazer.',
                    confirmLabel: 'Restaurar',
                    onConfirm: () => runWithUndo('Restaurar disposição inicial', (d) => ops.restoreDefaultLayout(d, scopeId), 'Disposição inicial restaurada.'),
                  })
                }
              >
                Restaurar a disposição inicial
              </button>
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}
