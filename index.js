require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, Collection } = require('discord.js');
const axios = require('axios');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

let mapaConfig = [];
try {
    if (fs.existsSync('mapa_config.json')) {
        mapaConfig = JSON.parse(fs.readFileSync('mapa_config.json', 'utf8'));
    }
} catch(e) {}
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildWebhooks
    ]
});


client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] O comando em ${filePath} nao possui as propriedades "data" ou "execute".`);
    }
}

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

// Caches
const skillsCache = new Map();
const cenasAtivas = new Map();
const missoesPreparacao = new Map();
let renderTimers = new Map();
const arenasDraft = new Map();
const timersTurno = new Map();
const mestresNarrando = new Map();
const lootsEmProcessamento = new Set();
const lootsColetados = new Set();

const MAPAS_ARENA = [
    { id: 'coliseu', nome: 'Coliseu de Vermécia', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Coliseu de Vermécia.png' },
    { id: 'cordilheira', nome: 'Cordilheira de Canaban', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Cordilheira de Canaban.png' },
    { id: 'floresta', nome: 'Floresta Mágica de Serdin', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Floresta Mágica de Serdin.png' },
    { id: 'planicies', nome: 'Planícies da Eternidade de Kastulle', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Planícies da Eternidade de Kastulle.png' },
    { id: 'patio', nome: 'Pátio da Academia Arcana', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Pátio da Academia Arcana.png' }
];

// =====================================
// FUNÇÕES UTILITÁRIAS E UI/UX
// =====================================

const formatarTexto = (str) => {
    if (!str) return '';
    const stringVal = String(str);
    return stringVal.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const embedErro = (msg) => new EmbedBuilder().setColor(0xE74C3C).setTitle('✗ Erro').setDescription(msg);
const embedSucesso = (msg) => new EmbedBuilder().setColor(0x2E5A36).setTitle('✓ Sucesso').setDescription(msg);











async function renderInventarioPage(interaction, p, itens, categoria, pagina) {
    const ITEMS_PER_PAGE = 8;

    // Filtra itens por categoria
    let itensFiltrados = itens;
    if (categoria !== 'todos') {
        itensFiltrados = itens.filter(i => {
            const cat = (i.categoria || i.item?.categoria || '').toLowerCase();
            if (categoria === 'armas') return ['arma', 'espada', 'arco', 'bastao', 'lança', 'machado', 'principal', 'secundaria', 'weapon'].some(w => cat.includes(w));
            if (categoria === 'armaduras') return ['armadura', 'peito', 'elmo', 'capacete', 'bota', 'sapato', 'escudo', 'luvas', 'calça', 'armor', 'shield', 'helmet', 'boots'].some(w => cat.includes(w));
            if (categoria === 'consumiveis') return ['consumivel', 'poção', 'comida', 'potion', 'scroll', 'pergaminho'].some(w => cat.includes(w));
            if (categoria === 'materiais') return ['material', 'minerio', 'couro', 'essencia', 'ore', 'herb', 'planta'].some(w => cat.includes(w));
            return false;
        });
    }

    const totalPaginas = Math.ceil(itensFiltrados.length / ITEMS_PER_PAGE) || 1;
    const pag = Math.max(0, Math.min(pagina, totalPaginas - 1));
    const slice = itensFiltrados.slice(pag * ITEMS_PER_PAGE, (pag + 1) * ITEMS_PER_PAGE);

    const buffer = await gerarBannerInventario(p, slice, categoria, pag, totalPaginas);
    const attachment = new AttachmentBuilder(buffer, { name: 'inventario.png' });

    const embed = new EmbedBuilder()
        .setColor(p.indice_poder_cor || 0x3498DB)
        .setImage('attachment://inventario.png');

    // Botões de Categorias
    const rowCats = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inv_cat_${p.id}_todos`).setLabel('Tudo').setStyle(categoria === 'todos' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inv_cat_${p.id}_armas`).setLabel('Armas').setStyle(categoria === 'armas' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inv_cat_${p.id}_armaduras`).setLabel('Defesas').setStyle(categoria === 'armaduras' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inv_cat_${p.id}_consumiveis`).setLabel('Consumíveis').setStyle(categoria === 'consumiveis' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inv_cat_${p.id}_materiais`).setLabel('Materiais').setStyle(categoria === 'materiais' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Botões de Paginação
    const rowPag = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inv_pag_${p.id}_${categoria}_${pag - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Primary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId(`inv_pag_${p.id}_${categoria}_${pag + 1}`).setLabel('Próximo').setStyle(ButtonStyle.Primary).setDisabled(pag >= totalPaginas - 1)
    );

    const components = [rowCats];
    if (totalPaginas > 1) {
        components.push(rowPag);
    }

    if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ embeds: [embed], files: [attachment], components });
    } else {
        return await interaction.update({ embeds: [embed], files: [attachment], components });
    }
}


// =====================================
// IA NARRATIVA E HUD DO MESTRE (ETAPAS 5.4 E 3.4)
// =====================================

async function gerarNarrativaIA(prompt, instruction = '') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Chave GEMINI_API_KEY não configurada no arquivo .env.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
        }
    };
    if (instruction) {
        payload.systemInstruction = { parts: [{ text: instruction }] };
    }
    const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
    });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}



function getMestrePainelComponents() {
    const rowVtt = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_vtt')
            .setPlaceholder('Controle VTT (Grid e Combate)')
            .addOptions([
                { label: 'Iniciar Cena VTT', description: 'Cria um novo mapa tatico no canal', value: 'iniciar_cena' },
                { label: 'Iniciar Arena PvP', description: 'Inicia draft de picks/bans para combate PvP', value: 'iniciar_arena' },
                { label: 'Iniciar Combate', description: 'Tranca iniciativa e turnos no VTT', value: 'combate_iniciar' },
                { label: 'Avançar Turno', description: 'Passa para o próximo token vivo', value: 'combate_proximo' },
                { label: 'Mudar Status de Vida', description: 'Alterna token entre Vivo e Incapacitado', value: 'status_vida' },
                { label: 'Teleportar Token', description: 'Força o movimento de um token no grid', value: 'mover_livre' },
                { label: 'Fechar Entrada', description: 'Bloqueia novos jogadores no mapa', value: 'fechar' },
                { label: 'Encerrar Cena', description: 'Deleta o mapa e remove VTT da memória', value: 'encerrar' }
            ])
    );

    const rowVoz = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_voz')
            .setPlaceholder('Voz, Narracao e Consultas')
            .addOptions([
                { label: 'Assumir NPC ou Monstro', description: 'Fala através de Webhook personalizado', value: 'assumir_npc' },
                { label: 'Voltar ao Perfil de Mestre', description: 'Desativa o Webhook e fala como usuário normal', value: 'voltar_mestre' },
                { label: 'Consultar Bestiario Secreto', description: 'Pesquisa atributos e lore de forma secreta', value: 'consultar_bestiario' },
                { label: 'Consultar Ficha de Personagem', description: 'Gera e exibe a ficha Canvas de qualquer jogador', value: 'visualizar_perfil' },
                { label: 'Consultar Mochila de Personagem', description: 'Abre a mochila e inventario de qualquer jogador', value: 'visualizar_inventario' }
            ])
    );

    const rowLoot = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_economia')
            .setPlaceholder('Loot, Moedas e Recompensas')
            .addOptions([
                { label: 'Dropar Item do Catalogo', description: 'Pesquisa item na API e envia caixa de loot', value: 'dropar_item' },
                { label: 'Creditar Libras (Moedas)', description: 'Adiciona moedas diretamente à ficha do jogador', value: 'creditar_libras' }
            ])
    );

    const rowIa = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_ia')
            .setPlaceholder('IA Narrativa Assistente (Gemini)')
            .addOptions([
                { label: 'Descrever Ambiente', description: 'IA gera narração mística do canal/local atual', value: 'ia_descrever_ambiente' },
                { label: 'Improvisar Fala de NPC', description: 'IA responde in-character como o NPC ativo', value: 'ia_npc_fala' },
                { label: 'Gerar Encontro Aleatorio', description: 'IA sorteia monstros e gera enredo de emboscada', value: 'ia_encontro' }
            ])
    );

    return [rowVtt, rowVoz, rowLoot, rowIa];
}


// =====================================
// FUNÇÕES DE MAPA 2D E COORDENADAS
// =====================================

function parsePosicao(posStr) {
    const match = posStr.trim().toUpperCase().match(/^([A-Z])(\d+)$/);
    if (!match) return null;
    const x = match[1].charCodeAt(0) - 65;
    const y = parseInt(match[2]) - 1;
    return { x, y };
}

async function renderMap(scene) {
    const CELL_SIZE = 100;
    const MARGIN = 40;
    
    const mapWidth = scene.colunas * CELL_SIZE;
    const mapHeight = scene.linhas * CELL_SIZE;
    const width = Math.max(mapWidth + MARGIN, 400); 
    const height = Math.max(mapHeight + MARGIN, 400);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fundo inteiro
    ctx.fillStyle = '#1E1F22'; 
    ctx.fillRect(0, 0, width, height);

    // Fundo do Grid
    if (scene.fundoUrl) {
        try {
            const bg = await loadImage(scene.fundoUrl);
            ctx.drawImage(bg, MARGIN, MARGIN, mapWidth, mapHeight);
        } catch (e) {
            ctx.fillStyle = '#2B2D31';
            ctx.fillRect(MARGIN, MARGIN, mapWidth, mapHeight);
        }
    } else {
        ctx.fillStyle = '#2B2D31';
        ctx.fillRect(MARGIN, MARGIN, mapWidth, mapHeight);
    }

    // Coordenadas Letras e Números
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = 0; x < scene.colunas; x++) {
        const letra = String.fromCharCode(65 + x);
        ctx.fillText(letra, MARGIN + (x * CELL_SIZE) + (CELL_SIZE / 2), MARGIN / 2);
    }
    for (let y = 0; y < scene.linhas; y++) {
        ctx.fillText((y + 1).toString(), MARGIN / 2, MARGIN + (y * CELL_SIZE) + (CELL_SIZE / 2));
    }

    // Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= scene.colunas; x++) {
        const px = MARGIN + (x * CELL_SIZE);
        ctx.beginPath(); ctx.moveTo(px, MARGIN); ctx.lineTo(px, MARGIN + mapHeight); ctx.stroke();
    }
    for (let y = 0; y <= scene.linhas; y++) {
        const py = MARGIN + (y * CELL_SIZE);
        ctx.beginPath(); ctx.moveTo(MARGIN, py); ctx.lineTo(MARGIN + mapWidth, py); ctx.stroke();
    }

    // Tokens
    for (let i = 0; i < scene.players.length; i++) {
        const p = scene.players[i];
        const cx = MARGIN + (p.x * CELL_SIZE) + (CELL_SIZE / 2);
        const cy = MARGIN + (p.y * CELL_SIZE) + (CELL_SIZE / 2);
        const radius = (CELL_SIZE / 2) - 10;

        let avatarLoaded = false;
        try {
            if (p.avatarUrl) {
                const avatar = await loadImage(p.avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
                ctx.restore();
                avatarLoaded = true;
            }
        } catch (e) {
            console.error('Erro ao desenhar token (fallback ativado)');
        }

        if (!avatarLoaded) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = p.isNpc ? '#8B0000' : '#2B4C7E';
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const inicial = p.name ? p.name.charAt(0).toUpperCase() : '?';
            ctx.fillText(inicial, cx, cy);
            ctx.textBaseline = 'alphabetic'; // Reset para o nome principal
        }

        // Borda do Token
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        
        if (p.incapacitado) {
            ctx.strokeStyle = '#7F8C8D'; 
        } else if (scene.estado === 'COMBATE' && scene.turnoAtual === i) {
            ctx.strokeStyle = '#B8860B'; 
        } else {
            ctx.strokeStyle = p.isNpc ? '#8B0000' : '#2B4C7E'; 
        }
        ctx.lineWidth = 4;
        ctx.stroke();

        // Desenhando X vermelho se incapacitado
        if (p.incapacitado) {
            ctx.beginPath();
            ctx.moveTo(cx - radius + 5, cy - radius + 5);
            ctx.lineTo(cx + radius - 5, cy + radius - 5);
            ctx.moveTo(cx + radius - 5, cy - radius + 5);
            ctx.lineTo(cx - radius + 5, cy + radius - 5);
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(139, 0, 0, 0.8)'; 
            ctx.stroke();
        }

        // Texto com Nome
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.name, cx, cy + radius + 15);
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

