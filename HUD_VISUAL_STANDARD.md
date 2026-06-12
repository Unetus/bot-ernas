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
- Textos principais devem ser curtos e centralizados quando forem botoes/cartoes de acao.
- Descricoes longas devem aparecer apenas quando agregarem informacao real, como dados de item ou ranking.
- A faixa lateral dos cards de navegacao deve usar uma cor unica: `#D4AF37`.

## Componentes do Discord

- Botões de HUD devem usar uma cor unica: `ButtonStyle.Secondary`.
- Estado ativo deve ser indicado por simbolo no label, nao por cor.
- Padrao recomendado:
  - Ativo: `◆ Nome`
  - Inativo: `◇ Nome`
  - Navegacao: `◁ Anterior` e `Proximo ▷`
- Evitar emojis nos botoes de HUD. Preferir simbolos discretos e neutros.

## Comandos Ja Padronizados

- `/painel`
- `/perfil`
- `/inventario`
- `/ranking`

## Checklist Para Novas HUDs

1. Reutilizar os helpers visuais do `canvas/renderer.js`.
2. Manter contraste alto entre texto e fundo.
3. Testar renderizacao local do Canvas antes do deploy.
4. Rodar `node test_commands.js`.
5. Conferir se assets novos estao incluidos no workflow de deploy.
