# ⚔️ Guia de Funcionalidades & Mapeamento de Comandos

Este documento contém o catálogo completo das funcionalidades do bot Discord RPG de Arkandia, detalhando todos os comandos barra (slash commands), subcomandos, parâmetros e componentes interativos de interface.

---

## 🌟 Visão Geral dos Recursos

O bot transforma canais de texto do Discord em salas de RPG completas, provendo:
1.  **Virtual Tabletop (VTT)** baseado em canvas dinâmico diretamente no chat.
2.  **Sistema de Viagem Regional** com controle automatizado de visibilidade de canais por categoria.
3.  **Fichas e Grimórios de Habilidades** integrados em tempo real com a API de Arkandia.
4.  **Ready Check de Missões** com validação de inscritos e status "Pronto".
5.  **Narração Atmosférica e Impersonação** de NPCs do RPG usando Webhooks.

---

## 🗺️ Painel de Comandos VTT (Virtual Tabletop)

O VTT é gerenciado pelo comando raiz `/cena`. Permite que mestres controlem o grid e jogadores posicionem seus personagens.

### `/cena` (Comando Raiz)

| Subcomando | Permissão | Parâmetros | O que faz |
| :--- | :---: | :--- | :--- |
| **`iniciar`** | **Mestre** | `colunas` (Int, Obrigatório)<br>`linhas` (Int, Obrigatório)<br>`fundo` (Attachment, Opcional) | Cria um tabuleiro em branco no canal de tamanho X por Y com imagem de fundo personalizada opcional. |
| **`entrar`** | **Livre** | Nenhum | Consulta a API e insere o personagem ativo associado ao Discord ID do usuário na posição `(0, 0)` do grid. |
| **`mover`** | **Livre** | `posicao` (String, Obrigatório, ex: `A1`, `D4`) | Move o token do jogador executor para a coordenada informada. |
| **`npc_entrar`** | **Mestre** | `nome` (String, Obrigatório)<br>`posicao` (String, Obrigatório, ex: `B2`) | Carrega os dados de um NPC canônico ou criatura do Bestiário da API e o adiciona no tabuleiro como inimigo (borda vermelha). |
| **`fechar`** | **Mestre** | Nenhum | Trava a cena para novas entradas. Novas execuções de `/cena entrar` serão rejeitadas. |
| **`combate_iniciar`**| **Mestre** | Nenhum | Inicia a ordem de combate. Bloqueia a movimentação livre e tranca os turnos de acordo com a lista de tokens. |
| **`combate_proximo`**| **Mestre** | Nenhum | Passa a vez para o próximo personagem vivo no combate. O mapa tático é repostado abaixo no chat. |
| **`mover_livre`** | **Mestre** | `nome_token` (String, Obrigatório)<br>`posicao` (String, Obrigatório, ex: `C3`) | Permite que o mestre reposicione qualquer token do tabuleiro à força. |
| **`status_vida`** | **Mestre** | `nome_token` (String, Obrigatório) | Alterna o status do token entre Vivo ❤️ e Incapacitado 💀 (desenhando um "X" vermelho sobre o token no grid). |
| **`encerrar`** | **Mestre** | Nenhum | Deleta a mensagem do mapa ativo no chat e apaga os dados da cena da memória do bot. |

### 🕹️ Componentes Interativos do VTT (Botões Direcionais)
Abaixo da imagem gerada do mapa, uma fileira de botões interativos é enviada:
*   **⬆️ (`move_up`)**: Move o personagem ativo 1 célula para cima.
*   **⬇️ (`move_down`)**: Move o personagem ativo 1 célula para baixo.
*   **⬅️ (`move_left`)**: Move o personagem ativo 1 célula para a esquerda.
*   **➡️ (`move_right`)**: Move o personagem ativo 1 célula para a direita.

> [!NOTE]
> No modo **COMBATE**, a movimentação por botões ou comando barra só é permitida no turno do jogador correspondente.

## 🏟️ Sistema Competitivo (Arena)

O sistema de Arena introduz a funcionalidade de combate Player vs Player (PvP) com sistema de Draft e controle de tempo real.

