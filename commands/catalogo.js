const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, SlashCommandBuilder } = require('discord.js');
const catalogCache = require('../catalogCache');
const { formatarTexto, embedErro } = require('../utils/helpers');

// Configurações do Catálogo
const RARIDADE_CORES = {
    comum: 0x6B7280, // Cinza
    raro: 0x3B82F6, // Azul
    epico: 0x8B5CF6, // Roxo
    lendario: 0xF59E0B, // Laranja
    mitico: 0xC41E3A // Vermelho escuro
};

const RARIDADE_EMOJIS = {
    comum: '⚪',
    raro: '🔵',
    epico: '🟣',
    lendario: '🟠',
    mitico: '🔴'
};

const ITEMS_PER_PAGE = 5;

// ===========================
// Builders de Interface (UI)
// ===========================

/**
 * Monta o Painel Inicial de Catálogos (Home Dashboard)
 */
function buildHomeDashboard() {
    const embed = new EmbedBuilder()
        .setColor(0xD4AF37) // Dourado Imperial Premium
        .setTitle('📖 Central de Catálogos de Arkandia')
        .setDescription(
            `Seja bem-vindo à biblioteca imperial de Arkandia! Aqui você pode consultar todos os registros oficiais do RPG em tempo real.\n\n` +
            `🎒 **Catálogo de Itens:** Equipamentos, consumíveis, defesas, armas e muito mais.\n` +
            `⚔️ **Catálogo de Habilidades:** Grimórios completos, skills de classe e maestrias.\n` +
            `🦇 **Bestiário Oficial:** Lendas, fraquezas, tiers e drops das criaturas do mundo.\n\n` +
            `*Clique em um dos botões abaixo para começar a navegar!*`
        )
        .setThumbnail('https://i.imgur.com/2U5fPoy.png');

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('catalogo_btn_itens')
            .setLabel('🎒 Itens')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('catalogo_btn_skills')
            .setLabel('⚔️ Habilidades')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('catalogo_btn_mobs')
            .setLabel('🦇 Bestiário')
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [rowButtons] };
}

/**
 * Monta o embed de página de itens
 */
function buildItensPage(itens, page, totalPages, searchKey = '') {
    const start = page * ITEMS_PER_PAGE;
    const slice = itens.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((item, i) => {
        const emoji = RARIDADE_EMOJIS[item.raridade] || '⚪';
        return `**${start + i + 1}.** ${emoji} **${formatarTexto(item.nome)}** — *${formatarTexto(item.categoria)}*`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🎒 Catálogo de Itens')
        .setDescription(desc || '*Nenhum item encontrado.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${itens.length} itens` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`catalogo_itens_prev_${page}_${searchKey}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('catalogo_btn_home')
            .setEmoji('🏠')
            .setLabel('Menu Principal')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`catalogo_itens_next_${page}_${searchKey}`)
            .setEmoji('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const options = slice.map(item => ({
        label: formatarTexto(item.nome).substring(0, 100),
        description: formatarTexto(item.categoria).substring(0, 100),
        value: item.id
    }));

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_catalogo_item')
            .setPlaceholder('Ver detalhes de um item')
            .addOptions(options.length > 0 ? options : [{ label: 'Vazio', value: 'empty' }])
            .setDisabled(options.length === 0)
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
}

/**
 * Monta o embed de página de habilidades (skills)
 */
function buildSkillsPage(skills, page, totalPages, searchKey = '') {
    const start = page * ITEMS_PER_PAGE;
    const slice = skills.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((s, i) => {
        const classe = s.classe ? formatarTexto(s.classe) : 'Geral';
        return `**${start + i + 1}.** ⚔️ **${formatarTexto(s.nome)}** — *${formatarTexto(s.tipo)}* (${classe})`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📜 Catálogo de Habilidades')
        .setDescription(desc || '*Nenhuma habilidade encontrada.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${skills.length} habilidades` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`catalogo_skills_prev_${page}_${searchKey}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('catalogo_btn_home')
            .setEmoji('🏠')
            .setLabel('Menu Principal')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`catalogo_skills_next_${page}_${searchKey}`)
            .setEmoji('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const options = slice.map(s => ({
        label: formatarTexto(s.nome).substring(0, 100),
        description: (formatarTexto(s.tipo) + (s.classe ? ` - ${formatarTexto(s.classe)}` : '')).substring(0, 100),
        value: s.id
    }));

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_catalogo_skill')
            .setPlaceholder('Ver detalhes de uma habilidade')
            .addOptions(options.length > 0 ? options : [{ label: 'Vazio', value: 'empty' }])
            .setDisabled(options.length === 0)
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
}

