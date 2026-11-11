/**
 * Configurações, lixeira, modelos de livro e ajuda.
 */
import { useRef, useState } from 'react';
import { EMBLEMS } from '@/domain/catalog';
import * as ops from '@/domain/ops';
import { liveTemplates, trashEntries } from '@/domain/selectors';
import { FIELD_TYPE_LABEL, type AvatarLook, type FieldDef, type FieldType, type ID, type LightMode } from '@/domain/types';
import { newId, plural } from '@/domain/util';
import { CLOTHES_COUNT, HAIR_COUNT, HAIR_STYLES, SKIN_COUNT } from '@/game/art/chars';
import { COVER_COLORS, cssColor } from '@/game/art/palette';
import { fixedSprite, spritePreviewUrl } from '@/game/art/sprites';
import { BackupError, exportBackup, importBackup } from '@/persistence/backup';
import { clearBlobUrls, run, runWithUndo } from '@/store/actions';
import { flush, getDb, getRepo, replaceDb } from '@/store/db';
import { ui, uiStore } from '@/store/ui';
import { TAG_COLORS } from '../editors';
import { AutoInput, Chip, Empty, Field, Icon, InlineEdit, Panel, QuickAdd, Section, Segmented, Swatches, useDb, useNow } from '../kit';

// ───────────────────────────── Configurações ─────────────────────────────

function Stepper({ label, value, count, onChange, names }: { label: string; value: number; count: number; onChange: (v: number) => void; names?: string[] }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <button className="mini" aria-label={`${label}: anterior`} onClick={() => onChange((value - 1 + count) % count)}>
        ‹
      </button>
      <span className="stepper-value">{names?.[value] ?? value + 1}</span>
      <button className="mini" aria-label={`${label}: próximo`} onClick={() => onChange((value + 1) % count)}>
        ›
      </button>
    </div>
  );
}

function AvatarPreview({ look }: { look: AvatarLook }) {
  const a = fixedSprite.person(look);
  return <img className="avatar-preview" src={spritePreviewUrl(a)} width={64} height={88} alt="Seu avatar" />;
}

async function doExport(): Promise<void> {
  await flush();
  const db = getDb();
  const json = await exportBackup(db, getRepo());
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = (db.meta.world?.name ?? 'recanto').toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ui.toast('Backup exportado: conteúdo, modelos, layout e anexos.', 'ok');
}

async function doImport(file: File): Promise<void> {
  try {
    const text = await file.text();
    await flush();
    const db = await importBackup(text, getRepo());
    clearBlobUrls();
    replaceDb(db);
    await flush();
    uiStore.setState({ place: { kind: 'city' }, panels: [], reform: false, selectedId: null, selectedHouseId: null, placing: null });
    ui.toast('Backup importado. O Recanto foi restaurado.', 'ok');
  } catch (e) {
    ui.toast(e instanceof BackupError ? e.message : 'Não foi possível importar este arquivo.', 'error');
  }
}