async function renderDraft(draft) {
    const canvasWidth = 1000;
    const canvasHeight = 600;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fundo escuro
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Titulo
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❖ Arena - Picks & Bans', canvasWidth / 2, 50);

    const cols = 3;
    const mapW = 300;
    const mapH = 200;
    const gapX = 25;
    const gapY = 50;

    const startX = (canvasWidth - ((cols * mapW) + ((cols - 1) * gapX))) / 2;
    let startY = 100;

    for (let i = 0; i < MAPAS_ARENA.length; i++) {
        const mapa = MAPAS_ARENA[i];
        const row = Math.floor(i / cols);
        const col = i % cols;

        let x = startX + col * (mapW + gapX);
        let y = startY + row * (mapH + gapY);

        if (i === 3) x += (mapW + gapX) / 2; // Centraliza a segunda linha
        if (i === 4) x += (mapW + gapX) / 2;

        try {
            const img = await loadImage(mapa.fundoUrl);
            ctx.drawImage(img, x, y, mapW, mapH);
        } catch(e) {
            ctx.fillStyle = '#555';
            ctx.fillRect(x, y, mapW, mapH);
        }

        // Borda do mapa
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, mapW, mapH);

        // Texto do nome
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mapa.nome, x + mapW / 2, y + mapH + 25);

        // Verifica se foi banido
        const isBanido = !draft.mapasRestantes.find(m => m.id === mapa.id);
        if (isBanido) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(x, y, mapW, mapH);

            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.moveTo(x + 20, y + 20);
            ctx.lineTo(x + mapW - 20, y + mapH - 20);
            ctx.moveTo(x + mapW - 20, y + 20);
            ctx.lineTo(x + 20, y + mapH - 20);
            ctx.stroke();
        }
    }

    return canvas.toBuffer('image/png');
}

function getCabecalhoCena(cena) {
    if (cena.estado === 'COMBATE') {
        const ativo = cena.players[cena.turnoAtual];
        let cabecalho = `⚔ **COMBATE INICIADO! (Rodada ${cena.rodada})**\nÉ o turno de: **${ativo.name}**. Mova sua peça ou realize sua ação!`;
        if (cena.tempoTurnoMs && cena.fimTurnoTimestamp) {
            const remainingSecs = Math.max(0, Math.ceil((cena.fimTurnoTimestamp - Date.now()) / 1000));
            cabecalho += `\n⧖ Tempo Restante: **${remainingSecs}s** (Total: ${cena.tempoTurnoMs / 1000}s)`;
        }
        return cabecalho;
    }
    return `❖ **MAPA TÁTICO INICIADO!**\nUse \`/cena entrar\` para participar. Modos: livre.`;
}

function iniciarTimerTurno(channel, cena) {
    if (!cena.tempoTurnoMs || cena.estado !== 'COMBATE' || !cena.msgId) return;
    
    if (timersTurno.has(cena.msgId)) clearInterval(timersTurno.get(cena.msgId));
    
    const interval = setInterval(async () => {
        if (cena.estado !== 'COMBATE') {
            clearInterval(interval);
            return;
        }
        const remaining = cena.fimTurnoTimestamp - Date.now();
        if (remaining <= 0) {
            clearInterval(interval);
            try {
                await channel.send(`⧖ O tempo de **${cena.players[cena.turnoAtual].name}** se esgotou! Passando o turno automaticamente.`);
                do {
                    cena.turnoAtual++;
                    if (cena.turnoAtual >= cena.players.length) {
                        cena.turnoAtual = 0;
                        cena.rodada++;
                    }
                } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
                await repintarMapaNovo(channel, cena);
            } catch(e) { console.error('Erro no auto-skip', e); }
            return;
        }
        
        try {
            const msg = await channel.messages.fetch(cena.msgId).catch(() => null);
            if (msg) {
                await msg.edit({ content: getCabecalhoCena(cena) });
            }
        } catch(e) {}
    }, 5000);
    
    timersTurno.set(cena.msgId, interval);
}

function getCenaBotoes(cena) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('move_up').setLabel('▲').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('move_down').setLabel('▼').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('move_left').setLabel('◀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('move_right').setLabel('▶').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('modal_mover_coord').setLabel('⌖ Mover (Coord.)').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('passar_turno').setLabel('» Passar Turno').setStyle(ButtonStyle.Danger)
    );
    return [row, row2];
}

async function atualizarMapaDebounced(channel, cena) {
    if (!cena.msgId) return;

    if (renderTimers.has(cena.msgId)) clearTimeout(renderTimers.get(cena.msgId));

    const timer = setTimeout(async () => {
        renderTimers.delete(cena.msgId);
        try {
            const msg = await channel.messages.fetch(cena.msgId);
            const buffer = await renderMap(cena);
            const attachment = new AttachmentBuilder(buffer, { name: 'mapa.png' });
            await msg.edit({ content: getCabecalhoCena(cena), files: [attachment], components: getCenaBotoes(cena) });
        } catch (e) {
            console.error('Erro debounce', e);
        }
    }, 600);

    renderTimers.set(cena.msgId, timer);
}

// Cria uma Nova Mensagem do Mapa no Chat (Utilizado no Next Turn)
async function repintarMapaNovo(channel, cena) {
    if (cena.msgId) {
        if (timersTurno.has(cena.msgId)) {
            clearInterval(timersTurno.get(cena.msgId));
            timersTurno.delete(cena.msgId);
        }
        try {
            const velha = await channel.messages.fetch(cena.msgId);
            await velha.delete();
        } catch(e) {}
    }
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs) {
        cena.fimTurnoTimestamp = Date.now() + cena.tempoTurnoMs;
    }
    const buffer = await renderMap(cena);
    const attachment = new AttachmentBuilder(buffer, { name: 'mapa.png' });
    const msg = await channel.send({ content: getCabecalhoCena(cena), files: [attachment], components: getCenaBotoes(cena) });
    cena.msgId = msg.id;
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs) {
        iniciarTimerTurno(channel, cena);
    }
}

function getUrlRequisicao(interaction) {
    const usuarioMencionado = interaction.options.getUser('jogador');
    const nomeFornecido = interaction.options.getString('nome');
    if (usuarioMencionado) return `${ARKANDIA_API}/personagens/discord/${usuarioMencionado.id}`;
    if (nomeFornecido) return `${ARKANDIA_API}/personagens/${encodeURIComponent(nomeFornecido)}`;
    return `${ARKANDIA_API}/personagens/discord/${interaction.user.id}`;
}

const legacyCommands = [
    new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Sistema de Arena com Picks/Bans e Timer')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub.setName('iniciar').setDescription('[Mestre] Inicia o draft da Arena')
            .addStringOption(o => o.setName('jogadores').setDescription('Mencione os jogadores (Ex: @J1 @J2)').setRequired(true))
            .addIntegerOption(o => o.setName('tempo_turno').setDescription('Tempo de turno em segundos').setRequired(true)))
        .addSubcommand(sub => sub.setName('encerrar').setDescription('[Mestre] Encerra o combate na arena e remove o mapa')),

    // COMANDOS CENA
    new SlashCommandBuilder()
        .setName('cena')
        .setDescription('Sistema VTT de Mapa, Posicionamento e Turnos')
        .addSubcommand(sub => sub.setName('iniciar').setDescription('[Mestre] Cria um novo mapa vazio').addIntegerOption(o => o.setName('colunas').setDescription('Largura').setRequired(true)).addIntegerOption(o => o.setName('linhas').setDescription('Altura').setRequired(true)).addAttachmentOption(o => o.setName('fundo').setDescription('Upload de Imagem (Opcional)')))
        .addSubcommand(sub => sub.setName('entrar').setDescription('Entra na cena (Apenas quando aberta)'))
        .addSubcommand(sub => sub.setName('mover').setDescription('Move SEU personagem').addStringOption(o => o.setName('posicao').setDescription('Ex: A1, C4').setRequired(true)))
        .addSubcommand(sub => sub.setName('npc_entrar').setDescription('[Mestre] Adiciona um NPC da API').addStringOption(o => o.setName('nome').setDescription('Nome do NPC').setRequired(true)).addStringOption(o => o.setName('posicao').setDescription('Ex: A1').setRequired(true)))
        .addSubcommand(sub => sub.setName('fechar').setDescription('[Mestre] Trava a entrada de novos jogadores'))
        .addSubcommand(sub => sub.setName('combate_iniciar').setDescription('[Mestre] Trava movimentos livres e inicia Ordem de Turnos'))
        .addSubcommand(sub => sub.setName('combate_proximo').setDescription('[Mestre] Passa para o próximo turno e joga o mapa pra baixo'))
        .addSubcommand(sub => sub.setName('mover_livre').setDescription('[Mestre] Move qualquer token').addStringOption(o => o.setName('nome_token').setDescription('Nome de quem vai mover').setRequired(true)).addStringOption(o => o.setName('posicao').setDescription('Nova posição (A1)').setRequired(true)))
        .addSubcommand(sub => sub.setName('status_vida').setDescription('[Mestre] Alterna token entre Vivo/Caído').addStringOption(o => o.setName('nome_token').setDescription('Nome do token').setRequired(true)))
        .addSubcommand(sub => sub.setName('encerrar').setDescription('[Mestre] Deleta o mapa atual e apaga tudo')),

    new SlashCommandBuilder().setName('perfil').setDescription('Busca a ficha do personagem').addUserOption(o => o.setName('jogador').setDescription('@nome')).addStringOption(o => o.setName('nome').setDescription('nome exato')),
    new SlashCommandBuilder().setName('mestre').setDescription('Ferramentas de DM').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addSubcommand(sub => sub.setName('dropar').setDescription('Cria Loot').addStringOption(o => o.setName('item').setDescription('Nome do item').setRequired(true)).addIntegerOption(o => o.setName('quantidade').setDescription('Qtd').setRequired(false))).addSubcommand(sub => sub.setName('painel').setDescription('Abre a central de controle interativa do Mestre (HUD)')),
    new SlashCommandBuilder().setName('narrar').setDescription('Sistema de Narração e Interpretação Imersiva para o Mestre').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addSubcommand(sub => sub.setName('habilitar').setDescription('[Mestre] Habilita o modo de interpretação neste canal').addStringOption(o => o.setName('nome').setDescription('Nome do NPC ou Monstro do Bestiário (Deixe vazio para ser o Narrador)').setRequired(false))).addSubcommand(sub => sub.setName('desabilitar').setDescription('[Mestre] Desabilita o modo de interpretação neste canal')),
    new SlashCommandBuilder().setName('missao').setDescription('Sistema de Missões').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addSubcommand(sub => sub.setName('preparar').setDescription('[Mestre] Prepara a HUD de uma missão da API').addStringOption(o => o.setName('nome').setDescription('Nome da Missão').setRequired(true))).addSubcommand(sub => sub.setName('iniciar').setDescription('[Mestre] Inicia a missão que está em preparação').addStringOption(o => o.setName('nome').setDescription('Nome da Missão').setRequired(true))),
    new SlashCommandBuilder().setName('mapa').setDescription('Sistema de Navegação do Mundo').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addSubcommand(sub => sub.setName('painel').setDescription('[Mestre] Cria o Painel de Viagem Rápida neste canal')).addSubcommand(sub => sub.setName('configurar').setDescription('[Mestre] Define quais categorias pertencem ao mapa')),
    new SlashCommandBuilder().setName('rp').setDescription('Sistema de Criação de Cenas (Tópicos)').addSubcommand(sub => sub.setName('iniciar').setDescription('Cria um tópico para RP').addStringOption(o => o.setName('titulo').setDescription('Título do tópico').setRequired(true)).addStringOption(o => o.setName('participantes').setDescription('Marque os jogadores (Ex: @joao @maria)').setRequired(true)).addStringOption(o => o.setName('subtitulo').setDescription('Subtítulo ou contexto da cena (Opcional)')).addStringOption(o => o.setName('ambientacao').setDescription('Descrição da ambientação do local (Opcional)')).addAttachmentOption(o => o.setName('cenario').setDescription('Imagem ilustrativa do cenário (Opcional)'))),

    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Visualiza o ranking global de Arkandia'),

    new SlashCommandBuilder()
        .setName('guilda')
        .setDescription('Busca as informações de uma guilda')
        .addStringOption(o => o.setName('nome').setDescription('Nome ou sigla da guilda').setRequired(true)),

    new SlashCommandBuilder()
        .setName('missoes')
        .setDescription('Consulta a lista de missões ativas e abertas em Arkandia'),

    new SlashCommandBuilder()
        .setName('inventario')
        .setDescription('Visualiza o inventário de itens do personagem no site')
        .addUserOption(o => o.setName('jogador').setDescription('@jogador (Opcional)'))
        .addStringOption(o => o.setName('nome').setDescription('Nome exato do personagem (Opcional)')),

    new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Abre a sua central de jogador (HUD)')
].map(command => command.toJSON());