/**
 * Monta o embed de página do bestiário
 */
function buildBestiarioPage(bestiario, page, totalPages, searchKey = '') {
    const start = page * ITEMS_PER_PAGE;
    const slice = bestiario.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((mob, i) => {
        const classificacao = mob.classificacao ? `[Tier ${mob.classificacao}]` : '';
        return `**${start + i + 1}.** 🦇 **${formatarTexto(mob.nome)}** ${classificacao} — *${formatarTexto(mob.tipo || 'Criatura Selvagem')}*`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🦇 Bestiário de Arkandia')
        .setDescription(desc || '*Nenhuma criatura encontrada.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${bestiario.length} monstros` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`catalogo_mobs_prev_${page}_${searchKey}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('catalogo_btn_home')
            .setEmoji('🏠')
            .setLabel('Menu Principal')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`catalogo_mobs_next_${page}_${searchKey}`)
            .setEmoji('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const options = slice.map(mob => ({
        label: formatarTexto(mob.nome).substring(0, 100),
        description: (mob.tipo || 'Criatura Selvagem').substring(0, 100),
        value: mob.id
    }));

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_catalogo_mob')
            .setPlaceholder('Ver detalhes de uma criatura')
            .addOptions(options.length > 0 ? options : [{ label: 'Vazio', value: 'empty' }])
            .setDisabled(options.length === 0)
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
}

// ===========================
// Detail Embed Builders
// ===========================

function buildItemDetail(item, includeHomeButton = false) {
    const embed = new EmbedBuilder()
        .setColor(RARIDADE_CORES[item.raridade] || 0x6B7280)
        .setTitle(`${RARIDADE_EMOJIS[item.raridade] || '⚪'} ${formatarTexto(item.nome)}`)
        .setDescription(item.descricao || '*Sem descrição.*')
        .addFields(
            { name: 'Categoria', value: formatarTexto(item.categoria), inline: true },
            { name: 'Raridade', value: formatarTexto(item.raridade), inline: true }
        );

    if (item.preco_base) embed.addFields({ name: 'Preço Base', value: `💰 ${item.preco_base}`, inline: true });
    if (item.peso) embed.addFields({ name: 'Peso', value: `${item.peso} kg`, inline: true });
    if (item.grau) embed.addFields({ name: 'Grau', value: String(item.grau), inline: true });
    if (item.imagem_url) embed.setThumbnail(item.imagem_url);

    const payload = { embeds: [embed] };
    if (includeHomeButton) {
        payload.components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('catalogo_btn_home')
                    .setEmoji('🏠')
                    .setLabel('Menu Principal')
                    .setStyle(ButtonStyle.Success)
            )
        ];
    }
    return payload;
}

function buildSkillDetail(skill, includeHomeButton = false) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`⚔️ ${formatarTexto(skill.nome)}`)
        .setDescription(skill.descricao || '*Sem descrição.*')
        .addFields(
            { name: 'Tipo', value: formatarTexto(skill.tipo), inline: true },
            { name: 'Origem', value: formatarTexto(skill.origem), inline: true }
        );

    if (skill.classe) embed.addFields({ name: 'Classe', value: formatarTexto(skill.classe), inline: true });
    if (skill.nivel_min) embed.addFields({ name: 'Nível Mínimo', value: String(skill.nivel_min), inline: true });
    if (skill.grau) embed.addFields({ name: 'Grau Máximo', value: String(skill.grau), inline: true });
    if (skill.custo_runas) embed.addFields({ name: 'Custo de Runas', value: `🔮 ${skill.custo_runas}`, inline: true });

    const payload = { embeds: [embed] };
    if (includeHomeButton) {
        payload.components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('catalogo_btn_home')
                    .setEmoji('🏠')
                    .setLabel('Menu Principal')
                    .setStyle(ButtonStyle.Success)
            )
        ];
    }
    return payload;
}

