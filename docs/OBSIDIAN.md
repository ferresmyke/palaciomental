# Integração com o Obsidian

Guia técnico e de uso. A decisão e a justificativa estão em `AVALIACAO_RELATORIO.md`.

## Uso
1. Abra o Recanto no **Chrome** ou **Edge** (Firefox e Safari não deixam escolher pastas).
2. **Configurações › Obsidian › Escolher a pasta do Obsidian…** e selecione a **raiz do Vault** (a que contém `.obsidian`).
   Para testar, use uma **cópia** do Vault, ou a pasta `versao-pronta/Vault-de-exemplo`.
3. Conceda a permissão. A cada nova sessão o navegador pede de novo: aparece o botão **Reconectar o Obsidian** no topo.
4. A sincronização roda ao conectar, ao abrir o app, ao voltar para a janela e ~12 s depois de você parar de editar.
   **Sincronizar agora** força uma rodada. Desligue a opção automática se preferir controlar à mão.

## O que é criado no Vault
```
00 - Caixa de Entrada/            Correio: livros sem casa  (Arquivo geral/ = arquivados sem casa)
10 - Áreas da Vida/<Casa>/<Móvel>/Livro.md
10 - Áreas da Vida/<Casa>/Chão/   livros da casa ainda sem móvel
10 - Áreas da Vida/<Casa>/Baú/    livros arquivados da casa
_Anexos/                          imagens e arquivos
90 - Sistema/Recanto/             ÍNDICE.md e LEIA-ME para agentes de IA.md (gerados)
```
Qualquer outra pasta do Vault é ignorada (mas notas com `recanto_id` movidas para lá continuam ligadas).

## Formato de uma nota
```markdown
---
recanto_id: lv_x8k2...        # identidade permanente: não apague
tipo: Contrato                # modelo do livro
casa: Lar                     # onde está no Recanto (informativo)
movel: Documentos
criado: 2026-11-12
atualizado: 2026-11-12
Com quem: Imobiliária Sol     # um campo do modelo
Valor: 2350
Vencimento: 2027-03-01
tags: [importante]            # suas propriedades são preservadas
---

# Contrato de aluguel

Reajuste anual pelo IGP-M.

- [ ] Assinar aditivo

<!-- recanto:tarefas (gerado pelo Recanto; edite as tarefas no app) -->
## Tarefas no Recanto
- [ ] Pagar o aluguel 📅 2026-12-05
<!-- /recanto:tarefas -->
```

| Recanto | Markdown |
|---|---|
| Título | nome do arquivo e `# título` |
| Campos (texto, número, moeda) | propriedade (`Nome: valor`) |
| Data e data recorrente | propriedade `AAAA-MM-DD` (o Obsidian reconhece como data) |
| Opção única / múltipla | rótulo / lista de rótulos (opções novas viram opções do modelo) |
| Checklist (campo) | lista de `"[ ] texto"` |
| Arquivo e imagem (campo) | lista de `[[_Anexos/arquivo]]` |
| Referência a livro | `"[[Título]]"` |
| Bloco título | `## título` |
| Bloco texto | parágrafo |
| Bloco checklist | `- [ ]` / `- [x]` |
| Bloco link | `[rótulo](url)` |
| Bloco tabela | tabela Markdown |
| Bloco data | `📅 AAAA-MM-DD rótulo` |
| Bloco arquivo/imagem | `[[_Anexos/x\|legenda]]` / `![[_Anexos/x.png\|legenda]]` |
| Bloco referência | linha só com `[[Título]]` |
| Projeto | `status`, `prazo`, `resumo` |

Notas: texto em parágrafos separados por linha em branco vira blocos separados; níveis de título (`###`) viram o mesmo bloco de título;
campos escondidos do modelo não são exportados; tarefas ficam só na seção gerada (somente leitura).

## Algoritmo (por livro, três vias)
O Recanto guarda, em cada livro, a ligação `note = { path, dir, hash, rhash, ghash }` da **última sincronização**:
`hash` do arquivo, `rhash` do conteúdo do livro (sem partes voláteis ou geradas), `ghash` da seção de tarefas.

| Arquivo mudou | Livro mudou | Resultado |
|---|---|---|
| não | não | nada (só atualiza a seção de tarefas se mudou) |
| sim | não | **importa** a nota para o livro (sem reformatar o seu arquivo) |
| não | sim | **grava** a nota (preservando propriedades desconhecidas); se mudou de casa/móvel, **move**; se mudou o título, **renomeia** |
| sim | sim | **conflito**: a nota vence; a versão do Recanto vai para `Nome (conflito Recanto data hora).md` (sem `recanto_id`) |
| sem arquivo | — | **cria** a nota (se existia antes, avisa que foi recriada) |
| nota sem `recanto_id` em `00`/`10` | — | **cria o livro** (casa e móvel pelo caminho; senão, Correio) e acrescenta o `recanto_id` ao arquivo |

Outras regras: renomear o arquivo no Obsidian renomeia o livro; mudar a pasta no Obsidian **não** muda o móvel; mudar `tipo` troca o modelo;
dois arquivos com o mesmo `recanto_id` (cópia) → o segundo é ignorado com aviso; arquivos `...conflito Recanto...` nunca são sincronizados;
a gravação confere se o arquivo mudou durante a sincronização antes de sobrescrever.

## Limites conhecidos
- Navegadores: Chrome/Edge. Permissão renovada a cada sessão (a menos que o navegador a mantenha).
- Pasta apagada ou movida pelo sistema: o app pede para escolher de novo; as notas não são afetadas.
- Wikilinks por título: livros com o mesmo título são ambíguos (prefere o da mesma casa).
- O que não é suportado hoje: pastas de Vault em rede muito lentas (a leitura é completa a cada rodada), propriedades YAML aninhadas (são preservadas, não interpretadas).
