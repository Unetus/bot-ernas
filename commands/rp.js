const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { iniciarCenaRp } = require('../utils/rpScene');
const sessionStore = require('../utils/sessionStore');
const { replyAndDelete } = require('../utils/tempMessage');

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
            sessionStore.finishSession(activeSession.id, interaction.user.id);
        } catch (err) {
            console.error('[rp encerrar] Erro ao finalizar sessao:', err);
            return await replyAndDelete(interaction, 'Erro ao encerrar a sessao.');
        }

        await replyAndDelete(interaction, 'Sessao encerrada e historico salvo com sucesso!', 5000);

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

module.exports = { data, execute };
