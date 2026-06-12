# ðŸ“– Arkandia RPG Bot â€” DocumentaÃ§Ã£o de Desenvolvimento (Dev-Doc)

Esta documentaÃ§Ã£o foi elaborada especificamente para **Desenvolvedores** e **Agentes de IA** compreenderem com precisÃ£o a arquitetura, o fluxo de dados e os padrÃµes de design do bot de RPG no Discord integrado Ã  API de Arkandia.

---

## ðŸ› ï¸ Stack TecnolÃ³gica & DependÃªncias

O bot Ã© construÃ­do utilizando a seguinte base tecnolÃ³gica:

| Tecnologia | Finalidade | Detalhes / VersÃ£o |
| :--- | :--- | :--- |
| **Node.js** | Ambiente de execuÃ§Ã£o | Recomenda-se v18 ou superior |
| **Discord.js** | ComunicaÃ§Ã£o com a API do Discord | `^14.26.4` (Slash Commands, Webhooks, Components) |
| **@napi-rs/canvas** | RenderizaÃ§Ã£o 2D acelerada do VTT | `^1.0.0` (Performance nativa em Rust) |
| **Axios** | Cliente HTTP para integraÃ§Ã£o externa | `^1.16.0` (RequisiÃ§Ãµes Ã  API de Arkandia) |
| **dotenv** | Gerenciamento de variÃ¡veis de ambiente | `^17.4.2` |

---

## ðŸ—ï¸ Arquitetura do Sistema & Fluxo de Dados

O bot opera sob um modelo reativo orientado a eventos do Discord (`interactionCreate`). Ele consome dados em tempo real da API de Arkandia e mantÃ©m um estado em memÃ³ria cache para sessÃµes ativas e VTT. Na nova arquitetura, o bot tambÃ©m faz prÃ©-carregamento de dados (Preload) via `catalogCache` para diminuir a latÃªncia de consultas estÃ¡ticas (itens, skills e bestiÃ¡rio).

```mermaid
graph TD
    User([UsuÃ¡rio no Discord]) -->|Slash Command / InteraÃ§Ãµes| Client[Discord.js Client]
    Client -->|Valida PermissÃ£o & Coleta Dados| Controller{Gerenciador de Eventos}
    
    Controller -->|Dados em Cache / Arquivo| LocalState[Caches & mapa_config.json]
    Controller -->|RequisiÃ§Ã£o HTTP com API Key| API[(API Arkandia)]
    
    Controller -->|Coordena RenderizaÃ§Ã£o| Canvas[Canvas Engine - Rust]
    Canvas -->|Gera Buffer PNG| Attachment[AttachmentBuilder]
    
    Controller -->|Resposta Enriquecida| User
```

---

## ðŸ’¾ Estruturas de Estado e Caches Locais

Por simplicidade e velocidade de acesso em canais de texto de RPG, parte do estado operacional do bot Ã© mantido em memÃ³ria, com persistÃªncia mÃ­nima em arquivos locais:

### 1. Sistema de Cache Global (`catalogCache` & `renderQueue`)
Para garantir mÃ¡xima performance durante a alta demanda (mÃºltiplos jogadores consultando itens ou renderizando canvas), o bot implementa duas esteiras de otimizaÃ§Ã£o:
*   **`catalogCache`**: Carrega e atualiza periodicamente em background os catÃ¡logos de `/itens`, `/skills`, `/bestiario` e `/npcs` vindos da API. Os comandos `/catalogo`, `/bestiario` e `/enciclopedia` consultam esta memÃ³ria Ram, poupando a API do site e respondendo instantaneamente.
*   **`renderQueue`**: Uma fila (Queue) especializada em gerenciar a renderizaÃ§Ã£o Canvas no `@napi-rs/canvas`. Evita que requisiÃ§Ãµes assÃ­ncronas concorrentes engasguem a single-thread do Node.js, processando no mÃ¡ximo 3 imagens simultÃ¢neas.

### 2. Mapa de ConfiguraÃ§Ã£o (`mapaConfig` & `mapa_config.json`)
Armazena um array de IDs das categorias do Discord que representam regiÃµes de RPG vÃ¡lidas no servidor para controle de viagem rÃ¡pida.
*   **PersistÃªncia:** Sincronizado automaticamente no arquivo `mapa_config.json` via `fs.writeFileSync`.

