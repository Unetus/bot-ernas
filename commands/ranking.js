const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { gerarBannerRanking } = require('../canvas/renderer');
const { embedErro } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

function getRankingButtons(tipo) {
    const options = [
        ['poder', 'Poder'],
        ['nivel', 'Nível'],
        ['guildas', 'Guildas'],
        ['arena', 'Arena']
    ];

    return new ActionRowBuilder().addComponents(
        ...options.map(([value, label]) => new ButtonBuilder()
            .setCustomId(`ranking_switch_${value}`)
            .setLabel(`${tipo === value ? '◆' : '◇'} ${label}`)
            .setStyle(ButtonStyle.Secondary))
    );
}

const data = new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Visualiza o ranking global de Arkandia');

async function execute(interaction) {
    const tipo = interaction.options.getString('tipo') || 'poder';
    try {
        await interaction.deferReply();
        const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
        const buffer = await gerarBannerRanking(tipo, res.data);
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
        const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
        const buffer = await gerarBannerRanking(tipo, res.data);
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
