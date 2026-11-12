/** Configuração e relatório da ligação com o Obsidian. */
import { useStore } from 'zustand';
import { plural } from '@/domain/util';
import { hasDirectoryPicker } from '@/integrations/obsidian/vault';
import { chooseVault, disconnectVault, obsidianLink, reconnectVault, setAutoSync, syncNow, vaultStore } from '@/store/vault';
import { ui } from '@/store/ui';
import { Chip, Panel, Section, useDb, useNow } from '../kit';

const ago = (t: number | null, now: number): string => {
  if (!t) return 'ainda não sincronizou';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'agora há pouco';
  if (s < 3600) return `há ${plural(Math.round(s / 60), 'minuto', 'minutos')}`;
  return `há ${plural(Math.round(s / 3600), 'hora', 'horas')}`;
};

export function ObsidianPanel() {
  const db = useDb();
  const now = useNow();
  const v = useStore(vaultStore);
  const cfg = db.meta.world?.vault;
  const r = v.report;
  const supported = hasDirectoryPicker();
  return (
    <Panel label="Obsidian" icon="book" wide kicker="Conhecimento em arquivos abertos" title="Obsidian">
      <p className="lede">
        Cada livro vira uma nota Markdown na sua pasta do Obsidian, e o que você escrever lá volta para o Recanto. O conteúdo fica em
        arquivos seus, legíveis por qualquer programa. O Recanto continua funcionando sem o Obsidian aberto, e vice-versa.
      </p>

      {!supported && (
        <p className="notice">
          Este navegador não permite escolher uma pasta do computador. Abra o Recanto no <strong>Google Chrome</strong> ou no <strong>Microsoft Edge</strong> para usar o Obsidian.
        </p>
      )}

      {supported && !cfg && v.status !== 'ready' && (
        <Section title="Ligar o seu Vault">
          <ol className="steps">
            <li>Escolha a <strong>pasta raiz</strong> do seu Vault (a que contém a pasta oculta <code>.obsidian</code>).</li>
            <li>
              Para o primeiro teste, prefira <strong>uma cópia</strong> do Vault. Assim você valida o resultado sem risco.
            </li>
            <li>O navegador vai pedir permissão para ler e gravar nessa pasta. É só confirmar.</li>
          </ol>
          <button className="btn big wide" onClick={() => void chooseVault()}>
            Escolher a pasta do Obsidian…
          </button>
          <p className="muted">
            O Recanto cria <code>00 - Caixa de Entrada</code>, <code>10 - Áreas da Vida</code>, <code>_Anexos</code> e <code>90 - Sistema/Recanto</code>. Nada fora dessas pastas é alterado, e nenhuma nota é apagada.
          </p>
        </Section>
      )}

      {(cfg || v.status === 'ready' || v.status === 'syncing') && (
        <Section title="Sua pasta">
          <div className="chips">
            <Chip tone={v.status === 'error' ? 'alert' : v.status === 'needs-permission' ? 'gold' : 'ok'} symbol={v.status === 'error' ? '⚑' : v.status === 'needs-permission' ? '◔' : '✓'}>
              {v.status === 'syncing' ? 'Sincronizando…' : v.status === 'needs-permission' ? 'Precisa reconectar' : v.status === 'error' ? 'Com problema' : 'Conectado'}
            </Chip>
            <strong>{cfg?.name ?? v.name}</strong>
            <span className="muted">{ago(v.lastSync, now)}</span>
          </div>
          {v.message && <p className="notice">{v.message}</p>}
          {v.status === 'needs-permission' && (
            <button className="btn wide" onClick={() => void reconnectVault()}>
              Reconectar (o navegador vai pedir permissão)
            </button>
          )}
          <div className="btn-row">
            <button className="btn" disabled={v.status !== 'ready'} onClick={() => void syncNow().then((rep) => rep && ui.toast(`Obsidian: ${rep.summary}.`, 'ok'))}>
              Sincronizar agora
            </button>
            <button className="btn ghost" onClick={() => void chooseVault()}>
              Trocar de pasta…
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                ui.confirm({
                  title: 'Desligar o Obsidian?',
                  body: 'O Recanto para de sincronizar. As notas continuam no seu Vault, intactas, e os livros continuam no Recanto.',
                  confirmLabel: 'Desligar',
                  onConfirm: () => void disconnectVault(),
                })
              }
            >
              Desligar
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={cfg?.auto ?? true} onChange={(e) => setAutoSync(e.target.checked)} />
            Sincronizar sozinho (ao abrir, ao voltar para a janela e pouco depois de você editar)
          </label>
        </Section>
      )}

      {r && (
        <Section title="Última sincronização">
          <p>
            <strong>{r.summary}</strong>. {plural(r.total, 'livro verificado', 'livros verificados')}.
          </p>
          <ul className="report">
            {r.created > 0 && <li>{plural(r.created, 'nota criada', 'notas criadas')} no Vault.</li>}
            {r.exported + r.moved > 0 && <li>{plural(r.exported + r.moved, 'nota atualizada', 'notas atualizadas')} no Vault.</li>}
            {r.imported > 0 && <li>{plural(r.imported, 'nota trazida', 'notas trazidas')} do Obsidian para o Recanto.</li>}
            {r.newNotes > 0 && <li>{plural(r.newNotes, 'nota nova virou', 'notas novas viraram')} livro (veja no Correio ou na casa da pasta).</li>}
          </ul>
          {r.conflicts.length > 0 && (
            <>
              <h4>Conflitos (nada foi perdido)</h4>
              <p className="muted">O livro e a nota mudaram desde a última vez. Ficou a versão do Obsidian e a do Recanto foi guardada em uma cópia.</p>
              {r.conflicts.map((c) => (
                <div key={c.id} className="row">
                  <div className="row-main static">
                    <span className="row-title">{c.title}</span>
                    <span className="row-address">Cópia: {c.copyPath}</span>
                  </div>
                  {obsidianLink(c.copyPath) && (
                    <a className="btn ghost" href={obsidianLink(c.copyPath)!}>
                      Abrir a cópia
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
          {r.warnings.length > 0 && (
            <>
              <h4>Avisos</h4>
              <ul className="report">
                {r.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      <Section title="Como funciona">
        <details>
          <summary>Onde cada coisa fica no Vault</summary>
          <ul className="report">
            <li>
              <code>10 - Áreas da Vida/Casa/Móvel/Livro.md</code>: um arquivo por livro. <code>Chão</code> guarda os que ainda não têm móvel e <code>Baú</code> os arquivados.
            </li>
            <li>
              <code>00 - Caixa de Entrada/</code>: o Correio. Uma nota criada ali (ou dentro de uma casa) vira um livro.
            </li>
            <li>
              <code>_Anexos/</code>: imagens e arquivos. <code>90 - Sistema/Recanto/</code>: o índice e um guia para agentes de IA.
            </li>
          </ul>
        </details>
        <details>
          <summary>O que é de quem</summary>
          <ul className="report">
            <li>
              <strong>Obsidian manda no texto</strong>: título, páginas, listas, tabelas, links e as propriedades dos campos.
            </li>
            <li>
              <strong>O Recanto manda no lugar</strong>: casa, móvel, posição, tarefas, objetivos. Para mudar um livro de lugar, mova-o no Recanto; a nota acompanha.
            </li>
            <li>
              A identidade da nota é a propriedade <code>recanto_id</code>: você pode renomear o arquivo ou mudar de pasta sem perder a ligação. Não apague essa propriedade.
            </li>
            <li>Propriedades suas (tags, aliases...) são preservadas. Links <code>[[assim]]</code> entre notas viram conexões no Mapa de Conexões.</li>
          </ul>
        </details>
        <details>
          <summary>E se eu editar os dois lados ao mesmo tempo?</summary>
          <p>
            Fica a versão do Obsidian, e a do Recanto é guardada em um arquivo ao lado, chamado <code>Nome (conflito Recanto data hora).md</code>. Nada é apagado, e a lixeira e as cópias automáticas do Recanto continuam valendo.
          </p>
        </details>
      </Section>
    </Panel>
  );
}
