# Avaliação do Relatório Técnico Estratégico (12/11/2026)

Resposta às recomendações do relatório recebido de outro agente. Para cada ponto: o que foi feito, como e por quê.

## Resumo
O relatório confirma a arquitetura (sem reconstrução) e propõe seis frentes. Foram **implementadas a 1, 2 e 5** (de forma
enxuta e prática), **preparadas a 3 e a 6** e **adiadas conscientemente a 4**, pelo critério do próprio relatório (não antecipar o que
depende de decisões) e do objetivo de uso no dia a dia.

| # | Frente do relatório | Decisão | Onde |
|---|---|---|---|
| 1 | Proteção de dados, migrações e consolidação | **Feito** | `domain/migrations.ts`, `persistence/snapshots.ts` |
| 2 | Integração inicial com Obsidian | **Feito**, com outra técnica | `integrations/obsidian/` |
| 3 | Sincronização documental e conflitos | **Feito** (junto com a 2) | `integrations/obsidian/sync.ts` |
| 4 | Editor do Mundo e Ateliê de Aparência | **Adiado** | `ROADMAP.md` |
| 5 | Mapa de Conexões | **Feito** (versão inicial) | `domain/links.ts`, `ui/panels/MapPanel.tsx` |
| 6 | Sincronização entre dispositivos (Supabase) | **Adiado**, estrutura pronta | `DECISIONS.md` |

## Ponto a ponto

### 4.2 Versionamento de dados / Fase 1 — **Aceito integralmente**
- `SCHEMA_VERSION` agora é 2 e existe uma lista de migrações ordenadas (`MIGRATIONS`). Cada uma é **não destrutiva**.
- **Antes** de migrar, o app guarda uma cópia do estado atual. Dados de uma versão **mais nova** são recusados (em vez de corrompidos).
- O IndexedDB passou da versão 1 para a 2 (novos stores) sem tocar nos dados existentes; há teste com um banco v1 real.
- **Verificação de integridade** a cada abertura: referências quebradas (livro em móvel que não existe, tarefa em livro apagado...) são
  desligadas, nunca apagadas. Backups importados de versões antigas passam pelo mesmo caminho.
- **Cópias automáticas**: uma por dia (as 14 mais recentes) e antes de migrar, restaurar ou ligar o Obsidian. Dá para restaurar pela
  interface, e a restauração guarda o estado atual antes.
- Regra nova no `CLAUDE.md`: toda mudança de esquema exige migração e teste.

### 4.5 Documentação desatualizada — **Aceito**
`DECISIONS.md` ainda dizia que a publicação do código estava pendente. Corrigido, e o roteiro foi reescrito conforme as fases do relatório.

### 5 e 8 Obsidian — **Aceito o conceito; trocada a técnica**
Concordo com a divisão: **Recanto = memória espacial (onde)**, **Obsidian = memória documental (o quê)**, IA como camada auxiliar. O Obsidian
não é "backend": é a fonte do conteúdo documental dos livros, e o Recanto continua mandando no lugar, nas tarefas e nos objetivos.

Discordo apenas da primeira técnica sugerida (plugin *Local REST API*). Em vez dela usei o **acesso direto à pasta do Vault pelo navegador**
(File System Access API, disponível no Chrome e no Edge):
- sem plugin para instalar, sem chave de API para guardar, sem servidor local e sem CORS;
- o conteúdo são arquivos comuns: funciona com o Obsidian fechado, com qualquer editor e com agentes de IA que leem pastas;
- a segurança é a do navegador: só a pasta escolhida, com permissão explícita, reconfirmada a cada sessão;
- a camada `VaultFs` (`integrations/obsidian/vault.ts`) isola o acesso. Um plugin próprio ou um app desktop (Tauri) podem entrar depois
  trocando só essa implementação, como o relatório antevê (8.2 e 8.3).
Limitações: não funciona em Firefox/Safari (o app avisa), e o Obsidian Sync/outros sincronizadores continuam sincronizando só os arquivos.

### 6 Estrutura de pastas — **Aceito, com a ressalva de 6.1**
Usei exatamente a estrutura sugerida: `00 - Caixa de Entrada`, `10 - Áreas da Vida/<Casa>/<Móvel>`, `_Anexos`, `90 - Sistema`. E a ressalva
do relatório foi respeitada: **a pasta é só a localização atual**. Se você mover uma nota para outra pasta no Obsidian, o livro **não** muda de
móvel (o Recanto manda no lugar); se mover o livro no Recanto, a nota acompanha. `20 - Conhecimento` e o resto do Vault não são tocados.
Links `[[assim]]` cobrem as relações transversais, sem duplicar conteúdo.

