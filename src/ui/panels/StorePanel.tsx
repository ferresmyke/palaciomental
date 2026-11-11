/**
 * "Guardar em…": a alternativa a arrastar. Sugere um móvel e permite criar um na hora.
 */
import { useState } from 'react';
import * as ops from '@/domain/ops';
import { containers, furnitureBooks, liveHouses, projectBooks } from '@/domain/selectors';
import { CONTAINER_LABEL, type ContainerType, type Db, type Furniture, type ID } from '@/domain/types';
import { normalize } from '@/domain/util';
import { run } from '@/store/actions';
import { ui } from '@/store/ui';
import { Empty, Field, Panel, Section, useDb } from '../kit';

/** Móvel sugerido: o que já guarda livros do mesmo modelo, ou cujo nome lembra o modelo. */
export function suggestFurniture(db: Db, houseId: ID, templateId: ID): Furniture | undefined {
  const list = containers(db, houseId);
  const tplName = normalize(db.templates[templateId]?.name ?? '');
  let best: Furniture | undefined;
  let bestScore = 0;
  for (const f of list) {
    const same = furnitureBooks(db, f.id).filter((b) => b.templateId === templateId).length;
    const name = normalize(f.name);
    const score = same * 2 + (tplName && (name.includes(tplName.slice(0, 5)) || tplName.includes(name.slice(0, 5))) ? 5 : 0);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best ?? list[0];
}

export function StorePanel({ kind, id }: { kind: 'book' | 'task'; id: ID }) {
  const db = useDb();
  const item = kind === 'book' ? db.books[id] : db.tasks[id];
  const place = ui.get().place;
  const [houseId, setHouseId] = useState<ID | null>(item?.houseId ?? (place.kind === 'house' ? place.houseId : null));
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ContainerType>('shelf');
  if (!item) return <Panel title="Guardar em…" label="Guardar"><Empty>Este item não existe mais.</Empty></Panel>;
  const houses = liveHouses(db, true);
  const done = (text: string, furnitureId?: ID) => {
    ui.toast(text, 'ok');
    if (furnitureId) ui.highlight({ kind: 'furniture', id: furnitureId }, 1800);
    ui.back();
  };
  const book = kind === 'book' ? db.books[id] : undefined;
  const list = houseId ? containers(db, houseId) : [];
  const suggested = houseId && book ? suggestFurniture(db, houseId, book.templateId) : undefined;
  const ordered = suggested ? [suggested, ...list.filter((f) => f.id !== suggested.id)] : list;
  const projects = houseId ? projectBooks(db).filter((b) => b.houseId === houseId) : [];
  const house = houseId ? db.houses[houseId] : undefined;
  const suggestedName = book ? (db.templates[book.templateId]?.name ?? 'Estante') + 's' : 'Estante';

  return (
    <Panel label="Guardar em" kicker="Guardar em…" title={item.title} icon="key">
      <Field label="Casa">
        <div className="chips" role="radiogroup" aria-label="Casa">
          {houses.map((h) => (
            <button key={h.id} role="radio" aria-checked={houseId === h.id} className={`chip toggle${houseId === h.id ? ' on' : ''}`} onClick={() => setHouseId(h.id)}>
              {h.name}
            </button>
          ))}
          {!houses.length && <span className="muted">Crie uma casa primeiro (botão Casas no topo).</span>}
        </div>
      </Field>
      {house && kind === 'book' && (
        <Section title={`Móveis da casa ${house.name}`}>
          {ordered.map((f) => (
            <button
              key={f.id}
              className={`row pick${f.id === suggested?.id ? ' suggested' : ''}`}
              onClick={() => {
                if (run('Guardar livro', (d) => ops.moveBook(d, id, { houseId: f.houseId, furnitureId: f.id })) !== undefined || db.books[id]) done(`Guardado em ${house.name} › ${f.name}.`, f.id);
              }}
            >
              <span className="row-title">{f.name}</span>
              <span className="row-meta">
                {CONTAINER_LABEL[f.containerType!]} · {furnitureBooks(db, f.id).length} livro(s){f.id === suggested?.id ? ' · sugerido' : ''}
              </span>
            </button>
          ))}
          {!list.length && <Empty>Esta casa ainda não tem um móvel para guardar livros.</Empty>}
          <div className="create-inline">
            <span className="field-label">Criar um móvel aqui</span>
            <div className="btn-row">
              <input className="field-input" value={newName} placeholder={suggestedName} aria-label="Nome do novo móvel" onChange={(e) => setNewName(e.target.value)} />
              <select className="field-input" value={newType} aria-label="Tipo do móvel" onChange={(e) => setNewType(e.target.value as ContainerType)}>
                {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((t) => (
                  <option key={t} value={t}>
                    {CONTAINER_LABEL[t]}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={() => {
                  const name = newName.trim() || suggestedName;
                  const fid = run('Criar móvel e guardar', (d) => {
                    const f = ops.createFurniture(d, { houseId: house.id, type: newType, name });
                    ops.moveBook(d, id, { houseId: house.id, furnitureId: f });
                    return f;
                  });
                  if (fid) done(`Guardado em ${house.name} › ${name}.`, fid);
                }}
              >
                Criar e guardar
              </button>
            </div>
          </div>
          <button className="btn ghost wide" onClick={() => { run('Deixar no chão da casa', (d) => ops.moveBook(d, id, { houseId: house.id, furnitureId: null })); done(`Deixado no chão de ${house.name}.`); }}>
            Deixar no chão desta casa por enquanto
          </button>
        </Section>
      )}
      {house && kind === 'task' && (
        <Section title={`Na casa ${house.name}`}>
          <button className="row pick suggested" onClick={() => { run('Guardar tarefa na mesa', (d) => ops.moveTask(d, id, { houseId: house.id, onDesk: true })); done(`Guardada na mesa de trabalho de ${house.name}.`); }}>
            <span className="row-title">Mesa de trabalho</span>
            <span className="row-meta">Tarefa avulsa, à vista na mesa</span>
          </button>
          {projects.map((b) => (
            <button key={b.id} className="row pick" onClick={() => { run('Guardar tarefa no projeto', (d) => ops.moveTask(d, id, { houseId: house.id, bookId: b.id })); done(`Guardada no projeto ${b.title}.`); }}>
              <span className="row-title">{b.title}</span>
              <span className="row-meta">Projeto</span>
            </button>
          ))}
          <button className="btn ghost wide" onClick={() => { run('Levar tarefa para a casa', (d) => ops.moveTask(d, id, { houseId: house.id })); done(`Deixada no chão de ${house.name}.`); }}>
            Só levar para esta casa (fica solta no chão)
          </button>
        </Section>
      )}
      {item.houseId && (
        <button className="btn ghost wide" onClick={() => { if (kind === 'book') run('Devolver ao Correio', (d) => ops.moveBook(d, id, { houseId: null, furnitureId: null })); else run('Devolver ao Correio', (d) => ops.moveTask(d, id, { houseId: null })); done('Devolvido ao Correio.'); }}>
          Devolver ao Correio
        </button>
      )}
    </Panel>
  );
}
