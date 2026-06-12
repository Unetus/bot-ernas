# Guia de Funcionalidades e Comandos

Este documento resume os comandos ativos do bot Discord RPG de Arkandia/Ernas, seus fluxos visuais e os cuidados operacionais que devem ser mantidos em novas interfaces.

## Visao Geral

O bot integra o Discord com a API do site para consultar personagens, inventarios, rankings, missoes, catalogos, bestiario, NPCs canonicos e controles de mestre. As HUDs visuais usam Canvas e devem priorizar leitura mobile, poucos textos e navegacao na mesma mensagem.

## Padrao de Interacao

- O comando central do jogador e `/painel`.
- Ao navegar por Perfil, Inventario, Ranking, Missoes ou Enciclopedia pelo `/painel`, a HUD atual deve substituir a mensagem anterior.
- Botoes de abas usam `ButtonStyle.Secondary` e simbolos discretos: ativo com `◆`, inativo com `◇`.
- Subviews abertas pelo `/painel` mostram somente `Inicio` e os controles do contexto atual.
- Modais, selects e botoes devem responder apenas ao handler dono da interacao para evitar respostas duplicadas.
- Avisos pontuais podem ser efemeros, mas mudancas de HUD devem editar a mensagem original.

## Comandos do Jogador

### `/painel`

Abre a HUD privada do jogador. A partir dela, o usuario acessa:

- Inicio: resumo visual do jogador.
- Perfil: ficha em Canvas com deck e equipamentos.
- Inventario: itens paginados e filtrados por categoria.
- Missoes: quadro de missoes abertas.
- Enciclopedia: acervo de itens, habilidades, bestiario e canones.
- Rankings: alternancia entre Poder, Nivel, Guildas e Arena.
- Guilda e Cena RP: atalhos com instrucao direta para os comandos dedicados.

### `/perfil`

Renderiza a ficha do personagem ativo ou de outro alvo informado. O select de skills deve atualizar/mostrar detalhes sem poluir o chat publico.

Parametros:

- `jogador`: mencao do Discord.
- `nome`: nome do personagem.

### `/inventario`

Renderiza a mochila do personagem com filtros por categoria e paginacao.

Parametros:

- `jogador`: mencao do Discord.
- `nome`: nome do personagem.

### `/ranking`

Mostra rankings em Canvas e permite alternar a categoria por botoes.

Categorias:

- Poder
- Nivel
- Guildas
- Arena

### `/enciclopedia`

Unifica buscas no acervo de Ernas.

Categorias:

- Itens: equipamentos, consumiveis, materiais e afins.
- Habilidades: skills registradas.
- Bestiario: criaturas e monstros.
- Canones: NPCs e figuras conhecidas.

A busca abre um modal. Se o nome nao for exato, o bot deve sugerir registros parecidos ou abrir o melhor resultado quando houver confianca suficiente.

### `/catalogo` e `/bestiario`

Comandos de consulta dedicados. Devem seguir o mesmo padrao visual da Enciclopedia quando forem reworkados.

### `/guilda`

Consulta dados de uma guilda registrada.

### `/missoes`

Lista missoes abertas e permite consultar inscritos por botoes efemeros.

## Comandos do Mestre

Comandos de mestre exigem permissao de `Gerenciar Mensagens`.

### `/mestre painel`

Abre a HUD moderna do mestre. Ela deve permanecer limpa, direta e sem emojis.

Modulos ativos:

- VTT: iniciar cena, arena, combate, passar turno, mover token, alterar vida, fechar ou encerrar cena.
- Voz: assumir Narrador, NPC ou criatura via webhook; voltar para a voz normal; consultar NPC/criatura.
- Consultas: atalhos para perfil e inventario.
- Economia: dropar item e creditar libras.

A IA Narrativa Assistente foi removida do fluxo ativo. Novas funcoes desse tipo devem ser implementadas como modulo separado e so voltar ao painel depois de validacao de custo, permissao e experiencia.

### `/mestre dropar`

Cria um loot coletavel no canal. O primeiro jogador a clicar recebe o item no inventario do personagem ativo.

Validacoes atuais:

- Quantidade minima: `1`.
- Quantidade maxima: `999`.
- Custom IDs de loot com quantidade invalida sao rejeitados.

### `/narrar`

Ativa ou desativa a interpretacao por webhook no canal.

Regras:

- Mensagens iniciadas com `/` sao ignoradas.
- Mensagens sem texto nao sao apagadas.
- O modo e encerrado automaticamente se o usuario perder a permissao de mestre.
- O bot precisa ter permissao para gerenciar mensagens e webhooks no canal.

## VTT, Arena e Mapa

### `/cena`

Controla o tabuleiro tatico.

Subcomandos principais:

- `iniciar`: cria a cena.
- `entrar`: adiciona o personagem do jogador.
- `mover`: move o token do jogador.
- `npc_entrar`: adiciona NPC ou criatura.
- `fechar`: bloqueia novas entradas.
- `combate_iniciar`: inicia combate.
- `combate_proximo`: passa turno.
- `mover_livre`: move qualquer token.
- `status_vida`: alterna status vivo/incapacitado.
- `encerrar`: remove a cena ativa.

### `/arena`

Controla draft de mapas e combate PvP.

- `iniciar`: abre picks/bans.
- `encerrar`: finaliza a arena no canal.

### `/mapa`

Controla viagens por categorias/canais.

- `configurar`: mestre escolhe categorias regionais.
- `painel`: abre a central de viagem.

## Cache, Performance e Seguranca

- Catalogos sao pre-carregados em memoria e atualizados periodicamente.
- Cache generico possui TTL curto e limite de entradas para evitar crescimento indefinido.
- Renders Canvas devem usar a fila de renderizacao para reduzir picos de RAM.
- Handlers de botoes, selects e modais devem ser roteados por dono e parar ao reconhecer a interacao.
- Comandos sensiveis devem validar permissao no slash command e novamente em componentes/modais.
- Valores numericos vindos de modal ou customId devem ter minimo, maximo e fallback seguro.

## Checklist Para Novas HUDs

1. Reutilizar helpers visuais de `canvas/renderer.js`.
2. Manter texto curto, alinhado e legivel em mobile.
3. Usar botoes secundarios com `◆` e `◇` para estado ativo.
4. Editar a mensagem original em navegacoes internas.
5. Validar permissoes em qualquer acao sensivel.
6. Rodar `node test_commands.js` antes do deploy.
