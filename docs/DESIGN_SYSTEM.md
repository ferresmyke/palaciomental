# Sistema de design

## Direção
RPG 2D artesanal, pixel art detalhada em visão superior inclinada (2.5D), fim de tarde dourado como
referência. O cenário é a interface: o mundo ocupa a tela e os controles ficam nas bordas.

## Arte procedural original
Toda a arte é desenhada por código em `src/game/art/` (sem imagens de terceiros):
- `px.ts`: buffer RGBA com primitivas de pixel art — retângulos, elipses, polígonos, "blobs" de folhagem
  com luz vinda de cima à esquerda, tábuas com veios, tijolos e pedras, contorno escuro de 1 px, sombra de contato.
- `palette.ts`: **paleta única** em rampas de 5 tons (do escuro ao claro): madeiras (carvalho, nogueira,
  pinho, cerejeira, ébano, branco), tecidos (vinho, azul, verde, ocre, cinza, rosa), metais (dourado,
  ferro), pedra, telha, ardósia, palha, musgo, folhagem, água, papel, fogo, luz. Toda cor de catálogo é
  o nome de uma rampa; por isso qualquer combinação montada pelo usuário mantém paleta, escala e luz coerentes.
- `cityArt.ts`: árvores (carvalho, pinheiro, bétula, frutífera), arbustos, flores, pedras, juncos, tocos,
  lanternas, bancos, carroça, feno, cercas, canteiros, horta, estátua, bebedouro, pontezinha, galinhas;
  casas em 5 modelos (chalé de telhas, casa de empena com enxaimel, cabana de palha, casa de pedra, casa
  de madeira) com corpo, telhado e janelas acesas em camadas separadas; Correio; Observatório; fonte animada;
  quadro da cidade; Mesa do Dia (barraca); feirinha; poço.
- `interiorArt.ts`: móveis em caixa 3/4 com as 4 rotações; estantes com lombadas reais (cor da capa de
  cada livro, espaço vazio para livro em uso), mesa com livros abertos, quadro com avisos (alfinete vermelho
  para urgentes), baú, gaveteiro, mural, caixa, armário, escrivaninha; decoração e temáticos; tapetes;
  itens soltos por tema (caixas de peças, cestos, papéis, sacolas, pacotes, rolos).
- `terrain.ts`: chão da cidade a partir da planta, com bordas orgânicas, praça em anéis de pedra,
  penhasco com estratos, ponte de tábuas, água animada; cômodos por tema (parede, lambri, piso, porta).
- `chars.ts`: avatar e vizinhos (frente, costas, lado; 4 quadros cada).
- `icons.ts`: emblemas 9×9 usados em placas, capas e HUD.

A folha `sheet.html` mostra tudo para revisão (`?only=city|interior|rooms|ground`).

## Grade e escala
- Célula = 16 px. Cidade: 72 × 48 células (+12 linhas por ampliação). Terreno: 7 × 6, casa ocupa 5 × 3.
- Interior: 14 × 9 células de piso + parede do fundo (objetos de parede ficam na faixa da parede).
- Cada objeto: tamanho em células, âncora no canto inferior esquerdo da pegada, sombra de contato,
  profundidade pela base (ordenação por y), variações e cores.

## Camadas
Cidade: água → chão → objetos rasos (flores, caminhos) → objetos ordenados por y (árvores, casas,
avatar, decoração) → luz (camada multiplicativa) → janelas acesas e brilhos (aditivos) → rótulos HTML.
Interior: cômodo → tapetes → parede → objetos ordenados por y → luz → brilhos → rótulos.

## Luz por hora real
Interpolação entre chaves: noite azul (até 4h30), amanhecer rosado, manhã clara, tarde, **fim de tarde
dourado** (17h30), anoitecer, noite. Janelas acendem com noite > 30% nas casas "Acolhedora" ou melhores.
O interior recebe uma versão mais quente e mais clara da mesma luz. Configurável em Configurações.

## Interior-base
Toda casa nasce com: mesa de trabalho (centro), quadro de avisos (parede), baú (canto), as estantes
sugeridas do tema na parede do fundo e a decoração do tema. Só a decoração muda por tema:
| Tema | Parede / piso | Destaques |
|---|---|---|
| Oficina | pedra / tábuas | bancada, bigorna, painel de ferramentas, barril |
| Lar | creme / tábuas | fogão a lenha, poltrona, gato, janela com cortina |
| Tesouraria | verde listrado / xadrez | balcão, cofre, relógio, castiçal |
| Ginásio | azul-céu / tábuas | halteres, cama de descanso, colchonete |
| Hospedaria | vinho / tábuas | lareira acesa, mesa comprida posta, poltronas, flâmula |
| Ateliê | lilás / tábuas | cavaletes, mapa, globo, pilhas de livros |
| Simples | creme / tábuas | neutro, para casas novas |

## Interface (React)
Tokens em `src/styles/tokens.css`: madeira (`--wood-*`), pergaminho (`--paper-*`), ouro, folha, vinho,
alerta. Títulos em serifa (Georgia/Iowan), texto em fonte do sistema com alta legibilidade.
- **HUD** nas bordas: breadcrumb com endereço completo e botão voltar (topo esquerdo); Buscar, Correio
  (com contador), Mesa do Dia, Objetivos, Casas, Reforma, Configurações (topo direito); zoom, Praça e
  Observatório (base esquerda); minimapa (base direita). No celular a barra vai para a base.
- **Painéis contextuais** à direita (folha inferior no celular), com cabeçalho de madeira e corpo de pergaminho.
- **Resumo da casa** no topo ao entrar ("1 item solto. 1 atrasada.") com "Arrumar um item".
- Componentes: botões (madeira, fantasma, perigo), chips, segmentados, amostras de cor, barra de
  progresso, linhas de lista, editores (checklist, anexos, seletor de livro, etiquetas), estante com
  lombadas, mural de cartões, gavetas com pastas.
- Acessibilidade: foco visível dourado; toda cor acompanhada de símbolo e texto; rótulos ARIA;
  alternativas de teclado e botões para tudo o que se arrasta; "reduzir movimento" (respeita o sistema).
