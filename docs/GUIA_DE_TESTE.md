# Guia de teste da versão 2

Abra `versao-pronta/Recanto.html` no Chrome ou Edge (ver `versao-pronta/COMO ABRIR.txt`) e escolha **Explorar com exemplos**.
Marque cada item. Se algo não corresponder ao esperado, anote qual item e me conte.

## 1. Primeira impressão
- [ ] A cidade aparece ao fim da tarde (ou na luz do seu horário), com praça, fonte, rio, ponte e as seis casas.
- [ ] Os botões do topo mostram **nomes** (Buscar, Correio, Mesa do Dia, Objetivos, Casas, Reforma, Configurações) em tela larga.
- [ ] Clique em uma casa: o avatar anda até ela e você entra. O resumo no topo diz algo como "2 itens soltos. 1 atrasada."
- [ ] `0` volta à praça, `1`–`6` entram nas casas, `O` leva ao Observatório.

## 2. Guardar e encontrar (o coração do app)
- [ ] `N` e anote "Comprar presente". Ele vai para o **Correio** (o contador sobe).
- [ ] Correio › **Guardar em…** › uma casa › um móvel (ou "Criar um móvel aqui"). A casa melhora de aparência (índice de arrumação).
- [ ] No interior da Hospedaria, clique na estante **Pessoas**: as lombadas têm as cores das capas. Abra "Dra. Helena Prado".
- [ ] `/` e busque **helena** ou **dermato**: o resultado mostra o endereço completo e **Enter leva o avatar até lá**.
- [ ] Arraste um item solto do chão até uma estante (ele encaixa e a casa fica mais arrumada).

## 3. Tarefas, prazos e repetição (novo)
- [ ] `M` abre a **Mesa do Dia**: Hoje, Próximos 7 dias, Atrasadas, Urgentes, Em andamento, Aguardando, Concluídas.
- [ ] Abra a tarefa **Pagar o aluguel**: ela está marcada **↻ Repete toda mês**. Conclua-a: **a próxima já aparece** com prazo no futuro.
- [ ] Crie uma tarefa e use **Repetir › Toda semana** (ou "a cada 2 dias"). Conclua e veja a próxima nascer.
- [ ] O risco de atraso aparece com símbolo e texto (⚑ Atrasada, ◉ Vence hoje), nunca só com cor.

## 4. Conexões entre livros (novo)
- [ ] Abra **Consulta de rotina**: a seção **Conexões** mostra "Este livro cita" (a Dra. Helena e os exames) e, no livro dela, "Citado por".
- [ ] Clique em **Ver no mapa**: o **Mapa de Conexões** desenha os livros ligados. Clique em um ponto para abrir o livro.
- [ ] No topo do mapa, clique no × para ver **todo o Recanto**; escolha outro livro como centro e mude a distância.
- [ ] Em um texto, escreva `[[Manual da geladeira]]`: a conexão aparece. Renomeie o livro citado: o `[[link]]` acompanha.

## 5. Obsidian (novo) — com o Vault de exemplo
- [ ] Configurações › **Obsidian** › Escolher a pasta › `versao-pronta/Vault-de-exemplo` › permitir.
- [ ] Aparece "Conectado" e o relatório: notas criadas no Vault, **3 notas novas viraram livros** (Correio, Lar › Compras, Ateliê › Ideias).
- [ ] Abra a pasta no Obsidian: há `10 - Áreas da Vida/...` com uma nota por livro, `_Anexos`, e `90 - Sistema/Recanto/ÍNDICE.md`.
- [ ] Abra uma nota (ex.: *Contrato de aluguel*): propriedades no topo (`recanto_id`, `tipo`, campos) e o texto em Markdown.
- [ ] Edite o texto no Obsidian, volte ao Recanto, **Sincronizar agora**: o livro mudou.
- [ ] Edite o livro no Recanto e sincronize: a nota mudou, e **suas propriedades extras (tags) foram mantidas**.
- [ ] Edite **o mesmo livro nos dois lados** e sincronize: fica a versão do Obsidian e aparece o **conflito** no relatório, com a cópia `(conflito Recanto ...)` ao lado.
- [ ] No livro, o botão **Abrir no Obsidian** abre a nota no aplicativo.
- [ ] Mova o livro para outro móvel no Recanto: a nota muda de pasta. Mover a nota de pasta no Obsidian **não** muda o móvel.

## 6. Proteção dos dados (novo)
- [ ] Configurações › **Cópias de segurança** › "Fazer uma cópia agora"; mude algo; **Restaurar** a cópia. O estado volta (e o anterior fica guardado).
- [ ] **Exportar backup** gera um arquivo; **Importar backup** o restaura.
- [ ] Recarregue a página (F5): tudo continua do jeito que estava.

## 7. Montar o seu Recanto (Modo Reforma)
- [ ] `R`: catálogo à direita. Escolha uma planta, clique na cena; `G` gira, `D` duplica, `Delete` remove, `Ctrl+Z` desfaz.
- [ ] Na cidade, mova uma casa para um terreno livre (a câmera mostra todos os terrenos).
- [ ] Quadro de parede com uma imagem sua (selecione o quadro › escolher imagem).

## 8. Objetivos
- [ ] `O`: o céu com estrelas. Abra uma estrela: o progresso vem das tarefas dos projetos ligados. Veja uma "sem caminho" e uma "adormecida".

## 9. No celular ou tela pequena
- [ ] Redimensione a janela (ou abra no celular): a barra vai para baixo, os painéis viram folhas inferiores e criar/editar continua possível.

## 10. O que me interessa saber
- Algo que você **esperava** e não encontrou? Algo que atrapalhou?
- O Obsidian conversou do jeito que você imaginava (pastas, nomes, propriedades)?
- O que você usaria **todo dia** e o que ainda falta para isso?
