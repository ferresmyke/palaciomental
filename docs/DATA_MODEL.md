# Modelo de dados

Definições completas em `src/domain/types.ts`. Tudo é serializável e independe da representação gráfica.

## Hierarquia
```
RECANTO (meta.world: nome, configurações, ampliação da cidade)
 ├─ TERRENOS (planta da cidade; função pura de `expansion`)  ── ocupados por CASAS e DECORAÇÃO EXTERNA
 └─ CASA (área da vida: tema, modelo, cor, terreno, oculta, ordem)
     ├─ LAYOUT (placements: posição, rotação, variação, cor, imagem)
     ├─ MÓVEL contêiner (estante, gaveteiro, mural, caixa, armário, escrivaninha)
     │   └─ LIVRO (de um MODELO DE LIVRO; campos + páginas em blocos)
     ├─ MÓVEIS ESSENCIAIS (mesa de trabalho, quadro de avisos, baú)
     ├─ DECORAÇÃO (placements sem móvel)
     └─ TAREFA (casa; opcionalmente um livro; ou "na mesa")
OBSERVATÓRIO
 ├─ CONSTELAÇÃO (uma por casa por padrão; criáveis)
 └─ OBJETIVO (estrela) ── ligado a ── LIVROS do modelo Projeto
```

## Tabelas
| Tabela | Conteúdo |
|---|---|
| `meta` | `world`: nome, `onboarded`, `expansion`, configurações (movimento, avatar, luz), versão do esquema |
| `houses` | nome, `themeId`, `modelId`, `color`, `lotId`, `hidden`, `order`, `trash?` |
| `furniture` | móvel lógico: `houseId`, nome, `kind` (container/essential), `containerType` ou `role`, ordenação |
| `placements` | layout: `scope` (`city` ou id da casa), `catalogId`, `x`, `y`, `rot`, `variant`, `color`, `furnitureId?`, `imageId?` |
| `books` | título, `templateId`, `houseId`, `furnitureId`, `order`, `fields`, `blocks`, capa, `project?`, `pinnedOpen`, `archivedAt` |
| `templates` | nome, `behavior` (none/project/note), `fields` (com `hidden`), capa padrão, `version` |
| `tasks` | título, descrição, casa, livro, `onDesk`, status, prioridade, etiquetas, datas, checklist, notas, links, `refs` |
| `tags` | nome e cor |
| `goals` | título, descrição, horizonte, constelação, `projectIds`, `dormant` |
| `constellations` | nome, `houseId` (constelação padrão da casa) ou `null` |
| `attachments` | metadados do anexo; o conteúdo fica no store `blobs` |

## Endereço lógico
`Recanto › Casa › Móvel › Livro`. Depende só de `houseId` e `furnitureId`. Mover o móvel no espaço
(layout), mudar status, prioridade ou prazo nunca altera o endereço. Itens soltos: **sem casa** (Correio)
ou **sem móvel** (chão da casa). Arquivados vão ao **Baú** da casa (ou ao Arquivo geral, se não têm casa).

## Status, prioridade e risco
- Status (fixo): A planejar ◌, Pendente ○, Em andamento ◐, Aguardando ⧖, Concluída ✓, Arquivada ▣.
- Prioridade (fixa): Baixa ▽, Normal ◇, Alta △, Crítica ▲.
- **Risco de atraso** (calculado, `taskRisk`): sem prazo ou concluída/arquivada → nenhum; prazo antes de
  hoje → **Atrasada ⚑**; hoje → **Vence hoje ◉**; até 3 dias → **Prazo próximo ◔**.

## Progresso
- **Projeto** = tarefas concluídas ÷ tarefas do projeto. Tarefas arquivadas sem conclusão não contam;
  arquivadas depois de concluídas contam como concluídas. Projeto sem tarefas: 100% se marcado como
  Concluído, senão 0%.
- **Objetivo** = média do progresso dos projetos ligados (que não estejam na lixeira).
  Sem projeto → *estrela sem caminho*. Marcado como adormecido → *estrela adormecida* (sem punição).

## Índice de arrumação (`tidy` em `selectors.ts`)
Itens da casa considerados:
- livros com `houseId` da casa, fora da lixeira e não arquivados;
- tarefas com `houseId` da casa, fora da lixeira, com status diferente de Concluída e Arquivada.

Um item está **guardado** quando: livro em um móvel existente; tarefa ligada a um livro ou "na mesa".
Senão está **solto**. Decoração não conta.

```
total  = livros + tarefas abertas
stored = itens guardados
loose  = total − stored
índice = stored ÷ total        (1 quando total = 0)
```

| Nível | Condição (avaliada nesta ordem) | Aparência externa |
|---|---|---|
| Acolhedora | casa vazia (total = 0) | janelas acesas à noite, fumaça |
| Esmerada | loose = 0 | + vasos e lanterna no jardim |
| Organizada | índice ≥ 0,85 **ou** loose ≤ 1 | + canteiro de flores e horta |
| Acolhedora | índice ≥ 0,60 **ou** loose ≤ 3 | janelas acesas, fumaça |
| Em arrumação | demais casos | caixas à vista, janelas apagadas, sem fumaça |

A aparência reflete só o estado atual. Casas novas ou vazias começam "Acolhedora". O nível mais baixo é
uma casa habitada, nunca ruína. Os toques de "Esmerada" se somam à decoração do usuário.

## Atividade da casa (`houseActivity`)
- **Com urgência**: há tarefa atrasada ou para hoje → selo com símbolo e número.
- **Movimentada**: tarefa em andamento ou 4+ tarefas abertas.
- **Tranquila**: demais casos.
No exterior aparece **um selo só** por casa, em ordem de importância: atrasadas ⚑, hoje ◉, soltos ▫, em andamento ◐.

## Modelos de livro (esquema versionado)
Campos: texto curto e longo, número, moeda, data, data recorrente, telefone, e-mail, link, opção única
e múltipla, checklist, arquivo, imagem, referência a outro livro. Cada alteração incrementa `version`.
- **Adicionar campo**: aparece vazio em todos os livros.
- **Remover campo**: vira `hidden`; os dados ficam nos livros e podem ser recuperados.
- **Remoção definitiva**: apaga o campo e os dados (com confirmação).
- **Mudar tipo**: `convertFieldValue` converte cada valor; `fieldTypeChangeLoss` conta os livros que
  perderiam dados e a interface avisa antes.
- **Excluir modelo**: os livros passam a outro modelo (padrão: Nota) e os campos preenchidos viram texto
  na primeira página.
- Modelos de sistema: Nota, Projeto, Pessoa, Contrato, Comprovante, Consulta, Rotina, Informação útil.
  Nota e Projeto não podem ser excluídos (sustentam funções do app), mas aceitam campos.

## Lixeira
Excluir marca `trash = { deletedAt, batchId }`. Itens excluídos juntos (uma casa e seu conteúdo)
compartilham o lote e são restaurados juntos, ao endereço original. Se o endereço não existe mais, o
item volta solto e o app pergunta onde guardar. Após 30 dias o lote é apagado na abertura do app.
Exclusão definitiva antecipada exige confirmação.

## Layout como dado
`placements` guardam o layout da cidade (`scope = 'city'`) e de cada casa. São exportados e importados
junto com o conteúdo. A validação de grade (`grid.ts`) separa camadas: piso, parede, tapete e cidade.
O cômodo tem 14 × 9 células; as duas células da porta ficam sempre livres.