### `/arena`
*   **`iniciar`**: Inicializa a fase de Draft (Picks & Bans) da Arena.
    *   **Permissão:** **Mestre**
    *   **Parâmetros:** `jogadores` (String, Obrigatório - menções no formato `@J1 @J2`), `tempo_turno` (Int, Obrigatório - tempo limite em segundos).
    *   **Mecânica de Draft:** 
        1. O bot renderiza dinamicamente e com belos efeitos visuais o painel com as ilustrações reais dos **5 Mapas** da arena (`mapas-arena/`).
        2. Os dois primeiros jogadores mencionados no comando tornam-se os "Capitães".
        3. Os Capitães alternam turnos para **banir** (excluir) mapas da lista utilizando botões interativos (`arena_ban_<id>`). A cada ban, o painel é re-renderizado com um efeito de "X" vermelho e escurecimento do mapa banido.
        4. Quando sobrar apenas 1 mapa, o bot automaticamente constrói a cena VTT com o mapa escolhido, insere os capitães em lados opostos do grid e trava o combate (`/cena combate_iniciar`).
*   **`encerrar`**: Encerra o combate ativo da arena naquele canal.
    *   **Permissão:** **Mestre**
    *   **Parâmetros:** Nenhum.
    *   **O que faz:** Para e remove o timer de turno (auto-skip) ativo, deleta a mensagem contendo o mapa tático da arena no chat e limpa os dados do combate da memória interna do bot.

### ⏳ Timer de Turno em Tempo Real (Auto-skip)
* No modo Arena, o cabeçalho do mapa informará o tempo restante de turno daquele jogador em tempo real graças às tags nativas do Discord (`<t:TIMESTAMP:R>`).
* **Como funciona o cronômetro em tempo real:** Por limitações estritas de taxa de requisições da API do Discord (Discord Rate Limits), editar uma mensagem a cada segundo causaria lentidão extrema e até bloqueios ao IP do bot. Contudo, ao usar o formato `<t:TIMESTAMP:R>` do Discord, o próprio aplicativo do usuário calcula e exibe em tempo real o cronômetro regressivo segundo a segundo na tela do jogador, sem consumir nenhuma chamada de API adicional.
* Se o tempo expirar antes do jogador concluir seu turno (ou do mestre passar com `/cena combate_proximo`), o bot fará o **Auto-skip** transferindo a vez para o próximo jogador vivo na lista de iniciativa.

---

## 👥 Comandos de Perfil & Skills (Integração de Ficha)

Permitem aos jogadores e mestres consultarem dados em tempo real sobre os personagens.

### `/perfil`
Exibe uma ficha de RPG em formato de Embed baseada nos dados oficiais do personagem.
*   **Parâmetros (Opcionais / Mutuamente Exclusivos):**
    *   `jogador`: `@menção` do Discord do jogador que deseja consultar.
    *   `nome`: Nome exato do personagem na API (para buscar fichas não atreladas ao Discord).
    *   *Se nenhum for informado, busca o personagem ativo do próprio usuário executor.*

### `/skills`
Apresenta o grimório de habilidades (skills) adquiridas pelo personagem na API do Arkandia.
*   **Parâmetros (Opcionais):** Mesma lógica de busca do `/perfil` (por menção de jogador ou nome exato).
*   **Interface Interativa:**
    1.  O bot envia uma mensagem contendo um **Menu de Seleção** (`select_skill`) contendo as primeiras 25 habilidades.
    2.  Ao selecionar uma skill no menu, a mensagem é atualizada exibindo os detalhes completos da habilidade (grau, tipo, descrição, ilustração).
    3.  Abaixo dos detalhes, um botão **Conjurar Skill ✨** (`conjurar_skill_<id>`) é liberado.
    4.  Ao clicar no botão, o bot envia uma mensagem pública no canal anunciando o conjuramento daquela skill de forma narrativa.

---

## 📜 Comandos do Mestre & Narração

Conjunto de comandos restritos a usuários com permissão de `Gerenciar Mensagens` para enriquecer a narrativa de RPG.

### `/mestre` (DM Tools)

| Subcomando | Parâmetros | O que faz |
| :--- | :--- | :--- |
| **`dropar`** | `item` (String, Obrigatório)<br>`quantidade` (Int, Opcional, default: `1`) | Busca as informações de um item no catálogo da API e cria um embed com um botão **Coletar Item** (`pegar_loot_<id>_<qtd>`). O primeiro jogador a clicar no botão tem seu personagem ativo resolvido pelo Discord ID e o item é adicionado automaticamente ao seu inventário no site de Arkandia, desabilitando o botão para os demais. |
| **`bestiario`**| `nome` (String, Obrigatório) | Consulta secreta de ficha. Busca os dados de um NPC ou monstro do Bestiário diretamente na API de Arkandia e exibe seus atributos e lore. |

