# Padronizacao Visual de HUDs

Este guia define o padrao visual para comandos que retornam HUDs em Canvas no Discord.

## Direcao Visual

- Tema: medieval moderno, leve e legivel em mobile.
- Fundo: usar o asset `assets/ui/painel-hud-medieval.png` via helper compartilhado do renderer.
- Paleta base: fundo escuro, texto claro, detalhes em dourado antigo `#D4AF37`.
- Evitar: excesso de descricoes, tags decorativas redundantes, cores muito saturadas e layouts poluidos.

## Estrutura de Canvas

- Usar `drawHudBase` para aplicar o fundo e overlay.
- Usar `drawHudHeader` para titulo, subtitulo e linha divisoria.
- Usar `drawHudBox` para caixas/cartoes.
- Textos principais devem ser curtos e centralizados quando forem botoes ou cartoes de acao.
- Descricoes longas devem aparecer apenas quando agregarem informacao real, como dados de item ou ranking.
- A faixa lateral dos cards de navegacao deve usar uma cor unica: `#D4AF37`.

## Componentes do Discord

- Botoes de HUD devem usar uma cor unica: `ButtonStyle.Secondary`.
- Estado ativo deve ser indicado por simbolo no label, nao por cor.
- Padrao recomendado:
  - Ativo: `◆ Nome`
  - Inativo: `◇ Nome`
  - Navegacao: `◁ Anterior` e `Proximo ▷`
- Paineis com botoes de abas devem atualizar o componente original quando uma aba for clicada, mantendo o item selecionado com `◆`.
- Evitar emojis nos botoes de HUD. Preferir simbolos discretos e neutros.
- Em HUDs abertas pelo `/painel`, submenus devem mostrar apenas `Inicio` e os controles do contexto atual.
- Nao repetir o menu raiz completo do jogador dentro de inventario, perfil, ranking ou enciclopedia.

## Fluxo de Navegacao

- O comando central do jogador e `/painel`.
- HUDs abertas a partir do `/painel` devem substituir a mensagem original do painel com `editReply` ou `update`.
- Evitar `followUp` para trocar entre HUDs visuais, pois isso empilha mensagens e polui a tela.
- Interacoes internas da HUD, como filtros de inventario, abas de ranking, busca modal e detalhes de skills, tambem devem substituir a mesma mensagem.
- O `/painel` deve manter um botao `Inicio` para voltar ao estado inicial da HUD.
- Use estados de carregamento na propria mensagem antes de chamadas de API potencialmente lentas.
- Use cache curto por usuario ou tipo de tela para reduzir chamadas repetidas quando o jogador alterna abas rapidamente.
- Use `followUp` apenas para avisos pontuais, erros sem relacao com a HUD atual ou acoes que precisam aparecer fora do painel.
- Se a HUD tiver listagens internas, pagina, filtro, detalhe e retorno devem continuar na mesma mensagem.
- Modais de busca devem reescrever a HUD de origem com `update`, sem abrir respostas paralelas.

## Enciclopedia

- A `/enciclopedia` concentra itens, habilidades, bestiario e canones em um unico fluxo.
- A home textual da enciclopedia deve servir tanto para o comando standalone quanto para o atalho no `/painel`.
- A busca deve abrir por modal e aceitar correspondencia aproximada, retornando o melhor match direto ou uma lista curta de sugestoes.
- Dentro do `/painel`, a enciclopedia deve manter `Inicio` + categorias + `Busca`, sem reexibir o menu raiz do jogador.

## Comandos Ja Padronizados

- `/painel`
- `/perfil`
- `/inventario`
- `/ranking`
- `/enciclopedia`
- `/catalogo`
- `/bestiario`
- `/missoes` (ajuste visual; detalhes continuam efemeros para nao alterar uma mensagem publica compartilhada)

## Checklist Para Novas HUDs

1. Reutilizar os helpers visuais do `canvas/renderer.js`.
2. Manter contraste alto entre texto e fundo.
3. Testar renderizacao local do Canvas antes do deploy.
4. Rodar `node test_commands.js`.
5. Conferir se assets novos estao incluidos no workflow de deploy.
