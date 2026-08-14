# Activity do Discord - Brainstorming, testes e roadmap

**Projeto:** Tales of Ernas / Arkandia  
**Data de consolidação:** 14 de agosto de 2026  
**Status:** base experimental publicada; próximos passos aguardando priorização

## 1. Visão consolidada

A Activity deve funcionar como uma HUD viva da sessão de RPG, enquanto o Discord continua sendo o espaço narrativo. O canal permanece adequado para texto, interpretação e decisões do mestre; a Activity concentra mapa, tokens, participantes, turnos e organização visual.

O site continua como fonte dos dados persistentes do jogador: personagem, ficha, inventário, imagens e assets. O bot atua como ponte com o Discord, lendo ações, publicando avisos, controlando permissões e abrindo a Activity.

## 2. O que já foi implementado e testado

### Atualização de homologação da HUD do jogador

- OAuth da Activity validado com `identify` e vínculo ao usuário do site.
- Personagem ativo, ficha resumida, habilidades, inventário e ranking carregados pela API.
- Client Secret configurado somente no ambiente protegido da aplicação.
- Assets do Ernas entregues por caminhos relativos através do URL Mapping da Activity; URLs absolutas do domínio principal não devem ser usadas no iframe por causa do isolamento/CSP do Discord.
- Estados de erro do OAuth separados por etapa (`authorize`, troca de token, autenticação do SDK e consulta da ficha).
- Próxima etapa ativa: lapidação visual, componentes reutilizáveis, responsividade e painel do mestre.

### Base da Activity

- Activity experimental em rota própria, lançada dentro do Discord.
- Painel visual com mapa, background do site, grade, tokens e participantes.
- Modo livre e modo por turnos.
- Limite de até 15 participantes.
- Identificação compartilhada por `instanceId`.
- Controles experimentais de mestre: iniciar turnos, avançar, voltar ao modo livre e reiniciar.
- Registro de movimentações e ações no estado da sessão.

### Correções e testes

- Corrigido o rewrite de produção que gerava erro 500 na abertura pelo root.
- Ajustada a política de frame para a Activity, mantendo a proteção do site normal.
- Adotado modo degradado: se a presença do Discord não responder, a Activity continua utilizável com um participante de contingência.
- Corrigida a seleção inicial do token.
- Adicionado movimento por arraste e fallback por clique em uma casa.
- Corrigida a condição de corrida em que uma consulta antiga poderia sobrescrever uma posição mais nova.
- Validado em produção o limite de participantes, posições iniciais únicas, turnos, envio de ação e avanço após remoção de participante.
- Validada em produção a abertura da Activity com parâmetros de simulação e o registro de movimento do token.
- Deploy do bot e da aplicação web concluídos com sucesso.

### Limitação conhecida

O ambiente de homologação confirmou o fluxo da Activity, mas a comunicação completa com o cliente Discord não é reproduzida integralmente fora do próprio Discord. Quando a presença não fica disponível, o tabuleiro continua funcional, mas não representa todos os usuários reais automaticamente. Essa integração deve ser validada em uma sessão real com dois ou mais jogadores.

## 3. Arquitetura proposta

```text
Chat do Discord -> Bot -> Backend compartilhado -> Activity
                                      |
                                      +-> Site e banco de dados
```

- **Discord:** narrativa, ações escritas, mensagens do mestre e histórico legível.
- **Bot:** eventos de mensagens, comandos, menções, avisos, DMs e permissões.
- **Backend:** estado compartilhado da cena, sessão, turnos, posições e sincronização.
- **Activity:** HUD, mapa, tokens, status, fila de turnos e controles visuais.
- **Site:** dados permanentes, ficha, inventário, personagens e assets.

O `instanceId` deve identificar a instância compartilhada da Activity. A sessão persistente do RPG deve continuar tendo seu próprio identificador no backend; os dois IDs precisam ser associados para que a Activity seja uma janela da sessão correta.

## 4. Integração entre chat e Activity

O jogador poderá escrever a ação no canal, por exemplo:

> Ação: Lyra avança até a coluna central e observa a porta.

O bot registra a mensagem, identifica jogador e cena, e atualiza o backend. A Activity então mostra quem já agiu, quem está aguardando e qual é o turno atual.

Formas possíveis de envio:

- texto livre no canal, como fluxo principal;
- comando `/acao`, para uma entrada mais estruturada;
- formulário interno na Activity, como alternativa opcional.

O texto original deve permanecer no canal. A Activity deve exibir apenas resumo, status e organização visual, evitando duplicar a narrativa.

## 5. Migração das interfaces

