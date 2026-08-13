# Roadmap de Experiencia Discord — Arkandia

Documento-base para avaliar, testar e padronizar melhorias de interação e apresentação do BOT dentro do Discord.

Este arquivo é um backlog de produto e experiência. Cada item deve passar por um ciclo simples:

1. protótipo funcional;
2. teste em uma guilda/canal controlado;
3. avaliação de usabilidade, permissões e estabilidade;
4. decisão: adotar, ajustar ou descartar;
5. padronização visual e técnica.

## Objetivos

- Reduzir a dependência de comandos digitados manualmente.
- Transformar mensagens do BOT em painéis claros e navegáveis.
- Manter uma experiência boa em desktop e celular.
- Evitar poluição de canais com mensagens temporárias e respostas duplicadas.
- Preservar as HUDs Canvas existentes enquanto testamos interfaces nativas do Discord.
- Centralizar ações de uma sessão de RP em sua própria thread.

## Princípios de produto

- A ação principal deve estar visível e ter um rótulo claro.
- Ações destrutivas sempre exigem confirmação.
- Seleções de usuários, cargos e canais devem usar componentes nativos quando possível.
- Respostas privadas devem ser usadas para escolhas pessoais, erros e confirmações.
- Mensagens públicas devem representar estado compartilhado: cena, participantes, turno e eventos.
- Componentes devem ser desabilitados quando a ação não estiver disponível.
- Toda nova interface deve ter uma alternativa funcional por slash command.
- O fluxo deve ser testável sem depender de dados artificiais em produção.

## Estado atual

Já disponíveis no BOT:

- Botões e navegação em HUDs.
- Menus de seleção textuais.
- Seleção nativa de usuários no RP.
- Modais para dados livres.
- Threads para sessões de RP.
- Painel da thread com participantes, convites, ficha, cena tática e encerramento.
- Atualização dinâmica da quantidade de participantes e do estado da cena tática.
- Canvas para banners, mapas, fichas e HUDs.
- SQLite para sessões, participantes e histórico.
- Webhooks para narração com identidade de NPC.

## Fase 1 — Ajustes imediatos e baixo risco

### 1.1 Convites de RP

Status: implementado, precisa de teste contínuo.

Testar:

- DM recebida pelo convidado.
- Nome de quem convidou.
- Convite duplicado.
- Limite de 15 participantes.
- DM bloqueada pelo usuário.
- Usuário removido da guilda depois do convite.
- Atualização do painel após adicionar e remover.

Critério de aceite: nenhuma duplicidade, nenhuma ultrapassagem do limite e feedback claro mesmo quando a DM não puder ser enviada.

### 1.2 Encerramento seguro

Status: implementado, precisa de teste contínuo.

Testar:

- Cancelar não encerra nem remove a thread.
- Confirmar encerra corretamente.
- Jogador comum não consegue confirmar.
- Criador consegue confirmar.
- Administrador consegue confirmar.
- Sessão já encerrada não pode ser confirmada novamente.

### 1.3 Expiração e recuperação de componentes

Proposta:

- Desabilitar painéis quando a sessão terminar.
- Exibir “Sessão encerrada” em vez de erro genérico.
- Reconstruir o painel ao reiniciar o BOT quando a thread ainda estiver ativa.
- Identificar mensagens antigas do painel sem depender apenas das últimas 50 mensagens.

Prioridade: alta.

### 1.4 Estados visuais padronizados

Criar uma convenção para botões e textos:

- `Participantes (N)`;
- `Cena tática: não iniciada`;
- `Cena tática: ativa`;
- `Carregando...`;
- `Indisponível`;
- `Sessão encerrada`.

Prioridade: alta.

## Fase 2 — Thread de RP como central de sessão

### 2.1 Central de participantes

Evoluir o botão `Participantes` para mostrar:

- avatar;
- nome do usuário;
- nome do personagem;
- criador da sessão;
- mestre;
- status online/offline;
- ações de ficha e remoção.

Decisão pendente: manter a lista como resposta privada ou publicar uma mensagem de estado na thread.

### 2.2 Convite com confirmação

Fluxo sugerido:

1. Mestre seleciona usuários.
2. BOT mostra resumo dos selecionados.
3. Usuário confirma o envio.
4. BOT registra e envia DM.
5. Painel é atualizado.

Benefício: evita convites acidentais e permite mostrar quantas vagas ainda estão disponíveis.

### 2.3 Gerenciamento de sessão

Adicionar ao painel:

