const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { iniciarCenaRp } = require('../utils/rpScene');
const sessionStore = require('../utils/sessionStore');
const { replyAndDelete } = require('../utils/tempMessage');
const { gerarBannerPerfil } = require('../canvas/renderer');
const profileCache = require('../utils/profileCache');
const cenaCommand = require('./cena');
const { cenasAtivas } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;
const RP_INVITE_SELECT = 'rp_invite_participants';
const RP_PROFILE_SELECT = 'rp_profile_participant';
const RP_TACTICAL_MODAL = 'rp_tactical_modal';

const MAX_PARTICIPANTES = 15;

const data = new SlashCommandBuilder()
    .setName('rp')
    .setDescription('Sistema de Criacao de Cenas (Topicos)')
    .addSubcommand(sub => sub
        .setName('iniciar')
        .setDescription('Cria um topico visual para RP')
        .addStringOption(o => o
            .setName('titulo')
            .setDescription('Titulo da cena')
            .setRequired(true)
            .setMaxLength(80))
        .addStringOption(o => o
            .setName('participantes')
            .setDescription('Marque os jogadores (Ex: @joao @maria)')
            .setRequired(true))
        .addStringOption(o => o
            .setName('subtitulo')
            .setDescription('Subtitulo ou contexto da cena (Opcional)')
            .setMaxLength(120))
        .addStringOption(o => o
            .setName('ambientacao')
            .setDescription('Descricao da ambientacao do local (Opcional)')
            .setMaxLength(800))
        .addAttachmentOption(o => o
            .setName('cenario')
            .setDescription('Imagem ilustrativa do cenario (Opcional)')))
    .addSubcommand(sub => sub
        .setName('encerrar')
        .setDescription('Encerra a sessao de RP ativa neste topico e salva o historico'));

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'encerrar') {
        await interaction.deferReply();

        const activeSession = sessionStore.findActiveRpSessionByChannel(interaction.channelId);
        if (!activeSession) {
            return await replyAndDelete(interaction, 'Nao ha uma sessao de RP ativa neste canal/topico.');
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (activeSession.creator_discord_id !== interaction.user.id && !isAdmin) {
            return await replyAndDelete(interaction, 'Apenas o criador da sessao ou um administrador pode encerra-la.');
        }

        try {
            sessionStore.deleteSession(activeSession.id);
        } catch (err) {
            console.error('[rp encerrar] Erro ao deletar registros da sessao:', err);
            return await replyAndDelete(interaction, 'Erro ao encerrar a sessao.');
        }

        await replyAndDelete(interaction, 'Sessao encerrada e registros removidos com sucesso!', 5000);

        try {
            const channel = interaction.channel;
            if (channel?.isThread?.() && channel?.delete) {
                await channel.delete(`Sessao de RP encerrada por ${interaction.user.tag}`);
            }
        } catch (e) {
            console.warn('[rp encerrar] Nao foi possivel deletar o topico:', e.message);
        }
        return;
    }

    if (sub !== 'iniciar') return;

    const titulo = interaction.options.getString('titulo')?.trim();
    const participantesRaw = interaction.options.getString('participantes')?.trim();
    const subtitulo = interaction.options.getString('subtitulo')?.trim() || null;
    const ambientacao = interaction.options.getString('ambientacao')?.trim() || null;
    const cenario = interaction.options.getAttachment('cenario');

    await interaction.deferReply();

    const isMestre = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || false;

    const result = await iniciarCenaRp({
        guild: interaction.guild,
        targetChannel: interaction.channel,
        criador: {
            id: interaction.user.id,
            tag: interaction.user.tag,
            displayName: interaction.member.displayName || interaction.user.username
        },
        isMestre,
        titulo,
        participantesRaw,
        subtitulo,
        ambientacao,
        cenarioUrl: cenario?.url || null
    });

    if (!result.ok) {
        return await replyAndDelete(interaction, `✗ ${result.error}`);
    }
    return await replyAndDelete(interaction, `✓ **Cena Iniciada:** <#${result.threadId}>`, 5000);
}