### 7 Formato Markdown — **Aceito**
- Propriedades YAML com **`recanto_id`** como identidade permanente (nome e pasta podem mudar), mais `tipo`, `casa`, `movel`, `criado`,
  `atualizado` e os campos do modelo (datas reais, listas, `[[links]]` para referências).
- Corpo em Markdown comum (títulos, `- [ ]`, tabelas, links, imagens `![[...]]`). **Sem JSON escondido.**
- Divisão de propriedade como no relatório: Markdown e propriedades do livro vêm do Obsidian; posição, tarefas e objetivos ficam no Recanto.
  Para não misturar checklists documentais com tarefas operacionais, as tarefas de um livro aparecem em uma **seção somente leitura** gerada
  (entre comentários HTML) e **não** são lidas de volta.
- Propriedades desconhecidas (tags, aliases, plugins) são **preservadas** exatamente como estavam.

### 9 Conflitos, sincronização e segurança — **Aceito integralmente**
- Detecção por **hash** do arquivo e do conteúdo do livro na última sincronização (três vias).
- **Conflito** (mudou nos dois lados): vence o Obsidian (fonte documental) e a versão do Recanto fica em uma cópia
  `Nome (conflito Recanto data hora).md`. Nada se perde, e o relatório lista cada conflito.
- **Nunca apaga** nota: nota excluída do Vault é recriada com aviso; livro na lixeira deixa a nota onde está.
- Conferência antes de gravar: se o arquivo mudou durante a sincronização, a gravação é abortada.
- Cópia automática do Recanto antes de ligar o Obsidian; teste em uma **cópia do Vault** recomendado na tela (e há um Vault de exemplo).
- 9.1 (o problema de sincronizar só os arquivos) está registrado na documentação: a sincronização operacional segue sendo da fase 6.

### 10 Editor do Mundo / Ateliê — **Adiado, por escolha**
A visão é válida (planta como dado versionado), mas é a frente mais cara e **não destrava o uso diário**: o Modo Reforma já cobre mover,
inserir e personalizar. Ela exige transformar `cityPlan()` em dados serializados com migração; é melhor fazê-la depois que as notas
estiverem sob uso real. Fica no roteiro como próxima grande etapa, com o plano descrito em `ROADMAP.md`.

### 11 Arquitetura / 3.1 Pontos visuais — **Parcial**
- Criada a pasta `integrations/obsidian` (separada de domínio, cenas e interface), como o relatório pede: a integração não se mistura com
  renderização nem com as operações de tarefas. Os arquivos grandes não foram reescritos (concordo: sem reescrita cosmética).
- Visuais: rótulos do HUD agora aparecem em telas largas (antes só ícones), a câmera ao mover uma casa mostra todos os terrenos, o
  Observatório cabe na tela e os rótulos de estrelas não se sobrepõem.

### 12 Mapa de Conexões — **Feito (versão inicial)**
Conexões vêm de **referências a livros** e de **`[[wikilinks]]` no texto** (os mesmos do Obsidian). Cada livro mostra "Este livro cita" e
"Citado por"; o **Mapa de Conexões** desenha o grafo (do Recanto todo ou em volta de um livro, 1 a 3 passos), com cor por casa; renomear um
livro atualiza os links dos outros. Mapas de Conteúdo (MOCs): o `ÍNDICE.md` gerado no Vault já funciona como um MOC do Recanto.

### 13 Fase 5 — Agentes de IA — **Preparado, sem dependência**
Sem acoplar nenhum agente (o relatório diz que a IA deve ser auxiliar): o Vault ganha `90 - Sistema/Recanto/LEIA-ME para agentes de IA.md`
(regras de leitura e escrita) e `ÍNDICE.md`; qualquer livro pode ser **copiado como Markdown** para colar em uma conversa. MCP/consulta
direta ficam como camada futura.

### 15 Riscos — **Todos considerados**
Árvore de pastas não é a única organização (links + metadados); sem duplicar conteúdo (uma fonte por dado); sincronização ≠ backup (cópias
automáticas, lixeira, conflito sem perda); sem dependências remotas; editores com papéis separados; sem gamificação.

## Ideias minhas, para o uso diário
- **Tarefas que se repetem** (todo dia, semana, mês, ano, ou "a cada N"): ao concluir, a próxima nasce em data futura. Hábitos e contas fixas
  deixam de ser recriados à mão.
- **Dados de exemplo** (na abertura ou em Configurações): navegar e validar sem digitar nada.
- **Copiar livro como Markdown**: para colar em uma IA ou em outro app.
- **Abrir no Obsidian** a partir do livro (`obsidian://`).
- **Sincronização sozinha**: ao abrir, ao voltar para a janela e poucos segundos depois de você parar de editar.
- **Versão em um único arquivo HTML**, que abre com duplo clique, sem instalar nada.
