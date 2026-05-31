const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const catalogCache = require('../catalogCache');
const { formatarTexto, embedErro } = require('../utils/helpers');

const ITEMS_PER_PAGE = 5;

/**
 * Monta o embed de página do bestiário
 */
function buildBestiarioPage(bestiario, page, totalPages) {
    const start = page * ITEMS_PER_PAGE;
    const slice = bestiario.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((mob, i) => {
        const classificacao = mob.classificacao ? `[Tier ${mob.classificacao}]` : '';
        return `**${start + i + 1}.** 🦇 **${formatarTexto(mob.nome)}** ${classificacao} — ${formatarTexto(mob.tipo || 'Desconhecido')}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle('🦇 Bestiário de Arkandia')
        .setDescription(desc || '*Nenhuma criatura encontrada nesta página.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${bestiario.length} monstros` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bestiario_prev_${page}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`bestiario_next_${page}`)
            .setEmoji('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const options = slice.map(mob => ({
        label: formatarTexto(mob.nome).substring(0, 100),
        description: (mob.tipo || 'Criatura Selvagem').substring(0, 100),
        value: mob.id || mob.slug || mob.nome
    }));

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_bestiario_mob')
            .setPlaceholder('Ver lore da criatura')
            .addOptions(options.length > 0 ? options : [{ label: 'Vazio', value: 'empty' }])
            .setDisabled(options.length === 0)
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
}

/**
 * Embed detalhado para uma criatura
 */
function buildBestiarioDetail(mob) {
    const embed = new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle(`🦇 ${formatarTexto(mob.nome)}`)
        .setDescription(mob.descricao || mob.lore || '*Sem informações detalhadas.*')
        .addFields({ name: 'Tipo', value: formatarTexto(mob.tipo || 'Desconhecido'), inline: true });

    if (mob.classificacao) embed.addFields({ name: 'Periculosidade', value: `Tier ${mob.classificacao}`, inline: true });
    if (mob.fraqueza) embed.addFields({ name: 'Fraqueza', value: formatarTexto(mob.fraqueza), inline: true });
    if (mob.drop) embed.addFields({ name: 'Drop Principal', value: formatarTexto(mob.drop), inline: true });
    
    if (mob.imagem_url) embed.setImage(mob.imagem_url);

    return { embeds: [embed] };
}

const data = new SlashCommandBuilder()
    .setName('bestiario')
    .setDescription('Consulta os monstros e criaturas do mundo')
    .addSubcommand(sub => sub.setName('list').setDescription('Navega por todas as criaturas catalogadas')
        .addStringOption(o => o.setName('nome').setDescription('Busca por nome específico'))
        .addIntegerOption(o => o.setName('tier').setDescription('Filtrar por Tier de perigo').setMinValue(1).setMaxValue(10))
        .addStringOption(o => o.setName('tipo').setDescription('Filtrar por tipo (Ex: Besta, Demônio)'))
    );

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
        const nome = interaction.options.getString('nome');
        const tier = interaction.options.getInteger('tier');
        const tipo = interaction.options.getString('tipo');

        if (nome) {
            const mob = catalogCache.findBestiario(nome);
            if (!mob) return await interaction.reply({ embeds: [embedErro(`Criatura "${nome}" não encontrada no bestiário.`)] });
            return await interaction.reply(buildBestiarioDetail(mob));
        }

        const filtros = {};
        if (tier) filtros.classificacao = tier;
        if (tipo) filtros.tipo = tipo;

        const monstros = catalogCache.listBestiario(filtros);
        if (monstros.length === 0) {
            return await interaction.reply({ embeds: [embedErro('Nenhuma criatura encontrada com esses filtros.')] });
        }

        const searchKey = `bestiario_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, filtros, 10 * 60 * 1000);
        
        const totalPages = Math.ceil(monstros.length / ITEMS_PER_PAGE);
        const payload = buildBestiarioPage(monstros, 0, totalPages);
        
        payload.components[1].components[0].setCustomId(`bestiario_prev_0_${searchKey}`);
        payload.components[1].components[1].setCustomId(`bestiario_next_0_${searchKey}`);

        return await interaction.reply(payload);
    }
}

async function handleButton(interaction) {
    const parts = interaction.customId.split('_');
    const direction = parts[1]; // 'prev' ou 'next'
    const currentPage = parseInt(parts[2]);
    const searchKey = parts.slice(3).join('_');

    const filtros = catalogCache.getGeneric(searchKey) || {};
    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    const monstros = catalogCache.listBestiario(filtros);
    const totalPages = Math.ceil(monstros.length / ITEMS_PER_PAGE);
    const pg = Math.max(0, Math.min(newPage, totalPages - 1));
    const payload = buildBestiarioPage(monstros, pg, totalPages);
    
    payload.components[1].components[0].setCustomId(`bestiario_prev_${pg}_${searchKey}`);
    payload.components[1].components[1].setCustomId(`bestiario_next_${pg}_${searchKey}`);

    return await interaction.update(payload);
}

async function handleSelect(interaction) {
    const selectedId = interaction.values[0];
    if (selectedId === 'empty') return await interaction.deferUpdate();

    if (interaction.customId === 'select_bestiario_mob') {
        const mob = catalogCache.findBestiario(selectedId);
        if (!mob) return await interaction.reply({ embeds: [embedErro('Criatura não encontrada no banco de dados.')], ephemeral: true });
        
        return await interaction.reply({ ...buildBestiarioDetail(mob), ephemeral: true });
    }
}

module.exports = {
    data,
    execute,
    handleButton,
    handleSelect
};