function buildBestiarioDetail(mob, includeHomeButton = false) {
    const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(`🦇 ${formatarTexto(mob.nome)}`)
        .setDescription(mob.descricao || mob.lore || '*Sem informações detalhadas.*')
        .addFields({ name: 'Tipo', value: formatarTexto(mob.tipo || 'Desconhecido'), inline: true });

    if (mob.classificacao) embed.addFields({ name: 'Periculosidade', value: `Tier ${mob.classificacao}`, inline: true });
    if (mob.fraqueza) embed.addFields({ name: 'Fraqueza', value: formatarTexto(mob.fraqueza), inline: true });
    if (mob.drop) embed.addFields({ name: 'Drop Principal', value: formatarTexto(mob.drop), inline: true });
    if (mob.imagem_url) embed.setThumbnail(mob.imagem_url);
    else if (mob.ilustracao_url) embed.setThumbnail(mob.ilustracao_url);

    const payload = { embeds: [embed] };
    if (includeHomeButton) {
        payload.components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('catalogo_btn_home')
                    .setEmoji('🏠')
                    .setLabel('Menu Principal')
                    .setStyle(ButtonStyle.Success)
            )
        ];
    }
    return payload;
}

// ===========================
// Core Execute Lógica
// ===========================

const data = new SlashCommandBuilder()
    .setName('catalogo')
    .setDescription('Navega pelos catálogos de Arkandia (Itens, Habilidades e Bestiário)')
    .addStringOption(o => o.setName('busca').setDescription('Busca por nome de item, habilidade ou monstro (Opcional)'));

async function execute(interaction) {
    await interaction.deferReply();
    const busca = interaction.options.getString('busca');

    if (busca) {
        const query = busca.toLowerCase();

        // 1. Tenta buscar no catálogo de itens
        const item = catalogCache.findItem(query);
        if (item) return await interaction.editReply(buildItemDetail(item, true));

        // 2. Tenta buscar no catálogo de habilidades
        const skill = catalogCache.findSkill(query);
        if (skill) return await interaction.editReply(buildSkillDetail(skill, true));

        // 3. Tenta buscar no bestiário
        const mob = catalogCache.findBestiario(query);
        if (mob) return await interaction.editReply(buildBestiarioDetail(mob, true));

        // 4. Caso não encontre por correspondência direta, tenta buscar parcial em listas
        const filtradosItens = catalogCache.listItens({ busca: query });
        if (filtradosItens.length > 0) {
            const searchKey = `itens_${interaction.user.id}_${Date.now()}`;
            catalogCache.setGeneric(searchKey, { busca: query }, 10 * 60 * 1000);
            const totalPages = Math.ceil(filtradosItens.length / ITEMS_PER_PAGE);
            return await interaction.editReply(buildItensPage(filtradosItens, 0, totalPages, searchKey));
        }

        const filtradosSkills = catalogCache.listSkills({ busca: query });
        if (filtradosSkills.length > 0) {
            const searchKey = `skills_${interaction.user.id}_${Date.now()}`;
            catalogCache.setGeneric(searchKey, { busca: query }, 10 * 60 * 1000);
            const totalPages = Math.ceil(filtradosSkills.length / ITEMS_PER_PAGE);
            return await interaction.editReply(buildSkillsPage(filtradosSkills, 0, totalPages, searchKey));
        }

        const filtradosMobs = catalogCache.listBestiario({ busca: query });
        if (filtradosMobs.length > 0) {
            const searchKey = `mobs_${interaction.user.id}_${Date.now()}`;
            catalogCache.setGeneric(searchKey, { busca: query }, 10 * 60 * 1000);
            const totalPages = Math.ceil(filtradosMobs.length / ITEMS_PER_PAGE);
            return await interaction.editReply(buildBestiarioPage(filtradosMobs, 0, totalPages, searchKey));
        }

        return await interaction.editReply({ embeds: [embedErro(`Nenhum item, habilidade ou monstro com o termo "${busca}" foi encontrado.`)] });
    }

    // Sem busca: abre a Dashboard Principal
    return await interaction.editReply(buildHomeDashboard());
}

