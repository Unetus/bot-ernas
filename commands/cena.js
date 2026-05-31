const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { cenasAtivas, timersTurno } = require('../utils/state');
const { repintarMapaNovo, atualizarMapaDebounced } = require('../canvas/renderer');
const { parsePosicao } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
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
    .addSubcommand(sub => sub.setName('encerrar').setDescription('[Mestre] Deleta o mapa atual e apaga tudo'));

async function execute(interaction) {
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    const sub = interaction.options.getSubcommand();
    const cid = interaction.channelId;

    await interaction.deferReply();

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

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('cena_')) return;

    if (interaction.customId.startsWith('cena_move_')) {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

        const token = cena.players[pIndex];
        if (token.incapacitado) return await interaction.reply({ content: '✗ Você está incapacitado e não pode se mover.', ephemeral: true });

        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `✗ Não é o seu turno! Agora é o turno de **${cena.players[cena.turnoAtual].name}**.`, ephemeral: true });
        }

        const dir = interaction.customId.replace('cena_move_', '');
        if (dir === 'up') token.y = Math.max(0, token.y - 1);
        if (dir === 'down') token.y = Math.min(cena.linhas - 1, token.y + 1);
        if (dir === 'left') token.x = Math.max(0, token.x - 1);
        if (dir === 'right') token.x = Math.min(cena.colunas - 1, token.x + 1);

        await interaction.deferUpdate();
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }

    if (interaction.customId === 'cena_passar_turno') {
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

    if (interaction.customId === 'cena_modal_mover_coord') {
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

        if (cena.players[pIndex].incapacitado) return await interaction.reply({ content: '✗ Você está incapacitado e não pode se mover.', ephemeral: true });

        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) {
            return await interaction.reply({ content: `✗ Não é o seu turno!`, ephemeral: true });
        }

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder().setCustomId('cena_modal_mover_coord_submit').setTitle('Mover para Coordenada');
        const coordInput = new TextInputBuilder().setCustomId('coord_input').setLabel('Coordenada (ex: A1)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(coordInput));
        
        await interaction.showModal(modal);
        return;
    }
}

async function handleModal(interaction) {
    if (interaction.customId === 'cena_modal_mover_coord_submit') {
        const coordStr = interaction.fields.getTextInputValue('coord_input');
        const pos = parsePosicao(coordStr);
        
        if (!pos) return await interaction.reply({ content: '✗ Formato inválido. Use letra e número (Ex: A1, C4).', ephemeral: true });
        
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa.', ephemeral: true });

        const pIndex = cena.players.findIndex(p => p.discordId === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não está no tabuleiro.', ephemeral: true });

        if (cena.players[pIndex].incapacitado) return await interaction.reply({ content: '✗ Você está incapacitado.', ephemeral: true });
        if (cena.estado === 'COMBATE' && cena.turnoAtual !== pIndex) return await interaction.reply({ content: `✗ Não é o seu turno!`, ephemeral: true });

        cena.players[pIndex].x = Math.max(0, Math.min(cena.colunas - 1, pos.x));
        cena.players[pIndex].y = Math.max(0, Math.min(cena.linhas - 1, pos.y));
        
        await interaction.reply({ content: '✓ Movimento efetuado!', ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return;
    }
}

module.exports = { data, execute, handleButton, handleModal };
