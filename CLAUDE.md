# CLAUDE.md — Palácio Mental (o Recanto)

Instruções permanentes para quem continuar o desenvolvimento. Leia também `docs/`.

## O produto em uma frase
Aplicação de organização pessoal baseada no palácio da memória: cada coisa tem um lugar
(casa › móvel › livro) em um mundo 2D de pixel art chamado **Recanto**, que o usuário constrói.
O app existe para guardar e encontrar informações com facilidade. A narrativa serve a isso, nunca o contrário.

## Comandos
- `npm run dev` — servidor de desenvolvimento (http://127.0.0.1:5173). `sheet.html` mostra toda a arte.
- `npm test` — testes de domínio e persistência (Vitest).
- `npm run e2e` — testes ponta a ponta dos critérios de aceitação (Playwright + Chromium). `-- --only=nome` roda um cenário; `-- --shots` grava capturas em `e2e/shots/`.
- `npm run typecheck` e `npm run build`. `npm run build:single` gera `versao-pronta/Recanto.html` (arquivo único que abre com duplo clique); regenere e comite ao entregar uma versão.

## Arquitetura (resumo; detalhes em docs/ARCHITECTURE.md)
- `src/domain/` — dados e regras puras (sem React/Phaser). Toda mudança passa por uma função de `ops.ts`.
- `src/store/` — `db.ts` executa operações como comandos reversíveis (patches do immer) e grava só o que mudou; `ui.ts` é o estado de interface; `nav.ts` é a viagem; `gameApi.ts` é o contrato com as cenas.
- `src/persistence/` — repositório (IndexedDB / memória), backup e cópias automáticas (snapshots).
- `src/integrations/obsidian/` — notas Markdown ↔ livros, acesso à pasta do Vault e sincronização em três vias. Não importa React nem Phaser.
- `src/game/` — Phaser 4: arte procedural (`art/`), utilidades (`core.ts`) e três cenas (Cidade, Interior, Observatório). As cenas só refletem o modelo.
- `src/ui/` — React: HUD, painéis, Modo Reforma, abertura.
- React e Phaser não se importam: conversam pela loja (`dbStore`, `uiStore`) e por `gameApi`/`gameBus`.

## Regras de código
- Nunca altere o banco fora de `exec(label, fn)` (ou `run`/`runWithUndo` na UI). Isso garante desfazer, salvamento automático e persistência.
- Regras violadas lançam `OpError` com mensagem para o usuário (voz do app). A UI mostra como aviso.
- Validação de grade e colisão fica em `domain/grid.ts`, testável sem renderizar.
- Novos objetos do catálogo entram em `src/catalog/objects.json`. Se usarem uma receita de sprite existente, não precisam de código.
- Toda arte é original e gerada por código (`src/game/art`). Use apenas as rampas de `palette.ts`.
- Textos de interface em português do Brasil. Toda cor vem acompanhada de texto e símbolo.
- **Mudou o esquema de dados? Aumente `SCHEMA_VERSION`, escreva a migração em `domain/migrations.ts` (não destrutiva) e um teste.** Nunca quebre dados antigos.
- A integração com o Obsidian **nunca apaga notas** e **nunca sobrescreve sem guardar a outra versão** (ver `docs/OBSIDIAN.md`). Novas conversões precisam de teste de ida e volta.
- Rode `npm test` e `npm run typecheck` antes de cada commit; rode `npm run e2e` antes de declarar uma funcionalidade pronta.
- Commits locais de checkpoints funcionais. **Não publicar em repositório remoto sem autorização do responsável pelo produto.**

## Princípios narrativos (seção 3 do documento mestre)
1. **Você é você.** Sem título, classe ou atributos. Há um avatar personalizável.
2. **Cuidar, não cumprir.** O progresso do mundo é arrumação. Prazos e atrasos são informação, não drama.
3. **Nenhuma pressão.** Sem sequências, sem punições, sem estado de abandono. O Recanto não piora porque o usuário ficou dias sem entrar.
4. **A narrativa mora nos lugares.** Não há personagens que falam, missões de história ou cerimônias obrigatórias.
5. **Cada elemento narrativo tem função.** Se não ajuda a achar, guardar ou decidir, não entra. Exceção: a decoração escolhida pelo usuário.
6. **Voz do app.** Segunda pessoa, calma, direta e curta ("4 itens soltos. 1 prazo na quinta."). Rótulos simples: "Hoje", "Atrasadas", "Arquivadas".
7. **Sem fantasia de aventura.** Vocabulário de moradia e cuidado: casa, estante, livro, mesa, baú. Nunca "missão".
8. **Construir é ferramenta, não jogo.** Sem moedas, materiais, tempo de obra, níveis ou itens bloqueados.

## Regras de edição (seção 8)
- **Conteúdo** (livros, páginas, tarefas, objetivos) edita-se a qualquer momento, no lugar, sem modo especial.
- **Estrutura e espaço** (casas, móveis, decoração, posições, terrenos) edita-se no **Modo Reforma** (`R`).
- Duplo clique renomeia. Não há botão "salvar": tudo é salvo automaticamente.
- Tudo é reversível: desfazer/refazer (`Ctrl+Z` / `Ctrl+Shift+Z`) e lixeira por 30 dias.
- Criar exige só um nome. Há sempre um "+" no contexto.
- Sem limites artificiais; listas longas são paginadas.
- Mesa de trabalho, quadro de avisos e baú são essenciais: movem e mudam de aparência, não se excluem.
- Excluir casa, móvel, modelo ou constelação exige escolher o destino do conteúdo.
- Endereço lógico permanente: mover um móvel no espaço ou mudar status nunca muda o endereço de um livro.
- Só o usuário move as coisas. O app nunca reposiciona nada sozinho.

## O que nunca acontece (seção 10.8)
- Perda por ausência, sequências de dias ou lembretes culposos.
- Mapa tomado por vermelho ou excesso de sinalização.
- Cor como único meio de informação.
- Narrativa que atrapalhe uma consulta rápida (viagens duram no máximo ~2 s; com movimento reduzido, são instantâneas).
- Personagens que interrompem o trabalho do usuário.
- Moedas, materiais, tempos de obra ou itens bloqueados para construir e decorar.
- O app mover, remover ou reorganizar casas, móveis ou livros por conta própria.
- Exclusão definitiva sem confirmação e sem possibilidade de recuperar pela lixeira.

## Decisões que dependem do responsável pelo produto
Sincronização remota das estruturas, criptografia/Cofre e multiusuário. Ver `docs/DECISIONS.md` e `docs/AVALIACAO_RELATORIO.md`. O código está publicado em github.com/ferresmyke/palaciomental (privado).
