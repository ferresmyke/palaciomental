# Criação e edição

## Dois tipos de edição
- **Conteúdo** (livros, páginas, tarefas, objetivos, modelos): a qualquer momento, no próprio lugar, sem modo especial.
- **Estrutura e espaço** (casas, móveis, decoração, posições, terrenos): no **Modo Reforma** (`R` ou botão de ferramenta no HUD).

Em ambos: duplo clique (ou Enter/F2 com foco) renomeia; campos salvam enquanto você digita; não há botão "salvar";
desfazer/refazer (`Ctrl+Z` / `Ctrl+Shift+Z`) e lixeira de 30 dias. Criar exige só um nome.

## O que dá para fazer com cada coisa
| Elemento | Criar | Editar | Mover | Excluir |
|---|---|---|---|---|
| Casa | Casas › Nova casa (modelo + tema + nome; terreno sugerido) ou clique em terreno livre na Reforma | nome, tema, modelo, cor do telhado, ocultar, ordem | outro terreno (Reforma: arrastar ou "Mover de terreno") | com destino do conteúdo |
| Móvel contêiner | catálogo da Reforma, "Guardar em… › Criar um móvel aqui" | nome, tipo (sem perder livros), variação, cor | arrastar, setas, girar `G` | com destino dos livros |
| Móvel essencial | já existe | aparência | arrastar, setas, girar | não |
| Decoração | catálogo da Reforma | variação, cor, imagem (quadros) | arrastar, setas, girar, duplicar `D` | `Delete` |
| Livro | "+" no móvel, Correio (anotação) | título, modelo, campos, páginas, capa, fita | Guardar em…, arrastar do chão, reordenar | lixeira |
| Modelo de livro | Configurações › Modelos (do zero ou duplicando) | nome, capa, campos (nome, tipo, opções, ordem) | — | com modelo de destino |
| Página (bloco) | "Inserir: + Texto, Título, Checklist, Link, Arquivo, Imagem, Tabela, Data, Referência" | no lugar | ↑ ↓ | × (com desfazer) |
| Tarefa | `N`, Correio, mesa, livro, Mesa do Dia | todos os campos | outra casa, livro ou mesa | lixeira |
| Objetivo | Observatório / Objetivos | título, descrição, horizonte, constelação, adormecer | entre constelações | lixeira |
| Constelação | Objetivos › Nova constelação | nome (duplo clique) | — | com destino dos objetivos |
| Etiqueta | no campo de etiquetas da tarefa ou em Configurações | nome e cor | — | só sai dos itens |

## Modo Reforma
- Grade visível; antes de soltar, o lugar fica verde (válido) ou vermelho, com o motivo escrito ("A entrada precisa ficar livre.").
- Catálogo lateral com categorias, busca e prévia. Clique para escolher e clique na cena para colocar,
  ou arraste o item até a cena. O objeto pode ser girado antes de colocar (`G`).
- Objeto selecionado: setas movem uma célula; `G` gira; `D` duplica; `Delete` remove (móveis pedem o destino dos livros).
- "Objetos aqui" lista tudo o que está na cena, para selecionar sem precisar clicar com precisão.
- Na cidade: casas podem ser arrastadas para um terreno livre; terrenos livres mostram "+ Nova casa"
  ou "Mover para cá"; "Liberar mais terrenos" amplia a cidade ao sul, sem custo.
- "Restaurar a disposição inicial" (por casa): móveis voltam aos lugares de origem e a decoração volta ao
  padrão do tema; livros e móveis criados são mantidos. Pede confirmação e pode ser desfeito.
- Em telas pequenas, o painel da Reforma vira folha inferior e todas as ações têm botões (sem depender de arrastar).

## Catálogo de objetos (manifesto)
`src/catalog/objects.json` descreve cada objeto: `id`, `name`, `category`, `scope` (interior/city),
`kind` (essential/container/decor), `mount` (floor/wall/rug/city/ground), tamanho `w × h` em células,
`recipe` (o desenho), `variants`, `colors`, `rotatable`, `solid`, `light`, `animated`, `acceptsImage`.
Um item novo que use uma receita existente entra sem alterar código. Modelos de casa ficam em
`houses.json`; temas (parede, piso, estantes sugeridas e decoração inicial) em `themes.json`.

Todo o catálogo está disponível desde o início. Decoração não conta na arrumação nem aparece na busca.

## Integridade
- Excluir casa: mover o conteúdo para outra casa (chega ao chão), arquivar, ou excluir junto (lixeira).
- Excluir móvel: mover os livros para outro móvel, deixar no chão, arquivar no baú, ou excluir junto.
- Excluir modelo: escolher o modelo que os livros passam a usar; campos preenchidos viram texto.
- Excluir constelação: mover os objetivos para outra, ou excluí-los (lixeira).
- Excluir etiqueta: só a remove dos itens.
- A exclusão em massa (casa, móvel, esvaziar lixeira) sempre mostra quantos itens serão afetados.
- Restaurar devolve ao endereço original; sem endereço, o item volta solto e o app pergunta onde guardar.

## Migração de modelos
Ver `DATA_MODEL.md › Modelos de livro`. Resumo: adicionar inclui vazio; remover oculta e preserva;
remoção definitiva apaga com confirmação; mudar tipo converte e avisa sobre perdas.
