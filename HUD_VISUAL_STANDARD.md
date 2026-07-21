# Padronizacao Visual de HUDs

Este guia define o padrao visual para comandos que retornam HUDs em Canvas no Discord.

## Direcao Visual

- Tema: medieval moderno, leve e legivel em mobile.
- Fundo: usar o asset `assets/ui/painel-hud-medieval.png` via helper compartilhado do renderer.
- Paleta base: fundo escuro, texto claro, detalhes em dourado antigo `#D4AF37`.
- Evitar: excesso de descricoes, tags decorativas redundantes, cores muito saturadas e layouts poluidos.
- **Evitar emojis em todos os textos renderizados** (cards, banners, botoes, transcripts). Usar simbolos discretos ou espacamento quando necessario.

## Padrao Tipografico

O bot registra tres familias via `GlobalFonts` em `utils/fonts.js` (arquivos em `assets/fonts/`). **Sempre use o nome da familia entre aspas** no `ctx.font`:

| Papel | Fonte | Quando usar | Exemplo |
| :--- | :--- | :--- | :--- |
| **Header / Display** | **Cinzel** | Titulos, banners, numeros grandes (>=24px), eyebrow labels | `ctx.font = 'bold 50px "Cinzel"'` |
| **Body** | **Nunito** | Textos, paragrafos, descricoes, subtitulos (12-23px, sem bold) | `ctx.font = '20px "Nunito"'` |
| **UI** | **Baloo 2** | Menus, chrome, labels, numeros, botoes (bold <24px ou <=11px) | `ctx.font = 'bold 12px "Baloo 2"'` |

Nunca use `sans-serif` ou `serif` cru — sao fontes do sistema e podem quebrar caracteres acentuados ou glifos especiais (causando mojibake como `Humano â€¢ Bardo` em vez de `Humano · Bardo`).

Para peso no Cinzel: use `bold` direto. Para Nunito/Baloo 2: use `bold` ou `italic` (italic gera faux-italic se nao houver arquivo italic registrado — aceitavel para Nunito body).

## Estrutura de Canvas

- Usar `drawHudBase` para aplicar o fundo e overlay.
- Usar `drawHudHeader` para titulo, subtitulo e linha divisoria.
- Usar `drawHudBox` para caixas/cartoes.
- Textos principais devem ser curtos e centralizados quando forem botoes ou cartoes de acao.
- Descricoes longas devem aparecer apenas quando agregarem informacao real, como dados de item ou ranking.
- A faixa lateral dos cards de navegacao deve usar uma cor unica: `#D4AF37`.

### Canvas dinamico (proporcao da imagem)

Banners de localidade e de cena de RP (`gerarBannerLocalidade`, `gerarBannerRpUnificado`) ajustam o canvas a proporcao da imagem enviada:

- Largura fixa: 1000px (evita re-escala pelo Discord).
- Altura: `h = max(altura_referencia, min(max, round(1000 * aspect))`).
  - Localidade: H_REF=620, max=1200.
  - RP: H_REF=780, max=1500.
- Imagem: cover-fit (preenche todo o canvas).
- Sem imagem: `drawHudBase` (fundo cinza do HUD com painel medieval).
- Texto, fontes e molduras escalam proporcionalmente via `ctx.scale(1, s)`.
- Se a imagem fornecida falha no `loadImage` (URL expirada, >8MB, host nao confiavel), o `loadImage` retorna um canvas 1x1 — os banners tratam isso como falha e usam `drawHudBase` em vez de desenhar a imagem invalida. Sempre cheque `bgImage.width > 16` antes de usar.

### Banner unificado (padrao de RP e Localidade)

Tanto `/localidade configurar` quanto `/rp iniciar` produzem **uma unica imagem** com layout consistente (eyebrow no topo, titulo, secao opcional, moldura dourada, gradiente de legibilidade, credito no rodape). Nao use mais banners separados para titulo/participantes/ambientacao — isso foi descontinuado em favor do unificado.

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

## Roteamento e Seguranca

- Cada botao, select ou modal deve ter um prefixo de `customId` claro e pertencente ao comando dono.
- O handler deve retornar imediatamente quando o `customId` nao pertence ao comando.
- Depois que uma interacao for reconhecida por um handler, o roteador central deve parar de repassar a mesma interacao para outros comandos.
- Campos numericos vindos de modal ou `customId` devem validar minimo, maximo e formato antes de chamar a API.
- Acoes de mestre devem checar permissao tanto no comando inicial quanto em componentes e modais.

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