function getPanelSession(interaction, customId) {
    const sessionId = customId.split('_').pop();
    const session = sessionStore.getSession(sessionId);
    if (!session || session.status !== 'ativa' || session.type !== 'rp' || session.discord_thread_id !== interaction.channelId) return null;
    return session;
}

function buildPanelComponents(sessionId, participantCount, tacticalActive) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rp_participantes_${sessionId}`).setLabel(`Participantes (${participantCount})`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rp_convidar_${sessionId}`).setLabel('Convidar jogador').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rp_cena_tatica_${sessionId}`).setLabel(tacticalActive ? 'Cena tatica ativa' : 'Iniciar cena tatica').setStyle(ButtonStyle.Success).setDisabled(tacticalActive),
        new ButtonBuilder().setCustomId(`rp_ver_ficha_${sessionId}`).setLabel('Ver ficha').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`encerrar_sessao_${sessionId}`).setLabel('Encerrar sessao').setStyle(ButtonStyle.Danger)
    )];
}

async function refreshPanel(interaction, session) {
    try {
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        const panel = messages.find(message => message.author.id === interaction.client.user.id && message.content.startsWith('**Painel da sessao**'));
        if (!panel) return;
        const count = sessionStore.getSessionParticipants(session.id).length;
        const tacticalActive = cenasAtivas.has(interaction.channelId);
        await panel.edit({
            content: `**Painel da sessao**\nParticipantes: **${count}**\nCena tatica: **${tacticalActive ? 'ativa' : 'nao iniciada'}**\n\nUse os botoes para consultar jogadores, convidar participantes, abrir uma cena tatica ou encerrar o RP.`,
            components: buildPanelComponents(session.id, count, tacticalActive)
        });
    } catch (error) {
        console.warn('[rp painel] Nao foi possivel atualizar o painel:', error.message);
    }
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith('rp_participantes_')) {
        const session = getPanelSession(interaction, interaction.customId);
        if (!session) return await interaction.reply({ content: 'Esta sessao nao esta mais ativa.', ephemeral: true });
        const participants = sessionStore.getSessionParticipants(session.id);
        const text = participants.length
            ? participants.map((p, i) => `${i + 1}. <@${p.discord_id}> — ${p.display_name}`).join('\n')
            : 'Nenhum participante registrado.';
        return await interaction.reply({ content: `**Participantes de ${session.title}**\n\n${text}`, ephemeral: true });
    }

    if (interaction.customId.startsWith('rp_convidar_')) {
        if (!getPanelSession(interaction, interaction.customId)) return await interaction.reply({ content: 'Esta sessao nao esta mais ativa.', ephemeral: true });
        const select = new UserSelectMenuBuilder()
            .setCustomId(RP_INVITE_SELECT)
            .setPlaceholder('Selecione quem deseja convidar')
            .setMinValues(1)
            .setMaxValues(15);
        return await interaction.reply({ content: 'Selecione um ou mais jogadores para adicionar a sessao.', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (interaction.customId.startsWith('rp_ver_ficha_')) {
        if (!getPanelSession(interaction, interaction.customId)) return await interaction.reply({ content: 'Esta sessao nao esta mais ativa.', ephemeral: true });
        const select = new UserSelectMenuBuilder().setCustomId(RP_PROFILE_SELECT).setPlaceholder('Selecione um jogador').setMinValues(1).setMaxValues(1);
        return await interaction.reply({ content: 'Selecione o jogador cuja ficha deseja consultar.', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (interaction.customId.startsWith('rp_cena_tatica_')) {
        const session = getPanelSession(interaction, interaction.customId);
        if (!session) return await interaction.reply({ content: 'Esta sessao nao esta mais ativa.', ephemeral: true });
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return await interaction.reply({ content: 'Somente mestres podem iniciar cenas taticas.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(RP_TACTICAL_MODAL).setTitle('Iniciar cena tatica');
        const cols = new TextInputBuilder().setCustomId('cena_colunas').setLabel('Colunas (3 a 20)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2);
        const rows = new TextInputBuilder().setCustomId('cena_linhas').setLabel('Linhas (3 a 20)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2);
        const name = new TextInputBuilder().setCustomId('cena_nome').setLabel('Nome da cena (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60);
        const desc = new TextInputBuilder().setCustomId('cena_descricao').setLabel('Descricao (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(180);
        const timer = new TextInputBuilder().setCustomId('cena_tempo').setLabel('Turno em segundos (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3);
        modal.addComponents(...[cols, rows, name, desc, timer].map(input => new ActionRowBuilder().addComponents(input)));
        return await interaction.showModal(modal);
    }
}

async function handleSelect(interaction) {
    if (interaction.customId === RP_INVITE_SELECT) {
        const session = sessionStore.findActiveRpSessionByChannel(interaction.channelId);
        if (!session) return await interaction.reply({ content: 'Esta sessao nao esta mais ativa.', ephemeral: true });
        const existing = new Set(sessionStore.getSessionParticipants(session.id).map(p => p.discord_id));
        const added = [];
        for (const id of interaction.values) {
            if (existing.has(id)) continue;
            const member = await interaction.guild.members.fetch(id).catch(() => null);
            sessionStore.addParticipant(session.id, id, member?.displayName || member?.user.username || 'Aventureiro');
            added.push(`<@${id}>`);
        }
        await refreshPanel(interaction, session);
        return await interaction.reply({ content: added.length ? `Participantes adicionados: ${added.join(', ')}.` : 'Todos os jogadores selecionados ja participavam da sessao.', ephemeral: true });
    }

    if (interaction.customId === RP_PROFILE_SELECT) {
        const userId = interaction.values[0];
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${userId}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            let buffer = profileCache.getProfile(p.id);
            if (!buffer) {
                buffer = await gerarBannerPerfil(p);
                profileCache.setProfile(p.id, buffer, 5 * 60 * 1000);
            }
            return await interaction.editReply({ content: `**Ficha de ${p.nome || 'personagem'}**`, embeds: [new EmbedBuilder().setColor(0xD4AF37).setImage('attachment://perfil.png')], files: [new AttachmentBuilder(buffer, { name: 'perfil.png' })] });
        } catch (error) {
            return await interaction.editReply('Nao foi possivel carregar a ficha desse jogador.');
        }
    }
    return false;
}

async function handleModal(interaction) {
    if (interaction.customId !== RP_TACTICAL_MODAL) return false;
    await interaction.deferReply({ ephemeral: true });
    const parse = (id) => Number(interaction.fields.getTextInputValue(id));
    const colunas = parse('cena_colunas');
    const linhas = parse('cena_linhas');
    const tempoRaw = interaction.fields.getTextInputValue('cena_tempo')?.trim();
    const tempoTurno = tempoRaw ? Number(tempoRaw) : null;
    if (!Number.isInteger(colunas) || colunas < 3 || colunas > 20 || !Number.isInteger(linhas) || linhas < 3 || linhas > 20) return await interaction.editReply('Colunas e linhas devem ser numeros inteiros entre 3 e 20.');
    if (tempoTurno !== null && (!Number.isInteger(tempoTurno) || tempoTurno < 15 || tempoTurno > 600)) return await interaction.editReply('O turno deve ficar entre 15 e 600 segundos.');
    const result = await cenaCommand.iniciarCenaTaticaPeloPainel(interaction, {
        colunas,
        linhas,
        nome: interaction.fields.getTextInputValue('cena_nome')?.trim() || null,
        descricao: interaction.fields.getTextInputValue('cena_descricao')?.trim() || null,
        tempoTurno
    });
    if (result.ok) {
        const session = sessionStore.findActiveRpSessionByChannel(interaction.channelId);
        if (session) await refreshPanel(interaction, session);
    }
    return await interaction.editReply(result.message);
}

module.exports = { data, execute, handleButton, handleSelect, handleModal };