### 2. Cenas Ativas (`cenasAtivas` - `Map`)
DicionÃ¡rio chaveado por `channelId` (ID do canal de texto onde o mapa foi aberto) contendo o estado da cena tÃ¡tica (VTT):
```typescript
interface PlayerToken {
    discordId: string; // "npc_timestamp" para NPCs
    name: string;      // Nome visÃ­vel no token
    avatarUrl: string; // URL da imagem para o retrato
    x: number;         // PosiÃ§Ã£o horizontal indexada em 0
    y: number;         // PosiÃ§Ã£o vertical indexada em 0
    isNpc: boolean;    // Flag para distinÃ§Ã£o de borda
    incapacitado: boolean; // Flag de status de vida (morto/caÃ­do)
}

interface CenaVTT {
    nome: string;          // Nome curto exibido no HUD do mapa
    descricao?: string;    // Ambientacao curta exibida no cabecalho visual
    linhas: number;       // Altura em celulas
    colunas: number;     // Largura em celulas
    fundoUrl: string | null; // URL da imagem de fundo do grid
    estado: 'ABERTA' | 'FECHADA' | 'COMBATE';
    rodada: number;
    turnoAtual: number;  // Indice do array de players
    players: PlayerToken[];
    msgId: string | null; // ID da mensagem contendo a imagem do mapa ativa
    tempoTurnoMs?: number | null; // Timer opcional por turno
    fimTurnoTimestamp?: number;   // Timestamp do fim do turno atual
    ultimoEvento?: string;        // Linha curta exibida no painel lateral
}
```

### 3. Cache de GrimÃ³rios (`skillsCache` - `Map`)
Chaveado por `message.id` (ID da mensagem de resposta ao comando `/skills`). Evita mÃºltiplas chamadas Ã  API quando o usuÃ¡rio interage vÃ¡rias vezes com o menu de seleÃ§Ã£o da mesma mensagem de grimÃ³rio.

### 4. MissÃµes em PreparaÃ§Ã£o (`missoesPreparacao` - `Map`)
Chaveado por `message.id` da mensagem de convocaÃ§Ã£o (`/missao preparar`), rastreia o estado da confirmaÃ§Ã£o ("Ready Check") de cada membro inscrito:
```typescript
interface MissaoPreparacao {
    msgId: string;
    nome: string;
    jogadores: Array<{
        id: string; // Discord ID
        nomePersonagem: string;
        pronto: boolean;
    }>;
    channelId: string;
}
```

### 5. Drafts de Arena Ativos (`arenasDraft` - `Map`)
Chaveado por `message.id` (ID da mensagem do painel de picks e bans), rastreia os dados do draft em andamento de uma arena:
```typescript
interface ArenaDraft {
    capitaes: string[]; // Array com 2 Discord IDs dos capitÃ£es
    turnoCapitao: number; // Ãndice de quem estÃ¡ banindo (0 ou 1)
    mapasRestantes: MapaArena[]; // Mapas disponÃ­veis para banir
    tempoTurnoMs: number; // Tempo de turno configurado em milissegundos
}
```

### 6. Timers de Auto-Skip (`timersTurno` - `Map`)
Chaveado por `message.id` (ID da mensagem do mapa ativo), armazena a referÃªncia aos timeouts (`NodeJS.Timeout`) ativos do auto-skip do turno do combate da arena. Sempre que o combate de uma arena Ã© encerrado ou o turno Ã© passado manualmente/automaticamente, o timer correspondente Ã© cancelado com `clearTimeout` e excluÃ­do deste Map para evitar vazamentos de memÃ³ria ou transiÃ§Ãµes indesejadas.

### 7. Mestres Interpretando (`mestresNarrando` - `Map`)
Chaveado pela string combinada `${channelId}-${userId}`, este Map armazena os dados de identidade (nome e URL de avatar) que o Mestre estÃ¡ emulando ativamente naquele canal. Se uma entrada existir para o autor da mensagem no canal em questÃ£o, a mensagem de texto padrÃ£o Ã© deletada e re-enviada via Webhook sob a identidade guardada em tempo real.

