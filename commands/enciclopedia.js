const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const catalogCache = require('../catalogCache');
const { gerarBannerEnciclopedia } = require('../canvas/renderer');
const { formatarTexto, embedErro } = require('../utils/helpers');
const catalogoCmd = require('./catalogo');

const ITEMS_PER_PAGE = 5;
const SEARCH_TTL = 10 * 60 * 1000;
const CATEGORY_META = {
    itens: { label: 'Itens', title: 'Itens', color: 0xD4AF37 },
    skills: { label: 'Habilidades', title: 'Habilidades', color: 0xD4AF37 },
    mobs: { label: 'Bestiario', title: 'Bestiario', color: 0xD4AF37 },
    npcs: { label: 'Canones', title: 'Canones', color: 0xD4AF37 }
};
const data = new SlashCommandBuilder()
    .setName('enciclopedia')
    .setDescription('Consulta o acervo oficial de itens, habilidades, bestiario e canones de Ernas');

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[rows - 1][cols - 1];
}

function scoreSearch(query, candidate) {
    const q = normalizeText(query);
    const name = normalizeText(candidate);
    if (!q || !name) return 0;
    if (q === name) return 1000;
    if (name.startsWith(q)) return 800 - Math.max(0, name.length - q.length);
    if (name.includes(q)) return 680 - name.indexOf(q);

    const queryTokens = q.split(' ');
    const nameTokens = name.split(' ');
    const overlap = queryTokens.filter(token => nameTokens.some(nameToken => nameToken.includes(token))).length;
    let score = overlap * 90;

    const distance = levenshtein(q, name);
    const longest = Math.max(q.length, name.length) || 1;
    score += Math.max(0, Math.round((1 - (distance / longest)) * 260));

    return score;
}