// ===========================
// Interaction Handlers
// ===========================

async function handleButton(interaction) {
    const customId = interaction.customId;

    // Retorno ao Painel Central
    if (customId === 'catalogo_btn_home') {
        return await interaction.update(buildHomeDashboard());
    }

    // Abertura de Categorias Principais
    if (customId === 'catalogo_btn_itens') {
        const items = catalogCache.listItens();
        const searchKey = `itens_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, {}, 10 * 60 * 1000);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        return await interaction.update(buildItensPage(items, 0, totalPages, searchKey));
    }

    if (customId === 'catalogo_btn_skills') {
        const skills = catalogCache.listSkills();
        const searchKey = `skills_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, {}, 10 * 60 * 1000);
        const totalPages = Math.ceil(skills.length / ITEMS_PER_PAGE);
        return await interaction.update(buildSkillsPage(skills, 0, totalPages, searchKey));
    }

    if (customId === 'catalogo_btn_mobs') {
        const mobs = catalogCache.listBestiario();
        const searchKey = `mobs_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, {}, 10 * 60 * 1000);
        const totalPages = Math.ceil(mobs.length / ITEMS_PER_PAGE);
        return await interaction.update(buildBestiarioPage(mobs, 0, totalPages, searchKey));
    }

    // Paginação Tabela
    const parts = customId.split('_');
    const catalogType = parts[1]; // 'itens', 'skills' ou 'mobs'
    const direction = parts[2]; // 'prev' ou 'next'
    const currentPage = parseInt(parts[3], 10);
    const searchKey = parts.slice(4).join('_');

    const filtros = catalogCache.getGeneric(searchKey) || {};
    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    let items = [];
    let payload = {};

    if (catalogType === 'itens') {
        items = catalogCache.listItens(filtros);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pg = Math.max(0, Math.min(newPage, totalPages - 1));
        payload = buildItensPage(items, pg, totalPages, searchKey);
    } else if (catalogType === 'skills') {
        items = catalogCache.listSkills(filtros);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pg = Math.max(0, Math.min(newPage, totalPages - 1));
        payload = buildSkillsPage(items, pg, totalPages, searchKey);
    } else if (catalogType === 'mobs') {
        items = catalogCache.listBestiario(filtros);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pg = Math.max(0, Math.min(newPage, totalPages - 1));
        payload = buildBestiarioPage(items, pg, totalPages, searchKey);
    }

    return await interaction.update(payload);
}

async function handleSelect(interaction) {
    const selectedId = interaction.values[0];
    if (selectedId === 'empty') return await interaction.deferUpdate();

    if (interaction.customId === 'select_catalogo_item') {
        const item = catalogCache.findItem(selectedId);
        if (!item) return await interaction.reply({ embeds: [embedErro('Item não encontrado.')], ephemeral: true });
        return await interaction.reply({ ...buildItemDetail(item, false), ephemeral: true });
    }

    if (interaction.customId === 'select_catalogo_skill') {
        const skill = catalogCache.findSkill(selectedId);
        if (!skill) return await interaction.reply({ embeds: [embedErro('Habilidade não encontrada.')], ephemeral: true });
        return await interaction.reply({ ...buildSkillDetail(skill, false), ephemeral: true });
    }

    if (interaction.customId === 'select_catalogo_mob') {
        const mob = catalogCache.findBestiario(selectedId);
        if (!mob) return await interaction.reply({ embeds: [embedErro('Criatura não encontrada no bestiário.')], ephemeral: true });
        return await interaction.reply({ ...buildBestiarioDetail(mob, false), ephemeral: true });
    }
}

module.exports = {
    data,
    execute,
    handleButton,
    handleSelect,
    // Exportados para reutilização no atalho de bestiário
    buildBestiarioPage,
    buildBestiarioDetail,
    buildHomeDashboard
};