- alterar título da sessão;
- atualizar ambientação;
- trocar banner;
- marcar jogador como ausente;
- adicionar mestre auxiliar;
- pausar sessão;
- exportar histórico.

Prioridade: média.

### 2.4 Notificações privadas

Avaliar notificações para:

- convite para RP;
- início de cena tática;
- início do turno do jogador;
- pesquisa concluída;
- loot disponível;
- sessão encerrada.

Regra: sempre oferecer feedback no Discord mesmo se a DM estiver bloqueada.

## Fase 3 — Cenas táticas e jogo

### 3.1 Painel de combate

Adicionar controles conforme permissão:

- entrar na cena;
- fechar entradas;
- iniciar combate;
- passar turno;
- encerrar cena;
- consultar ordem de iniciativa;
- visualizar timer.

### 3.2 Estado compartilhado

A mensagem da cena deve exibir:

- nome da cena;
- tamanho do mapa;
- estado: aberta, fechada ou combate;
- rodada atual;
- jogador ativo;
- tempo restante;
- último evento.

### 3.3 Condições e ações rápidas

Avaliar botões/selects para:

- incapacitado;
- envenenado;
- atordoado;
- protegido;
- fora de combate.

Prioridade: média, após estabilizar a persistência da cena.

### 3.4 Activity para VTT

Visão de longo prazo:

- tabuleiro com tokens arrastáveis;
- zoom e navegação;
- painel de iniciativa;
- rolagens;
- comunicação em tempo real;
- sincronização com a API Arkandia.

Activities são aplicações web executadas dentro do Discord via iframe e Embedded App SDK. Elas são adequadas para experiências multiplayer, mas exigem um frontend próprio, hospedagem e uma arquitetura de sincronização diferente do BOT atual.

Decisão: prototipar somente depois de validar os fluxos do VTT por mensagens.

## Fase 4 — Componentes nativos avançados

### 4.1 Components V2

Components V2 adiciona uma estrutura mais rica para mensagens, incluindo:

- `Container`;
- `Section`;
- `Text Display`;
- `Thumbnail`;
- `Media Gallery`;
- `File`;
- `Separator`;
- `Label`;
- `File Upload`;
- `Radio Group`;
- `Checkbox Group`;
- `Checkbox`.

Aplicações possíveis no Arkandia:

- painel de combate dividido por estado, iniciativa e ações;
- card de personagem com imagem, atributos e ações;
- painel do mestre com módulos agrupados;
- tela de confirmação com resumo visual;
- seleção de cenário com galeria de imagens;
- formulário de feedback ou relatório de erro.

### 4.2 Riscos do Components V2

Components V2 deve ser testado em mensagens novas e isoladas. Ao ativar a flag `IS_COMPONENTS_V2`:

- `content` e `embeds` tradicionais deixam de funcionar naquela mensagem;
- anexos precisam ser expostos por componentes;
- polls e stickers ficam desabilitados;
- a mensagem não pode voltar ao formato tradicional.

Estratégia recomendada: não migrar as HUDs atuais de uma vez. Criar um protótipo independente, por exemplo `Painel de Combate V2`, e comparar com a versão legada em desktop e celular.

### 4.3 Selects nativos

Priorizar:

- `User Select` para jogadores;
- `Role Select` para mestre, guilda ou equipe;
- `Channel Select` para escolher canal de avisos;
- `Mentionable Select` para usuários/cargos;
- `String Select` para categorias, filtros e estados.

### 4.4 Uploads e formulários avançados

Avaliar upload nativo em modal para:

- imagem de personagem;
- mapa tático;
- imagem de NPC;
- cenário de RP;
- evidência de missão.

Antes de adotar, verificar suporte na versão instalada do `discord.js`, comportamento mobile e limites de tamanho.

## Fase 5 — Comandos nativos e descoberta

### 5.1 Autocomplete

Adicionar autocomplete para:

- NPCs e criaturas;
- itens e loot;
- habilidades;
- localidades;
- guildas;
- personagens;
- sessões e históricos.

Critérios:

- máximo de 25 sugestões;
- resposta rápida;
- cache curto;
- fallback quando a API estiver indisponível;
- nunca expor registros que o usuário não pode consultar.

### 5.2 Comandos de contexto em usuário

Comandos no menu de usuário:

- `Ver personagem`;
- `Ver inventário`;
- `Convidar para RP`;
- `Adicionar à cena`;
- `Desafiar para arena`.

### 5.3 Comandos de contexto em mensagem

Comandos no menu de mensagem:

- `Transformar em narração`;
- `Registrar como pista`;
- `Criar evento`;
- `Adicionar ao histórico`;
- `Enviar ao mestre`.

