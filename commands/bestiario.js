const { SlashCommandBuilder } = require('discord.js');
const catalogCache = require('../catalogCache');
const { embedErro } = require('../utils/helpers');
const catalogoCmd = require('./catalogo');

const data = new SlashCommandBuilder()
    .setName('bestiario')
    .setDescription('Acesso rápido ao Bestiário oficial de Arkandia')
    .addStringOption(o => o.setName('busca').setDescription('Nome específico do monstro (Opcional)'));

const ITEMS_PER_PAGE = 5;

async function execute(interaction) {
    await interaction.deferReply();
    const busca = interaction.options.getString('busca');

    if (busca) {
        const query = busca.toLowerCase();
        const mob = catalogCache.findBestiario(query);
        if (mob) {
            return await interaction.editReply(catalogoCmd.buildBestiarioDetail(mob, true));
        }

        const filtrados = catalogCache.listBestiario({ busca: query });
        if (filtrados.length > 0) {
            const searchKey = `mobs_${interaction.user.id}_${Date.now()}`;
            catalogCache.setGeneric(searchKey, { busca: query }, 10 * 60 * 1000);
            const totalPages = Math.ceil(filtrados.length / ITEMS_PER_PAGE);
            return await interaction.editReply(catalogoCmd.buildBestiarioPage(filtrados, 0, totalPages, searchKey));
        }

        return await interaction.editReply({ embeds: [embedErro(`Nenhuma criatura com o nome "${busca}" foi encontrada no bestiário.`)] });
    }

    const mobs = catalogCache.listBestiario();
    const searchKey = `mobs_${interaction.user.id}_${Date.now()}`;
    catalogCache.setGeneric(searchKey, {}, 10 * 60 * 1000);
    const totalPages = Math.ceil(mobs.length / ITEMS_PER_PAGE);
    return await interaction.editReply(catalogoCmd.buildBestiarioPage(mobs, 0, totalPages, searchKey));
}

async function handleButton(interaction) {
    return await catalogoCmd.handleButton(interaction);
}

async function handleSelect(interaction) {
    return await catalogoCmd.handleSelect(interaction);
}

module.exports = {
    data,
    execute,
    handleButton,
    handleSelect
};
