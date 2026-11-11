# Arquitetura técnica

## Pilha
| Peça | Versão | Papel |
|---|---|---|
| TypeScript | 5.9.3 | Tipagem estrita em todo o código |
| React | 19.3.1 | Interface, painéis, formulários, Mesa do Dia, Reforma |
| Vite | 8.3.7 | Servidor de desenvolvimento e build |
| Phaser | 4.2.1 | Três cenas 2D (Cidade, Interior, Observatório), WebGL |
| Zustand | 5.1.0 | Lojas reativas (dados e interface), usadas por React e Phaser |
| Immer | 11.2.10 | Operações imutáveis e patches para desfazer/refazer |
| idb | 8.0.4 | IndexedDB com promessas |
| Vitest | 5.1.0 | Testes de domínio e persistência (com fake-indexeddb) |
| Playwright | 1.63.0 | Testes ponta a ponta no Chromium |

## Camadas
```
src/
  domain/        dados e regras puras — nenhuma dependência de React ou Phaser
    types.ts       modelo de dados (ver DATA_MODEL.md)
    ops.ts         todas as operações de escrita (criar, mover, excluir, restaurar...)
    selectors.ts   leituras derivadas: arrumação, progresso, risco, agenda, ronda, endereço
    search.ts      busca universal
    city.ts        planta da cidade (terreno, terrenos, lugares, cenário) e A* do avatar
    grid.ts        grade, encaixe e colisão (cidade e interiores)
    catalog.ts     leitura do catálogo por manifesto (src/catalog/*.json)
    seed.ts        modelos de livro de sistema e mundo inicial
  catalog/       manifestos de dados: objects.json, houses.json, themes.json
  persistence/   Repository (interface), IndexedDbRepository, MemoryRepository, backup
  store/
    db.ts          loja de dados + comandos reversíveis + gravação incremental
    ui.ts          estado de interface (onde estou, painéis, Reforma, avisos)
    nav.ts         viagem: casa, móvel, livro, tarefa, objetivo, praça
    gameApi.ts     contrato entre navegação e cenas; barramento de eventos
    actions.ts     execução com aviso de erro e "Desfazer"; anexos
  game/
    art/           motor de pixel art procedural e todos os sprites
    core.ts        câmera, rótulos em HTML, luz por hora, caminhante
    scenes/        CityScene, InteriorScene, ObservatoryScene
    index.ts       cria o Phaser.Game e alterna a cena conforme ui.place
  ui/            React: App, HUD, painéis, Reforma, abertura, atalhos
```

## Fluxo de dados
1. A interface (ou uma cena) chama `exec(rótulo, draft => ops.algo(draft, ...))`.
2. `exec` roda a operação com `produceWithPatches` do Immer: obtém o novo estado, os patches e os inversos.
3. O comando entra na pilha de desfazer (edições de texto consecutivas são agrupadas por `merge`).
4. Só os registros alterados são gravados no repositório (fila serializada; erros viram aviso na tela).
5. As lojas notificam: o React re-renderiza; cada cena compara a revisão e redesenha só o que mudou.

As cenas nunca escrevem no banco diretamente: elas chamam as mesmas operações de domínio via `run`.
O estado dos dados é independente da representação gráfica.

## React × Phaser
- O React nunca importa Phaser. O Phaser é carregado sob demanda (`import('@/game')`).
- As cenas leem `dbStore` e `uiStore` e registram uma API em `gameApi` (andar até, focar, zoom).
- Arrastar do catálogo (HTML) para a cena usa `gameBus` (`reform:pointer`, `reform:drop`).
- Rótulos de casas, móveis e estrelas são elementos HTML posicionados sobre o canvas (legíveis em qualquer zoom e acessíveis).

## Cenas
- **Cidade**: chão pintado a partir da planta (com bordas orgânicas), água animada por baixo, cenário,
  casas por terreno (corpo, telhado, janelas acesas, fumaça, jardim conforme arrumação), decoração do
  usuário, avatar com A*, vizinhos, luz por hora (camada multiplicativa + brilhos aditivos), minimapa.
- **Interior**: fundo do cômodo por tema, móveis e decoração por layout, itens soltos no chão, avatar,
  grade da Reforma, realce de destino ao arrastar um item.
- **Observatório**: céu com constelações (uma coluna por constelação, altura pelo horizonte), estrelas
  com brilho pelo progresso, luneta e varanda.

## Persistência
Local-first em IndexedDB: um object store por tabela e um para os anexos (`blobs`).
`Repository` é a única porta de acesso; trocar ou ampliar o armazenamento é implementar essa interface.
Backup: um JSON com todas as tabelas e os anexos em base64 (`persistence/backup.ts`).
Se o IndexedDB não estiver disponível, o app usa memória e avisa o usuário.

### Estratégia futura de sincronização (Supabase/PostgreSQL)
- Cada registro já tem `id` estável gerado no cliente; tabelas mapeiam 1:1 para tabelas remotas.
- Adicionar `updatedAt` a todas as entidades (já existe em livros e tarefas) e um registro de mudanças
  locais (os `Change` gravados por `db.ts` são o ponto natural para isso).
- Sincronização por "último a escrever vence" por registro, com lixeira como exclusão lógica (já é).
- Anexos para o Storage do Supabase, referenciados pelo mesmo `id`.
- Migrações de esquema: `SCHEMA_VERSION` em `types.ts` e `meta.world.schemaVersion`.
A sincronização não foi implementada: privacidade e propriedade dos dados exigem decisão do responsável pelo produto.

## Desempenho
- Gravação incremental (só registros alterados) e agrupamento de digitação.
- Sprites gerados uma vez e guardados em cache por chave (receita, variação, cor, rotação, estado).
- Estantes paginadas (24 lombadas por página) e listas em páginas de 40 para centenas de livros.
- Interiores redesenham apenas objetos cujo estado visual mudou.
- Viagem e animações usam tempo real, imunes a quedas de quadros.

## Testes
- `tests/domain.test.ts`: endereço permanente, referências sem cópia, progresso, migração de modelos,
  grade e colisão, integridade ao excluir, lixeira, arrumação, Mesa do Dia, Ronda, busca, planta e caminho.
- `tests/store.test.ts`: desfazer/refazer, persistência em IndexedDB, backup.
- `e2e/run.mjs`: 15 cenários ponta a ponta cobrindo os critérios de aceitação, inclusive tela de celular
  e verificação de erros no console.
