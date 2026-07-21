const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gerarBannerLocalidade, gerarBannerPainelLocalidade } = require('../canvas/renderer');
const sessionStore = require('../utils/sessionStore');
const { replyAndDelete } = require('../utils/tempMessage');

const data = new SlashCommandBuilder()
    .setName('localidade')
    .setDescription('Configura e gerencia canais de localidade (RP fixo por regiao)')
    .addSubcommand(sub => sub
        .setName('configurar')
        .setDescription('[Mestre/Admin] Publica o card da localidade e registra o canal')
        .addStringOption(o => o
            .setName('titulo')
            .setDescription('Nome da localidade')
            .setRequired(true)
            .setMaxLength(80))
        .addStringOption(o => o
            .setName('descricao')
            .setDescription('Descricao do ambiente')
            .setRequired(true)
            .setMaxLength(800))
        .addAttachmentOption(o => o
            .setName('imagem')
            .setDescription('Imagem de referencia do ambiente')
            .setRequired(true)))
    .addSubcommand(sub => sub
        .setName('painel')
        .setDescription('[Mestre/Admin] Publica o painel fixo de acoes da localidade'));

function hasMasterAccess(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
        || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'configurar') {
        if (!hasMasterAccess(interaction)) {
            return await replyAndDelete(interaction, 'Apenas mestres ou administradores podem configurar localidades.', 6000);
        }
        await interaction.deferReply();

        const titulo = interaction.options.getString('titulo')?.trim();
        const descricao = interaction.options.getString('descricao')?.trim();
        const imagem = interaction.options.getAttachment('imagem');

        if (!titulo || !descricao || !imagem) {
            return await replyAndDelete(interaction, 'Preencha titulo, descricao e anexe a imagem de referencia.');
        }

        let buffer;
        try {
            buffer = await gerarBannerLocalidade({ titulo, descricao, imagemUrl: imagem.url });
        } catch (e) {
            console.error('[localidade configurar] Erro ao renderizar banner:', e);
            return await replyAndDelete(interaction, 'Erro ao renderizar o card da localidade.');
        }

        const attachment = new AttachmentBuilder(buffer, { name: 'localidade-card.png' });

        let sentMessage = null;
        try {
            sentMessage = await interaction.channel.send({
                files: [attachment]
            });
        } catch (e) {
            console.error('[localidade configurar] Erro ao enviar:', e);
            return await replyAndDelete(interaction, 'Erro ao publicar o card no canal.');
        }

        try {
            if (sentMessage?.pin) await sentMessage.pin();
        } catch (pinErr) {
            console.warn('[localidade configurar] Nao foi possivel fixar:', pinErr.message);
        }

        try {
            sessionStore.upsertLocality({
                discordChannelId: interaction.channelId,
                discordGuildId: interaction.guild.id,
                title: titulo,
                description: descricao,
                imageUrl: imagem.url,
                updatedBy: interaction.user.id
            });
        } catch (e) {
            console.error('[localidade configurar] Erro ao salvar no banco:', e);
        }

        return await replyAndDelete(interaction, `Localidade **${titulo}** configurada e publicada. Agora use \`/localidade painel\` para fixar o painel de acoes.`);
    }

    if (sub === 'painel') {
        if (!hasMasterAccess(interaction)) {
            return await replyAndDelete(interaction, 'Apenas mestres ou administradores podem publicar o painel.', 6000);
        }
        await interaction.deferReply();

        const locality = sessionStore.getLocality(interaction.channelId);
        const tituloPainel = locality?.title || interaction.channel.name || 'Localidade';

        let buffer;
        try {
            buffer = await gerarBannerPainelLocalidade({ titulo: tituloPainel });
        } catch (e) {
            console.error('[localidade painel] Erro ao renderizar:', e);
            return await replyAndDelete(interaction, 'Erro ao renderizar o painel.');
        }

        const attachment = new AttachmentBuilder(buffer, { name: 'localidade-painel.png' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('localidade_iniciar_rp')
                .setLabel('Iniciar RP')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('localidade_explorar')
                .setLabel('Explorar')
                .setStyle(ButtonStyle.Secondary)
        );

        let sentMessage = null;
        try {
            sentMessage = await interaction.channel.send({
                files: [attachment],
                components: [row]
            });
            if (sentMessage?.pin) await sentMessage.pin();
        } catch (e) {
            console.error('[localidade painel] Erro ao enviar:', e);
            return await replyAndDelete(interaction, 'Erro ao publicar o painel.');
        }

        try {
            sessionStore.setLocalityPanelMessageId(interaction.channelId, sentMessage.id);
        } catch (e) {
            console.warn('[localidade painel] Nao foi possivel registrar o id do painel:', e.message);
        }

        return await replyAndDelete(interaction, 'Painel de acoes publicado e fixado no canal.');
    }
}

async function handleButton(interaction) {
    if (interaction.customId === 'localidade_explorar') {
        return await replyAndDelete(interaction, 'A mecanica de **Explorar** ainda esta em desenvolvimento. Fique ligado nas novidades!', 6000);
    }

    if (interaction.customId === 'localidade_iniciar_rp') {
        return await replyAndDelete(interaction, 'Use o comando `/rp iniciar` neste canal para abrir a cena. A mensagem deste painel sera removida automaticamente para manter apenas as mensagens fixas.', 8000);
    }
}

module.exports = { data, execute, handleButton };
