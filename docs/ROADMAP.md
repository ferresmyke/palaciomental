# Roteiro

## Entregue nesta versão
- **Fase 0–1 · Fundação**: Vite + React + TypeScript + Phaser 4; modelo de dados completo; operações de
  domínio; repositório IndexedDB; comandos reversíveis; testes; Git; documentação.
- **Fase 2 · O Recanto visual**: arte procedural original; cidade com praça, fonte, Correio, rio, ponte,
  colina do Observatório, terrenos; interiores por tema; avatar com caminho; vida ambiente; luz por hora;
  câmera com zoom, arrasto e pinça; minimapa.
- **Fase 3 · Organização**: livros, modelos e campos, páginas em blocos, tarefas, checklists, etiquetas,
  projetos, status/prioridade/risco, arquivamento, lixeira e restauração; arrumar (arrastar, "Guardar em…",
  "Arrumar um item"); índice de arrumação no exterior; seis casas iniciais.
- **Fase 4 · Modo Reforma**: interior e cidade; catálogo por manifesto; mover, girar, duplicar, remover,
  desfazer/refazer; quadros com imagem do usuário; criar, mover, ocultar e excluir casas; ampliar terrenos;
  restaurar disposição; escolha do início.
- **Fase 5 · Observatório e conhecimento**: céu com constelações, objetivos, horizontes, progresso
  calculado, "Traçar caminho", estrelas sem caminho e adormecidas; baús e histórico; breadcrumbs; viagem rápida.
- **Fase 6 · Ferramentas**: Correio com cadastro rápido (`N`) e classificação; Mesa do Dia completa;
  busca universal com viagem; Ronda semanal; exportar/importar.
- **Fase 7 · Refinamento**: 72 testes de domínio, persistência e Obsidian e 18 cenários ponta a ponta; celular;
  acessibilidade; desempenho com listas paginadas.

## Versão 2 (12–13/11/2026): proteção, Obsidian, conexões, uso diário
- Migrações não destrutivas, integridade, cópias automáticas e restauração.
- Obsidian bidirecional por acesso direto à pasta; conflitos sem perda; índice e guia para agentes de IA.
- Mapa de Conexões e conexões por livro; tarefas que se repetem; dados de exemplo; versão em arquivo único.

## Próximas etapas (ordem sugerida pelo relatório, ajustada)
1. **Uso real do Obsidian por algumas semanas** (em cópia do Vault primeiro): ajustar conversões e relatório conforme o que aparecer.
2. **Editor do Mundo**: transformar `cityPlan()` em uma planta serializada e versionada (terreno, ruas, rio, praça, pontes), com migração e
   restauração do padrão; ferramentas de pintar caminhos/terreno no Modo Reforma. Depois, **Ateliê de Aparência** (paletas, temas, iluminação).
3. **Mapa de Conexões 2**: filtros, Mapas de Conteúdo (MOCs) gerados, relações tipadas (pessoa ↔ projeto ↔ reunião).
4. **Camada de IA opcional** (consulta ao Vault por agentes; MCP).
5. **Sincronização entre aparelhos** das estruturas (Supabase ou equivalente), com decisão prévia de privacidade e conflitos.
6. **Plugin do Obsidian / app desktop (Tauri)** se o acesso por navegador se mostrar limitante.

## Próximos passos menores
- Revisão de usabilidade com uso real por algumas semanas (o que mais se busca, o que fica solto).
- Mais variações de arte por tema (objetos temáticos extras, estações do ano).
- Edição de datas recorrentes além de anuais (mensais, semanais) e lembretes opcionais não intrusivos.
- Importação de dados de outros apps (CSV de tarefas, contatos vCard).
- Repetição por dias da semana (ex.: seg/qua/sex) e lembretes opcionais, sem culpa.
- Ícone e instalação como PWA (uso offline já é natural, por ser local-first).

## Dependem de decisão estratégica
- Sincronização entre aparelhos (Supabase) e conta de usuário.
- Cofre / criptografia de dados sensíveis.
- Sprites totalmente personalizados pelo usuário.
- Publicação do código em repositório remoto.