function buildControls(activeCategory = null, options = {}) {
    const { panelMode = false, homeActive = false } = options;
    const homeLabel = `${homeActive ? '\u25C6' : '\u25C7'} In\u00EDcio`;
    const homeId = panelMode ? 'painel_menu_inicio' : 'enciclopedia_btn_home';
    const categoryLabel = (category, label) => `${activeCategory === category ? '\u25C6' : '\u25C7'} ${label}`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(homeId).setLabel(homeLabel).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('enciclopedia_btn_itens').setLabel(categoryLabel('itens', 'Itens')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('enciclopedia_btn_skills').setLabel(categoryLabel('skills', 'Habilidades')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('enciclopedia_btn_mobs').setLabel(categoryLabel('mobs', 'Besti\u00E1rio')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('enciclopedia_btn_npcs').setLabel(categoryLabel('npcs', 'Can\u00F4nes')).setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`enciclopedia_btn_busca_${activeCategory || 'all'}`)
            .setLabel('\u25C7 Busca')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

function isPanelContext(message) {
    return Boolean(
        message?.components?.some(row =>
            row.components?.some(component => component.customId === 'painel_menu_inicio')
        )
    );
}

function buildSearchKey(category, userId) {
    return `enciclopedia_${category}_${userId}_${Date.now()}`;
}

function getCategoryItems(category, filtros = {}) {
    if (category === 'itens') return catalogCache.listItens(filtros);
    if (category === 'skills') return catalogCache.listSkills(filtros);
    if (category === 'mobs') return catalogCache.listBestiario(filtros);
    if (category === 'npcs') return catalogCache.listNpcs(filtros);
    return [];
}

function getCategoryDescription(category, item) {
    if (category === 'itens') return formatarTexto(item.categoria || 'Item');
    if (category === 'skills') {
        const tipo = formatarTexto(item.tipo || 'Habilidade');
        const classe = item.classe ? ` - ${formatarTexto(item.classe)}` : '';
        return `${tipo}${classe}`.substring(0, 100);
    }
    if (category === 'mobs') return formatarTexto(item.tipo || 'Criatura');
    if (category === 'npcs') {
        const rank = item.rank ? `Rank ${item.rank}` : 'Canon';
        const regiao = item.regiao ? formatarTexto(item.regiao) : 'Ernas';
        return `${rank} - ${regiao}`.substring(0, 100);
    }
    return 'Registro';
}

function buildNpcDetail(npc, options = {}) {
    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setTitle(formatarTexto(npc.nome))
        .setDescription(npc.lore || npc.flavor_text || '*Sem informa\u00E7\u00F5es registradas.*')
        .addFields(
            { name: 'Rank', value: String(npc.rank || '-'), inline: true },
            { name: 'Ra\u00E7a', value: formatarTexto(npc.raca || '-'), inline: true },
            { name: 'Classe', value: formatarTexto(npc.classe || '-'), inline: true }
        );

    if (npc.regiao) embed.addFields({ name: 'Regi\u00E3o', value: formatarTexto(npc.regiao), inline: true });
    if (npc.afiliacao) embed.addFields({ name: 'Afilia\u00E7\u00E3o', value: formatarTexto(npc.afiliacao), inline: true });
    if (npc.titulo) embed.addFields({ name: 'T\u00EDtulo', value: formatarTexto(npc.titulo), inline: true });
    if (npc.retrato_url) embed.setThumbnail(npc.retrato_url);

    return {
        content: null,
        embeds: [embed],
        components: buildControls('npcs', options)
    };
}

function buildDetailPayload(category, item, options = {}) {
    if (category === 'itens') {
        return { ...catalogoCmd.buildItemDetail(item, false), content: null, components: buildControls('itens', options) };
    }
    if (category === 'skills') {
        return { ...catalogoCmd.buildSkillDetail(item, false), content: null, components: buildControls('skills', options) };
    }
    if (category === 'mobs') {
        return { ...catalogoCmd.buildBestiarioDetail(item, false), content: null, components: buildControls('mobs', options) };
    }
    return buildNpcDetail(item, options);
}

function buildListPage(category, items, page, totalPages, searchKey, options = {}) {
    const { panelMode = false, query = null } = options;
    const start = page * ITEMS_PER_PAGE;
    const slice = items.slice(start, start + ITEMS_PER_PAGE);
    const meta = CATEGORY_META[category];

    const description = slice.length
        ? slice.map((item, index) => {
            const position = start + index + 1;
            const subtitle = getCategoryDescription(category, item);
            return `**${position}.** **${formatarTexto(item.nome)}** - *${subtitle}*`;
        }).join('\n')
        : '*Nenhum registro encontrado.*';

    const embed = new EmbedBuilder()
        .setColor(meta.color)
        .setTitle(`Enciclop\u00E9dia • ${meta.title}`)
        .setDescription(description)
        .setFooter({ text: `P\u00E1gina ${page + 1}/${Math.max(totalPages, 1)} • ${items.length} registros` });

    if (query) embed.setAuthor({ name: `Busca: ${query}` });

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_enciclopedia_result')
            .setPlaceholder('Abrir registro')
            .addOptions(
                slice.length
                    ? slice.map(item => ({
                        label: formatarTexto(item.nome).substring(0, 100),
                        description: getCategoryDescription(category, item).substring(0, 100),
                        value: `${category}|${item.id}`
                    }))
                    : [{ label: 'Vazio', description: 'Nenhum registro nesta lista', value: 'empty' }]
            )
            .setDisabled(slice.length === 0)
    );

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`enciclopedia_page_prev_${category}_${page}_${searchKey}`)
            .setLabel('\u25C1 Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`enciclopedia_page_next_${category}_${page}_${searchKey}`)
            .setLabel(`Pr\u00F3ximo \u25B7`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    return {
        content: null,
        embeds: [embed],
        components: [...buildControls(category, { panelMode }), rowSelect, rowPagination]
    };
}

function collectCandidates(query, activeCategory = null) {
    const all = [
        ...catalogCache.listItens().map(item => ({ category: 'itens', item, aliases: [item.nome, item.categoria].filter(Boolean) })),
        ...catalogCache.listSkills().map(item => ({ category: 'skills', item, aliases: [item.nome, item.tipo, item.classe, item.origem].filter(Boolean) })),
        ...catalogCache.listBestiario().map(item => ({ category: 'mobs', item, aliases: [item.nome, item.tipo, item.classificacao].filter(Boolean) })),
        ...catalogCache.listNpcs().map(item => ({ category: 'npcs', item, aliases: [item.nome, item.titulo, item.regiao, item.afiliacao].filter(Boolean) }))
    ];

    return all
        .map(entry => {
            let score = Math.max(...entry.aliases.map(alias => scoreSearch(query, alias)), scoreSearch(query, entry.aliases.join(' ')));
            if (activeCategory && activeCategory !== 'all' && activeCategory === entry.category) score += 24;
            return { ...entry, score };
        })
        .filter(entry => entry.score >= 80)
        .sort((a, b) => b.score - a.score);
}

function runSmartSearch(query, activeCategory = 'all') {
    const normalized = normalizeText(query);
    const scored = collectCandidates(normalized, activeCategory);
    return {
        exact: scored.find(entry => normalizeText(entry.item.nome) === normalized) || null,
        best: scored[0] || null,
        suggestions: scored.slice(0, 5)
    };
}

function buildSearchSuggestions(query, results, options = {}) {
    const { panelMode = false, activeCategory = null } = options;
    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setTitle('Resultados aproximados')
        .setDescription(results.map((result, index) => {
            const label = CATEGORY_META[result.category].label;
            return `**${index + 1}.** ${formatarTexto(result.item.nome)} - *${label}*`;
        }).join('\n'));

    const rowSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_enciclopedia_result')
            .setPlaceholder(`Escolha um resultado para "${query}"`)
            .addOptions(results.map(result => ({
                label: formatarTexto(result.item.nome).substring(0, 100),
                description: `${CATEGORY_META[result.category].label} - ${getCategoryDescription(result.category, result.item)}`.substring(0, 100),
                value: `${result.category}|${result.item.id}`
            })))
    );

    return {
        content: null,
        embeds: [embed],
        components: [...buildControls(activeCategory, { panelMode }), rowSelect]
    };
}

async function buildHomePayload(options = {}) {
    const { panelMode = false } = options;
    const buffer = await gerarBannerEnciclopedia();
    const attachment = new AttachmentBuilder(buffer, { name: 'enciclopedia.png' });
    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://enciclopedia.png');

    return {
        content: null,
        embeds: [embed],
        files: [attachment],
        components: buildControls(null, { panelMode, homeActive: true })
    };
}

function buildModal(activeCategory = 'all', panelMode = false) {
    const modal = new ModalBuilder()
        .setCustomId(`enciclopedia_modal_busca_${panelMode ? 'painel' : 'padrao'}_${activeCategory}`)
        .setTitle('Buscar na Enciclopedia');

    const input = new TextInputBuilder()
        .setCustomId('enciclopedia_query')
        .setLabel('O que voce procura?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Guram, adaga, lobo das sombras...')
        .setRequired(true)
        .setMaxLength(80);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

async function renderCategory(interaction, category, page = 0, searchKey = null, options = {}) {
    const filtros = searchKey ? (catalogCache.getGeneric(searchKey) || {}) : {};
    const items = getCategoryItems(category, filtros);
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const key = searchKey || buildSearchKey(category, interaction.user.id);
    return buildListPage(category, items, safePage, totalPages, key, options);
}

async function execute(interaction) {
    await interaction.reply({ ...(await buildHomePayload()), ephemeral: true });
}

async function handleButton(interaction) {
    const panelMode = isPanelContext(interaction.message);

    if (interaction.customId === 'enciclopedia_btn_home') {
        return await interaction.update(await buildHomePayload());
    }

    if (interaction.customId.startsWith('enciclopedia_btn_busca_')) {
        const activeCategory = interaction.customId.replace('enciclopedia_btn_busca_', '');
        return await interaction.showModal(buildModal(activeCategory, panelMode));
    }

    if (interaction.customId.startsWith('enciclopedia_btn_')) {
        const category = interaction.customId.replace('enciclopedia_btn_', '');
        if (!CATEGORY_META[category]) return;
        const searchKey = buildSearchKey(category, interaction.user.id);
        catalogCache.setGeneric(searchKey, {}, SEARCH_TTL);
        return await interaction.update(await renderCategory(interaction, category, 0, searchKey, { panelMode }));
    }

    if (interaction.customId.startsWith('enciclopedia_page_')) {
        const [, , direction, category, currentPageRaw, ...searchParts] = interaction.customId.split('_');
        const currentPage = parseInt(currentPageRaw, 10) || 0;
        const nextPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
        const searchKey = searchParts.join('_');
        return await interaction.update(await renderCategory(interaction, category, nextPage, searchKey, { panelMode }));
    }
}

async function handleSelect(interaction) {
    if (interaction.customId !== 'select_enciclopedia_result') return;
    const panelMode = isPanelContext(interaction.message);
    const selected = interaction.values[0];
    if (selected === 'empty') return await interaction.deferUpdate();

    const [category, ref] = selected.split('|');
    let item = null;
    if (category === 'itens') item = catalogCache.findItem(ref);
    else if (category === 'skills') item = catalogCache.findSkill(ref);
    else if (category === 'mobs') item = catalogCache.findBestiario(ref);
    else if (category === 'npcs') item = catalogCache.findNpc(ref);

    if (!item) {
        return await interaction.reply({ embeds: [embedErro('Registro nao encontrado na enciclopedia.')], ephemeral: true });
    }

    return await interaction.update(buildDetailPayload(category, item, { panelMode }));
}

async function handleModal(interaction) {
    if (!interaction.customId.startsWith('enciclopedia_modal_busca_')) return;
    const [, , , mode, ...categoryParts] = interaction.customId.split('_');
    const panelMode = mode === 'painel';
    const activeCategory = categoryParts.join('_');
    const query = interaction.fields.getTextInputValue('enciclopedia_query').trim();

    if (!query) {
        return await interaction.reply({ embeds: [embedErro('Informe um nome para pesquisar na enciclopedia.')], ephemeral: true });
    }

    const results = runSmartSearch(query, activeCategory);
    if (results.exact) {
        return await interaction.update(buildDetailPayload(results.exact.category, results.exact.item, { panelMode }));
    }

    if (results.best && results.best.score >= 720) {
        return await interaction.update(buildDetailPayload(results.best.category, results.best.item, { panelMode }));
    }

    if (results.suggestions.length > 0) {
        return await interaction.update(buildSearchSuggestions(query, results.suggestions, { activeCategory, panelMode }));
    }

    return await interaction.reply({ embeds: [embedErro(`Nenhum registro foi encontrado para "${query}".`)], ephemeral: true });
}

module.exports = {
    data,
    execute,
    handleButton,
    handleSelect,
    handleModal,
    buildHomePayload,
    buildControls
};
