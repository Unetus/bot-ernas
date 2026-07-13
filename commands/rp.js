const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { gerarBannerRpTitulo, gerarBannerRpParticipantes, gerarBannerRpAmbientacao } = require('../canvas/renderer');

const MAX_PARTICIPANTES = 15;
const MENTION_REGEX = /<@!?(\d+)>/g;

const data = new SlashCommandBuilder()
    .setName('rp')
    .setDescription('Sistema de Criação de Cenas (Tópicos)')
    .addSubcommand(sub => sub
        .setName('iniciar')
        .setDescription('Cria um tópico visual para RP')
        .addStringOption(o => o
            .setName('titulo')
            .setDescription('Título da cena')
            .setRequired(true)
            .setMaxLength(80))
        .addStringOption(o => o
            .setName('participantes')
            .setDescription('Marque os jogadores (Ex: @joao @maria)')
            .setRequired(true))
        .addStringOption(o => o
            .setName('subtitulo')
            .setDescription('Subtítulo ou contexto da cena (Opcional)')
            .setMaxLength(120))
        .addStringOption(o => o
            .setName('ambientacao')
            .setDescription('Descrição da ambientação do local (Opcional)')
            .setMaxLength(800))
        .addAttachmentOption(o => o
            .setName('cenario')
            .setDescription('Imagem ilustrativa do cenário (Opcional)'))
    );

function extrairMencoes(texto) {
    if (!texto) return [];
    const matches = [...texto.matchAll(MENTION_REGEX)];
    return [...new Set(matches.map(m => m[1]))];
}

async function buscarParticipantes(guild, ids) {
    const resultado = [];
    for (const id of ids) {
        try {
            const member = await guild.members.fetch(id);
            resultado.push({
                id,
                displayName: member.displayName || member.user.username,
                avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 })
            });
        } catch {
            resultado.push({
                id,
                displayName: 'Aventureiro',
                avatarUrl: 'https://i.imgur.com/vHqB3q0.png'
            });
        }
    }
    return resultado;
}

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'iniciar') return;

    const titulo = interaction.options.getString('titulo')?.trim();
    const participantesRaw = interaction.options.getString('participantes')?.trim();
    const subtitulo = interaction.options.getString('subtitulo')?.trim() || null;
    const ambientacao = interaction.options.getString('ambientacao')?.trim() || null;
    const cenario = interaction.options.getAttachment('cenario');

    const ids = extrairMencoes(participantesRaw);
    if (ids.length === 0) {
        return await interaction.reply({
            content: '✗ Marque pelo menos um participante usando @usuário.',
            ephemeral: true
        });
    }
    if (ids.length > MAX_PARTICIPANTES) {
        return await interaction.reply({
            content: `✗ Limite de ${MAX_PARTICIPANTES} participantes por cena.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    let targetChannel = interaction.channel;
    if (!targetChannel.threads) {
        targetChannel = await interaction.guild.channels.fetch(interaction.channelId);
    }
    if (!targetChannel.threads) {
        return await interaction.editReply('✗ Este tipo de canal não suporta a criação de tópicos de RP.');
    }

    const isMestre = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || false;

    let participantes;
    try {
        participantes = await buscarParticipantes(interaction.guild, ids);
    } catch (e) {
        console.error('[rp iniciar] Erro ao buscar participantes:', e);
        participantes = ids.map(id => ({
            id,
            displayName: 'Aventureiro',
            avatarUrl: 'https://i.imgur.com/vHqB3q0.png'
        }));
    }

    let tituloBuffer, participantesBuffer, ambientacaoBuffer;
    try {
        tituloBuffer = await gerarBannerRpTitulo({
            titulo,
            subtitulo,
            criador: { tag: interaction.user.tag },
            mestre: isMestre
        });
        participantesBuffer = await gerarBannerRpParticipantes(participantes);
        if (ambientacao) {
            ambientacaoBuffer = await gerarBannerRpAmbientacao(ambientacao, subtitulo);
        }
    } catch (e) {
        console.error('[rp iniciar] Erro ao renderizar banners:', e);
        return await interaction.editReply('✗ Erro ao gerar as imagens da cena de RP.');
    }

    try {
        const thread = await targetChannel.threads.create({
            name: titulo.substring(0, 100),
            autoArchiveDuration: 1440,
            reason: `Cena de RP: ${titulo}`
        });

        let webhook;
        try {
            const webhooks = await targetChannel.fetchWebhooks();
            webhook = webhooks.find(wh => wh.token) || await targetChannel.createWebhook({ name: 'Arkandia System' });
        } catch (e) {
            console.warn('[rp iniciar] Webhook indisponível, usando fallback:', e.message);
        }

        const enviar = async (conteudo) => {
            if (webhook) {
                return await webhook.send({
                    ...conteudo,
                    threadId: thread.id,
                    username: 'Narrador',
                    avatarURL: 'https://i.imgur.com/2U5fPoy.png'
                });
            }
            return await thread.send(conteudo);
        };

        // 1. Banner de título (fixado)
        const tituloAttachment = new AttachmentBuilder(tituloBuffer, { name: 'rp-titulo.png' });
        const msgTitulo = await enviar({ files: [tituloAttachment] });
        try {
            await msgTitulo.pin();
        } catch (pinErr) {
            console.warn('[rp iniciar] Não foi possível fixar a mensagem de título:', pinErr.message);
        }

        // 2. Banner de participantes
        const partAttachment = new AttachmentBuilder(participantesBuffer, { name: 'rp-participantes.png' });
        await enviar({ files: [partAttachment] });

        // 3. Banner de ambientação/contexto
        if (ambientacaoBuffer) {
            const ambAttachment = new AttachmentBuilder(ambientacaoBuffer, { name: 'rp-ambientacao.png' });
            await enviar({ files: [ambAttachment] });
        }

        // 4. Ilustração do cenário (mantida como estava)
        if (cenario) {
            const imgEmbed = new EmbedBuilder()
                .setTitle('Ilustração do Cenário')
                .setImage(cenario.url)
                .setColor(0x1E1E1E);
            await enviar({ embeds: [imgEmbed] });
        }

        return await interaction.editReply(`✓ **Cena Iniciada:** <#${thread.id}>`);
    } catch (e) {
        console.error('[rp iniciar] Erro ao criar cena de RP:', e);
        return await interaction.editReply('✗ Houve um erro ao criar a cena de RP.');
    }
}

module.exports = { data, execute };
