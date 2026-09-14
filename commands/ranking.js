const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { gerarBannerRanking } = require('../canvas/renderer');
const { embedErro } = require('../utils/helpers');
const socialProgression = require('../utils/socialProgression');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

function getRankingButtons(tipo) {
    const options = [
        ['social', 'XP Social'],
        ['poder', 'Poder'],
        ['nivel', 'Nível'],
        ['guildas', 'Guildas'],
        ['arena', 'Arena']
    ];

    return new ActionRowBuilder().addComponents(
        ...options.map(([value, label]) => new ButtonBuilder()
            .setCustomId(`ranking_switch_${value}`)
            .setLabel(`${tipo === value ? '◆' : '◇'} ${label}`)
            .setStyle(tipo === value ? ButtonStyle.Primary : ButtonStyle.Secondary))
    );
}

const data = new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Visualiza o ranking social e os rankings de Tales of Ernas');

async function getSocialRanking(interaction, limit = 10) {
    const rows = socialProgression.listProgression(interaction.guildId, limit);
    return Promise.all(rows.map(async (row) => {
        const member = interaction.guild
            ? await interaction.guild.members.fetch(row.discordUserId).catch(() => null)
            : null;
        const discordUsername = member?.displayName || member?.user?.username || row.discordUserId;
        const discordAvatarUrl = member?.user?.displayAvatarURL?.({ extension: 'png', size: 128, forceStatic: true }) || null;
        let personagem = null;
        try {
            const response = await axios.get(`${ARKANDIA_API}/personagens/discord/${encodeURIComponent(row.discordUserId)}`, {
                headers: { 'X-API-Key': API_KEY },
                timeout: 8000
            });
            personagem = response.data || null;
        } catch (_) {
            // O ranking social continua disponível para membros sem ficha
            // ativa ou quando a API pública estiver temporariamente indisponível.
        }
        return {
            ...row,
            nome: personagem?.nome || 'Sem personagem',
            discordUsername,
            avatarUrl: personagem?.avatar_url || personagem?.imagem_url || personagem?.retrato_url || discordAvatarUrl,
            discordUserId: row.discordUserId,
            xp_total: row.xpTotal,
            nivel: row.level,
            rank_social: row.rank?.name || 'Bronze'
        };
    }));
}

async function getRankingData(interaction, tipo) {
    if (tipo === 'social') return getSocialRanking(interaction);
    const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
    return res.data;
}

async function execute(interaction) {
    const tipo = interaction.options.getString('tipo') || 'social';
    try {
        await interaction.deferReply();
        const rankingData = await getRankingData(interaction, tipo);
        const buffer = await gerarBannerRanking(tipo, rankingData);
        const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://ranking.png');

        const row = getRankingButtons(tipo);

        return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
    } catch (e) {
        console.error(e);
        const erroMsg = e.response?.data?.error || e.message;
        if (interaction.deferred) {
            return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar o ranking de ${tipo}: ${erroMsg}`)] });
        } else {
            return await interaction.reply({ embeds: [embedErro(`Erro ao buscar o ranking de ${tipo}: ${erroMsg}`)], ephemeral: true });
        }
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('ranking_switch_')) return;
    
    await interaction.deferUpdate();
    const tipo = interaction.customId.replace('ranking_switch_', '');
    try {
        const rankingData = await getRankingData(interaction, tipo);
        const buffer = await gerarBannerRanking(tipo, rankingData);
        const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://ranking.png');

        const row = getRankingButtons(tipo);

        return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
    } catch (e) {
        console.error(e);
        return await interaction.followUp({ embeds: [embedErro(`Erro ao atualizar ranking para ${tipo}: ${e.message}`)], ephemeral: true });
    }
}

module.exports = { data, execute, handleButton };