### 8. Controle de Coleta de Loot (`lootsEmProcessamento` & `lootsColetados` - `Set`)
Utilizados para garantir integridade transacional na coleta de recompensas (botÃ£o do comando `/mestre dropar`):
*   `lootsEmProcessamento`: Conjunto de `message.id` das coletas de item cujo processo da API (resoluÃ§Ã£o + inserÃ§Ã£o POST) estÃ¡ em andamento. Bloqueia cliques concorrentes ou duplicados de forma imediata.
*   `lootsColetados`: Conjunto de `message.id` das mensagens de loot que jÃ¡ foram totalmente coletadas por algum jogador. Previne que itens sejam resgatados mais de uma vez.

### 9. Roteador DinÃ¢mico e ModularizaÃ§Ã£o (`commands/` e Autoloader)
Todo o controle do bot agora reside em um Autoloader Ã¡gil e robusto no `index.js` (~120 linhas). O bot importa dinamicamente cada comando da pasta `commands/` usando `client.commands.set(...)`. 
As interaÃ§Ãµes (`ChatInputCommand`, `Button`, `StringSelectMenu` e `ModalSubmit`) sÃ£o despachadas automaticamente para os handlers dentro do prÃ³prio arquivo do comando:
- `execute(interaction)`: LÃ³gica base para Slash Commands.
- `handleButton(interaction)`: Captura cliques em botÃµes baseados no prefixo do comando.
- `handleSelect(interaction)`: Captura seleÃ§Ãµes de menus.
- `handleModal(interaction)`: SubmissÃµes de formulÃ¡rios.
Essa arquitetura isolada garante altÃ­ssima escalabilidade e facilidade de manutenÃ§Ã£o.

### Padrao Atual de HUDs do Jogador
As HUDs abertas pelo `/painel` seguem um roteamento de mensagem unica:
*   A tela inicial exibe o menu completo do jogador.
*   Ao entrar em uma sub-HUD, o bot reduz os componentes para `Inicio` + controles locais daquela tela.
*   Inventario, ranking, perfil, enciclopedia e detalhes internos atualizam a mesma mensagem via `editReply` ou `update`.
*   Modais de busca, como o da `/enciclopedia`, devem substituir a HUD original em vez de publicar uma nova resposta visual.

## ðŸŽ¨ Engine de RenderizaÃ§Ã£o 2D (VTT)

O VTT desenha dinamicamente um mapa tÃ¡tico utilizando `@napi-rs/canvas`. 

### ParÃ¢metros FÃ­sicos do Grid:
*   `CELL_SIZE`: `80` pixels por cÃ©lula.
*   `MARGIN`: `30` pixels de recuo para exibiÃ§Ã£o de coordenadas (letras A-Z no eixo X, nÃºmeros 1-N no eixo Y).
*   `Width / Height` do Canvas: Calculados com base no nÃºmero de colunas/linhas, respeitando um tamanho mÃ­nimo de `400x400` pixels.

### Desenho dos Tokens:
*   Os avatares dos jogadores sÃ£o carregados via `loadImage` e mascarados como cÃ­rculos perfeitos (`ctx.arc(...)` + `ctx.clip()`).
*   **CÃ³digo de Cores das Bordas dos Tokens:**
    *   `Cinza (#7F8C8D)`: Jogador incapacitado.
    *   `Dourado (#F1C40F)`: Turno ativo do jogador (no modo `COMBATE`).
    *   `Vermelho (#E74C3C)`: NPCs / Monstros vivos.
    *   `Azul (#3498DB)`: Jogadores vivos.
*   **IncapacitaÃ§Ã£o:** Um "X" vermelho semi-transparente Ã© renderizado sobre o token se `incapacitado: true`.

> [!TIP]
> **OtimizaÃ§Ã£o por Debounce:** Para evitar sobrecarga gerada por cliques rÃ¡pidos de movimentaÃ§Ã£o nos botÃµes, a funÃ§Ã£o `atualizarMapaDebounced` atrasa o envio de atualizaÃ§Ãµes em `600ms`. Se um novo movimento ocorrer dentro deste perÃ­odo, o timer anterior Ã© limpo.

