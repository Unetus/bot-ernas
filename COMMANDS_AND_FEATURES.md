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

### `/sessao`

Consulta e exporta sessoes de RP/Cena gravadas automaticamente.

- `listar` (mestre/admin): embed com as sessoes do servidor, com filtros por `status` e `criador`.
- `historico id:` (mestre/admin): exporta transcricao `.txt` (sem emojis, com cabecalho formatado, participantes e mensagens com timestamp). Aceita o UUID **completo** ou um **prefixo de 4+ caracteres**. Se o prefixo for ambiguo, lista os matches.

### `/localidade`

Configura e gerencia canais de localidade (RP fixo por regiao). O canal deve ter `SendMessages: false` para `@everyone` (o bot ajusta o topico do RP para `true` automaticamente).

- `configurar` (mestre/admin): publica o **card da localidade** (banner unico em canvas, com a imagem de referencia como background, titulo e descricao sobrepostos, fontes Cinzel/Nunito/Baloo 2). O canvas respeita a proporcao da imagem enviada. Posta como o bot (sem webhook) e fixa.
- `painel` (mestre/admin): publica o **painel de acoes** fixo com dois botoes:
  - `Iniciar RP` (verde): abre um formulário (Modal) solicitando Título, Participantes, Subtítulo e Ambientação. O painel permanece fixo no canal.
  - `Explorar` (cinza): resposta efemera "mecanica em desenvolvimento".

O canal permanece limpo: notificacoes de pin e criacao de topico sao deletadas automaticamente (5s), e as respostas de interacoes sao auto-deletadas para manter apenas os painéis fixos.

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

## Cenas de RP

### `/rp`

Cria e gerencia cenas de RP em threads, com gravacao automatica de todas as mensagens de texto no banco SQLite.

- `iniciar` — cria o topico e renderiza um **banner unificado** (canvas dinamico que respeita a proporcao da imagem de cenario; o que for opcional e nao for preenchido simplesmente nao aparece). Pode ser chamado por `/rp iniciar` ou pelo botao "Iniciar RP" no painel fixo da localidade. A mensagem com o botao "Encerrar sessao" e temporaria (some em 15s).
- `encerrar` — encerra a sessao de RP ativa no topico (apenas o criador ou Administrator), deleta o topico e remove automaticamente todos os registros da sessao e mensagens no banco de dados.

Regras:
- O topico e criado com `autoArchiveDuration: 1440` (24h).
- O bot garante que `@everyone` pode enviar mensagens no topico, mesmo que o canal-pai seja read-only (importante para canais de localidade).
- Cenas filhas (`/cena iniciar` dentro do topico do RP) sao automaticamente encerradas quando o RP pai e encerrado.

## VTT, Arena e Mapa

### `/cena`

Controla o tabuleiro tatico.

Subcomandos principais:

- `iniciar`: cria a cena. Aceita `colunas`, `linhas`, `nome`, `descricao`, `tempo_turno` e `fundo`.
- `entrar`: adiciona o personagem do jogador.
- `mover`: move o token do jogador.
- `npc_entrar`: adiciona NPC ou criatura.
- `fechar`: bloqueia novas entradas.
- `combate_iniciar`: inicia combate.
- `combate_proximo`: passa turno.
- `mover_livre`: move qualquer token.
- `status_vida`: alterna status vivo/incapacitado.
- `encerrar`: remove a cena ativa.

Regras atuais do VTT:

- Tamanho minimo do mapa: `3x3`.
- Tamanho maximo do mapa: `14x12`.
- Tokens nao podem ocupar celulas ja ocupadas por outro token vivo.
- Coordenadas fora do mapa sao rejeitadas.
- Ao entrar, o jogador e colocado automaticamente na primeira celula livre.
- Se `tempo_turno` for definido, o combate usa contador e auto-skip.
- A HUD do mapa mostra nome da cena, estado, rodada, iniciativa, timer e ultimo evento.

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
