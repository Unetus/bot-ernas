const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} = require('discord.js');
const { gerarBannerLocalidade, gerarBannerPainelLocalidade } = require('../canvas/renderer');
const sessionStore = require('../utils/sessionStore');
const { replyAndDelete } = require('../utils/tempMessage');
const { iniciarCenaRp } = require('../utils/rpScene');
const { rpParticipantsSelection } = require('../utils/state');

const RP_SELECT_ID = 'localidade_rp_participantes';
const RP_MODAL_ID = 'localidade_modal_iniciar_rp';
const SELECTION_TTL_MS = 10 * 60 * 1000;

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

function selectionKey(interaction) {
    return `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}`;
}

function saveParticipantSelection(interaction, userIds) {
    const key = selectionKey(interaction);
    const expiresAt = Date.now() + SELECTION_TTL_MS;
    rpParticipantsSelection.set(key, { userIds, expiresAt });
    setTimeout(() => {
        const current = rpParticipantsSelection.get(key);
        if (current?.expiresAt === expiresAt) rpParticipantsSelection.delete(key);
    }, SELECTION_TTL_MS);
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
            sentMessage = await interaction.channel.send({ files: [attachment] });
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
            sentMessage = await interaction.channel.send({ files: [attachment], components: [row] });
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
        const select = new UserSelectMenuBuilder()
            .setCustomId(RP_SELECT_ID)
            .setPlaceholder('Selecione os participantes do RP')
            .setMinValues(1)
            .setMaxValues(15);
        const row = new ActionRowBuilder().addComponents(select);

        return await interaction.reply({
            ephemeral: true,
            content: '**Selecione os participantes do RP.**\n\nEscolha de 1 a 15 jogadores no campo abaixo. Depois da selecao, o formulario da cena sera aberto automaticamente.',
            components: [row]
        });
    }
}

async function handleSelect(interaction) {
    if (interaction.customId !== RP_SELECT_ID) return false;

    const userIds = [...new Set(interaction.values || [])];
    if (userIds.length < 1 || userIds.length > 15) {
        await interaction.reply({ content: 'Selecione entre 1 e 15 participantes.', ephemeral: true });
        return true;
    }

    saveParticipantSelection(interaction, userIds);

    const modal = new ModalBuilder()
        .setCustomId(RP_MODAL_ID)
        .setTitle('Iniciar Cena de RP');

    const tituloInput = new TextInputBuilder()
        .setCustomId('rp_titulo')
        .setLabel('Titulo da cena')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);

    const subtituloInput = new TextInputBuilder()
        .setCustomId('rp_subtitulo')
        .setLabel('Subtitulo ou contexto (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(120);

    const ambientacaoInput = new TextInputBuilder()
        .setCustomId('rp_ambientacao')
        .setLabel('Ambientacao do local (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(800);

    modal.addComponents(
        new ActionRowBuilder().addComponents(tituloInput),
        new ActionRowBuilder().addComponents(subtituloInput),
        new ActionRowBuilder().addComponents(ambientacaoInput)
    );

    await interaction.showModal(modal);
    return true;
}

async function handleModal(interaction) {
    if (interaction.customId !== RP_MODAL_ID) return false;

    await interaction.deferReply({ ephemeral: true });

    const selection = rpParticipantsSelection.get(selectionKey(interaction));
    rpParticipantsSelection.delete(selectionKey(interaction));
    if (!selection || selection.expiresAt < Date.now()) {
        await interaction.editReply('A selecao de participantes expirou. Clique em **Iniciar RP** novamente.');
        return true;
    }

    const titulo = interaction.fields.getTextInputValue('rp_titulo')?.trim();
    const subtitulo = interaction.fields.getTextInputValue('rp_subtitulo')?.trim() || null;
    const ambientacao = interaction.fields.getTextInputValue('rp_ambientacao')?.trim() || null;
    const participantesRaw = selection.userIds.map(id => `<@${id}>`).join(' ');
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
        cenarioUrl: null
    });

    if (!result.ok) {
        await interaction.editReply(`✗ ${result.error}`);
        return true;
    }

    await interaction.editReply(`✓ **Cena Iniciada:** <#${result.threadId}>`);
    return true;
}

module.exports = { data, execute, handleButton, handleSelect, handleModal };
