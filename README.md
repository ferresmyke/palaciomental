# Palácio Mental — o Recanto

Organização pessoal pelo método do palácio da memória. A sua vida vira uma vila em pixel art:
cada área é uma **casa**, cada casa tem **móveis**, cada móvel guarda **livros** (pessoas, contratos,
projetos, notas...). Tarefas, prazos e objetivos convivem com esse mapa, e um **modo lista**
completo (a Mesa do Dia) dá acesso a tudo sem andar pela cidade.

## Abrir sem instalar nada (versão pronta)

Baixe o repositório (**Code › Download ZIP**), descompacte e dê duplo clique em **`versao-pronta/Recanto.html`** (Chrome ou Edge).
Veja `versao-pronta/COMO ABRIR.txt` e o roteiro `docs/GUIA_DE_TESTE.md`. Na primeira tela, escolha **Explorar com exemplos**.

## Novidades da versão 2
- **Obsidian**: cada livro vira uma nota Markdown na pasta do seu Vault, nos dois sentidos, com conflitos resolvidos sem perda (`docs/OBSIDIAN.md`).
- **Mapa de Conexões**: veja como os livros se relacionam (referências e `[[links]]`).
- **Tarefas que se repetem** e **cópias de segurança automáticas** com restauração.
- Migrações de dados, verificação de integridade e dados de exemplo.

## Como executar (desenvolvimento)

Requisitos: Node.js 20 ou mais recente.

```bash
npm install
npm run dev
```

Abra http://127.0.0.1:5173. Os dados ficam no próprio navegador (IndexedDB). Use
**Configurações › Exportar backup** de tempos em tempos.

Para gerar a versão de produção: `npm run build` e sirva a pasta `dist/` (por exemplo, `npm run preview`).

## Como usar

| Quero... | Como |
|---|---|
| Anotar algo sem decidir onde guardar | `N` (de qualquer lugar). Vai para o **Correio**, na praça. |
| Ver o que fazer hoje | `M` abre a **Mesa do Dia**: Hoje, próximos 7 dias, atrasadas, urgentes, em andamento, aguardando, concluídas. |
| Encontrar qualquer coisa | `/` ou `Ctrl+K`. Enter leva você (e o avatar) até lá. |
| Ir a uma casa | Clique nela, ou `1`–`6`. `0` volta à praça, `O` vai ao Observatório. |
| Guardar um item solto | Arraste do chão até um móvel, ou use **Guardar em…** / **Arrumar um item**. |
| Mudar a disposição, criar casas e móveis | `R` liga o **Modo Reforma**: catálogo, mover, girar (`G`), duplicar (`D`), remover (`Delete`). |
| Desfazer | `Ctrl+Z` / `Ctrl+Shift+Z`. Itens excluídos ficam 30 dias na **Lixeira**. |
| Definir objetivos | **Observatório**: cada objetivo é uma estrela; o brilho vem do progresso dos projetos ligados. |
| Revisar a semana | **Ronda semanal** (na Mesa do Dia): um cartão por casa, com guardar, adiar ou arquivar. |

Mapa: roda do mouse para o zoom, arrastar (ou botão direito) para mover; no toque, arrastar e pinça.
Tudo tem alternativa por teclado e por botões. Em Configurações você pode reduzir movimento,
ocultar o avatar e fixar a luz (por padrão ela segue o relógio).

## Desenvolvimento

- `npm test` — testes de domínio, persistência e Obsidian.
- `npm run build:single` — gera `versao-pronta/Recanto.html` (arquivo único).
- `npm run e2e` — testes ponta a ponta dos critérios de aceitação (requer Chromium do Playwright).
- `npm run typecheck`.
- `http://127.0.0.1:5173/sheet.html` — folha com toda a arte procedural.

Documentação técnica e de produto em [`docs/`](docs). Regras permanentes em [`CLAUDE.md`](CLAUDE.md).

## Créditos e licenças

Toda a arte (casas, móveis, vegetação, personagens, céu, ícones) é **original**, desenhada por código
em `src/game/art/` para este projeto. Não há imagens de terceiros. Bibliotecas: React, Phaser, Vite,
Zustand, Immer, idb (todas sob licença MIT). Fonte da interface: a do sistema (sem download).

## Capturas

Em [`docs/capturas/`](docs/capturas): a cidade ao fim da tarde, a praça, a Mesa do Dia, um livro de
pessoa na Hospedaria, o interior da Tesouraria, o Modo Reforma, o Observatório e a cidade à noite.