const commands = [...legacyCommands, ...client.commands.map(cmd => cmd.data.toJSON())];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
client.once('ready', async () => { 
    console.log(`✓ Bot logado como ${client.user.tag}!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
});

client.on('interactionCreate', async interaction => {
    // ⚔️ SEGURANÇA E FILTRO DO PAINEL DO MESTRE
    if (interaction.customId && (interaction.customId.startsWith('mestre_menu_') || interaction.customId.startsWith('modal_mestre_'))) {
        const isMaster = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
        if (!isMaster) {
            return await interaction.reply({ content: '✗ Apenas Mestres e Administradores podem interagir com os controles da HUD!', ephemeral: true });
        }
    }

    // 📂 1. SELEÇÕES DE MENUS DA HUD DO MESTRE
    if (interaction.isStringSelectMenu() && interaction.customId === 'mestre_menu_vtt') {
        const action = interaction.values[0];
        const channelId = interaction.channelId;
        const cena = cenasAtivas.get(channelId);

        if (action === 'iniciar_cena') {
            return await interaction.reply({ content: '💡 Para iniciar uma nova cena com mapa personalizado ou fundo em anexo, digite no chat:\n\n👉 `/cena iniciar`', ephemeral: true });
        }

        if (action === 'iniciar_arena') {
            return await interaction.reply({ content: '💡 Para iniciar o draft da Arena aproveitando o autocomplete de menções do Discord, digite no chat:\n\n👉 `/arena iniciar`', ephemeral: true });
        }

        if (action === 'combate_iniciar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.players.length === 0) return await interaction.reply({ content: '✗ Não há nenhum jogador na cena para iniciar o combate.', ephemeral: true });
            cena.estado = 'COMBATE';
            cena.rodada = 1;
            cena.turnoAtual = 0;
            await interaction.deferReply({ ephemeral: true });
            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: '✓ Combate INICIADO! Ordem de turnos trancada.' });
        }

        if (action === 'combate_proximo') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.estado !== 'COMBATE') return await interaction.reply({ content: '✗ O Combate não está ativo neste canal.', ephemeral: true });
            
            await interaction.deferReply({ ephemeral: true });
            do {
                cena.turnoAtual++;
                if (cena.turnoAtual >= cena.players.length) {
                    cena.turnoAtual = 0;
                    cena.rodada++;
                }
            } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
            
            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: `✓ Passou para o turno de **${cena.players[cena.turnoAtual].name}**.` });
        }

        if (action === 'status_vida') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_vida').setTitle('Status de Vida (Vivo/Morto)');
            const tokenInput = new TextInputBuilder().setCustomId('token_input').setLabel('Nome ou parte do nome do Token').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'mover_livre') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_teleport').setTitle('Teleportar Token');
            const tokenInput = new TextInputBuilder().setCustomId('token_input').setLabel('Nome do Token').setStyle(TextInputStyle.Short).setRequired(true);
            const posInput = new TextInputBuilder().setCustomId('pos_input').setLabel('Coordenada (ex: A1)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput), new ActionRowBuilder().addComponents(posInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'fechar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            cena.estado = 'FECHADA';
            return await interaction.reply({ content: '✓ Cena FECHADA. Ninguém mais entra via `/cena entrar`.', ephemeral: true });
        }

        if (action === 'encerrar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.msgId) {
                if (timersTurno.has(cena.msgId)) {
                    clearTimeout(timersTurno.get(cena.msgId));
                    timersTurno.delete(cena.msgId);
                }
                try { await (await interaction.channel.messages.fetch(cena.msgId)).delete(); } catch(e){}
            }
            cenasAtivas.delete(channelId);
            return await interaction.reply({ content: '✓ Tabuleiro VTT finalizado e cena apagada com sucesso!', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'mestre_menu_voz') {
        const action = interaction.values[0];
        const key = `${interaction.channelId}-${interaction.user.id}`;

        if (action === 'visualizar_perfil') {
            return await interaction.reply({ content: '💡 Para ver a ficha e os dados de combate de um jogador com facilidade, digite no chat:\n\n👉 `/perfil`', ephemeral: true });
        }

        if (action === 'visualizar_inventario') {
            return await interaction.reply({ content: '💡 Para visualizar a mochila e saldo de libras de um personagem, digite no chat:\n\n👉 `/inventario`', ephemeral: true });
        }

        if (action === 'assumir_npc') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_npc').setTitle('Assumir Voz de NPC');
            const npcInput = new TextInputBuilder().setCustomId('npc_input').setLabel('Nome do NPC/Criatura (Vazio = Narrador)').setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(npcInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'voltar_mestre') {
            if (mestresNarrando.has(key)) {
                mestresNarrando.delete(key);
                return await interaction.reply({ content: '👤 **Modo Interpretação Desabilitado!** Suas mensagens voltaram ao normal.', ephemeral: true });
            }
            return await interaction.reply({ content: 'ℹ Você não está interpretando nenhum NPC ou Narrador neste canal.', ephemeral: true });
        }

        if (action === 'consultar_bestiario') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_bestiario').setTitle('Consultar Bestiário Secreto');
            const nomeInput = new TextInputBuilder().setCustomId('nome_input').setLabel('Nome do NPC ou Monstro').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));
            await interaction.showModal(modal);
            return;
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'mestre_menu_economia') {
        const action = interaction.values[0];

        if (action === 'dropar_item') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_drop').setTitle('Dropar Item no Chat');
            const itemInput = new TextInputBuilder().setCustomId('item_input').setLabel('Nome do Item').setStyle(TextInputStyle.Short).setRequired(true);
            const qtdInput = new TextInputBuilder().setCustomId('qtd_input').setLabel('Quantidade').setStyle(TextInputStyle.Short).setValue('1').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(qtdInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'creditar_libras') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_libras').setTitle('Creditar Libras (Recompensa)');
            const charInput = new TextInputBuilder().setCustomId('char_input').setLabel('Nome do Personagem').setStyle(TextInputStyle.Short).setRequired(true);
            const valorInput = new TextInputBuilder().setCustomId('valor_input').setLabel('Quantidade de Libras').setStyle(TextInputStyle.Short).setRequired(true);
            const motivoInput = new TextInputBuilder().setCustomId('motivo_input').setLabel('Motivo da Recompensa').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(charInput), new ActionRowBuilder().addComponents(valorInput), new ActionRowBuilder().addComponents(motivoInput));
            await interaction.showModal(modal);
            return;
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'mestre_menu_ia') {
        const action = interaction.values[0];

        if (action === 'ia_descrever_ambiente') {
            if (!process.env.GEMINI_API_KEY) {
                return await interaction.reply({ content: '✗ Configure a chave GEMINI_API_KEY no arquivo .env para utilizar a IA Narrativa.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const channel = interaction.channel;
                const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
                const prompt = `Gere uma descrição narrativa de ambientação extremamente rica, poética, misteriosa e imersiva para a localidade "${channel.name}" que fica na região "${parentName}". Use o tom oficial de RPG de Arkandia, com lendas medievais arcanas. Escreva 2 parágrafos imersivos sem spoilers de enredo, ideais para introduzir um Roleplay.`;
                
                const instrucao = "Você é o Narrador oficial do RPG de Arkandia. Suas descrições são majestosas, envolvendo o leitor com detalhes sensoriais e mantendo a alta imersão medieval.";
                const narrativa = await gerarNarrativaIA(prompt, instrucao);

                const webhooks = await channel.fetchWebhooks();
                let webhook = webhooks.find(wh => wh.token);
                if (!webhook) {
                    webhook = await channel.createWebhook({ name: 'Arkandia System' });
                }

                await webhook.send({
                    content: narrativa,
                    username: 'Narrador',
                    avatarURL: 'https://i.imgur.com/2U5fPoy.png'
                });

                return await interaction.editReply({ content: '✓ Narração gerada por IA e postada no chat com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ content: `✗ Erro ao gerar narrativa com IA: ${e.message}` });
            }
        }

        if (action === 'ia_npc_fala') {
            const key = `${interaction.channelId}-${interaction.user.id}`;
            if (!mestresNarrando.has(key)) {
                return await interaction.reply({ content: '✗ Você precisa estar interpretando um NPC (Assumir NPC) antes de improvisar falas com IA.', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('modal_mestre_ia_npc_fala').setTitle('Improvisar Fala do NPC');
            const promptInput = new TextInputBuilder().setCustomId('prompt_input').setLabel('O que o NPC deve responder/fazer?').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(promptInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'ia_encontro') {
            if (!process.env.GEMINI_API_KEY) {
                return await interaction.reply({ content: '✗ Configure a chave GEMINI_API_KEY no arquivo .env para utilizar a IA Narrativa.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const channel = interaction.channel;
                const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
                const prompt = `Gere um encontro aleatório dramático, hostil e emocionante compatível com a região "${parentName}" (localidade "${channel.name}"). Sorteie ou descreva monstros compatíveis com a fauna e magia da área. Diga o que acontece na emboscada de forma poética e conclua sugerindo quais criaturas (monstros) e em quais posições no grid do VTT o Mestre deve invocar.`;
                
                const instrucao = "Você é o Guia do Mestre e Narrador do RPG de Arkandia. Suas ideias de encontros são eletrizantes, desafiadoras e visualmente marcantes.";
                const encontro = await gerarNarrativaIA(prompt, instrucao);

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle('🧠 Encontro Aleatório Sorteado pela IA')
                    .setDescription(encontro)
                    .setFooter({ text: 'Assistente do Mestre • Gemini AI' });

                await interaction.channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✓ Encontro aleatório gerado com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ content: `✗ Erro ao gerar encontro com IA: ${e.message}` });
            }
        }
    }

    // 📥 2. SUBMISSÕES DE MODAIS DO PAINEL DO MESTRE
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_mestre_vtt_vida') {
            const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
            const cena = cenasAtivas.get(interaction.channelId);
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });

            const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
            if (!token) return await interaction.reply({ content: `✗ Ninguém com "${nameInput}" foi encontrado no grid.`, ephemeral: true });

            token.incapacitado = !token.incapacitado;
            await interaction.deferReply({ ephemeral: true });
            atualizarMapaDebounced(interaction.channel, cena);
            return await interaction.editReply({ content: `✓ Status de **${token.name}** alterado para: ${token.incapacitado ? 'Incapacitado 💀' : 'Vivo ❤️'}.` });
        }

        if (interaction.customId === 'modal_mestre_vtt_teleport') {
            const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
            const coord = interaction.fields.getTextInputValue('pos_input').toUpperCase().trim();
            const cena = cenasAtivas.get(interaction.channelId);
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });

            const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
            if (!token) return await interaction.reply({ content: `✗ Ninguém com "${nameInput}" foi encontrado no grid.`, ephemeral: true });

            const pos = parsePosicao(coord);
            if (!pos) return await interaction.reply({ content: '✗ Coordenada inválida. Use Letra+Número (ex: A1).', ephemeral: true });

            token.x = Math.max(0, Math.min(cena.colunas - 1, pos.x));
            token.y = Math.max(0, Math.min(cena.linhas - 1, pos.y));

            await interaction.deferReply({ ephemeral: true });
            atualizarMapaDebounced(interaction.channel, cena);
            return await interaction.editReply({ content: `✓ Token **${token.name}** teleportado para a coordenada **${coord}** com sucesso!` });
        }

        if (interaction.customId === 'modal_mestre_voz_npc') {
            const nomeInput = interaction.fields.getTextInputValue('npc_input').trim();
            const key = `${interaction.channelId}-${interaction.user.id}`;

            if (!nomeInput) {
                mestresNarrando.set(key, {
                    nome: 'Narrador',
                    avatarUrl: 'https://i.imgur.com/2U5fPoy.png'
                });
                return await interaction.reply({ content: '🗣️ **Modo Narrador Habilitado!** Todas as suas mensagens no chat sairão como **Narrador**.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            try {
                try {
                    const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                    mestresNarrando.set(key, {
                        nome: res.data.titulo ? `${res.data.nome}, ${res.data.titulo}` : res.data.nome,
                        avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png'
                    });
                    return await interaction.editReply({ content: `🗣️ **Modo Interpretação Habilitado!** Suas mensagens sairão como o NPC **${res.data.nome}**.` });
                } catch (eNpc) {
                    if (eNpc.response?.status === 404) {
                        const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                        mestresNarrando.set(key, {
                            nome: resBestia.data.nome,
                            avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png'
                        });
                        return await interaction.editReply({ content: `🗣️ **Modo Interpretação Habilitado!** Suas mensagens sairão como a criatura **${resBestia.data.nome}**.` });
                    } else {
                        throw eNpc;
                    }
                }
            } catch(e) {
                return await interaction.editReply({ content: `✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nomeInput}".` });
            }
        }

        if (interaction.customId === 'modal_mestre_voz_bestiario') {
            const nome = interaction.fields.getTextInputValue('nome_input').trim();
            await interaction.deferReply({ ephemeral: true });
            try {
                try {
                    const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY }});
                    const npc = res.data;
                    const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                    const embed = new EmbedBuilder()
                        .setColor(0x2A2320)
                        .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                        .setTitle(`🕮 ${npc.nome} ${npc.titulo ? '- ' + npc.titulo : ''}`)
                        .setDescription(`**Raça:** ${primeiraMaiuscula(npc.raca)} | **Classe:** ${primeiraMaiuscula(npc.classe)} | **Rank:** ${npc.rank}\n**Região:** ${primeiraMaiuscula(npc.regiao)} | **Afiliação:** ${npc.afiliacao || 'Nenhuma'}\n\n*${npc.flavor_text || ''}*\n\n${npc.lore ? npc.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                    if (npc.retrato_url) embed.setThumbnail(npc.retrato_url);
                    return await interaction.editReply({ embeds: [embed] });
                } catch (eNpc) {
                    if (eNpc.response?.status === 404) {
                        const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY } });
                        const criatura = resBestia.data;
                        
                        const tierMap = { 1: 'Comum', 2: 'Raro', 3: 'Épico', 4: 'Lendário', 5: 'Mítico' };
                        const corTier = { 1: 0x6B7280, 2: 0x3B82F6, 3: 0x8B5CF6, 4: 0xF59E0B, 5: 0xC41E3A };
                        
                        const cor = corTier[criatura.classificacao] || 0x34495E;
                        const tier = tierMap[criatura.classificacao] || 'Desconhecido';
                        const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                        
                        const embed = new EmbedBuilder()
                            .setColor(cor)
                            .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                            .setTitle(`🕮 ${criatura.nome}`)
                            .setDescription(`**Tipo:** ${primeiraMaiuscula(criatura.tipo)} | **Classificação:** ${tier}\n\n${criatura.lore ? criatura.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                        if (criatura.ilustracao_url) embed.setThumbnail(criatura.ilustracao_url);
                        
                        return await interaction.editReply({ embeds: [embed] });
                    } else {
                        throw eNpc;
                    }
                }
            } catch(e) {
                return await interaction.editReply({ content: `✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nome}".` });
            }
        }

        if (interaction.customId === 'modal_mestre_economia_drop') {
            const itemNome = interaction.fields.getTextInputValue('item_input').trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('qtd_input') || '1', 10) || 1;
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await axios.get(`${ARKANDIA_API}/itens/${encodeURIComponent(itemNome)}`, { headers: { 'X-API-Key': API_KEY } });
                const item = res.data;
                
                const buffer = await gerarBannerLoot(item, qtd);
                const attachment = new AttachmentBuilder(buffer, { name: 'loot.png' });
                
                const raridades = { comum: 0x8B949E, raro: 0x3498DB, epico: 0x8B5CF6, lendario: 0xF59E0B, mitico: 0xE74C3C };
                const embed = new EmbedBuilder()
                    .setColor(raridades[item.raridade?.toLowerCase()] || 0xB8860B)
                    .setImage('attachment://loot.png');
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('◈ Coletar Item').setStyle(ButtonStyle.Success)
                );
                
                await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
                return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat com sucesso!')] });
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" não encontrado no catálogo da API.`)] });
            }
        }

        if (interaction.customId === 'modal_mestre_economia_libras') {
            const charName = interaction.fields.getTextInputValue('char_input').trim();
            const valor = parseInt(interaction.fields.getTextInputValue('valor_input'), 10) || 0;
            const motivo = interaction.fields.getTextInputValue('motivo_input').trim();

            await interaction.deferReply({ ephemeral: true });
            try {
                const resChar = await axios.get(`${ARKANDIA_API}/personagens/${encodeURIComponent(charName)}`, { headers: { 'X-API-Key': API_KEY } });
                const p = resChar.data;
                if (!p) return await interaction.editReply({ embeds: [embedErro(`Personagem "${charName}" não encontrado.`)] });

                const { randomUUID } = require('crypto');
                const idempotencyKey = randomUUID();
                
                const resPost = await axios.post(
                    `${ARKANDIA_API}/personagens/${p.id}/libras/creditar`,
                    { quantidade: valor, motivo },
                    {
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Idempotency-Key': idempotencyKey,
                            'User-Agent': 'rpg-bot/1.0'
                        }
                    }
                ).catch(() => null);

                const embed = new EmbedBuilder()
                    .setColor(0xD4AF37)
                    .setTitle('🪙 Recompensa de Libras Autorizada')
                    .setDescription(`✓ **${valor.toLocaleString('pt-BR')} Libras** foram creditadas com sucesso para **${p.nome}**!\n\n**Motivo:** ${motivo}`)
                    .setFooter({ text: 'Recompensa Aprovada via Central de Controle' });

                await interaction.channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✓ Recompensa de Libras efetuada e postada no chat com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao processar o crédito de Libras: ${e.response?.data?.error || e.message}`)] });
            }
        }

        if (interaction.customId === 'modal_mestre_ia_npc_fala') {
            const promptInput = interaction.fields.getTextInputValue('prompt_input').trim();
            const key = `${interaction.channelId}-${interaction.user.id}`;
            
            if (!mestresNarrando.has(key)) {
                return await interaction.reply({ content: '✗ Você precisa estar interpretando um NPC antes de improvisar falas.', ephemeral: true });
            }
            
            const npc = mestresNarrando.get(key);
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const channel = interaction.channel;
                const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
                
                const systemPrompt = `Você é o NPC "${npc.nome}" do universo RPG de Arkandia, localizado na região "${parentName}" (localidade "${channel.name}"). Responda de forma in-character, mantendo sua personalidade, sotaque, tom e modo de agir medievais. Mantenha a resposta imersiva, rica e coerente com a lore oficial de Arkandia. Responda em no máximo 1 ou 2 parágrafos envolventes.`;
                
                const respostaIA = await gerarNarrativaIA(promptInput, systemPrompt);

                const webhooks = await channel.fetchWebhooks();
                let webhook = webhooks.find(wh => wh.token);
                if (!webhook) {
                    webhook = await channel.createWebhook({ name: 'Arkandia System' });
                }

                await webhook.send({
                    content: respostaIA,
                    username: npc.nome,
                    avatarURL: npc.avatarUrl
                });

                return await interaction.editReply({ content: '✓ Fala improvisada por IA enviada com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ content: `✗ Erro ao gerar fala improvisada com IA: ${e.message}` });
            }
        }
    }

    // BOTÕES DE CENA (MOVER)
    if (interaction.isButton() && interaction.customId.startsWith('move_')) {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

        const token = cena.players[pIndex];
        if (token.incapacitado) return await interaction.reply({ content: '✗ Você está incapacitado e não pode se mover.', ephemeral: true });

        // Validação de Turno
        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `✗ Não é o seu turno! Agora é o turno de **${cena.players[cena.turnoAtual].name}**.`, ephemeral: true });
        }

        const dir = interaction.customId.replace('move_', '');
        if (dir === 'up') token.y = Math.max(0, token.y - 1);
        if (dir === 'down') token.y = Math.min(cena.linhas - 1, token.y + 1);
        if (dir === 'left') token.x = Math.max(0, token.x - 1);
        if (dir === 'right') token.x = Math.min(cena.colunas - 1, token.x + 1);

        await interaction.deferUpdate();
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'passar_turno') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena || cena.estado !== 'COMBATE') return await interaction.reply({ content: '✗ Não há combate ativo.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1 || cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `✗ Não é o seu turno!`, ephemeral: true });
        }

        await interaction.deferUpdate();
        
        do {
            cena.turnoAtual++;
            if (cena.turnoAtual >= cena.players.length) {
                cena.turnoAtual = 0;
                cena.rodada++;
            }
        } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
        
        await repintarMapaNovo(interaction.channel, cena);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'modal_mover_coord') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

        if (cena.players[pIndex].incapacitado) return await interaction.reply({ content: '✗ Você está incapacitado e não pode se mover.', ephemeral: true });

        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `✗ Não é o seu turno!`, ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId('modal_mover_coord_submit').setTitle('Mover para Coordenada');
        const coordInput = new TextInputBuilder().setCustomId('coord_input').setLabel('Coordenada (ex: A1)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(coordInput));
        
        await interaction.showModal(modal);
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_skill') {
        const cacheData = skillsCache.get(interaction.message.id);
        if (!cacheData) return interaction.reply({ content: '✗ Cache expirado.', ephemeral: true });

        const skillId = interaction.values[0];
        const skill = cacheData.skills.find(s => s.id === skillId);
        
        const skillEmbed = new EmbedBuilder()
            .setColor(0x2B4C7E)
            .setTitle(`✦ ${formatarTexto(skill.nome)} (Grau ${skill.grau})`)
            .setDescription(`**Tipo:** ${formatarTexto(skill.tipo)} | **Origem:** ${formatarTexto(skill.origem)}\n\n${skill.descricao}`);
        
        if (skill.imagem_url) skillEmbed.setThumbnail(skill.imagem_url);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`conjurar_skill_${skill.id}`).setLabel('✦ Conjurar Skill').setStyle(ButtonStyle.Success)
        );

        await interaction.update({ embeds: [skillEmbed], components: [interaction.message.components[0], row] });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_catalogo_')) {
        return; // handled by dynamic router
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_profile_skill') {
        const cacheData = skillsCache.get(interaction.message.id);
        if (!cacheData) return interaction.reply({ embeds: [embedErro('Cache expirado.')], ephemeral: true });

        const skillId = interaction.values[0];
        const skill = cacheData.skills.find(s => s.id === skillId);
        
        if (!skill) return interaction.reply({ embeds: [embedErro('Habilidade não encontrada no perfil.')], ephemeral: true });

        const skillEmbed = new EmbedBuilder()
            .setColor(0x2B4C7E)
            .setTitle(`✦ ${formatarTexto(skill.nome)} (Grau ${skill.grau})`)
            .setDescription(`**Tipo:** ${formatarTexto(skill.tipo)} | **Origem:** ${formatarTexto(skill.origem)}\n\n${skill.descricao}`);
        
        if (skill.imagem_url) skillEmbed.setThumbnail(skill.imagem_url);
        
        await interaction.reply({ embeds: [skillEmbed], ephemeral: true });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('pegar_loot_')) {
        const msgId = interaction.message.id;

        // 1. Verificar se o loot já foi coletado
        if (lootsColetados.has(msgId)) {
            return await interaction.reply({ embeds: [embedErro('Este loot já foi coletado por outro jogador!')], ephemeral: true });
        }

        // 2. Verificar se está em processamento
        if (lootsEmProcessamento.has(msgId)) {
            return await interaction.reply({ embeds: [embedErro('Este loot está sendo coletado neste momento. Tente novamente em alguns segundos.')], ephemeral: true });
        }

        // Marcar como em processamento para travar cliques concorrentes
        lootsEmProcessamento.add(msgId);

        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_');
        const itemId = parts[2];
        const qtd = parseInt(parts[3] || '1', 10);

        try {
            // 3. Buscar o personagem do jogador pelo Discord ID
            let personagem;
            try {
                const resUser = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
                personagem = resUser.data;
            } catch (errUser) {
                lootsEmProcessamento.delete(msgId);
                if (errUser.response?.status === 404) {
                    return await interaction.editReply({ embeds: [embedErro('Você não possui um personagem ativo cadastrado no site de Arkandia. Por favor, vincule seu Discord no site antes de coletar o loot.')] });
                }
                return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar seu personagem na API: ${errUser.response?.data?.error || errUser.message}`)] });
            }

            // 4. Adicionar o item ao inventário do personagem via POST
            const { randomUUID } = require('crypto');
            const idempotencyKey = randomUUID();

            try {
                const resPost = await axios.post(
                    `${ARKANDIA_API}/personagens/${personagem.id}/inventario/adicionar`,
                    { item_id: itemId, quantidade: qtd },
                    {
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Idempotency-Key': idempotencyKey,
                            'User-Agent': 'rpg-bot/1.0'
                        }
                    }
                );

                if (resPost.data.ok) {
                    // Marcar como coletado e remover de em processamento
                    lootsColetados.add(msgId);
                    lootsEmProcessamento.delete(msgId);

                    // Atualiza a mensagem original para desabilitar o botão e mostrar quem coletou
                    await interaction.message.edit({
                        content: `✦ **${interaction.user.toString()}** (${personagem.nome}) coletou o item e ele foi adicionado ao seu inventário no site!`,
                        components: []
                    });

                    return await interaction.editReply({ embeds: [embedSucesso(`Você coletou **${resPost.data.item_nome} (x${qtd})** com sucesso! O item já está no seu inventário do site.`)] });
                } else {
                    lootsEmProcessamento.delete(msgId);
                    return await interaction.editReply({ embeds: [embedErro(`Erro da API ao adicionar o item: ${resPost.data.error || 'Erro desconhecido'}`)] });
                }
            } catch (errPost) {
                lootsEmProcessamento.delete(msgId);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao registrar o item no seu inventário: ${errPost.response?.data?.error || errPost.message}`)] });
            }
        } catch (e) {
            lootsEmProcessamento.delete(msgId);
            console.error('Erro na coleta de loot:', e);
            return await interaction.editReply({ embeds: [embedErro('Ocorreu um erro interno ao processar a coleta do loot.')] });
        }
    }

    if (interaction.isButton() && interaction.customId === 'missao_pronto') {
        const missao = missoesPreparacao.get(interaction.message.id);
        if (!missao) return await interaction.reply({ content: '✗ Não há nenhuma missão em preparação nesta mensagem.', ephemeral: true });

        const pIndex = missao.jogadores.findIndex(p => p.id === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não faz parte desta missão.', ephemeral: true });

        if (missao.jogadores[pIndex].pronto) return await interaction.reply({ content: '✓ Você já está pronto.', ephemeral: true });

        missao.jogadores[pIndex].pronto = true;

        const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0]);
        let descricao = `Os jogadores abaixo foram convocados. Confirme que você está pronto!\n\n`;
        let todosProntos = true;
        for (const p of missao.jogadores) {
            const status = p.pronto ? '[x]' : '[ ]';
            descricao += `${status} **[${p.nomePersonagem}]** <@${p.id}>\n`;
            if (!p.pronto) todosProntos = false;
        }

        if (todosProntos) {
            descricao += `\n**Todos os jogadores estão prontos!** O Mestre já pode usar \`/missao iniciar\`.`;
        }

        embedOriginal.setDescription(descricao);
        await interaction.update({ embeds: [embedOriginal] });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'config_mapa_categorias') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });
        
        mapaConfig = interaction.values;
        fs.writeFileSync('mapa_config.json', JSON.stringify(mapaConfig, null, 2), 'utf8');
        
        await interaction.update({ content: `✓ **Configuração Salva!**\nO mapa agora exibe ${mapaConfig.length} região(ões) configurada(s).`, components: [] });
        return;
    }

    if (interaction.isButton() && interaction.customId === 'btn_mapa_viajar') {
        const canaisTexto = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.parentId);
        const parentIds = new Set(canaisTexto.map(c => c.parentId));
        
        const categorias = interaction.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory && parentIds.has(c.id) && (mapaConfig.length === 0 || mapaConfig.includes(c.id)))
            .sort((a, b) => a.position - b.position)
            .first(25);
            
        const options = categorias.map(c => ({ label: `❖ ${c.name.substring(0, 95)}`, value: c.id }));
        if (options.length === 0) return await interaction.reply({ content: '✗ Nenhuma região configurada no servidor.', ephemeral: true });
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_mapa_categoria')
            .setPlaceholder('Selecione uma Região...')
            .addOptions(options);
            
        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.reply({ content: 'Para onde você deseja viajar? Selecione a região abaixo:', components: [row], ephemeral: true });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_mapa_categoria') {
        const destinoId = interaction.values[0];
        const destino = interaction.guild.channels.cache.get(destinoId);
        
        if (!destino) return await interaction.update({ content: '✗ A região selecionada não existe mais.', components: [] });
        
        await interaction.update({ content: '⧖ Viajando...', components: [] });
        
        const oldChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory);
        for (const [id, ch] of oldChannels) {
            const overwrite = ch.permissionOverwrites.cache.get(interaction.user.id);
            if (overwrite && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
                try { await ch.permissionOverwrites.delete(interaction.user.id); } catch(e) {}
            }
        }
        
        try {
            await destino.permissionOverwrites.create(interaction.user.id, { ViewChannel: true });
            
            await interaction.editReply({ content: `✓ **Você viajou para a região ${destino.name}!** Todos os locais da área revelaram-se para você na barra lateral.` });
        } catch (e) {
            await interaction.editReply({ content: `✗ Erro ao viajar. Certifique-se que o bot tem permissão de "Gerenciar Canais" e "Gerenciar Cargos" no servidor.` });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'btn_mapa_sair') {
        await interaction.reply({ content: '⧖ Saindo da região...', ephemeral: true });
        
        const oldChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory);
        let removed = 0;
        for (const [id, ch] of oldChannels) {
            const overwrite = ch.permissionOverwrites.cache.get(interaction.user.id);
            if (overwrite && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
                try { 
                    await ch.permissionOverwrites.delete(interaction.user.id); 
                    removed++;
                } catch(e) {}
            }
        }
        
        if (removed > 0) {
            await interaction.editReply({ content: `✓ **Você saiu da área de Roleplay.** A região onde você estava foi ocultada da barra lateral.` });
        } else {
            await interaction.editReply({ content: `ℹ Você não estava em nenhuma região restrita no momento.` });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('conjurar_skill_')) {
        const skillId = interaction.customId.replace('conjurar_skill_', '');
        const cacheData = skillsCache.get(interaction.message.id);
        
        if (!cacheData) return interaction.reply({ content: '✗ Essa mensagem expirou.', ephemeral: true });

        const skill = cacheData.skills.find(s => s.id === skillId);
        if (!skill) return interaction.reply({ content: '✗ Skill não encontrada.', ephemeral: true });

        const embedSkill = EmbedBuilder.from(interaction.message.embeds[0]);

        await interaction.channel.send({ 
            content: `✦ **${formatarTexto(cacheData.personagem.nome)}** está canalizando sua energia e conjura a skill **[${formatarTexto(skill.nome)}]**!`, 
            embeds: [embedSkill] 
        });
        
        return await interaction.reply({ content: '✓ Skill conjurada publicamente!', ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('ranking_switch_')) {
        await interaction.deferUpdate();
        const tipo = interaction.customId.replace('ranking_switch_', '');
        try {
            const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
            const buffer = await gerarBannerRanking(tipo, res.data);
            const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://ranking.png');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ranking_switch_poder').setLabel('Poder').setStyle(tipo === 'poder' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ranking_switch_nivel').setLabel('Nível').setStyle(tipo === 'nivel' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ranking_switch_guildas').setLabel('Guildas').setStyle(tipo === 'guildas' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ranking_switch_arena').setLabel('Arena').setStyle(tipo === 'arena' ? ButtonStyle.Success : ButtonStyle.Secondary)
            );

            return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
        } catch (e) {
            console.error(e);
            return await interaction.followUp({ embeds: [embedErro(`Erro ao atualizar ranking para ${tipo}: ${e.message}`)], ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('missoes_inscritos_')) {
        const missaoId = interaction.customId.replace('missoes_inscritos_', '');
        await interaction.deferReply({ ephemeral: true });
        try {
            const resInscritos = await axios.get(`${ARKANDIA_API}/missoes/${missaoId}/inscritos`, { headers: { 'X-API-Key': API_KEY } });
            const confirmados = resInscritos.data.confirmados || [];

            if (confirmados.length === 0) {
                return await interaction.editReply({ embeds: [embedErro('Nenhum aventureiro confirmado ou inscrito nesta missão ainda.')] });
            }

            const listaInscritos = confirmados.map((c, idx) => {
                const nomePersonagem = c.personagem ? c.personagem.nome : 'Desconhecido';
                const discStr = c.discord_id || (c.personagem && c.personagem.discord_id) ? `<@${c.discord_id || c.personagem.discord_id}>` : '*Sem Discord*';
                const racaClasse = c.personagem ? ` (${formatarTexto(c.personagem.raca)} • ${formatarTexto(c.personagem.classe)})` : '';
                return `${idx + 1}. **${formatarTexto(nomePersonagem)}** ${discStr}${racaClasse}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x4A2B7E)
                .setTitle('👥 Aventureiros Convocados')
                .setDescription(`Estes são os heróis confirmados para esta expedição:\n\n${listaInscritos}`);

            return await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.error(e);
            return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar inscritos: ${e.message}`)] });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('jogador_menu_')) {
        const menu = interaction.customId.replace('jogador_menu_', '');
        
        if (menu === 'guilda') {
            return await interaction.reply({ content: '✦ Para buscar os dados de uma guilda, digite no chat: `/guilda nome:`', ephemeral: true });
        }
        
        if (menu === 'rp') {
            return await interaction.reply({ content: '✦ Para iniciar uma cena de RP marcando os jogadores, digite no chat: `/rp iniciar`', ephemeral: true });
        }
        
        if (menu === 'missoes') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await axios.get(`${ARKANDIA_API}/missoes`, { headers: { 'X-API-Key': API_KEY } });
                const missoes = res.data.filter(m => m.status === 'aberta');
                
                if (missoes.length === 0) return await interaction.editReply({ content: '✦ Não há missões abertas no momento.' });
                
                const embed = new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle('✦ Quadro de Missões de Arkandia ✦')
                    .setDescription(missoes.map(m => `**[${m.ranque || 'D'}]** ${m.nome}\n*${m.descricao || 'Sem descrição'}*`).join('\n\n'));
                return await interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro('Erro ao buscar as missões.')] });
            }
        }
        
        if (menu === 'ranking') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await axios.get(`${ARKANDIA_API}/rankings/poder`, { headers: { 'X-API-Key': API_KEY } });
                const buffer = await gerarBannerRanking('poder', res.data);
                const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });
                
                const embed = new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setImage('attachment://ranking.png');
                    
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ranking_switch_poder').setLabel('Poder').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('ranking_switch_riqueza').setLabel('Riqueza').setStyle(ButtonStyle.Secondary)
                );
                
                return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro('Erro ao buscar o ranking.')] });
            }
        }
        
        if (menu === 'perfil') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
                const p = res.data;
                if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
                
                const buffer = await gerarBannerPerfil(p);
                const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
                
                const embed = new EmbedBuilder()
                    .setColor(p.indice_poder_cor || 0x3498DB)
                    .setImage('attachment://perfil.png');
                    
                return await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu perfil.')] });
            }
        }
        
        if (menu === 'inventario') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
                const p = res.data;
                if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
                
                const itens = p.inventario || p.itens || [];
                const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
                skillsCache.set(cacheKey, { personagem: p, itens });
                
                return await renderInventarioPage(interaction, p, itens, 'todos', 0);
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu inventário.')] });
            }
        }
    }

    if (interaction.isButton() && (interaction.customId.startsWith('inv_cat_') || interaction.customId.startsWith('inv_pag_'))) {
        const isCat = interaction.customId.startsWith('inv_cat_');
        
        let personagemId, categoria, pagina;
        if (isCat) {
            const parts = interaction.customId.split('_');
            personagemId = parts[2];
            categoria = parts[3];
            pagina = 0;
        } else {
            const parts = interaction.customId.split('_');
            personagemId = parts[2];
            categoria = parts[3];
            pagina = parseInt(parts[4] || '0', 10);
        }

        const cacheKey = `inventario_${interaction.user.id}_${personagemId}`;
        const cacheData = skillsCache.get(cacheKey);

        if (!cacheData) {
            return await interaction.reply({ embeds: [embedErro('Sua sessão de inventário expirou. Por favor, execute o comando `/inventario` novamente.')], ephemeral: true });
        }

        await interaction.deferUpdate();
        return await renderInventarioPage(interaction, cacheData.personagem, cacheData.itens, categoria, pagina);
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('preview_resize_submit_')) {
            const previewId = interaction.customId.replace('preview_resize_submit_', '');
            const cena = cenasAtivas.get(previewId);
            if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });
            
            const colunas = parseInt(interaction.fields.getTextInputValue('colunas_input'), 10);
            const linhas = parseInt(interaction.fields.getTextInputValue('linhas_input'), 10);
            
            if (colunas > 0 && linhas > 0) {
                cena.colunas = colunas;
                cena.linhas = linhas;
                
                for (const p of cena.players) {
                    p.x = Math.min(p.x, colunas - 1);
                    p.y = Math.min(p.y, linhas - 1);
                }
            }

            await interaction.deferUpdate();
            const bufferPreview = await renderMap(cena);
            const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
            await interaction.editReply({ files: [attachmentPreview] });
            return;
        }

        if (interaction.customId.startsWith('preview_pos_submit_')) {
            const previewId = interaction.customId.replace('preview_pos_submit_', '');
            const cena = cenasAtivas.get(previewId);
            if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

            for (let i = 0; i < cena.players.length; i++) {
                try {
                    const coord = interaction.fields.getTextInputValue(`pos_input_${i}`).toUpperCase().trim();
                    const letras = coord.match(/[A-Z]+/);
                    const numeros = coord.match(/[0-9]+/);
                    if (letras && numeros) {
                        let letra = letras[0];
                        let nx = 0;
                        for (let j = 0; j < letra.length; j++) {
                            nx = nx * 26 + (letra.charCodeAt(j) - 64);
                        }
                        nx -= 1;
                        let ny = parseInt(numeros[0], 10) - 1;
                        if (nx >= 0 && ny >= 0 && nx < cena.colunas && ny < cena.linhas) {
                            cena.players[i].x = nx;
                            cena.players[i].y = ny;
                        }
                    }
                } catch(e) {}
            }

            await interaction.deferUpdate();
            const bufferPreview = await renderMap(cena);
            const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
            await interaction.editReply({ files: [attachmentPreview] });
            return;
        }

        if (interaction.customId === 'modal_mover_coord_submit') {
            const coord = interaction.fields.getTextInputValue('coord_input').toUpperCase().trim();
            const cena = cenasAtivas.get(interaction.channelId);
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

            const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
            if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

            const token = cena.players[pIndex];

            const letras = coord.match(/[A-Z]+/);
            const numeros = coord.match(/[0-9]+/);
            if (!letras || !numeros) return await interaction.reply({ content: '✗ Coordenada inválida. Use o formato Letra+Número (ex: A1).', ephemeral: true });

            let letra = letras[0];
            let nx = 0;
            for (let i = 0; i < letra.length; i++) {
                nx = nx * 26 + (letra.charCodeAt(i) - 64);
            }
            nx -= 1;
            let ny = parseInt(numeros[0], 10) - 1;

            if (nx < 0 || ny < 0 || nx >= cena.colunas || ny >= cena.linhas) {
                return await interaction.reply({ content: '✗ Coordenada fora dos limites do mapa.', ephemeral: true });
            }

            token.x = nx;
            token.y = ny;

            await interaction.deferUpdate();
            atualizarMapaDebounced(interaction.channel, cena);
            return;
        }
        return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('preview_resize_')) {
        const previewId = interaction.customId.replace('preview_resize_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`preview_resize_submit_${previewId}`).setTitle('Redimensionar Mapa');
        const colInput = new TextInputBuilder().setCustomId('colunas_input').setLabel('Colunas (Largura)').setStyle(TextInputStyle.Short).setValue(cena.colunas.toString()).setRequired(true);
        const linInput = new TextInputBuilder().setCustomId('linhas_input').setLabel('Linhas (Altura)').setStyle(TextInputStyle.Short).setValue(cena.linhas.toString()).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(colInput), new ActionRowBuilder().addComponents(linInput));
        
        await interaction.showModal(modal);
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('preview_pos_')) {
        const previewId = interaction.customId.replace('preview_pos_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`preview_pos_submit_${previewId}`).setTitle('Mover Jogadores');
        for (let i = 0; i < Math.min(cena.players.length, 5); i++) {
            const p = cena.players[i];
            const letra = String.fromCharCode(65 + p.x);
            const numero = p.y + 1;
            const posInput = new TextInputBuilder().setCustomId(`pos_input_${i}`).setLabel(`Posição de ${p.name} (ex: A1)`).setStyle(TextInputStyle.Short).setValue(`${letra}${numero}`).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(posInput));
        }
        
        await interaction.showModal(modal);
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('preview_start_')) {
        const previewId = interaction.customId.replace('preview_start_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        await interaction.deferUpdate();

        cena.isPreview = false;
        cena.estado = 'COMBATE';
        
        const cid = cena.channelIdOriginal;
        cenasAtivas.set(cid, cena);
        cenasAtivas.delete(previewId);

        const channel = interaction.guild.channels.cache.get(cid);
        if (channel) {
            await repintarMapaNovo(channel, cena);
        }

        await interaction.editReply({ content: '✅ Arena inicializada e enviada para o canal oficial!', components: [] });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('arena_ban_')) {
        const draft = arenasDraft.get(interaction.message.id);
        if (!draft) return await interaction.reply({ content: '✗ Este draft já terminou ou expirou.', ephemeral: true });

        const capitaoAtual = draft.capitaes[draft.turnoCapitao];
        if (interaction.user.id !== capitaoAtual) return await interaction.reply({ content: `✗ Não é a sua vez! É a vez de <@${capitaoAtual}>.`, ephemeral: true });

        const mapaId = interaction.customId.replace('arena_ban_', '');
        const mapaIndex = draft.mapasRestantes.findIndex(m => m.id === mapaId);
        if (mapaIndex === -1) return await interaction.reply({ content: '✗ Este mapa já foi banido.', ephemeral: true });

        const mapaBanido = draft.mapasRestantes.splice(mapaIndex, 1)[0];
        draft.turnoCapitao = draft.turnoCapitao === 0 ? 1 : 0;

        if (draft.mapasRestantes.length === 1) {
            const mapaEscolhido = draft.mapasRestantes[0];
            arenasDraft.delete(interaction.message.id);

            const buffer = await renderDraft(draft);
            const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

            const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0])
                .setDescription(`**${mapaBanido.nome}** foi banido.\n\n❖ O mapa escolhido foi: **${mapaEscolhido.nome}**! O Mestre está configurando o mapa...`);
            await interaction.update({ embeds: [embedOriginal], files: [attachment], components: [] });

            const previewId = "preview_" + interaction.message.id;
            let fundoUsado = mapaEscolhido.fundoUrl;
            if (fs.existsSync(fundoUsado.replace('.png', ' - Tabletop Version.png'))) {
                fundoUsado = fundoUsado.replace('.png', ' - Tabletop Version.png');
            }

            cenasAtivas.set(previewId, {
                isPreview: true,
                linhas: mapaEscolhido.linhas,
                colunas: mapaEscolhido.colunas,
                fundoUrl: fundoUsado,
                estado: 'CONFIGURACAO',
                rodada: 1,
                turnoAtual: 0,
                players: [],
                msgId: null,
                tempoTurnoMs: draft.tempoTurnoMs,
                channelIdOriginal: interaction.channelId
            });

            const cena = cenasAtivas.get(previewId);
            
            try {
                for (let i = 0; i < draft.capitaes.length; i++) {
                    const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${draft.capitaes[i]}`, { headers: { 'X-API-Key': API_KEY } }).catch(() => null);
                    if (res && res.data) {
                        cena.players.push({
                            discordId: draft.capitaes[i],
                            name: res.data.nome,
                            avatarUrl: res.data.avatar_url || 'https://i.imgur.com/vHqB3q0.png',
                            x: i === 0 ? 0 : mapaEscolhido.colunas - 1,
                            y: i === 0 ? 0 : mapaEscolhido.linhas - 1,
                            isNpc: false,
                            incapacitado: false
                        });
                    }
                }
            } catch(e) { console.error('Erro ao adicionar jogadores na arena', e); }

            const bufferPreview = await renderMap(cena);
            const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
            
            const rowSetup = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`preview_resize_${previewId}`).setLabel('⌖ Redimensionar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`preview_pos_${previewId}`).setLabel('⌖ Mover Jogadores').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`preview_start_${previewId}`).setLabel('⚔ Iniciar Oficial').setStyle(ButtonStyle.Success)
            );

            await interaction.followUp({ content: `⚙ **Preview do Mestre:** Configure as posições e o tamanho do mapa tabletop antes de enviar aos jogadores.`, files: [attachmentPreview], components: [rowSetup], ephemeral: true });
            return;
        }

        const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0])
            .setDescription(`**${mapaBanido.nome}** foi banido por <@${interaction.user.id}>.\n\nÉ a vez de <@${draft.capitaes[draft.turnoCapitao]}> banir um mapa!`);

        const rows = [];
        let currentRow = new ActionRowBuilder();
        draft.mapasRestantes.forEach((mapa, index) => {
            currentRow.addComponents(new ButtonBuilder().setCustomId(`arena_ban_${mapa.id}`).setLabel(`Banir ${mapa.nome}`).setStyle(ButtonStyle.Danger));
            if (currentRow.components.length === 5 || index === draft.mapasRestantes.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        const buffer = await renderDraft(draft);
        const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

        await interaction.update({ embeds: [embedOriginal], files: [attachment], components: rows });
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'arena') {
        const sub = interaction.options.getSubcommand();
        const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
        if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });

        if (sub === 'iniciar') {
            const jogadoresRaw = interaction.options.getString('jogadores');
            const tempoTurno = interaction.options.getInteger('tempo_turno');

            const regex = /<@!?(\d+)>/g;
            const matches = [...jogadoresRaw.matchAll(regex)];
            const capitaesIds = matches.map(m => m[1]).slice(0, 2);

            if (capitaesIds.length < 2) return await interaction.reply({ content: '✗ Você precisa mencionar pelo menos 2 jogadores (@J1 @J2) para serem os capitães do Draft.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle('⚔ Arena - Fase de Picks & Bans')
                .setDescription(`Capitães: <@${capitaesIds[0]}> e <@${capitaesIds[1]}>\nTempo de Turno: ${tempoTurno}s\n\nÉ a vez de <@${capitaesIds[0]}> banir um mapa!`);

            const rows = [];
            let currentRow = new ActionRowBuilder();
            MAPAS_ARENA.forEach((mapa, index) => {
                currentRow.addComponents(new ButtonBuilder().setCustomId(`arena_ban_${mapa.id}`).setLabel(`Banir ${mapa.nome}`).setStyle(ButtonStyle.Danger));
                if (currentRow.components.length === 5 || index === MAPAS_ARENA.length - 1) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
            });

            await interaction.reply({ content: 'Iniciando Draft...', ephemeral: true });
            
            const draftData = {
                capitaes: capitaesIds,
                turnoCapitao: 0,
                mapasRestantes: [...MAPAS_ARENA],
                tempoTurnoMs: tempoTurno * 1000
            };

            const buffer = await renderDraft(draftData);
            const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

            const msg = await interaction.channel.send({ content: `<@${capitaesIds[0]}> <@${capitaesIds[1]}> O Draft da Arena começou!`, embeds: [embed], files: [attachment], components: rows });
            
            arenasDraft.set(msg.id, draftData);

            return;
        }

        if (sub === 'encerrar') {
            const cid = interaction.channelId;
            const cena = cenasAtivas.get(cid);

            if (cena) {
                if (cena.msgId) {
                    if (timersTurno.has(cena.msgId)) {
                        clearTimeout(timersTurno.get(cena.msgId));
                        timersTurno.delete(cena.msgId);
                    }
                    try { 
                        const msg = await interaction.channel.messages.fetch(cena.msgId);
                        await msg.delete(); 
                    } catch(e){}
                }
                cenasAtivas.delete(cid);
                return await interaction.reply({ content: '✓ Arena encerrada e o combate foi finalizado com sucesso!' });
            }

            return await interaction.reply({ content: '✗ Nenhuma arena ou combate ativo encontrado neste canal.', ephemeral: true });
        }
        return;
    }



    await interaction.deferReply({ ephemeral: true });

    try {
        const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
        
        if (interaction.commandName === 'narrar') {
            if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
            const sub = interaction.options.getSubcommand();
            const cid = interaction.channelId;
            const key = `${cid}-${interaction.user.id}`;

            if (sub === 'habilitar') {
                const nomeInput = interaction.options.getString('nome');

                if (!nomeInput) {
                    mestresNarrando.set(key, {
                        nome: 'Narrador',
                        avatarUrl: 'https://i.imgur.com/2U5fPoy.png'
                    });
                    return await interaction.editReply('🗣️ **Modo Narrador Habilitado!**\nA partir de agora, suas mensagens enviadas normalmente neste canal sairão como **Narrador**.');
                }

                try {
                    try {
                        const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                        mestresNarrando.set(key, {
                            nome: res.data.titulo ? `${res.data.nome}, ${res.data.titulo}` : res.data.nome,
                            avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png'
                        });
                        return await interaction.editReply(`🗣️ **Modo Interpretação Habilitado!**\nSuas mensagens neste canal sairão como o NPC **${res.data.nome}**.`);
                    } catch (eNpc) {
                        if (eNpc.response?.status === 404) {
                            const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                            mestresNarrando.set(key, {
                                nome: resBestia.data.nome,
                                avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png'
                            });
                            return await interaction.editReply(`🗣️ **Modo Interpretação Habilitado!**\nSuas mensagens neste canal sairão como a criatura **${resBestia.data.nome}**.`);
                        } else {
                            throw eNpc;
                        }
                    }
                } catch(e) {
                    return await interaction.editReply(`✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nomeInput}".`);
                }
            }

            if (sub === 'desabilitar') {
                if (mestresNarrando.has(key)) {
                    mestresNarrando.delete(key);
                    return await interaction.editReply('👤 **Modo Interpretação Desabilitado!**\nSuas mensagens voltaram ao normal.');
                }
                return await interaction.editReply('ℹ Você não está interpretando nenhum NPC ou Narrador neste canal.');
            }
        }

        if (interaction.commandName === 'cena') {
            const sub = interaction.options.getSubcommand();
            const cid = interaction.channelId;

            if (sub === 'iniciar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                const colunas = interaction.options.getInteger('colunas');
                const linhas = interaction.options.getInteger('linhas');
                const fundo = interaction.options.getAttachment('fundo');
                
                cenasAtivas.set(cid, { 
                    linhas, colunas, fundoUrl: fundo ? fundo.url : null,
                    estado: 'ABERTA', rodada: 1, turnoAtual: 0, players: [], msgId: null
                });
                await repintarMapaNovo(interaction.channel, cenasAtivas.get(cid));
                return await interaction.editReply('✓ Cena ABERTA. Jogadores já podem entrar.');
            }

            const cena = cenasAtivas.get(cid);
            if (!cena) return await interaction.editReply('✗ Nenhuma cena ativa.');

            if (sub === 'fechar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                cena.estado = 'FECHADA';
                return await interaction.editReply('✓ Cena FECHADA. Ninguém mais entra.');
            }

            if (sub === 'combate_iniciar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                if (cena.players.length === 0) return await interaction.editReply('✗ Não há ninguém na cena.');
                cena.estado = 'COMBATE';
                cena.rodada = 1;
                cena.turnoAtual = 0;
                await repintarMapaNovo(interaction.channel, cena);
                return await interaction.editReply('✓ Combate INICIADO! Ordem de turnos trancada.');
            }

            if (sub === 'combate_proximo') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                if (cena.estado !== 'COMBATE') return await interaction.editReply('✗ O Combate não está ativo. Use `/cena combate_iniciar` primeiro.');

                // Roda o turno até achar alguém vivo
                do {
                    cena.turnoAtual++;
                    if (cena.turnoAtual >= cena.players.length) {
                        cena.turnoAtual = 0;
                        cena.rodada++;
                    }
                } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));

                await repintarMapaNovo(interaction.channel, cena);
                return await interaction.editReply(`✓ Passou para o turno de **${cena.players[cena.turnoAtual].name}**.`);
            }

            if (sub === 'mover_livre') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                const nToken = interaction.options.getString('nome_token').toLowerCase();
                const pos = parsePosicao(interaction.options.getString('posicao'));
                if (!pos) return await interaction.editReply('✗ Coordenada inválida.');
                
                const token = cena.players.find(p => p.name.toLowerCase().includes(nToken));
                if (!token) return await interaction.editReply(`✗ Ninguém com "${nToken}" no nome foi encontrado.`);

                token.x = Math.max(0, Math.min(cena.colunas - 1, pos.x));
                token.y = Math.max(0, Math.min(cena.linhas - 1, pos.y));
                atualizarMapaDebounced(interaction.channel, cena);
                return await interaction.editReply(`✓ Movimentou ${token.name}.`);
            }

            if (sub === 'status_vida') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                const nToken = interaction.options.getString('nome_token').toLowerCase();
                const token = cena.players.find(p => p.name.toLowerCase().includes(nToken));
                if (!token) return await interaction.editReply(`✗ Ninguém com "${nToken}" no nome foi encontrado.`);

                token.incapacitado = !token.incapacitado;
                atualizarMapaDebounced(interaction.channel, cena);
                return await interaction.editReply(`✓ Status de ${token.name} mudado para: ${token.incapacitado ? 'Incapacitado 💀' : 'Vivo ❤️'}.`);
            }

            if (sub === 'encerrar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                if (cena.msgId) {
                    if (timersTurno.has(cena.msgId)) {
                        clearTimeout(timersTurno.get(cena.msgId));
                        timersTurno.delete(cena.msgId);
                    }
                    try { await (await interaction.channel.messages.fetch(cena.msgId)).delete(); } catch(e){}
                }
                cenasAtivas.delete(cid);
                return await interaction.editReply('✓ Cena apagada.');
            }

            if (sub === 'entrar') {
                if (cena.estado !== 'ABERTA') return await interaction.editReply('✗ Esta cena já foi fechada pelo mestre.');
                if (cena.players.find(x => x.discordId === interaction.user.id)) return await interaction.editReply('✗ Você já está nela!');
                
                try {
                    const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
                    cena.players.push({ discordId: interaction.user.id, name: res.data.nome, avatarUrl: res.data.avatar_url || 'https://i.imgur.com/vHqB3q0.png', x: 0, y: 0, isNpc: false, incapacitado: false });
                    atualizarMapaDebounced(interaction.channel, cena);
                    return await interaction.editReply(`✓ Você entrou na cena.`);
                } catch(e) { return await interaction.editReply(`✗ Erro ao buscar ficha.`); }
            }

            if (sub === 'npc_entrar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                const pos = parsePosicao(interaction.options.getString('posicao'));
                if (!pos) return await interaction.editReply('✗ Coordenada inválida.');
                const nomeInput = interaction.options.getString('nome');
                try {
                    try {
                        const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                        cena.players.push({ discordId: 'npc_'+Date.now(), name: res.data.nome, avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png', x: pos.x, y: pos.y, isNpc: true, incapacitado: false });
                        atualizarMapaDebounced(interaction.channel, cena);
                        return await interaction.editReply(`✓ NPC colocado.`);
                    } catch (eNpc) {
                        if (eNpc.response?.status === 404) {
                            const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                            cena.players.push({ discordId: 'npc_'+Date.now(), name: resBestia.data.nome, avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png', x: pos.x, y: pos.y, isNpc: true, incapacitado: false });
                            atualizarMapaDebounced(interaction.channel, cena);
                            return await interaction.editReply(`✓ Criatura do Bestiário colocada.`);
                        } else {
                            throw eNpc;
                        }
                    }
                } catch(e) { return await interaction.editReply(`✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nomeInput}".`); }
            }

            if (sub === 'mover') {
                const pos = parsePosicao(interaction.options.getString('posicao'));
                if (!pos) return await interaction.editReply('✗ Coordenada inválida.');
                const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
                if (pIndex === -1) return await interaction.editReply('✗ Você não está no mapa!');
                
                if (cena.players[pIndex].incapacitado) return await interaction.editReply('✗ Você está incapacitado.');
                if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) return await interaction.editReply(`✗ Não é o seu turno!`);

                cena.players[pIndex].x = pos.x;
                cena.players[pIndex].y = pos.y;
                atualizarMapaDebounced(interaction.channel, cena);
                return await interaction.editReply(`✓ Movimentou.`);
            }
        }

        if (interaction.commandName === 'missao') {
            const sub = interaction.options.getSubcommand();
            if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');

            if (sub === 'preparar') {
                const nome = interaction.options.getString('nome');

                try {
                    const resMissoes = await axios.get(`${ARKANDIA_API}/missoes/abertas?incluir_arcos=true`, { headers: { 'X-API-Key': API_KEY } });
                    const missaoEncontrada = resMissoes.data.missoes.find(m => m.nome.toLowerCase() === nome.toLowerCase());
                    
                    if (!missaoEncontrada) return await interaction.editReply(`✗ Missão "${nome}" não encontrada nas missões abertas.`);

                    const resInscritos = await axios.get(`${ARKANDIA_API}/missoes/${missaoEncontrada.id}/inscritos`, { headers: { 'X-API-Key': API_KEY } });
                    const confirmados = resInscritos.data.confirmados;

                    if (!confirmados || confirmados.length === 0) {
                        return await interaction.editReply(`✗ A missão "${missaoEncontrada.nome}" não possui nenhum jogador confirmado na API.`);
                    }

                    const jogadores = confirmados.map(c => {
                        const discordId = c.discord_id || (c.personagem && c.personagem.discord_id) || 'desconhecido';
                        const nomePersonagem = c.personagem ? c.personagem.nome : 'Personagem Desconhecido';
                        return { id: discordId, nomePersonagem, pronto: false };
                    }).filter(p => p.id !== 'desconhecido');

                    if (jogadores.length === 0) {
                        return await interaction.editReply(`✗ Nenhum jogador confirmado possui um Discord ID atrelado na API.`);
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x4A2B7E)
                        .setTitle(`❖ Preparação de Missão: ${missaoEncontrada.nome}`)
                        .setDescription(`Os jogadores confirmados pela API foram convocados. Confirme que você está pronto!\n\n` + jogadores.map(p => `[ ] **[${p.nomePersonagem}]** <@${p.id}>`).join('\n'));

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('missao_pronto').setLabel('✓ PRONTO').setStyle(ButtonStyle.Success)
                    );

                    const mencoesStr = jogadores.map(p => `<@${p.id}>`).join(' ');
                    const msg = await interaction.channel.send({ content: `${mencoesStr}`, embeds: [embed], components: [row] });
                    
                    missoesPreparacao.set(msg.id, {
                        msgId: msg.id,
                        nome: missaoEncontrada.nome,
                        jogadores,
                        channelId: interaction.channelId
                    });

                    return await interaction.editReply('✓ HUD de preparação criada 100% via API!');
                } catch (e) {
                    return await interaction.editReply(`✗ Erro ao comunicar com a API do Arkandia. ${e.message}`);
                }
            }

            if (sub === 'iniciar') {
                const nomeMissao = interaction.options.getString('nome');
                let missao = null;
                let missaoKey = null;

                for (const [key, m] of missoesPreparacao.entries()) {
                    if (m.nome.toLowerCase() === nomeMissao.toLowerCase() && m.channelId === interaction.channelId) {
                        missao = m;
                        missaoKey = key;
                        break;
                    }
                }

                if (!missao) return await interaction.editReply(`✗ Não há nenhuma missão chamada "${nomeMissao}" em preparação neste canal.`);

                try {
                    const velhaMsg = await interaction.channel.messages.fetch(missao.msgId);
                    await velhaMsg.delete();
                } catch(e) {}

                const mencoes = missao.jogadores.map(p => `**[${p.nomePersonagem}]** <@${p.id}>`).join(' | ');
                missoesPreparacao.delete(missaoKey);

                await interaction.channel.send({ content: `⚔ **A missão \`${missao.nome}\` foi INICIADA!**\nParticipantes convocados: ${mencoes}` });
                return await interaction.editReply('✓ Missão iniciada com sucesso.');
            }
        }

        if (interaction.commandName === 'mapa') {
            const sub = interaction.options.getSubcommand();
            if (sub === 'configurar') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                
                const canaisTexto = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.parentId);
                const parentIds = new Set(canaisTexto.map(c => c.parentId));
                const categorias = interaction.guild.channels.cache
                    .filter(c => c.type === ChannelType.GuildCategory && parentIds.has(c.id))
                    .sort((a, b) => a.position - b.position)
                    .first(25);
                
                const options = categorias.map(c => ({ 
                    label: c.name.substring(0, 100), 
                    value: c.id, 
                    default: mapaConfig.includes(c.id) 
                }));
                
                if (options.length === 0) return await interaction.editReply('✗ Nenhuma região configurada no servidor.');
                
                const select = new StringSelectMenuBuilder()
                    .setCustomId('config_mapa_categorias')
                    .setPlaceholder('Selecione as categorias do Mapa...')
                    .setMinValues(0)
                    .setMaxValues(options.length)
                    .addOptions(options);
                    
                const row = new ActionRowBuilder().addComponents(select);
                
                await interaction.channel.send({ content: '⚙️ **Configuração do Mapa:** Selecione as categorias que fazem parte da navegação do RPG:', components: [row] });
                return await interaction.editReply('✓ Menu de configuração criado!');
            }

            if (sub === 'painel') {
                if (!isMaster) return await interaction.editReply('✗ Somente Mestres.');
                const attachment = new AttachmentBuilder('./mapa.png', { name: 'mapa.png' });
                const embed = new EmbedBuilder()
                    .setTitle('❖ Mapa do Mundo')
                    .setDescription('Bem-vindo ao portal de viagem! Clique no botão abaixo para explorar as regiões e viajar para o seu destino.\n\n*Nota: Ao viajar, seu personagem sairá da área atual e entrará na nova área (seus canais antigos serão ocultados).*')
                    .setColor(0x2B4C7E)
                    .setImage('attachment://mapa.png');
                    
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_mapa_viajar').setLabel('❖ Iniciar Viagem').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_mapa_sair').setLabel('⏏ Sair do Local Atual').setStyle(ButtonStyle.Danger)
                );
                
                await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
                return await interaction.editReply('✓ Painel do Mapa criado!');
            }
        }

        if (interaction.commandName === 'rp') {
            const sub = interaction.options.getSubcommand();
            if (sub === 'iniciar') {
                const titulo = interaction.options.getString('titulo');
                const participantes = interaction.options.getString('participantes');
                const subtitulo = interaction.options.getString('subtitulo');
                const ambientacao = interaction.options.getString('ambientacao');
                const cenario = interaction.options.getAttachment('cenario');

                try {
                    let targetChannel = interaction.channel;
                    
                    // Se o canal não tem o manager de threads, pode ser cache incompleto ou tipo incompatível
                    if (!targetChannel.threads) {
                        targetChannel = await interaction.guild.channels.fetch(interaction.channelId);
                    }

                    if (!targetChannel.threads) {
                        return await interaction.editReply('✗ Este tipo de canal não suporta a criação de tópicos de RP.');
                    }

                    const thread = await targetChannel.threads.create({
                        name: titulo.substring(0, 100),
                        autoArchiveDuration: 1440,
                        reason: `Nova cena de RP: ${titulo}`
                    });

                    // 1. Mensagem de Cabeçalho (Bot)
                    await thread.send({
                        content: `**Participantes:** ${participantes}\n\n-# Cena criada por <@${interaction.user.id}>. Interpretem livremente.`
                    });

                    // 2. Mensagem de Descrição da Cena (via Webhook, estilo narrativo)
                    try {
                        const webhooks = await targetChannel.fetchWebhooks();
                        let webhook = webhooks.find(wh => wh.token) || await targetChannel.createWebhook({ name: 'Arkandia System' });

                        // Monta a mensagem principal com o novo estilo
                        let descricaoMsg = `## ✶ ${titulo}`;
                        if (subtitulo) descricaoMsg += `\n-# ${subtitulo}`;
                        if (ambientacao) descricaoMsg += `\n\n**Ambientação**\n-# ${ambientacao}`;

                        await webhook.send({
                            content: descricaoMsg,
                            username: 'Narrador',
                            avatarURL: 'https://i.imgur.com/2U5fPoy.png',
                            threadId: thread.id
                        });

                        // 3. Imagem com moldura (embed) separada, se fornecida
                        if (cenario) {
                            const imgEmbed = new EmbedBuilder()
                                .setTitle('Ilustração do cenário')
                                .setImage(cenario.url)
                                .setColor(0x1E1E1E);
                            await webhook.send({
                                embeds: [imgEmbed],
                                username: 'Narrador',
                                avatarURL: 'https://i.imgur.com/2U5fPoy.png',
                                threadId: thread.id
                            });
                        }
                    } catch (webhookError) {
                        // Fallback se o bot não tiver permissão de Webhook no canal
                        let fallbackMsg = `## ✶ ${titulo}`;
                        if (subtitulo) fallbackMsg += `\n→ *${subtitulo}*`;
                        if (ambientacao) fallbackMsg += `\n\n**Ambientação**\n-# ${ambientacao}`;
                        if (cenario) fallbackMsg += `\n\n**Ilustração do cenário**\n${cenario.url}`;

                        await thread.send({ content: fallbackMsg });
                    }

                    return await interaction.editReply(`✓ Cena **${titulo}** criada com sucesso: <#${thread.id}>`);
                } catch (error) {
                    console.error('Erro ao criar cena:', error);
                    return await interaction.editReply('✗ Ocorreu um erro ao criar a cena. Verifique se o Bot tem a permissão de "Criar Tópicos Públicos" no canal.');
                }
            }
        }

        if (interaction.commandName === 'perfil') {
            try {
                const res = await axios.get(getUrlRequisicao(interaction), { headers: { 'X-API-Key': API_KEY } });
                const p = res.data;
                const buffer = await gerarBannerPerfil(p);
                const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
                
                const embed = new EmbedBuilder()
                    .setColor(p.indice_poder_cor || 0x3498DB)
                    .setImage('attachment://perfil.png');
                
                let components = [];
                if (p.build_skills && p.build_skills.length > 0) {
                    const options = p.build_skills.slice(0, 25).map(s => ({
                        label: `${formatarTexto(s.nome)} (Grau ${s.grau})`,
                        description: formatarTexto(s.tipo) || '',
                        value: s.id
                    }));

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('select_profile_skill')
                            .setPlaceholder('Selecione uma habilidade equipada para ver detalhes')
                            .addOptions(options)
                    );
                    components.push(row);
                }

                const msg = await interaction.editReply({ embeds: [embed], files: [attachment], components });
                
                if (p.build_skills && p.build_skills.length > 0) {
                    skillsCache.set(msg.id, { personagem: p, skills: p.build_skills });
                }
                return;
            } catch (e) {
                return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
            }
        }

        if (interaction.commandName === 'ranking') {
            const tipo = interaction.options.getString('tipo') || 'poder';
            try {
                const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
                const buffer = await gerarBannerRanking(tipo, res.data);
                const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

                const embed = new EmbedBuilder()
                    .setColor(0xD4AF37)
                    .setImage('attachment://ranking.png');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ranking_switch_poder').setLabel('Poder').setStyle(tipo === 'poder' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ranking_switch_nivel').setLabel('Nível').setStyle(tipo === 'nivel' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ranking_switch_guildas').setLabel('Guildas').setStyle(tipo === 'guildas' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ranking_switch_arena').setLabel('Arena').setStyle(tipo === 'arena' ? ButtonStyle.Success : ButtonStyle.Secondary)
                );

                return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar o ranking de ${tipo}: ${e.message}`)] });
            }
        }

        if (interaction.commandName === 'guilda') {
            const nomeInput = interaction.options.getString('nome');
            try {
                let guildaId = nomeInput;
                const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(nomeInput);

                if (!isUUID) {
                    // Buscar guilda no ranking para obter o UUID associado ao nome ou sigla
                    const resRanking = await axios.get(`${ARKANDIA_API}/rankings/guildas?limit=50`, { headers: { 'X-API-Key': API_KEY } });
                    const listGuildas = Array.isArray(resRanking.data) ? resRanking.data : (resRanking.data.guildas || []);
                    
                    const guildaMatch = listGuildas.find(g => 
                        (g.nome && g.nome.toLowerCase() === nomeInput.toLowerCase()) || 
                        (g.sigla && g.sigla.toLowerCase() === nomeInput.toLowerCase())
                    ) || listGuildas.find(g => 
                        (g.nome && g.nome.toLowerCase().includes(nomeInput.toLowerCase())) || 
                        (g.sigla && g.sigla.toLowerCase().includes(nomeInput.toLowerCase()))
                    );

                    if (!guildaMatch) {
                        return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não foi encontrada no ranking de guildas. Verifique a grafia ou utilize a sigla.`)] });
                    }
                    guildaId = guildaMatch.id;
                }

                const res = await axios.get(`${ARKANDIA_API}/guildas/${guildaId}`, { headers: { 'X-API-Key': API_KEY } });
                const guilda = res.data;
                
                if (!guilda) {
                    return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não encontrada.`)] });
                }

                const buffer = await gerarBannerGuilda(guilda);
                const attachment = new AttachmentBuilder(buffer, { name: 'guilda.png' });

                const embed = new EmbedBuilder()
                    .setColor(0xD4AF37)
                    .setImage('attachment://guilda.png');

                return await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (e) {
                console.error(e);
                if (e.response?.status === 404) {
                    return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não encontrada.`)] });
                }
                return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar dados da guilda: ${e.response?.data?.error || e.message}`)] });
            }
        }

        if (interaction.commandName === 'missoes') {
            try {
                const res = await axios.get(`${ARKANDIA_API}/missoes/abertas?incluir_arcos=true`, { headers: { 'X-API-Key': API_KEY } });
                const missoes = res.data.missoes || [];

                if (missoes.length === 0) {
                    return await interaction.editReply({ embeds: [embedErro('Nenhuma missão aberta encontrada no momento.')] });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x4A2B7E)
                    .setTitle('❖ QUADRO DE MISSÕES DE ARKANDIA')
                    .setDescription('Aventureiros, estas são as missões abertas atualmente na guilda. Preparem suas armas!')
                    .setThumbnail('https://i.imgur.com/vHqB3q0.png');

                const rows = [];
                let row = new ActionRowBuilder();

                missoes.slice(0, 5).forEach((m, idx) => {
                    const statusPerigo = m.morte_permanente ? '💀 PERIGO EXTREMO (Morte Permanente)' : '🛡 Seguro (Sem Morte Permanente)';
                    embed.addFields({
                        name: `📍 ${idx + 1}. ${m.nome}`,
                        value: `> **Nível Mínimo:** ${m.nivel_minimo || 1} | **Rank:** ${m.rank_minimo || 'Iniciante'}\n> **Risco:** ${statusPerigo}\n> **Status:** ${m.status || 'Aberta'} | **Vagas:** ${m.vagas_restantes || m.limite_jogadores || 5}\n> **Sessão:** ${m.data_sessão || 'A agendar'}`
                    });

                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`missoes_inscritos_${m.id}`)
                            .setLabel(`Inscritos: ${m.nome.substring(0, 15)}`)
                            .setStyle(ButtonStyle.Secondary)
                    );

                    if (row.components.length === 2 || idx === missoes.length - 1 || idx === 4) {
                        rows.push(row);
                        row = new ActionRowBuilder();
                    }
                });

                return await interaction.editReply({ embeds: [embed], components: rows });
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar o quadro de missões: ${e.message}`)] });
            }
        }

        if (interaction.commandName === 'inventario') {
            const usuarioMencionado = interaction.options.getUser('jogador');
            const nomeFornecido = interaction.options.getString('nome');

            const member = interaction.member;
            const isUserAdmin = member && (
                member.permissions.has(PermissionFlagsBits.Administrator) ||
                member.roles.cache.some(r => ['admin', 'administrador'].includes(r.name.toLowerCase()))
            );

            if ((nomeFornecido || (usuarioMencionado && usuarioMencionado.id !== interaction.user.id)) && !isUserAdmin) {
                return await interaction.editReply({ embeds: [embedErro("Apenas administradores podem consultar o inventário de outros jogadores!")] });
            }

            try {
                const res = await axios.get(getUrlRequisicao(interaction), { headers: { 'X-API-Key': API_KEY } });
                const p = res.data;

                if (!p) {
                    return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
                }

                const itens = p.inventario || p.itens || [];

                // Armazenar inventário completo no cache
                const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
                skillsCache.set(cacheKey, { personagem: p, itens });

                return await renderInventarioPage(interaction, p, itens, 'todos', 0);
            } catch (e) {
                console.error(e);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao carregar o inventário: ${e.message}`)] });
            }
        }


        if (interaction.commandName === 'painel') {
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('✦ Central do Jogador ✦')
                .setDescription('Bem-vindo à sua HUD interativa! Aqui você tem acesso rápido a todas as funcionalidades do seu personagem. Escolha uma opção abaixo:')
                .setFooter({ text: 'Apenas você pode ver este painel.' });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('jogador_menu_perfil').setLabel('✦ Meu Perfil').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('jogador_menu_inventario').setLabel('✦ Meu Inventário').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('jogador_menu_missoes').setLabel('✦ Missões Ativas').setStyle(ButtonStyle.Secondary)
            );
            
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('jogador_menu_ranking').setLabel('✦ Rankings').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('jogador_menu_guilda').setLabel('✦ Buscar Guilda').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('jogador_menu_rp').setLabel('✦ Iniciar Cena RP').setStyle(ButtonStyle.Success)
            );

            return await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        }

        if (interaction.commandName === 'mestre') {
            const sub = interaction.options.getSubcommand();
            
            if (sub === 'painel') {
                try {
                    const buffer = await gerarBannerPainelMestre(interaction.channelId, interaction.guild);
                    const attachment = new AttachmentBuilder(buffer, { name: 'painel_mestre.png' });
                    
                    const embed = new EmbedBuilder()
                        .setColor(0xD4AF37)
                        .setImage('attachment://painel_mestre.png');
                        
                    return await interaction.editReply({
                        embeds: [embed],
                        files: [attachment],
                        components: getMestrePainelComponents()
                    });
                } catch (err) {
                    console.error('Erro ao renderizar painel do mestre:', err);
                    return await interaction.editReply({ embeds: [embedErro(`Não foi possível carregar a HUD do Mestre: ${err.message}`)] });
                }
            }

            if (sub === 'dropar') {
                const itemNome = interaction.options.getString('item');
                const qtd = interaction.options.getInteger('quantidade') || 1;
                try {
                    const res = await axios.get(`${ARKANDIA_API}/itens/${encodeURIComponent(itemNome)}`, { headers: { 'X-API-Key': API_KEY } });
                    const item = res.data;
                    
                    const buffer = await gerarBannerLoot(item, qtd);
                    const attachment = new AttachmentBuilder(buffer, { name: 'loot.png' });
                    
                    const raridades = { comum: 0x8B949E, raro: 0x3498DB, epico: 0x8B5CF6, lendario: 0xF59E0B, mitico: 0xE74C3C };
                    const embed = new EmbedBuilder()
                        .setColor(raridades[item.raridade?.toLowerCase()] || 0xB8860B)
                        .setImage('attachment://loot.png');
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('◈ Coletar Item').setStyle(ButtonStyle.Success)
                    );
                    
                    await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
                    return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat.')] });
                } catch (e) {
                    return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" não encontrado.`)] });
                }
            }

            if (sub === 'bestiario') {
                const nome = interaction.options.getString('nome');
                try {
                    try {
                        const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY }});
                        const npc = res.data;
                        const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                        const embed = new EmbedBuilder()
                            .setColor(0x2A2320)
                            .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                            .setTitle(`🕮 ${npc.nome} ${npc.titulo ? '- ' + npc.titulo : ''}`)
                            .setDescription(`**Raça:** ${primeiraMaiuscula(npc.raca)} | **Classe:** ${primeiraMaiuscula(npc.classe)} | **Rank:** ${npc.rank}\n**Região:** ${primeiraMaiuscula(npc.regiao)} | **Afiliação:** ${npc.afiliacao || 'Nenhuma'}\n\n*${npc.flavor_text || ''}*\n\n${npc.lore ? npc.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                        if (npc.retrato_url) embed.setThumbnail(npc.retrato_url);
                        return await interaction.editReply({ embeds: [embed] });
                    } catch (eNpc) {
                        if (eNpc.response?.status === 404) {
                            const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY } });
                            const criatura = resBestia.data;
                            
                            const tierMap = {
                                1: 'Comum',
                                2: 'Raro',
                                3: 'Épico',
                                4: 'Lendário',
                                5: 'Mítico'
                            };
                            const corTier = {
                                1: 0x6B7280, // Comum
                                2: 0x3B82F6, // Raro
                                3: 0x8B5CF6, // Épico
                                4: 0xF59E0B, // Lendário
                                5: 0xC41E3A  // Mítico
                            };
                            
                            const cor = corTier[criatura.classificacao] || 0x34495E;
                            const tier = tierMap[criatura.classificacao] || 'Desconhecido';
                            const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                            
                            const embed = new EmbedBuilder()
                                .setColor(cor)
                                .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                                .setTitle(`🕮 ${criatura.nome}`)
                                .setDescription(`**Tipo:** ${primeiraMaiuscula(criatura.tipo)} | **Classificação:** ${tier}\n\n${criatura.lore ? criatura.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                            if (criatura.ilustracao_url) embed.setThumbnail(criatura.ilustracao_url);
                            
                            return await interaction.editReply({ embeds: [embed] });
                        } else {
                            throw eNpc;
                        }
                    }
                } catch (e) {
                    if (e.response?.status === 404) return await interaction.editReply(`✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nome}".`);
                    return await interaction.editReply(`✗ Erro interno.`);
                }
            }
        }
    } catch(e) { return await interaction.editReply('✗ Erro interno.'); }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const key = `${message.channel.id}-${message.author.id}`;
    if (mestresNarrando.has(key)) {
        if (message.content.startsWith('/')) return;

        const npcData = mestresNarrando.get(key);

        try {
            await message.delete().catch(() => null);

            const webhooks = await message.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);
            if (!webhook) {
                webhook = await message.channel.createWebhook({ name: 'Arkandia System' });
            }

            await webhook.send({
                content: message.content,
                username: npcData.nome,
                avatarURL: npcData.avatarUrl
            });
        } catch (e) {
            console.error('Erro na interpretação de fala do Mestre:', e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