É possível reutilizar HTML, CSS, React, ícones, imagens, backgrounds e chamadas de API do site. A migração deve ser feita por componentes compartilhados, não por cópia indiscriminada de páginas.

Conversões esperadas:

- embed do bot -> card visual da Activity;
- botão Discord -> botão HTML estilizado;
- modal -> painel lateral, drawer ou formulário interno;
- mensagem efêmera -> toast ou aviso temporário;
- painel de várias mensagens -> uma tela única com seções navegáveis.

Componentes candidatos a um design system compartilhado:

- `PanelCard`;
- `CharacterAvatar`;
- `ActionButton`;
- `StatusBadge`;
- `InventoryItem`;
- `TurnIndicator`;
- `SceneHeader`;
- `PlayerSummary`.

## 6. Proposta para a Cena Tática

### Modo livre

- jogadores movimentam seus tokens;
- ações ficam no chat;
- o mestre pode corrigir posições;
- a Activity organiza visualmente a cena sem impor ordem.

### Modo por turnos

- o mestre fecha a cena;
- a Activity exibe claramente o jogador atual;
- cada jogador envia uma ação por vez;
- o bot registra o texto no canal;
- a Activity marca a ação como enviada;
- o mestre avança o turno.

O sistema deve privilegiar texto interpretativo. A posição no mapa serve para compreensão espacial, não para transformar o RPG em um sistema rígido de atributos.

## 7. Recursos do Discord aderentes

- **Embedded App SDK:** comunicação entre Activity e cliente Discord.
- **Participantes da instância:** nomes, avatares e entrada/saída de jogadores.
- **Entry Point e `LAUNCH_ACTIVITY`:** abertura da Activity pelo App Launcher, botões ou interações.
- **Slash commands:** comandos como `/acao`, `/cena` e `/activity`.
- **Message e User Commands:** ações rápidas sobre mensagens ou jogadores.
- **Botões e selects:** comandos rápidos no painel do canal.
- **Rich Presence:** exibir nome da cena e status resumido no perfil, se o escopo for autorizado.
- **Convites:** abrir o fluxo nativo de convite para a sessão.

Referências oficiais:

- https://docs.discord.com/developers/activities/overview
- https://docs.discord.com/developers/activities/how-activities-work
- https://docs.discord.com/developers/activities/development-guides/multiplayer-experience
- https://docs.discord.com/developers/developer-tools/embedded-app-sdk
- https://docs.discord.com/developers/platform/interactions

## 8. Priorização sugerida

### P0 - funcionamento essencial

- sincronização real entre bot, backend e Activity;
- validação da identidade e permissão de mestre;
- sessão por `instanceId` associada à cena correta;
- movimento e turnos confiáveis;
- atualização de participantes reais;
- fallback claro quando a presença do Discord falhar.

### P1 - experiência de jogo

- reconhecimento de ações escritas no chat;
- status de ação enviada e pendente;
- avisos compactos editáveis no canal;
- ficha resumida e inventário dentro da Activity;
- assets e avatar real do site/Discord;
- painel do mestre.

### P2 - acabamento e expansão

- objetivos e pontos de interesse no mapa;
- Rich Presence;
- histórico visual da cena;
- atalhos de teclado e acessibilidade;
- animações discretas de movimento;
- componentes visuais reutilizáveis em todo o painel.

## 9. Riscos e decisões em aberto

- definir como o bot distinguirá uma ação narrativa comum de uma mensagem fora da cena;
- decidir se o canal terá uma mensagem de status única, editada ao longo da cena;
- definir retenção e encerramento do estado temporário da Activity;
- validar comportamento com dois ou mais usuários reais;
- confirmar escopos do Embedded App SDK para presença e identidade;
- evitar que a Activity duplique o histórico textual do Discord;
- tratar reconexão, troca de canal e reabertura da Activity;
- garantir que permissões sejam verificadas no backend, nunca apenas no navegador.

## 10. Próxima sessão de homologação

1. Abrir a Activity pelo Discord com dois usuários.
2. Confirmar se ambos aparecem na lista de participantes.
3. Selecionar personagens e movimentar tokens.
4. Ativar turnos pelo mestre.
5. Enviar uma ação pelo canal.
6. Confirmar o registro no bot e a atualização da Activity.
7. Avançar o turno e testar jogador incorreto.
8. Fechar e reabrir a Activity.
9. Encerrar a cena e verificar limpeza do estado e das mensagens auxiliares.

## 11. Diretriz de produto

A Activity não deve substituir a interpretação do RPG. Ela deve remover atrito: mostrar onde cada personagem está, quem precisa agir, quais informações são relevantes e como a cena está organizada. O canal continua sendo a mesa narrativa; a Activity é o tabuleiro e a HUD.