export function SettingsPanel() {
  const db = useDb();
  const w = db.meta.world;
  const file = useRef<HTMLInputElement>(null);
  if (!w) return null;
  const s = w.settings;
  const setLook = (patch: Partial<AvatarLook>) => run('Mudar avatar', (d) => ops.updateSettings(d, { avatar: { ...s.avatar, ...patch } }));
  const tags = Object.values(db.tags);
  return (
    <Panel label="Configurações" icon="gear" kicker="Perfil e configurações" title={<InlineEdit value={w.name} label="Nome da cidade" onCommit={(name) => run('Renomear a cidade', (d) => ops.renameWorld(d, name))} />}>
      <Section title="Você">
        <div className="avatar-edit">
          <AvatarPreview look={s.avatar} />
          <div>
            <Stepper label="Pele" value={s.avatar.skin} count={SKIN_COUNT} onChange={(skin) => setLook({ skin })} />
            <Stepper label="Cabelo" value={s.avatar.hair} count={HAIR_COUNT} onChange={(hair) => setLook({ hair })} />
            <Stepper label="Penteado" value={s.avatar.hairStyle} count={HAIR_STYLES.length} names={HAIR_STYLES} onChange={(hairStyle) => setLook({ hairStyle })} />
            <Stepper label="Roupa" value={s.avatar.shirt} count={CLOTHES_COUNT} onChange={(shirt) => setLook({ shirt })} />
            <Stepper label="Calça" value={s.avatar.pants} count={5} onChange={(pants) => setLook({ pants })} />
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={s.showAvatar} onChange={(e) => run('Mostrar ou ocultar avatar', (d) => ops.updateSettings(d, { showAvatar: e.target.checked }))} />
          Mostrar o avatar no mapa
        </label>
      </Section>
      <Section title="Movimento e luz">
        <label className="toggle">
          <input type="checkbox" checked={s.reduceMotion} onChange={(e) => run('Reduzir movimento', (d) => ops.updateSettings(d, { reduceMotion: e.target.checked }))} />
          Reduzir movimento e animações
        </label>
        <Field label="Luz do Recanto" hint="No automático, a luz segue o relógio: manhã clara, tarde dourada, noite com janelas acesas.">
          <Segmented<LightMode>
            label="Luz"
            value={s.light}
            onChange={(light) => run('Mudar luz', (d) => ops.updateSettings(d, { light }))}
            options={[
              { value: 'auto', label: 'Hora real' },
              { value: 'morning', label: 'Manhã' },
              { value: 'afternoon', label: 'Tarde' },
              { value: 'dusk', label: 'Anoitecer' },
              { value: 'night', label: 'Noite' },
            ]}
          />
        </Field>
      </Section>
      <Section title="Etiquetas" count={tags.length}>
        {tags.map((t) => (
          <div key={t.id} className="row">
            <span className="tag" style={{ background: cssColor(t.color, 4), borderColor: cssColor(t.color, 1) }}>
              #
            </span>
            <AutoInput value={t.name} label={`Nome da etiqueta ${t.name}`} onCommit={(name) => run('Renomear etiqueta', (d) => ops.updateTag(d, t.id, { name }), { merge: `tag:${t.id}` })} />
            <Swatches options={TAG_COLORS} value={t.color} label={`Cor da etiqueta ${t.name}`} onChange={(color) => run('Mudar cor da etiqueta', (d) => ops.updateTag(d, t.id, { color }))} />
            <button className="mini" aria-label={`Excluir etiqueta ${t.name}`} onClick={() => runWithUndo('Excluir etiqueta', (d) => ops.deleteTag(d, t.id), 'Etiqueta removida dos itens. Os itens continuam.')}>
              ×
            </button>
          </div>
        ))}
        <QuickAdd placeholder="Nova etiqueta" label="Nova etiqueta" onAdd={(name) => run('Criar etiqueta', (d) => ops.createTag(d, name, TAG_COLORS[Object.keys(d.tags).length % TAG_COLORS.length]))} />
      </Section>
      <Section title="Seus dados">
        <p className="muted">Tudo fica guardado neste navegador, neste aparelho. Exporte um backup de tempos em tempos.</p>
        <div className="btn-row">
          <button className="btn" onClick={() => void doExport()}>
            Exportar backup
          </button>
          <button className="btn ghost" onClick={() => file.current?.click()}>
            Importar backup…
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Arquivo de backup"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              ui.confirm({
                title: 'Importar este backup?',
                body: 'O conteúdo atual do Recanto será substituído pelo do arquivo. Exporte um backup antes, se quiser guardar o estado atual.',
                confirmLabel: 'Substituir e importar',
                danger: true,
                onConfirm: () => void doImport(f),
              });
            }}
          />
        </div>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => ui.push({ type: 'templates' })}>
            Modelos de livro
          </button>
          <button className="btn ghost" onClick={() => ui.push({ type: 'trash' })}>
            Lixeira
          </button>
          <button className="btn ghost" onClick={() => ui.push({ type: 'help' })}>
            Atalhos
          </button>
        </div>
      </Section>
    </Panel>
  );
}

// ───────────────────────────── Lixeira ─────────────────────────────

const KIND_LABEL = { house: 'Casa', furniture: 'Móvel', book: 'Livro', task: 'Tarefa', goal: 'Objetivo', template: 'Modelo' } as const;

