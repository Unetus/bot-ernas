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

### ⏳ Timer de Turno em Tempo Real (Live Countdown)
* No modo Arena, o cabeçalho do mapa informará o tempo restante de turno em tempo real de forma regressiva (`Tempo Restante: 120s`, `115s`...).
* **Como funciona o cronômetro em tempo real:** Para garantir a precisão visual regressiva em segundos contornando as limitações de formatação nativa do Discord, o bot utiliza um processo ativo em background (`setInterval`) que edita o cabeçalho do painel de controle da arena a cada 5 segundos para atualizar a string de tempo, garantindo que a imersão de urgência se mantenha.

### 🖼️ Mapas Tabletop e Fallback de Tokens
* Durante a fase de Picks & Bans, imagens conceituais completas de cada mapa da arena são exibidas. Após o Draft finalizar, a arena puxará inteligentemente a versão respectiva com o sufixo ` - Tabletop Version.png` para compor o fundo de VTT do combate final.
* Caso as imagens de perfil cadastradas na base de dados dos personagens fiquem inacessíveis no Imgur/API, o VTT engatilhará uma camada inteligente de **Fallback Genérico** no motor do canvas, desenhando na hora os tokens em formato de escudo/círculo contendo a inicial primária do nome do aventureiro.
* Se o tempo expirar antes do jogador concluir seu turno (ou do mestre passar com `/cena combate_proximo`), o bot fará o **Auto-skip** transferindo a vez para o próximo jogador vivo na lista de iniciativa.

---

## 👥 Comandos de Perfil (Integração de Ficha Centralizada)

Permitem aos jogadores e mestres consultarem dados em tempo real sobre os personagens, consolidando informações da ficha, equipamentos, deck de habilidades e conquistas em um único comando centralizado.

### `/perfil`
Renderiza e exibe um **banner Canvas dinâmico e premium de alta qualidade** (1100x415) com a ficha completa e consolidada do personagem.

*   **Parâmetros (Opcionais / Mutuamente Exclusivos):**
    *   `jogador`: `@menção` do Discord do jogador que deseja consultar.
    *   `nome`: Nome exato do personagem na API (para buscar fichas não atreladas ao Discord).
    *   *Se nenhum for informado, busca o personagem ativo do próprio usuário executor.*

*   **Recursos Visuais do Banner Canvas:**
    *   **Avatar & Identidade**: Foto de perfil com moldura circular iluminada na cor representativa do seu índice de poder. Nome, título, raça e classe com tratamentos textuais premium em degrade e fontes modernas.
    *   **Atributos de Combate**: Seção centralizada de estatísticas exibindo Nível, Rank e Índice de Poder em caixas de visualização estilizadas.
    *   **Deck de Habilidades**: Exibe visualmente as habilidades equipadas no deck em uso pelo jogador em slots estilizados com contornos dourados e realce para a habilidade racial.
    *   **Painel Lateral de Equipamentos (Direita)**: Slots dispostos verticalmente na lateral direita mostrando os equipamentos em uso de forma estruturada: **Elmo** (topo), **Peito** e **Arma** (centro), e **Botas** (base). Cada slot possui uma borda colorida dinâmica indicando a raridade do item (Cinza para Comum, Azul para Raro, Roxo para Épico, Laranja para Lendário e Vermelho para Mítico).
    *   **Painel Lateral de Conquistas (Direita)**: Abaixo do bloco de equipamentos, renderiza as medalhas oficiais do personagem: **🥇 Ouro**, **🥈 Prata** e **🥉 Bronze** com contadores e estilo visual premium.

*   **Interface Interativa (Visualização de Skills & Tooltips):**
    *   Abaixo do banner do perfil, o bot anexa um **Menu de Seleção Dinâmico** contendo todas as habilidades equipadas no deck atual do aventureiro.
    *   Ao selecionar uma habilidade do menu, o jogador recebe um **Tooltip detalhado e formatado por Embed** de forma efêmera (visível apenas para quem consultou), apresentando a descrição da skill, seu tipo (ativa/passiva), grau, origem e sua ilustração oficial para consulta rápida sem poluir o chat geral.

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

---

## 🏆 Novos Comandos de Consulta (Integração de Ficha & Comunidade)

Estes comandos barra foram adicionados na **Etapa 2** para expandir as opções de consulta dos jogadores e mestres na API de Arkandia.

### 🏆 `/ranking`
Permite a visualização em tempo real do Top 10 global em formato de banner Canvas altamente estilizado de 800x620.
*   **Parâmetros (Obrigatórios):**
    *   `tipo`: Selecione a categoria (`Poder 💪`, `Nível 📊`, `Guildas 🏰`, `Arena ⚔️`).
*   **Componentes Interativos**:
    *   **Botões de Alternância**: Quatro botões integrados abaixo do banner que atualizam o ranking instantaneamente sem a necessidade de novos comandos no chat.

### 🏰 `/guilda`
Busca e exibe informações completas e detalhadas de qualquer guilda registrada na API de Arkandia com um design Canvas medieval de 800x450.
*   **Parâmetros (Obrigatórios):**
    *   `nome`: Nome ou sigla exata da guilda a ser consultada.
*   **Recursos Visuais**:
    *   Brasão heráldico da guilda desenhado em tempo real.
    *   Informações de Nível, XP acumulado e Saldo total no Banco de Libras em cartões estilizados.
    *   Insígnias e lista dos bônus e Perks ativos no momento para os membros.

### 📜 `/missoes`
Apresenta o quadro público de aventuras e missões ativas e abertas na API de Arkandia.
*   **Mecânica**: Exibe um Embed com detalhes de requerimentos de nível e rank, grau de perigo (aviso de morte permanente) e status das vagas.
*   **Interatividade**:
    *   Cada missão listada possui um botão associado contendo o nome da missão. Clicar no botão exibe em formato efêmero a lista com o nome e Discord ID de todos os aventureiros inscritos para aquela expedição.

### 🎒 `/inventario`
Permite que o jogador consulte o conteúdo completo da sua mochila (inventário) registrada no site ou de qualquer outro aventureiro.
*   **Parâmetros (Opcionais):**
    *   `jogador`: `@menção` do Discord a consultar.
    *   `nome`: Nome do personagem na API.
    *   *Se nenhum for informado, consulta a mochila do próprio usuário executor.*
*   **Interface Dinâmica**:
    *   **Menu de Abas**: Botões de categorias para filtrar itens (`Tudo 🎒`, `Armas ⚔`, `Defesas 🛡`, `Consumíveis 🧪`, `Materiais 💎`).
    *   **Paginação**: Botões de navegação (`Anterior ◀` e `Próximo ▶`) para listar itens grandes organizados por páginas.
    *   **Raridade**: Exibe os itens marcados por cores temáticas de acordo com a raridade do item (⚪ Comum, 🔵 Raro, 🟣 Épico, 🟠 Lendário, 🔴 Mítico).