Esses comandos são bons candidatos porque recebem automaticamente o usuário ou a mensagem selecionada, reduzindo campos e ambiguidades.

## Fase 6 — Localidades, comunidades e organização

### 6.1 Localidade como hub

O painel pode mostrar:

- RPs ativos;
- jogadores presentes;
- evento atual;
- perigos da região;
- última atividade;
- botão para entrar em uma cena.

### 6.2 Canais de fórum

Avaliar canais de fórum para:

- uma aventura por tópico;
- uma missão por tópico;
- um registro de personagem por tópico;
- uma guilda por tópico.

Tags sugeridas:

- `Ativo`;
- `Encerrado`;
- `Recrutando`;
- `Combate`;
- `Mestre necessário`;
- `Concluído`.

### 6.3 Polls nativos

Usos possíveis:

- votação de destino da expedição;
- escolha de evento da localidade;
- decisão coletiva de guilda;
- enquete pós-sessão.

Limitação importante: polls são bons para consulta, mas não devem substituir ações transacionais do BOT, como escolha de loot ou confirmação de encerramento.

## Fase 7 — Experiências de longo prazo

### 7.1 Activity do Arkandia

Possíveis módulos:

- VTT completo;
- sala de preparação de missão;
- mapa mundial colaborativo;
- painel de guilda;
- rolagem compartilhada;
- visualizador de fichas.

### 7.2 Rich Presence

Avaliar presença rica para mostrar:

- personagem ativo;
- localidade atual;
- sessão de RP ativa;
- cena tática em andamento.

### 7.3 Sistema de conquistas e cartões

- títulos desbloqueados;
- badges de mestre;
- cartão de personagem compartilhável;
- marcos de campanha;
- ranking semanal.

## Itens para avaliar com cautela

### IA narrativa dentro do painel

Pode aumentar custo, complexidade e risco de comportamento inconsistente. Manter fora do fluxo principal até existir uma definição clara de custo, permissões, limites e revisão do mestre.

### Animações por edição frequente

Podem gerar rate limits, ruído visual e problemas em celulares. Usar apenas para estados importantes, como turno e contagem regressiva.

### Migração completa para Components V2

Não fazer antes de um protótipo. O modelo é poderoso, mas a incompatibilidade com `content` e `embeds` exige revisão das mensagens.

### Gamificação excessiva

Evitar transformar cada ação em pontos, badges ou notificações. A prioridade é melhorar o RPG, não criar ruído de interface.

## Roadmap recomendado

### Próximo ciclo

1. Testar DM, duplicidade, limite e remoção de participantes.
2. Adicionar confirmação também ao encerramento de cena tática.
3. Melhorar o painel de participantes com avatar e personagem.
4. Implementar autocomplete para NPCs, itens e localidades.
5. Criar comandos de contexto `Ver personagem` e `Convidar para RP`.

### Ciclo seguinte

1. Painel de combate com estados e ações rápidas.
2. Recuperação de painéis após reinício.
3. Protótipo isolado de Components V2.
4. Teste de fórum para missões ou aventuras.
5. Polls para decisões narrativas não transacionais.

### Longo prazo

1. Protótipo de Activity para VTT.
2. Sincronização em tempo real.
3. Rich Presence.
4. Sistema de conquistas e cartões compartilháveis.

## Matriz de decisão

Para cada experimento, registrar:

| Campo | Pergunta |
|---|---|
| Objetivo | Qual problema do jogador resolve? |
| Fluxo | Quantos cliques e mensagens são necessários? |
| Permissão | Quem pode executar e quem pode visualizar? |
| Persistência | O estado sobrevive a restart? |
| Mobile | Funciona bem em tela pequena? |
| Falhas | O que acontece se API, DM ou permissão falhar? |
| Custo | Qual impacto em código, hospedagem e manutenção? |
| Decisão | Adotar, ajustar, pausar ou descartar? |

## Referências oficiais do Discord

- [Component Reference](https://docs.discord.com/developers/components/reference)
- [Using Message Components](https://docs.discord.com/developers/components/using-message-components)
- [Components Overview](https://docs.discord.com/developers/components/overview)
- [Interactions Overview](https://docs.discord.com/developers/interactions/overview)
- [Application Commands](https://docs.discord.com/developers/interactions/application-commands)
- [Activities Overview](https://docs.discord.com/developers/activities/overview)
- [How Activities Work](https://docs.discord.com/developers/activities/how-activities-work)
- [Poll Resource](https://docs.discord.com/developers/resources/poll)

