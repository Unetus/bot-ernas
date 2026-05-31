const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
    .setName('rp')
    .setDescription('Sistema de Criação de Cenas (Tópicos)')
    .addSubcommand(sub => sub
        .setName('iniciar')
        .setDescription('Cria um tópico para RP')
        .addStringOption(o => o.setName('titulo').setDescription('Título do tópico').setRequired(true))
        .addStringOption(o => o.setName('participantes').setDescription('Marque os jogadores (Ex: @joao @maria)').setRequired(true))
        .addStringOption(o => o.setName('subtitulo').setDescription('Subtítulo ou contexto da cena (Opcional)'))
        .addStringOption(o => o.setName('ambientacao').setDescription('Descrição da ambientação do local (Opcional)'))
        .addAttachmentOption(o => o.setName('cenario').setDescription('Imagem ilustrativa do cenário (Opcional)'))
    );

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'iniciar') {
        const titulo = interaction.options.getString('titulo');
        const participantes = interaction.options.getString('participantes');
        const subtitulo = interaction.options.getString('subtitulo');
        const ambientacao = interaction.options.getString('ambientacao');
        const cenario = interaction.options.getAttachment('cenario');

        try {
            await interaction.deferReply({ ephemeral: true });
            
            let targetChannel = interaction.channel;
            
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

            await thread.send({
                content: `**Participantes:** ${participantes}\n\n-# Cena criada por <@${interaction.user.id}>. Interpretem livremente.`
            });

            try {
                const webhooks = await targetChannel.fetchWebhooks();
                let webhook = webhooks.find(wh => wh.token) || await targetChannel.createWebhook({ name: 'Arkandia System' });

                let descricaoMsg = `## ✶ ${titulo}`;
                if (subtitulo) descricaoMsg += `\n-# ${subtitulo}`;
                if (ambientacao) descricaoMsg += `\n\n**Ambientação**\n-# ${ambientacao}`;

                await webhook.send({
                    content: descricaoMsg,
                    username: 'Narrador',
                    avatarURL: 'https://i.imgur.com/2U5fPoy.png',
                    threadId: thread.id
                });

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
                let fallbackMsg = `## ✶ ${titulo}`;
                if (subtitulo) fallbackMsg += `\n→ *${subtitulo}*`;
                if (ambientacao) fallbackMsg += `\n\n**Ambientação**\n-# ${ambientacao}`;
                if (cenario) fallbackMsg += `\n\n**Ilustração do cenário**\n${cenario.url}`;

                await thread.send({ content: fallbackMsg });
            }

            return await interaction.editReply(`✓ **Cena Iniciada:** <#${thread.id}>`);
        } catch (e) {
            console.error(e);
            return await interaction.editReply('✗ Houve um erro ao criar a cena de RP.');
        }
    }
}

module.exports = { data, execute };
