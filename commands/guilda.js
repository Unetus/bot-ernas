const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { gerarBannerGuilda } = require('../canvas/renderer');
const { embedErro } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('guilda')
    .setDescription('Busca as informações de uma guilda')
    .addStringOption(o => o.setName('nome').setDescription('Nome ou sigla da guilda').setRequired(true));

async function execute(interaction) {
    const nomeInput = interaction.options.getString('nome');
    try {
        await interaction.deferReply();
        
        let guildaId = nomeInput;
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(nomeInput);

        if (!isUUID) {
            // Buscar guilda no ranking para obter o UUID associado ao nome ou sigla
            const resRanking = await axios.get(`${ARKANDIA_API}/rankings/guildas?limit=50`, { headers: { 'X-API-Key': API_KEY } });
            const listGuildas = Array.isArray(resRanking.data) ? resRanking.data : (resRanking.data.guildas || []);
            
            const guildaMatch = listGuildas.find(g => 
                (g.nome && g.nome.toLowerCase() === nomeInput.toLowerCase()) || 
                (g.sigla && g.sigla.toLowerCase() === nomeInput.toLowerCase())
            ) || listGuildas.find(g => 
                (g.nome && g.nome.toLowerCase().includes(nomeInput.toLowerCase())) || 
                (g.sigla && g.sigla.toLowerCase().includes(nomeInput.toLowerCase()))
            );

            if (!guildaMatch) {
                return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não foi encontrada no ranking de guildas. Verifique a grafia ou utilize a sigla.`)] });
            }
            guildaId = guildaMatch.id;
        }

        const res = await axios.get(`${ARKANDIA_API}/guildas/${guildaId}`, { headers: { 'X-API-Key': API_KEY } });
        const guilda = res.data;
        
        if (!guilda) {
            return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não encontrada.`)] });
        }

        const buffer = await gerarBannerGuilda(guilda);
        const attachment = new AttachmentBuilder(buffer, { name: 'guilda.png' });

        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://guilda.png');

        return await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (e) {
        console.error(e);
        if (e.response?.status === 404) {
            return await interaction.editReply({ embeds: [embedErro(`Guilda "${nomeInput}" não encontrada.`)] });
        }
        return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar dados da guilda: ${e.response?.data?.error || e.message}`)] });
    }
}

module.exports = { data, execute };
