const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const catalogCache = require('../catalogCache');
const { formatarTexto, embedErro } = require('../utils/helpers');

// Helpers de formatação específicos para o catálogo
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

/**
 * Monta o embed de página de itens
 */
function buildItensPage(itens, page, totalPages) {
    const start = page * ITEMS_PER_PAGE;
    const slice = itens.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((item, i) => {
        const emoji = RARIDADE_EMOJIS[item.raridade] || '⚪';
        return `**${start + i + 1}.** ${emoji} **${formatarTexto(item.nome)}** — ${formatarTexto(item.categoria)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('🎒 Catálogo de Itens')
        .setDescription(desc || '*Nenhum item encontrado nesta página.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${itens.length} itens` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`catalogo_itens_prev_${page}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`catalogo_itens_next_${page}`)
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
 * Monta o embed de página de skills
 */
function buildSkillsPage(skills, page, totalPages) {
    const start = page * ITEMS_PER_PAGE;
    const slice = skills.slice(start, start + ITEMS_PER_PAGE);

    const desc = slice.map((s, i) => {
        const classe = s.classe ? formatarTexto(s.classe) : 'Geral';
        return `**${start + i + 1}.** ⚔️ **${formatarTexto(s.nome)}** — ${formatarTexto(s.tipo)} (${classe})`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('📜 Catálogo de Habilidades')
        .setDescription(desc || '*Nenhuma habilidade encontrada nesta página.*')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${skills.length} habilidades` });

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`catalogo_skills_prev_${page}`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`catalogo_skills_next_${page}`)
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
 * Comando principal /catalogo
 */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'itens') {
        const nome = interaction.options.getString('nome');
        const categoria = interaction.options.getString('categoria');
        const raridade = interaction.options.getString('raridade');

        // Modo Detalhe Direto (Busca exata por nome)
        if (nome) {
            const item = catalogCache.findItem(nome);
            if (!item) {
                return await interaction.editReply({ embeds: [embedErro(`Item "${nome}" não encontrado no catálogo.`)] });
            }
            return await interaction.editReply(buildItemDetail(item));
        }

        // Modo Lista
        const filtros = {};
        if (categoria) filtros.categoria = categoria;
        if (raridade) filtros.raridade = raridade;

        const itens = catalogCache.listItens(filtros);
        if (itens.length === 0) {
            return await interaction.editReply({ embeds: [embedErro('Nenhum item encontrado com esses filtros.')] });
        }

        // Para a paginação interativa funcionar armazenamos os filtros no state do botão?
        // Como o cache local é estático e rápido, nós podemos refazer a filtragem na interação do botão.
        // O Discord não permite guardar muito estado nos Custom IDs (max 100 chars).
        // Vamos guardar apenas os parâmetros vitais: "catalogo_itens_prev_0_categoria_raridade"
        // Para simplificar, como o comando de catálogo sem estado salvo no banco não pode armazenar sessão,
        // vamos armazenar os filtros genéricos no cache global ou passar no customId.
        // Por ora, vamos usar o customId curto para paginação sem filtros (ou com filtros default),
        // ou criar um mini cache temporal.
        
        // Temporariamente, vamos passar a lista inicial (se os botões de paginação não tiverem os filtros, 
        // eles voltarão pra lista inteira. O ideal é usar cache na memória).
        const searchKey = `itens_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, filtros, 10 * 60 * 1000); // 10 min
        
        const totalPages = Math.ceil(itens.length / ITEMS_PER_PAGE);
        const payload = buildItensPage(itens, 0, totalPages);
        
        // Atualizar IDs com a chave de busca para persistir os filtros
        payload.components[1].components[0].setCustomId(`catalogo_itens_prev_0_${searchKey}`);
        payload.components[1].components[1].setCustomId(`catalogo_itens_next_0_${searchKey}`);

        return await interaction.editReply(payload);
    }

    if (subcommand === 'skills') {
        const nome = interaction.options.getString('nome');
        const classe = interaction.options.getString('classe');
        const tipo = interaction.options.getString('tipo');
        const origem = interaction.options.getString('origem');

        // Modo Detalhe Direto
        if (nome) {
            const skill = catalogCache.findSkill(nome);
            if (!skill) {
                return await interaction.editReply({ embeds: [embedErro(`Habilidade "${nome}" não encontrada no catálogo.`)] });
            }
            return await interaction.editReply(buildSkillDetail(skill));
        }

        // Modo Lista
        const filtros = {};
        if (classe) filtros.classe = classe;
        if (tipo) filtros.tipo = tipo;
        if (origem) filtros.origem = origem;

        const skills = catalogCache.listSkills(filtros);
        if (skills.length === 0) {
            return await interaction.editReply({ embeds: [embedErro('Nenhuma habilidade encontrada com esses filtros.')] });
        }

        const searchKey = `skills_${interaction.user.id}_${Date.now()}`;
        catalogCache.setGeneric(searchKey, filtros, 10 * 60 * 1000); // 10 min
        
        const totalPages = Math.ceil(skills.length / ITEMS_PER_PAGE);
        const payload = buildSkillsPage(skills, 0, totalPages);
        
        payload.components[1].components[0].setCustomId(`catalogo_skills_prev_0_${searchKey}`);
        payload.components[1].components[1].setCustomId(`catalogo_skills_next_0_${searchKey}`);

        return await interaction.editReply(payload);
    }
}

/**
 * Handle Pagination Buttons
 */
async function handleButton(interaction) {
    const parts = interaction.customId.split('_');
    const catalogType = parts[1]; // 'itens' ou 'skills'
    const direction = parts[2]; // 'prev' ou 'next'
    const currentPage = parseInt(parts[3]);
    const searchKey = parts.slice(4).join('_');

    const filtros = catalogCache.getGeneric(searchKey) || {};
    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    let items = [];
    let payload = {};

    if (catalogType === 'itens') {
        items = catalogCache.listItens(filtros);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pg = Math.max(0, Math.min(newPage, totalPages - 1));
        payload = buildItensPage(items, pg, totalPages);
        
        payload.components[1].components[0].setCustomId(`catalogo_itens_prev_${pg}_${searchKey}`);
        payload.components[1].components[1].setCustomId(`catalogo_itens_next_${pg}_${searchKey}`);
    } else if (catalogType === 'skills') {
        items = catalogCache.listSkills(filtros);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pg = Math.max(0, Math.min(newPage, totalPages - 1));
        payload = buildSkillsPage(items, pg, totalPages);
        
        payload.components[1].components[0].setCustomId(`catalogo_skills_prev_${pg}_${searchKey}`);
        payload.components[1].components[1].setCustomId(`catalogo_skills_next_${pg}_${searchKey}`);
    }

    return await interaction.update(payload);
}

/**
 * Handle Select Menu
 */
async function handleSelect(interaction) {
    const selectedId = interaction.values[0];
    if (selectedId === 'empty') return await interaction.deferUpdate();

    if (interaction.customId === 'select_catalogo_item') {
        const item = catalogCache.findItem(selectedId);
        if (!item) return await interaction.reply({ embeds: [embedErro('Item não encontrado.')], ephemeral: true });
        
        return await interaction.reply({ ...buildItemDetail(item), ephemeral: true });
    }

    if (interaction.customId === 'select_catalogo_skill') {
        const skill = catalogCache.findSkill(selectedId);
        if (!skill) return await interaction.reply({ embeds: [embedErro('Habilidade não encontrada.')], ephemeral: true });
        
        return await interaction.reply({ ...buildSkillDetail(skill), ephemeral: true });
    }
}

/**
 * Embed detalhado para um item
 */
function buildItemDetail(item) {
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

    return { embeds: [embed] };
}

/**
 * Embed detalhado para uma skill
 */
function buildSkillDetail(skill) {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
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

    return { embeds: [embed] };
}

module.exports = {
    execute,
    handleButton,
    handleSelect
};
