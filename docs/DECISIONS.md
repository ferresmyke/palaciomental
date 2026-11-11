# Decisões

Registro das decisões técnicas e de produto tomadas durante o desenvolvimento, com a justificativa.

## Técnicas
1. **TypeScript 5.9 em vez de 7.0.** A 7.0 (compilador nativo) é recente; a 5.9 é a linha estável mais
   usada pelo ecossistema (Vite, Vitest, tipos do React). Migrar depois é simples.
2. **Phaser 4.2.1** (versão estável) com `smoothPixelArt`: pixels nítidos em qualquer zoom, sem serrilhado.
   Renderização WebGL (o Canvas está obsoleto no Phaser 4).
3. **Arte gerada por código, não importada.** Os bancos de assets (OpenGameArt, Kenney, itch.io) não estavam
   acessíveis neste ambiente e o documento pede arte original com licença verificável. Um motor de pixel art
   com paleta única garante coerência entre qualquer combinação que o usuário monte, permite variações de
   cor sem novos arquivos e deixa o catálogo extensível por dados. A arquitetura aceita trocar uma receita
   por imagem no futuro (o registro de sprites devolve um canvas).
4. **Zustand + Immer com patches** como padrão de comandos: cada operação de domínio produz patches e
   inversos; desfazer/refazer é universal (conteúdo, layout, modelos) e a gravação é incremental.
5. **Operações de domínio puras** (`domain/ops.ts`) usadas pela UI, pelas cenas e pelos testes. Regras de
   integridade vivem num só lugar.
6. **Rótulos do mundo em HTML** sobre o canvas, não texto do Phaser: legíveis em qualquer zoom, acessíveis
   e baratos de atualizar.
7. **Uma instância do Phaser com três cenas**, alternadas por `ui.place`. O Phaser é carregado sob demanda.
8. **Planta da cidade como função pura** da ampliação (`cityPlan(expansion)`), com cenário determinístico.
   Só o layout do usuário (casas em terrenos, decoração) é dado persistido.
9. **Tempo real nas viagens**: caminhada e transições usam o relógio real e são limitadas a ~2 s, para a
   narrativa nunca atrasar uma consulta e não travar em máquinas lentas.
10. **IndexedDB com um store por tabela** e anexos em store próprio; backup em JSON único com base64.
11. **Rótulos de terreno e ampliação**: ampliar a cidade acrescenta fileiras de 8 terrenos ao sul sem
    mexer nos existentes (ids estáveis `A1…`, `B1…`, `S1-1…`).
12. **Lixeira por lotes**: excluir uma casa com conteúdo cria um lote único, restaurado de uma vez.
13. **"Nota" e "Projeto" não podem ser excluídos**: sustentam o destino padrão de livros e o cálculo de progresso.
14. **Constelação padrão acompanha o nome da casa** enquanto não for renomeada à parte.
15. **Livro "aberto na mesa"** quando tem tarefa em andamento ou quando o usuário o deixa aberto; no móvel
    fica a etiqueta do espaço vazio. O endereço não muda.
16. **Tarefa "guardada"** = ligada a um livro ou deixada na mesa de trabalho da casa.
17. **Fórmula da arrumação** com limiares por proporção e por contagem absoluta (ver `DATA_MODEL.md`), para
    que uma casa grande com 1 item solto não pareça bagunçada.
18. **Interior com 14 × 9 células** e porta sempre livre; camadas de colisão separadas para piso, parede e tapete.
19. **Gancho `window.__pm`** expõe a loja e operações para os testes ponta a ponta. Não há dados de
    terceiros nem rede envolvidos; é útil também para suporte.
20. **Playwright 1.63** (mesma versão do Chromium instalado) para os testes ponta a ponta.

## De produto (tomadas dentro da autonomia, sem mudar o conceito)
- Seções "Hoje", "Próximos sete dias", "Atrasadas", "Em andamento" e "Aguardando terceiros" abertas por padrão
  na Mesa do Dia; "Urgentes" e "Concluídas" recolhidas (evitam repetição).
- No exterior, **um selo por casa** (atrasadas > hoje > soltos > em andamento), para não carregar o mapa.
- Projeto parado (Ronda) = projeto aberto sem atividade há 14 dias.
- "Prazo próximo" = até 3 dias.
- Ao mover uma casa, a câmera se afasta para mostrar todos os terrenos.

## Pendentes — dependem do responsável pelo produto
1. **Sincronização remota (Supabase).** Exige decidir conta, privacidade e propriedade dos dados.
   A arquitetura está preparada (`Repository`, ids estáveis, exclusão lógica); nada foi implementado.
2. **Cofre e criptografia** de dados sensíveis.
3. **Publicação do código** em repositório remoto (GitHub). Hoje o repositório Git é só local.
