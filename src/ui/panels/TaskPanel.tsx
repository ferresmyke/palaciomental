/**
 * Painel da tarefa. Status, prioridade e risco de atraso aparecem separados,
 * sempre com texto e símbolo além da cor.
 */
import * as ops from '@/domain/ops';
import { liveTemplates, taskAddress } from '@/domain/selectors';
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_SYMBOL, STATUS_LABEL, STATUS_SYMBOL, STATUSES, type ID, type Priority, type TaskStatus } from '@/domain/types';
import { newId } from '@/domain/util';
import { run, runWithUndo } from '@/store/actions';
import { goToTask } from '@/store/nav';
import { ui } from '@/store/ui';
import { BookPicker, ChecklistEditor, HouseSelect, RiskChip, TagPicker } from '../editors';
import { AutoInput, Chip, Empty, Field, InlineEdit, Menu, MenuItem, Panel, Section, Segmented, useDb } from '../kit';

export function TaskPanel({ id }: { id: ID }) {
  const db = useDb();
  const t = db.tasks[id];
  if (!t) return <Panel title="Tarefa" label="Tarefa"><Empty>Esta tarefa não existe mais.</Empty></Panel>;
  const addr = taskAddress(db, t);
  const upd = (patch: ops.TaskPatch, label = 'Editar tarefa', merge?: string) => run(label, (d) => ops.updateTask(d, id, patch), merge ? { merge } : undefined);
  const loose = !t.bookId && !t.onDesk && t.status !== 'done' && t.status !== 'archived';
  return (
    <Panel
      label={`Tarefa ${t.title}`}
      kicker={
        <button className="crumbs" onClick={() => void goToTask(id)} title="Ir até lá">
          {addr.parts.slice(0, -1).join(' › ')}
        </button>
      }
      title={<InlineEdit value={t.title} label="Nome da tarefa" onCommit={(title) => upd({ title }, 'Renomear tarefa')} />}
      actions={
        <Menu label="Ações da tarefa">
          <MenuItem onClick={() => ui.push({ type: 'store', kind: 'task', id })}>Guardar em…</MenuItem>
          <MenuItem onClick={() => runWithUndo('Arquivar tarefa', (d) => ops.updateTask(d, id, { status: t.status === 'archived' ? 'pending' : 'archived' }), t.status === 'archived' ? 'Tarefa reaberta.' : 'Tarefa arquivada no baú.')}>{t.status === 'archived' ? 'Desarquivar' : 'Arquivar no baú'}</MenuItem>
          <MenuItem danger onClick={() => { runWithUndo('Excluir tarefa', (d) => ops.deleteTask(d, id), 'Tarefa na lixeira por 30 dias.'); ui.back(); }}>Excluir</MenuItem>
        </Menu>
      }
    >
      {t.trash && <p className="notice">Esta tarefa está na lixeira.</p>}
      <div className="chips">
        <RiskChip task={t} />
        {loose && (
          <Chip tone="gold" symbol="▫" onClick={() => ui.push({ type: 'store', kind: 'task', id })}>
            Solta: guardar em…
          </Chip>
        )}
        {t.onDesk && <Chip symbol="▭">Na mesa de trabalho</Chip>}
      </div>
      <Field label="Status">
        <Segmented<TaskStatus> label="Status" value={t.status} onChange={(status) => upd({ status }, `Marcar como ${STATUS_LABEL[status].toLowerCase()}`)} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], symbol: STATUS_SYMBOL[s] }))} />
      </Field>
      <div className="grid2">
        <Field label="Prioridade">
          <select className="field-input" value={t.priority} onChange={(e) => upd({ priority: e.target.value as Priority }, 'Mudar prioridade')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_SYMBOL[p]} {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prazo">
          <input className="field-input" type="date" value={t.dueDate ?? ''} onChange={(e) => upd({ dueDate: e.target.value || null }, 'Mudar prazo')} />
        </Field>
        <Field label="Início">
          <input className="field-input" type="date" value={t.startDate ?? ''} onChange={(e) => upd({ startDate: e.target.value || null }, 'Mudar início')} />
        </Field>
        <Field label="Casa">
          <HouseSelect value={t.houseId} label="Casa" onChange={(houseId) => run('Mudar tarefa de casa', (d) => ops.moveTask(d, id, { houseId, onDesk: false }))} />
        </Field>
      </div>
      <Field label="Livro" hint="Opcional. A tarefa passa a fazer parte do livro (por exemplo, um projeto).">
        <BookPicker value={t.bookId} label="Livro da tarefa" onChange={(bookId) => run('Ligar tarefa a livro', (d) => ops.moveTask(d, id, { houseId: t.houseId, bookId, onDesk: bookId ? false : t.onDesk }))} />
      </Field>
      <Field label="Etiquetas">
        <TagPicker value={t.tagIds} onChange={(tagIds) => upd({ tagIds }, 'Mudar etiquetas')} />
      </Field>
      <Field label="Descrição">
        <AutoInput multiline value={t.description} label="Descrição" onCommit={(description) => upd({ description }, 'Editar descrição', `tdesc:${id}`)} />
      </Field>
      <Section title="Checklist" count={t.checklist.length}>
        <ChecklistEditor items={t.checklist} label="Checklist da tarefa" onChange={(checklist) => upd({ checklist }, 'Editar checklist', `tck:${id}`)} />
      </Section>
      <Field label="Notas">
        <AutoInput multiline value={t.notes} label="Notas" onCommit={(notes) => upd({ notes }, 'Editar notas', `tnotes:${id}`)} />
      </Field>
      <Section title="Links e referências">
        {t.links.map((l) => (
          <div key={l.id} className="link-block">
            <AutoInput value={l.label} label="Nome do link" placeholder="Nome" onCommit={(label) => upd({ links: t.links.map((x) => (x.id === l.id ? { ...x, label } : x)) }, 'Editar link', `tl:${l.id}`)} />
            <AutoInput value={l.url} label="Endereço do link" type="url" placeholder="https://" onCommit={(url) => upd({ links: t.links.map((x) => (x.id === l.id ? { ...x, url } : x)) }, 'Editar link', `tl:${l.id}`)} />
            {l.url && (
              <a className="mini go" href={/^https?:/.test(l.url) ? l.url : `https://${l.url}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir link">
                ↗
              </a>
            )}
            <button className="mini" aria-label="Remover link" onClick={() => upd({ links: t.links.filter((x) => x.id !== l.id) }, 'Remover link')}>
              ×
            </button>
          </div>
        ))}
        {t.refs.map((ref) => (
          <BookPicker key={ref} value={ref} label="Livro referenciado" onChange={() => upd({ refs: t.refs.filter((x) => x !== ref) }, 'Remover referência')} />
        ))}
        <div className="btn-row">
          <button className="btn ghost" onClick={() => upd({ links: [...t.links, { id: newId('lk'), label: '', url: '' }] }, 'Adicionar link')}>
            + Link
          </button>
        </div>
        <BookPicker value={null} label="Adicionar referência a um livro" placeholder="+ Referência a um livro…" filter={(b) => !t.refs.includes(b.id)} onChange={(bookId) => bookId && upd({ refs: [...t.refs, bookId] }, 'Adicionar referência')} />
      </Section>
      {!t.houseId && (
        <Section title="É outra coisa?">
          <p className="muted">Uma anotação do Correio pode virar um livro de qualquer modelo.</p>
          <div className="chips">
            {liveTemplates(db).map((tpl) => (
              <button
                key={tpl.id}
                className="chip toggle"
                onClick={() => {
                  const b = run(`Transformar em ${tpl.name}`, (d) => ops.taskToBook(d, id, tpl.id, { houseId: null, furnitureId: null }));
                  if (b) ui.open({ type: 'book', id: b });
                }}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </Section>
      )}
      <p className="stamp">
        Criada em {new Date(t.createdAt).toLocaleDateString('pt-BR')}
        {t.completedAt ? ` · concluída em ${new Date(t.completedAt).toLocaleDateString('pt-BR')}` : ''}
      </p>
    </Panel>
  );
}
