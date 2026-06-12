const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { cenasAtivas, timersTurno, renderTimers } = require('../utils/state');
const { repintarMapaNovo, atualizarMapaDebounced } = require('../canvas/renderer');
const { parsePosicao } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const MIN_GRID_SIZE = 3;
const MAX_COLUMNS = 20;
const MAX_ROWS = 20;
const MIN_TURN_SECONDS = 15;
const MAX_TURN_SECONDS = 600;

const data = new SlashCommandBuilder()
    .setName('cena')
    .setDescription('Sistema VTT de mapa, posicionamento e turnos')
    .addSubcommand(sub => sub
        .setName('iniciar')
        .setDescription('[Mestre] Cria uma cena tatica')
        .addIntegerOption(o => o
            .setName('colunas')
            .setDescription('Largura do mapa')
            .setMinValue(MIN_GRID_SIZE)
            .setMaxValue(MAX_COLUMNS)
            .setRequired(true))
        .addIntegerOption(o => o
            .setName('linhas')
            .setDescription('Altura do mapa')
            .setMinValue(MIN_GRID_SIZE)
            .setMaxValue(MAX_ROWS)
            .setRequired(true))
        .addStringOption(o => o
            .setName('nome')
            .setDescription('Nome da cena')
            .setMaxLength(60)
            .setRequired(false))
        .addStringOption(o => o
            .setName('descricao')
            .setDescription('Ambientacao curta')
            .setMaxLength(180)
            .setRequired(false))
        .addIntegerOption(o => o
            .setName('tempo_turno')
            .setDescription('Tempo por turno em segundos')
            .setMinValue(MIN_TURN_SECONDS)
            .setMaxValue(MAX_TURN_SECONDS)
            .setRequired(false))
        .addAttachmentOption(o => o
            .setName('fundo')
            .setDescription('Imagem de fundo opcional')))
    .addSubcommand(sub => sub.setName('entrar').setDescription('Entra na cena aberta'))
    .addSubcommand(sub => sub
        .setName('mover')
        .setDescription('Move seu personagem')
        .addStringOption(o => o.setName('posicao').setDescription('Ex: A1, C4').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('npc_entrar')
        .setDescription('[Mestre] Adiciona um NPC ou criatura')
        .addStringOption(o => o.setName('nome').setDescription('Nome do NPC ou criatura').setRequired(true))
        .addStringOption(o => o.setName('posicao').setDescription('Ex: A1').setRequired(true)))
    .addSubcommand(sub => sub.setName('fechar').setDescription('[Mestre] Trava a entrada de novos jogadores'))
    .addSubcommand(sub => sub.setName('combate_iniciar').setDescription('[Mestre] Inicia a ordem de turnos'))
    .addSubcommand(sub => sub.setName('combate_proximo').setDescription('[Mestre] Passa para o proximo turno'))
    .addSubcommand(sub => sub
        .setName('mover_livre')
        .setDescription('[Mestre] Move qualquer token')
        .addStringOption(o => o.setName('nome_token').setDescription('Nome do token').setRequired(true))
        .addStringOption(o => o.setName('posicao').setDescription('Nova posicao, ex: A1').setRequired(true)))
    .addSubcommand(sub => sub
        .setName('status_vida')
        .setDescription('[Mestre] Alterna token entre vivo e incapacitado')
        .addStringOption(o => o.setName('nome_token').setDescription('Nome do token').setRequired(true)))
    .addSubcommand(sub => sub.setName('encerrar').setDescription('[Mestre] Encerra e remove a cena ativa'));

function hasMasterAccess(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

function formatCoord(pos) {
    return `${String.fromCharCode(65 + pos.x)}${pos.y + 1}`;
}

function isInsideMap(cena, pos) {
    return pos && pos.x >= 0 && pos.y >= 0 && pos.x < cena.colunas && pos.y < cena.linhas;
}

function validatePosition(cena, pos) {
    if (!pos) return 'Coordenada invalida. Use o formato A1.';
    if (!isInsideMap(cena, pos)) {
        return `Coordenada fora do mapa. Limite atual: A1 ate ${formatCoord({ x: cena.colunas - 1, y: cena.linhas - 1 })}.`;
    }
    return null;
}

function getTokenAt(cena, pos, ignoreToken = null) {
    return cena.players.find(p => p !== ignoreToken && !p.incapacitado && p.x === pos.x && p.y === pos.y);
}

function validateDestination(cena, pos, token = null) {
    const positionError = validatePosition(cena, pos);
    if (positionError) return positionError;
    const occupant = getTokenAt(cena, pos, token);
    if (occupant) return `A celula ${formatCoord(pos)} ja esta ocupada por ${occupant.name}.`;
    return null;
}

function findFreeCell(cena) {
    for (let y = 0; y < cena.linhas; y++) {
        for (let x = 0; x < cena.colunas; x++) {
            const pos = { x, y };
            if (!getTokenAt(cena, pos)) return pos;
        }
    }
    return null;
}

function normalizeTurnIndex(cena) {
    if (cena.turnoAtual >= cena.players.length) cena.turnoAtual = 0;
    if (cena.turnoAtual < 0) cena.turnoAtual = 0;
}

function advanceTurn(cena) {
    const vivos = cena.players.filter(p => !p.incapacitado);
    if (vivos.length === 0) return null;

    normalizeTurnIndex(cena);
    do {
        cena.turnoAtual++;
        if (cena.turnoAtual >= cena.players.length) {
            cena.turnoAtual = 0;
            cena.rodada++;
        }
    } while (cena.players[cena.turnoAtual].incapacitado);

    return cena.players[cena.turnoAtual];
}

function clearSceneTimers(cena) {
    if (!cena?.msgId) return;
    if (timersTurno.has(cena.msgId)) {
        clearInterval(timersTurno.get(cena.msgId));
        timersTurno.delete(cena.msgId);
    }
    if (renderTimers.has(cena.msgId)) {
        clearTimeout(renderTimers.get(cena.msgId));
        renderTimers.delete(cena.msgId);
    }
}

function addLog(cena, mensagem) {
    if (!cena.logs) cena.logs = [];
    cena.logs.push(mensagem);
    if (cena.logs.length > 30) {
        cena.logs.shift();
    }
}

function createScene({ colunas, linhas, fundoUrl, nome, descricao, tempoTurnoMs, mestreId }) {
    return {
        linhas,
        colunas,
        fundoUrl,
        nome: nome || 'Cena Tatica',
        descricao: descricao || null,
        estado: 'ABERTA',
        rodada: 1,
        turnoAtual: 0,
        players: [],
        msgId: null,
        mestreId: mestreId || null,
        tempoTurnoMs: tempoTurnoMs || null,
        logs: ['Cena aberta para entrada dos jogadores.'],
        turnStartPos: null
    };
}

async function resolveNpcOrCreature(nomeInput) {
    try {
        const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
        return {
            name: res.data.nome,
            avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png',
            kind: 'NPC'
        };
    } catch (eNpc) {
        if (eNpc.response?.status !== 404) throw eNpc;
        const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
        return {
            name: resBestia.data.nome,
            avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png',
            kind: 'Criatura'
        };
    }
}

async function execute(interaction) {
    const isMaster = hasMasterAccess(interaction);
    const sub = interaction.options.getSubcommand();
    const cid = interaction.channelId;

    await interaction.deferReply();

    if (sub === 'iniciar') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem iniciar cenas.');
        if (cenasAtivas.has(cid)) {
            return await interaction.editReply('Ja existe uma cena ativa neste canal. Encerre a cena atual antes de abrir outra.');
        }

        const colunas = interaction.options.getInteger('colunas');
        const linhas = interaction.options.getInteger('linhas');
        const fundo = interaction.options.getAttachment('fundo');
        const nome = interaction.options.getString('nome')?.trim();
        const descricao = interaction.options.getString('descricao')?.trim();
        const tempoTurno = interaction.options.getInteger('tempo_turno');

        const cena = createScene({
            colunas,
            linhas,
            fundoUrl: fundo ? fundo.url : null,
            nome,
            descricao,
            tempoTurnoMs: tempoTurno ? tempoTurno * 1000 : null,
            mestreId: interaction.user.id
        });

        cenasAtivas.set(cid, cena);
        await repintarMapaNovo(interaction.channel, cena);
        return await interaction.editReply(`Cena aberta: **${cena.nome}**. Jogadores podem usar \`/cena entrar\`.`);
    }

    const cena = cenasAtivas.get(cid);
    if (!cena) return await interaction.editReply('Nenhuma cena ativa neste canal.');

    if (sub === 'fechar') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem fechar cenas.');
        cena.estado = 'FECHADA';
        addLog(cena, 'Entrada de novos jogadores bloqueada pelo mestre.');
        await atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply('Cena fechada. Novas entradas foram bloqueadas.');
    }

    if (sub === 'combate_iniciar') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem iniciar combate.');
        if (cena.players.length === 0) return await interaction.editReply('Nao ha tokens na cena.');
        if (!cena.players.some(p => !p.incapacitado)) return await interaction.editReply('Nao ha tokens vivos para iniciar combate.');

        cena.estado = 'COMBATE';
        cena.rodada = 1;
        cena.turnoAtual = cena.players.findIndex(p => !p.incapacitado);
        if (cena.turnoAtual < 0) cena.turnoAtual = 0;
        
        const active = cena.players[cena.turnoAtual];
        cena.turnStartPos = { x: active.x, y: active.y };
        addLog(cena, `Combate iniciado. Primeiro turno: ${active.name}.`);

        await repintarMapaNovo(interaction.channel, cena);
        return await interaction.editReply(`Combate iniciado. Turno de **${active.name}**.`);
    }

    if (sub === 'combate_proximo') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem passar turnos.');
        if (cena.estado !== 'COMBATE') return await interaction.editReply('O combate nao esta ativo. Use `/cena combate_iniciar` primeiro.');

        const oldActive = cena.players[cena.turnoAtual];
        const moved = cena.turnStartPos && (oldActive.x !== cena.turnStartPos.x || oldActive.y !== cena.turnStartPos.y);

        const active = advanceTurn(cena);
        if (!active) return await interaction.editReply('Nao ha tokens vivos para receber turno.');

        cena.turnStartPos = { x: active.x, y: active.y };
        if (moved) {
            addLog(cena, `[Mestre] ${oldActive.name} moveu para ${formatCoord(oldActive)} e teve o turno avancado. Agora: ${active.name}.`);
        } else {
            addLog(cena, `[Mestre] Turno de ${oldActive.name} avancado. Agora: ${active.name}.`);
        }
        await repintarMapaNovo(interaction.channel, cena);
        return await interaction.editReply(`Turno passado para **${active.name}**.`);
    }

    if (sub === 'mover_livre') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem mover qualquer token.');
        const nToken = interaction.options.getString('nome_token').toLowerCase();
        const pos = parsePosicao(interaction.options.getString('posicao'));
        const token = cena.players.find(p => p.name.toLowerCase().includes(nToken));
        if (!token) return await interaction.editReply(`Nenhum token com "${nToken}" foi encontrado.`);

        const error = validateDestination(cena, pos, token);
        if (error) return await interaction.editReply(error);

        token.x = pos.x;
        token.y = pos.y;
        addLog(cena, `${token.name} foi movido para ${formatCoord(pos)}.`);
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply(`Movimentou **${token.name}** para ${formatCoord(pos)}.`);
    }

    if (sub === 'status_vida') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem alterar status.');
        const nToken = interaction.options.getString('nome_token').toLowerCase();
        const tokenIndex = cena.players.findIndex(p => p.name.toLowerCase().includes(nToken));
        const token = cena.players[tokenIndex];
        if (!token) return await interaction.editReply(`Nenhum token com "${nToken}" foi encontrado.`);

        token.incapacitado = !token.incapacitado;
        addLog(cena, `${token.name} agora esta ${token.incapacitado ? 'incapacitado' : 'vivo'}.`);

        if (cena.estado === 'COMBATE' && token.incapacitado && cena.turnoAtual === tokenIndex) {
            const active = advanceTurn(cena);
            if (active) {
                cena.turnStartPos = { x: active.x, y: active.y };
                addLog(cena, `Turno transferido para ${active.name}.`);
            }
            await repintarMapaNovo(interaction.channel, cena);
        } else {
            atualizarMapaDebounced(interaction.channel, cena);
        }

        return await interaction.editReply(`Status de **${token.name}**: ${token.incapacitado ? 'Incapacitado' : 'Vivo'}.`);
    }

    if (sub === 'encerrar') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem encerrar cenas.');
        clearSceneTimers(cena);
        if (cena.msgId) {
            try { await (await interaction.channel.messages.fetch(cena.msgId)).delete(); } catch(e) {}
        }
        cenasAtivas.delete(cid);
        return await interaction.editReply(`Cena **${cena.nome || 'Tatica'}** encerrada.`);
    }

    if (sub === 'entrar') {
        if (cena.estado !== 'ABERTA') return await interaction.editReply('Esta cena ja foi fechada pelo mestre.');
        if (cena.players.find(x => x.discordId === interaction.user.id)) return await interaction.editReply('Voce ja esta nesta cena.');

        const spawn = findFreeCell(cena);
        if (!spawn) return await interaction.editReply('Nao ha celulas livres para entrar na cena.');

        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            cena.players.push({
                discordId: interaction.user.id,
                name: res.data.nome,
                avatarUrl: res.data.avatar_url || 'https://i.imgur.com/vHqB3q0.png',
                x: spawn.x,
                y: spawn.y,
                isNpc: false,
                incapacitado: false
            });
            addLog(cena, `${res.data.nome} entrou em ${formatCoord(spawn)}.`);
            atualizarMapaDebounced(interaction.channel, cena);
            return await interaction.editReply(`Voce entrou na cena em ${formatCoord(spawn)}.`);
        } catch(e) {
            return await interaction.editReply('Erro ao buscar sua ficha ativa.');
        }
    }

    if (sub === 'npc_entrar') {
        if (!isMaster) return await interaction.editReply('Somente mestres podem adicionar NPCs.');
        const pos = parsePosicao(interaction.options.getString('posicao'));
        const error = validateDestination(cena, pos);
        if (error) return await interaction.editReply(error);

        const nomeInput = interaction.options.getString('nome');
        try {
            const npc = await resolveNpcOrCreature(nomeInput);
            cena.players.push({
                discordId: `npc_${Date.now()}`,
                name: npc.name,
                avatarUrl: npc.avatarUrl,
                x: pos.x,
                y: pos.y,
                isNpc: true,
                incapacitado: false
            });
            addLog(cena, `${npc.kind} ${npc.name} entrou em ${formatCoord(pos)}.`);
            atualizarMapaDebounced(interaction.channel, cena);
            return await interaction.editReply(`${npc.kind} **${npc.name}** colocado em ${formatCoord(pos)}.`);
        } catch(e) {
            return await interaction.editReply(`Nenhum NPC ou criatura encontrado com o nome "${nomeInput}".`);
        }
    }

    if (sub === 'mover') {
        const pos = parsePosicao(interaction.options.getString('posicao'));
        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.editReply('Voce nao esta no mapa.');

        const token = cena.players[pIndex];
        if (token.incapacitado) return await interaction.editReply('Voce esta incapacitado.');
        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) return await interaction.editReply('Nao e o seu turno.');

        const error = validateDestination(cena, pos, token);
        if (error) return await interaction.editReply(error);

        token.x = pos.x;
        token.y = pos.y;
        if (cena.estado !== 'COMBATE') addLog(cena, `${token.name} moveu para ${formatCoord(pos)}.`);
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply(`Movimentou para ${formatCoord(pos)}.`);
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('cena_')) return;

    if (interaction.customId === 'cena_toggle_entrar') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        
        if (pIndex !== -1) {
            if (cena.estado === 'COMBATE' && cena.turnoAtual === pIndex) {
                return await interaction.reply({ content: 'Voce nao pode sair da cena durante o seu turno no combate. Passe o turno primeiro.', ephemeral: true });
            }
            const name = cena.players[pIndex].name;
            cena.players.splice(pIndex, 1);
            if (cena.estado === 'COMBATE' && cena.turnoAtual > pIndex) cena.turnoAtual--;
            addLog(cena, `${name} saiu da cena.`);
            await interaction.deferUpdate();
            atualizarMapaDebounced(interaction.channel, cena);
            return;
        }

        if (cena.estado === 'FECHADA' || cena.estado === 'COMBATE') return await interaction.reply({ content: 'A cena nao esta recebendo novos jogadores no momento.', ephemeral: true });
        
        let spawn = { x: 0, y: 0 };
        while (cena.players.some(p => p.x === spawn.x && p.y === spawn.y)) {
            spawn.x++;
            if (spawn.x >= cena.colunas) { spawn.x = 0; spawn.y++; }
            if (spawn.y >= cena.linhas) return await interaction.reply({ content: 'Tabuleiro cheio.', ephemeral: true });
        }

        try {
            const apiRes = await axios.get(`${ARKANDIA_API}/personagens?discordId=${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const pAtivo = apiRes.data.find(p => p.ativo);
            if (!pAtivo) return await interaction.reply({ content: 'Voce nao tem um personagem ativo.', ephemeral: true });

            cena.players.push({
                discordId: interaction.user.id,
                name: pAtivo.nome,
                avatarUrl: pAtivo.retrato_url || 'https://i.imgur.com/vHqB3q0.png',
                x: spawn.x,
                y: spawn.y,
                isNpc: false,
                incapacitado: false
            });
            addLog(cena, `${pAtivo.nome} entrou em ${formatCoord(spawn)}.`);
            await interaction.deferUpdate();
            atualizarMapaDebounced(interaction.channel, cena);
            return;
        } catch(e) {
            return await interaction.reply({ content: 'Erro ao buscar sua ficha ativa.', ephemeral: true });
        }
    }

    if (interaction.customId === 'cena_toggle_aberta') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });
        if (interaction.user.id !== cena.mestreId) return await interaction.reply({ content: 'Apenas o mestre pode alterar o acesso a cena.', ephemeral: true });
        
        cena.estado = cena.estado === 'FECHADA' ? 'ABERTA' : 'FECHADA';
        addLog(cena, `O mestre ${cena.estado === 'ABERTA' ? 'abriu' : 'fechou'} a cena.`);
        await interaction.deferUpdate();
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }

    if (interaction.customId === 'cena_toggle_combate') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });
        if (interaction.user.id !== cena.mestreId) return await interaction.reply({ content: 'Apenas o mestre pode alterar o estado do combate.', ephemeral: true });
        
        if (cena.estado === 'COMBATE') {
            if (timersTurno.has(cena.msgId)) {
                clearInterval(timersTurno.get(cena.msgId));
                timersTurno.delete(cena.msgId);
            }
            if (renderTimers.has(cena.msgId)) {
                clearTimeout(renderTimers.get(cena.msgId));
                renderTimers.delete(cena.msgId);
            }
            cenasAtivas.delete(interaction.channelId);
            await interaction.deferUpdate();
            await interaction.channel.send(`**A cena ${cena.nome} foi encerrada pelo mestre.**`);
            try {
                const velha = await interaction.channel.messages.fetch(cena.msgId);
                await velha.edit({ components: [] });
            } catch(e) {}
            return;
        } else {
            if (cena.players.length === 0) return await interaction.reply({ content: 'Nao ha jogadores para iniciar o combate.', ephemeral: true });
            
            cena.estado = 'COMBATE';
            cena.rodada = 1;
            cena.turnoAtual = 0;
            
            cena.players.sort(() => Math.random() - 0.5);
            
            const active = cena.players[0];
            cena.turnStartPos = { x: active.x, y: active.y };
            addLog(cena, `Combate iniciado. Primeiro turno: ${active.name}.`);
            
            await interaction.deferUpdate();
            await repintarMapaNovo(interaction.channel, cena);
            return;
        }
    }

    if (interaction.customId.startsWith('cena_move_')) {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: 'Voce nao esta no tabuleiro.', ephemeral: true });

        const token = cena.players[pIndex];
        if (token.incapacitado) return await interaction.reply({ content: 'Voce esta incapacitado e nao pode se mover.', ephemeral: true });

        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `Nao e o seu turno. Agora e o turno de **${cena.players[cena.turnoAtual].name}**.`, ephemeral: true });
        }

        const dir = interaction.customId.replace('cena_move_', '');
        const nextPos = { x: token.x, y: token.y };
        if (dir === 'up') nextPos.y--;
        if (dir === 'down') nextPos.y++;
        if (dir === 'left') nextPos.x--;
        if (dir === 'right') nextPos.x++;

        const error = validateDestination(cena, nextPos, token);
        if (error) return await interaction.reply({ content: error, ephemeral: true });

        token.x = nextPos.x;
        token.y = nextPos.y;
        if (cena.estado !== 'COMBATE') addLog(cena, `${token.name} moveu para ${formatCoord(nextPos)}.`);

        await interaction.deferUpdate();
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }

    if (interaction.customId === 'cena_passar_turno') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena || cena.estado !== 'COMBATE') return await interaction.reply({ content: 'Nao ha combate ativo.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1 || cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: 'Nao e o seu turno.', ephemeral: true });
        }

        await interaction.deferUpdate();
        
        const oldActive = cena.players[cena.turnoAtual];
        const moved = cena.turnStartPos && (oldActive.x !== cena.turnStartPos.x || oldActive.y !== cena.turnStartPos.y);

        const active = advanceTurn(cena);
        if (active) {
            cena.turnStartPos = { x: active.x, y: active.y };
            if (moved) {
                addLog(cena, `${oldActive.name} moveu-se para ${formatCoord(oldActive)} e passou o turno. Agora: ${active.name}.`);
            } else {
                addLog(cena, `${oldActive.name} passou o turno. Agora: ${active.name}.`);
            }
        }
        await repintarMapaNovo(interaction.channel, cena);
        return;
    }

    if (interaction.customId === 'cena_modal_mover_coord') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: 'Voce nao esta no tabuleiro.', ephemeral: true });

        if (cena.players[pIndex].incapacitado) return await interaction.reply({ content: 'Voce esta incapacitado e nao pode se mover.', ephemeral: true });

        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: 'Nao e o seu turno.', ephemeral: true });
        }

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder().setCustomId('cena_modal_mover_coord_submit').setTitle('Mover para coordenada');
        const coordInput = new TextInputBuilder().setCustomId('coord_input').setLabel('Coordenada, ex: A1').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(coordInput));

        await interaction.showModal(modal);
        return;
    }
}

async function handleModal(interaction) {
    if (interaction.customId === 'cena_modal_mover_coord_submit') {
        const coordStr = interaction.fields.getTextInputValue('coord_input');
        const pos = parsePosicao(coordStr);
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: 'Voce nao esta no tabuleiro.', ephemeral: true });

        const token = cena.players[pIndex];
        if (token.incapacitado) return await interaction.reply({ content: 'Voce esta incapacitado.', ephemeral: true });
        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) return await interaction.reply({ content: 'Nao e o seu turno.', ephemeral: true });

        const error = validateDestination(cena, pos, token);
        if (error) return await interaction.reply({ content: error, ephemeral: true });

        token.x = pos.x;
        token.y = pos.y;
        if (cena.estado !== 'COMBATE') addLog(cena, `${token.name} moveu para ${formatCoord(pos)}.`);

        await interaction.reply({ content: `Movimento efetuado para ${formatCoord(pos)}.`, ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }
}

module.exports = { data, execute, handleButton, handleModal };