export function TrashPanel() {
  const db = useDb();
  const now = useNow();
  const entries = trashEntries(db, now);
  const total = entries.reduce((s, e) => s + e.count, 0);
  const restore = (batchId: ID) => {
    const r = run('Restaurar da lixeira', (d) => ops.restoreBatch(d, batchId));
    if (!r) return;
    if (r.needsDestination.length) ui.push({ type: 'restoreDest', items: r.needsDestination });
    else ui.toast('Restaurado ao endereço original.', 'ok');
  };
  return (
    <Panel label="Lixeira" icon="trash" kicker="Tudo é reversível" title="Lixeira">
      <p className="lede">O que você exclui fica aqui por 30 dias e pode voltar ao lugar de onde saiu.</p>
      {!entries.length && <Empty>A lixeira está vazia.</Empty>}
      {entries.map((e) => (
        <div key={e.batchId} className="row">
          <div className="row-main static">
            <span className="row-title">{e.label}</span>
            <span className="row-meta">
              <span>{KIND_LABEL[e.kind]}</span>
              {e.count > 1 && <span>+ {e.count - 1} item(ns) junto</span>}
              <span>{e.daysLeft > 0 ? `some em ${plural(e.daysLeft, 'dia', 'dias')}` : 'some hoje'}</span>
            </span>
          </div>
          <button className="btn" onClick={() => restore(e.batchId)}>
            Restaurar
          </button>
          <button
            className="mini"
            aria-label={`Excluir ${e.label} definitivamente`}
            title="Excluir definitivamente"
            onClick={() =>
              ui.confirm({
                title: `Excluir "${e.label}" definitivamente?`,
                body: `${plural(e.count, 'item será apagado', 'itens serão apagados')} para sempre. Isto não pode ser desfeito.`,
                confirmLabel: 'Excluir para sempre',
                danger: true,
                onConfirm: () => run('Excluir definitivamente', (d) => ops.purgeBatch(d, e.batchId), { transient: true }),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      {entries.length > 0 && (
        <button
          className="btn danger wide"
          onClick={() =>
            ui.confirm({
              title: 'Esvaziar a lixeira?',
              body: `${plural(total, 'item será apagado', 'itens serão apagados')} para sempre. Isto não pode ser desfeito.`,
              confirmLabel: 'Esvaziar lixeira',
              danger: true,
              onConfirm: () => run('Esvaziar lixeira', (d) => ops.emptyTrash(d), { transient: true }),
            })
          }
        >
          Esvaziar a lixeira ({total})
        </button>
      )}
    </Panel>
  );
}

// ───────────────────────────── Modelos de livro ─────────────────────────────

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[];

function FieldRow({ tplId, def, index, count }: { tplId: ID; def: FieldDef; index: number; count: number }) {
  const db = useDb();
  const hasOptions = def.type === 'select' || def.type === 'multiselect';
  const changeType = (to: FieldType) => {
    const lost = ops.fieldTypeChangeLoss(db, tplId, def.id, to);
    const apply = () => run('Mudar tipo do campo', (d) => ops.changeFieldType(d, tplId, def.id, to));
    if (!lost) return void apply();
    ui.confirm({
      title: `Mudar "${def.name}" para ${FIELD_TYPE_LABEL[to]}?`,
      body: `${plural(lost, 'livro tem', 'livros têm')} um valor que não cabe no novo tipo e ficará vazio neste campo. Dá para desfazer logo em seguida.`,
      confirmLabel: 'Mudar mesmo assim',
      danger: true,
      onConfirm: apply,
    });
  };
  return (
    <div className="tpl-field">
      <div className="tpl-field-main">
        <AutoInput value={def.name} label="Nome do campo" onCommit={(name) => run('Renomear campo', (d) => ops.updateField(d, tplId, def.id, { name }), { merge: `fname:${def.id}` })} />
        <select className="field-input" value={def.type} aria-label={`Tipo do campo ${def.name}`} onChange={(e) => changeType(e.target.value as FieldType)}>
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button className="mini" aria-label={`Subir campo ${def.name}`} disabled={index === 0} onClick={() => run('Mover campo', (d) => ops.moveField(d, tplId, def.id, index - 1))}>
          ↑
        </button>
        <button className="mini" aria-label={`Descer campo ${def.name}`} disabled={index === count - 1} onClick={() => run('Mover campo', (d) => ops.moveField(d, tplId, def.id, index + 1))}>
          ↓
        </button>
        <button className="mini" aria-label={`Remover campo ${def.name}`} title="Remover do modelo (os dados ficam guardados)" onClick={() => runWithUndo('Remover campo do modelo', (d) => ops.hideField(d, tplId, def.id), `Campo "${def.name}" removido. Os dados ficam guardados até a remoção definitiva.`)}>
          ×
        </button>
      </div>
      {hasOptions && (
        <div className="tpl-options">
          {(def.options ?? []).map((o) => (
            <span key={o.id} className="tpl-option">
              <AutoInput value={o.label} label="Opção" onCommit={(label) => run('Editar opção', (d) => ops.updateField(d, tplId, def.id, { options: (def.options ?? []).map((x) => (x.id === o.id ? { ...x, label } : x)) }), { merge: `opt:${o.id}` })} />
              <button className="mini" aria-label={`Remover opção ${o.label}`} onClick={() => run('Remover opção', (d) => ops.updateField(d, tplId, def.id, { options: (def.options ?? []).filter((x) => x.id !== o.id) }))}>
                ×
              </button>
            </span>
          ))}
          <QuickAdd placeholder="Nova opção" label={`Nova opção de ${def.name}`} onAdd={(label) => run('Adicionar opção', (d) => ops.updateField(d, tplId, def.id, { options: [...(def.options ?? []), { id: newId('op'), label }] }))} />
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ id }: { id: ID }) {
  const db = useDb();
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const t = db.templates[id];
  if (!t || t.trash) return <Empty>Este modelo não existe mais.</Empty>;
  const visible = t.fields.filter((f) => !f.hidden);
  const hidden = t.fields.filter((f) => f.hidden);
  const used = Object.values(db.books).filter((b) => b.templateId === id && !b.trash).length;
  const fixed = t.behavior !== 'none';
  const add = () => {
    if (!name.trim()) return;
    run('Adicionar campo', (d) => ops.addField(d, id, { name, type }));
    setName('');
  };
  return (
    <>
      <div className="tpl-head">
        <span className="cover lg" style={{ background: cssColor(t.cover.color, 2), borderColor: cssColor(t.cover.color, 0) }}>
          <Icon name={t.cover.emblem} size={27} tone="papel" />
        </span>
        <div>
          <h3 className="tpl-name">
            <InlineEdit value={t.name} label="Nome do modelo" onCommit={(n) => run('Renomear modelo', (d) => ops.updateTemplate(d, id, { name: n }))} />
          </h3>
          <div className="chips">
            {t.system && <Chip tone="muted">Modelo pronto</Chip>}
            {t.behavior === 'project' && <Chip symbol="✦">Reúne tarefas e calcula progresso</Chip>}
            <Chip>{plural(used, 'livro', 'livros')}</Chip>
          </div>
        </div>
      </div>
      <Field label="Cor padrão da capa">
        <Swatches options={COVER_COLORS} value={t.cover.color} label="Cor padrão da capa" onChange={(color) => run('Mudar capa do modelo', (d) => ops.updateTemplate(d, id, { cover: { color } }))} />
      </Field>
      <Field label="Emblema">
        <div className="emblems" role="radiogroup" aria-label="Emblema do modelo">
          {EMBLEMS.map((e) => (
            <button key={e} role="radio" aria-checked={t.cover.emblem === e} aria-label={e} className={`emblem${t.cover.emblem === e ? ' on' : ''}`} onClick={() => run('Mudar emblema do modelo', (d) => ops.updateTemplate(d, id, { cover: { emblem: e } }))}>
              <Icon name={e} size={18} tone="nogueira" />
            </button>
          ))}
        </div>
      </Field>
      <Section title="Campos" count={visible.length}>
        {!visible.length && <Empty>{t.behavior === 'note' ? 'A Nota é texto livre: use as páginas do livro. Você também pode adicionar campos.' : 'Nenhum campo ainda.'}</Empty>}
        {visible.map((f, i) => (
          <FieldRow key={f.id} tplId={id} def={f} index={i} count={visible.length} />
        ))}
        <div className="tpl-add">
          <input className="field-input" value={name} placeholder="Nome do novo campo" aria-label="Nome do novo campo" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <select className="field-input" value={type} aria-label="Tipo do novo campo" onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {FIELD_TYPE_LABEL[ft]}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!name.trim()} onClick={add}>
            Adicionar campo
          </button>
        </div>
        <p className="muted">Um campo novo aparece vazio em todos os livros deste modelo.</p>
      </Section>
      {hidden.length > 0 && (
        <Section title="Campos removidos (dados preservados)" count={hidden.length}>
          {hidden.map((f) => {
            const withData = Object.values(db.books).filter((b) => b.templateId === id && b.fields[f.id] !== undefined && b.fields[f.id] !== null && b.fields[f.id] !== '').length;
            return (
              <div key={f.id} className="row">
                <div className="row-main static">
                  <span className="row-title">{f.name}</span>
                  <span className="row-meta">
                    {FIELD_TYPE_LABEL[f.type]} · {plural(withData, 'livro com dados', 'livros com dados')}
                  </span>
                </div>
                <button className="btn ghost" onClick={() => run('Recuperar campo', (d) => ops.hideField(d, id, f.id, false))}>
                  Recuperar
                </button>
                <button
                  className="btn danger"
                  onClick={() =>
                    ui.confirm({
                      title: `Remover "${f.name}" definitivamente?`,
                      body: `Os dados deste campo serão apagados de ${plural(withData, 'livro', 'livros')}.`,
                      confirmLabel: 'Remover definitivamente',
                      danger: true,
                      onConfirm: () => runWithUndo('Remover campo definitivamente', (d) => ops.purgeField(d, id, f.id), 'Campo removido definitivamente.'),
                    })
                  }
                >
                  Remover de vez
                </button>
              </div>
            );
          })}
        </Section>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={() => { const n = run('Duplicar modelo', (d) => ops.createTemplate(d, { name: `${t.name} (cópia)`, fromId: id })); if (n) ui.open({ type: 'templates', id: n }); }}>
          Duplicar modelo
        </button>
        {!fixed && (
          <button className="btn danger" onClick={() => ui.push({ type: 'deleteTemplate', id })}>
            Excluir modelo…
          </button>
        )}
      </div>
      {fixed && <p className="muted">Este modelo sustenta funções do app e não pode ser excluído, mas aceita campos extras.</p>}
    </>
  );
}

export function TemplatesPanel({ id }: { id?: ID }) {
  const db = useDb();
  const list = liveTemplates(db);
  return (
    <Panel label="Modelos de livro" icon="book" wide kicker="Como os seus registros são estruturados" title="Modelos de livro">
      {id ? (
        <>
          <button className="link" onClick={() => ui.open({ type: 'templates' })}>
            ‹ Todos os modelos
          </button>
          <TemplateEditor id={id} />
        </>
      ) : (
        <>
          <p className="lede">Um modelo define os campos de uma categoria de livros. Duplique um modelo pronto ou crie o seu.</p>
          {list.map((t) => (
            <button key={t.id} className="row pick" onClick={() => ui.open({ type: 'templates', id: t.id })}>
              <span className="cover sm" style={{ background: cssColor(t.cover.color, 2), borderColor: cssColor(t.cover.color, 0) }}>
                <Icon name={t.cover.emblem} size={9} tone="papel" />
              </span>
              <span className="row-title">{t.name}</span>
              <span className="row-meta">
                {plural(t.fields.filter((f) => !f.hidden).length, 'campo', 'campos')}
                {t.system ? ' · modelo pronto' : ''}
              </span>
            </button>
          ))}
          <Section title="Novo modelo">
            <QuickAdd placeholder="Ex.: Receita, Fornecedor, Viagem" label="Novo modelo de livro" onAdd={(name) => { const n = run('Novo modelo', (d) => ops.createTemplate(d, { name })); if (n) ui.open({ type: 'templates', id: n }); }} />
          </Section>
        </>
      )}
    </Panel>
  );
}

// ───────────────────────────── Ajuda ─────────────────────────────

const SHORTCUTS: [string, string][] = [
  ['N', 'Novo item no Correio, de qualquer lugar'],
  ['/ ou Ctrl+K', 'Buscar em todo o Recanto'],
  ['M', 'Mesa do Dia (modo lista)'],
  ['0', 'Voltar à Praça'],
  ['1 a 6', 'Ir para uma casa'],
  ['O', 'Observatório'],
  ['R', 'Modo Reforma'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Desfazer / refazer'],
  ['Esc', 'Voltar ou fechar'],
  ['Setas', 'Mover o mapa (ou o objeto selecionado, na Reforma)'],
  ['+ e −', 'Aproximar e afastar'],
  ['G', 'Girar o objeto selecionado (Reforma)'],
  ['D', 'Duplicar o objeto selecionado (Reforma)'],
  ['Delete', 'Remover o objeto selecionado (Reforma)'],
  ['Duplo clique', 'Renomear'],
];

export function HelpPanel() {
  return (
    <Panel label="Atalhos" icon="key" kicker="Ajuda" title="Atalhos">
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">No mapa: roda do mouse para o zoom, botão direito (ou arrastar) para mover, clique para ir até um lugar. No toque: arraste e use a pinça.</p>
    </Panel>
  );
}