### `/narrar` (Narração Imersiva & Interpretação)

O sistema de Narração Imersiva permite que o Mestre incorpore uma identidade (NPC, Criatura ou o próprio Narrador) no canal de chat. Quando o modo está ativo, todas as mensagens de texto comuns digitadas pelo mestre no chat serão automaticamente convertidas e enviadas por um Webhook com o nome e avatar correspondentes.

*   **`habilitar`**: Ativa o modo de interpretação imersiva neste canal de chat.
    *   **Parâmetros:** `nome` (String, Opcional) — Nome do NPC canônico ou criatura do Bestiário na API.
    *   **Como funciona:** 
        * Se o parâmetro `nome` for fornecido, o bot pesquisa a identidade correspondente na API de Arkandia para usar seu nome e avatar.
        * Se o parâmetro `nome` for omitido, o bot assume o perfil padrão de **Narrador** (avatar: `https://i.imgur.com/2U5fPoy.png`).
        * O bot apaga a mensagem de texto original do mestre no chat e a reenvia via Webhook instantaneamente.
*   **`desabilitar`**: Desativa o modo de interpretação neste canal de chat.
    *   **Como funciona:** O mestre retorna ao seu perfil pessoal e suas mensagens normais de chat saem com seu próprio usuário do Discord.

> [!NOTE]
> Mensagens que iniciam com o caractere `/` são desconsideradas pelo sistema para permitir que o mestre execute outros comandos barra sem interferências.

---

## 🗺️ Viagem Rápida & Cenas de RP

Mapeamento do sistema de movimentação geográfica por categorias de canais do Discord e início de tópicos.

### `/mapa` (Sistema de Viagens)
*   **`configurar`**: Abre um menu de seleção múltipla com todas as categorias do servidor. O mestre escolhe quais categorias representam regiões do mapa de RPG. As opções salvas são persistidas no arquivo local `mapa_config.json`.
*   **`painel`**: Cria a central de viagem do RPG com a imagem do mapa do mundo e dois botões interativos:
    *   **🧭 Iniciar Viagem** (`btn_mapa_viajar`): Exibe um menu suspenso contendo as regiões configuradas. Ao escolher o destino, o bot atualiza as permissões de canal do jogador, ocultando sua categoria antiga e liberando o acesso visual à nova região na barra lateral.
    *   **🚪 Sair do Local Atual** (`btn_mapa_sair`): Oculta todas as regiões de RP das quais o jogador possuía acesso geográfico temporário.

### `/rp` (Iniciar Cena)
*   **`iniciar`**: Abre um tópico (thread pública) a partir do canal atual dedicado a uma cena de RPG.
    *   **Parâmetros:** `titulo` (String, Obrigatório), `participantes` (String, Obrigatório - ex: marcar jogadores), `subtitulo` (String, Opcional), `ambientacao` (String, Opcional), `cenario` (Attachment, Imagem de cenário opcional).
    *   **Resultado:** O bot cria o tópico, marca os envolvidos, cria uma introdução estrutizada utilizando o Webhook de "Narrador" e anexa o cenário em um embed cinza escuro de alta legibilidade.

---

## 🛡️ Sistema de Missões (Preparação)

### `/missao`
*   **`preparar`**: Prepara a convocação de uma missão cadastrada na API de Arkandia.
    *   **Parâmetros:** `nome` (String, Obrigatório) — Nome exato da missão.
    *   **Mecânica:** O bot busca os jogadores oficialmente inscritos e confirmados para a missão na API de Arkandia, marca todos no chat e cria um embed de "Ready Check".
    *   **Interatividade:** Cada participante convocado deve clicar no botão **PRONTO ✅** (`missao_pronto`). O painel atualiza em tempo real indicando quem já confirmou.
*   **`iniciar`**:
    *   **Parâmetros:** `nome` (String, Obrigatório).
    *   **Mecânica:** Apaga a HUD de preparação e dá início formal à missão no chat com as menções de todos os heróis confirmados prontos.