### Regras atuais do VTT

*   `/cena iniciar` limita mapas entre `3x3` e `14x12`.
*   `nome`, `descricao` e `tempo_turno` sao opcionais e aparecem no HUD quando preenchidos.
*   Coordenadas fora do mapa sao rejeitadas em comandos e modais.
*   Tokens vivos nao podem ocupar a mesma celula.
*   Ao entrar na cena, o jogador recebe a primeira celula livre disponivel.
*   Se o token ativo ficar incapacitado durante combate, o turno avanca automaticamente para o proximo token vivo.
*   `tempo_turno` ativa contador e auto-skip tambem em cenas comuns, nao apenas em Arena.

---

## ðŸ“¡ IntegraÃ§Ã£o Arkandia API (v1)

Todas as requisiÃ§Ãµes para `https://www.ernas.com.br/api/public/v1` exigem o header `X-API-Key`.

> [!IMPORTANT]
> **Headers ObrigatÃ³rios:**
> - `X-API-Key`: A chave secreta obtida no painel de desenvolvedor.
> - `Idempotency-Key` (apenas para operaÃ§Ãµes do tipo `POST`): Um UUID v4 exclusivo gerado pelo bot para evitar execuÃ§Ãµes duplicadas sob oscilaÃ§Ãµes de rede.

### Principais Pontos de Consumo da API no Bot:
1.  **ResoluÃ§Ã£o de Personagens:**
    *   O bot resolve automaticamente o personagem buscando por Discord ID (`GET /personagens/discord/:idOuUsername`).
2.  **Consulta a Itens e Drops:**
    *   `/itens/:ref` suporta UUID, slug e nome.
3.  **NPCs, BestiÃ¡rio e EnciclopÃ©dia:**
    *   Para o sistema de impersonaÃ§Ã£o (`/narrar habilitar` e `/cena npc_entrar`), o bot tenta carregar os dados de `/npcs/:ref` e, caso dÃª 404, recorre ao `/bestiario/:ref` para criaturas selvagens.
    *   O comando global `/bestiario` continua como atalho rÃ¡pido para criaturas.
    *   O comando `/enciclopedia` consolida itens, habilidades, bestiÃ¡rio e NPCs canÃ´nicos em uma sÃ³ interface com busca modal e correspondÃªncia aproximada.
4.  **InserÃ§Ã£o no InventÃ¡rio:**
    *   Ao clicar no botÃ£o de coleta de drop, o bot efetua um `POST /personagens/:id/inventario/adicionar` passando o `item_id` e a `quantidade` para popular o inventÃ¡rio do jogador em tempo real no site do jogo, utilizando cabeÃ§alhos de controle e autenticaÃ§Ã£o (`X-API-Key` e `Idempotency-Key` com UUID v4 gerado no ato).

---

## âš ï¸ Armadilhas Comuns & Regras Importantes (Gotchas)

> [!WARNING]
> **Tratamento de Fallbacks de Webhooks:**
> Algumas funcionalidades como `/rp iniciar` e o sistema de interpretaÃ§Ã£o em tempo real `/narrar` tentam criar webhooks dinÃ¢micos no canal para enviar mensagens com avatares/nomes personalizados. 
> Sempre implemente blocos `try-catch` robustos. Caso o bot nÃ£o tenha a permissÃ£o `ManageWebhooks` no servidor, a lÃ³gica deve reverter para um envio clÃ¡ssico do bot utilizando embeds explicativos para nÃ£o quebrar a experiÃªncia do usuÃ¡rio.

> [!WARNING]
> **Build Skills vs Skills Adquiridas:**
> Conforme a documentaÃ§Ã£o da API, o array `skills_adquiridas` representa o acervo total aprendido. Para exibir apenas o grimÃ³rio atualmente **equipado**, utilize `build_skills`. Atualmente, o comando `/skills` mapeia `skills_adquiridas` para visualizaÃ§Ã£o, mas lembre-se desta diferenÃ§a conceitual se for expandir mecÃ¢nicas de batalha!
