const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    ContainerBuilder,
    MessageFlags,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const axios = require('axios');
const { gerarBannerRanking, gerarBannerPerfil, gerarBannerPainelJogador, renderInventarioPage } = require('../canvas/renderer');
const { buildProfileSkillRow } = require('./perfil');
const enciclopediaCmd = require('./enciclopedia');
const { embedErro } = require('../utils/helpers');
const { skillsCache } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;
const PANEL_CACHE_TTL = 2 * 60 * 1000;
const panelCache = new Map();

const data = new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Abre a sua central de jogador (HUD)');

function getMainPainelComponents(activeMenu = null) {
    const label = (menu, text) => `${activeMenu === menu ? '\u25C6' : '\u25C7'} ${text}`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_inicio').setLabel(label('inicio', 'In\u00EDcio')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_perfil').setLabel(label('perfil', 'Perfil')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_inventario').setLabel(label('inventario', 'Invent\u00E1rio')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_missoes').setLabel(label('missoes', 'Miss\u00F5es')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_enciclopedia').setLabel(label('enciclopedia', 'Enciclop\u00E9dia')).setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_pesquisa').setLabel(label('pesquisa', 'Pesquisa')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_ranking').setLabel(label('ranking', 'Rankings')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_guilda').setLabel(label('guilda', 'Guilda')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_rp').setLabel(label('rp', 'Cena RP')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_v2_teste').setLabel('✦ Painel V2 (teste)').setStyle(ButtonStyle.Success)
    );

    return [row1, row2];
}

function getInicioOnlyRow() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_menu_inicio').setLabel('\u25C7 In\u00EDcio').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function getPainelRankingButtons(tipo) {
    const options = [
        ['poder', 'Poder'],
        ['nivel', 'N\u00EDvel'],
        ['guildas', 'Guildas'],
        ['arena', 'Arena']
    ];

    return new ActionRowBuilder().addComponents(
        ...options.map(([value, label]) => new ButtonBuilder()
            .setCustomId(`painel_rank_switch_${value}`)
            .setLabel(`${tipo === value ? '\u25C6' : '\u25C7'} ${label}`)
            .setStyle(ButtonStyle.Secondary))
    );
}

function getPainelComponentsForView(view, extras = []) {
    if (view === 'inicio') return getMainPainelComponents('inicio');
    if (view === 'ranking') return [...getInicioOnlyRow(), getPainelRankingButtons(extras[0] || 'poder')];
    if (view === 'enciclopedia') return enciclopediaCmd.buildControls(null, { panelMode: true, homeActive: false });

    const rows = getInicioOnlyRow();
    if (extras.length > 0) rows.push(...extras);
    return rows;
}

async function cachedPanelFetch(key, loader, ttl = PANEL_CACHE_TTL) {
    const now = Date.now();
    const cached = panelCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await loader();
    panelCache.set(key, { value, expiresAt: now + ttl });
    return value;
}

async function getPersonagemByDiscord(userId) {
    return cachedPanelFetch(`personagem_${userId}`, async () => {
        const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${userId}`, {
            headers: { 'X-API-Key': API_KEY },
            timeout: 5000
        });
        return res.data;
    });
}

async function getRankingData(tipo) {
    return cachedPanelFetch(`ranking_${tipo}`, async () => {
        const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, {
            headers: { 'X-API-Key': API_KEY },
            timeout: 5000
        });
        return res.data;
    });
}

async function getMissoesAbertas() {
    return cachedPanelFetch('missoes_abertas_painel', async () => {
        const res = await axios.get(`${ARKANDIA_API}/missoes`, {
            headers: { 'X-API-Key': API_KEY },
            timeout: 5000
        });
        return Array.isArray(res.data) ? res.data.filter(m => m.status === 'aberta') : [];
    }, 60 * 1000);
}

async function getPainelContext(userId) {
    const [personagemResult, missoesResult] = await Promise.allSettled([
        getPersonagemByDiscord(userId),
        getMissoesAbertas()
    ]);

    const personagem = personagemResult.status === 'fulfilled' ? personagemResult.value : null;
    const missoes = missoesResult.status === 'fulfilled' ? missoesResult.value : [];

    return {
        personagem,
        missoes,
        personagemNome: personagem?.nome || null,
        inventarioQtd: (personagem?.inventario || personagem?.itens || []).length,
        missoesAbertas: missoes.length
    };
}

async function setPainelStatus(interaction, components, text) {
    return await interaction.editReply({
        content: text,
        embeds: [],
        files: [],
        attachments: [],
        components
    });
}

async function renderPainelHome(interaction) {
    const context = await getPainelContext(interaction.user.id).catch(() => ({}));
    const buffer = await gerarBannerPainelJogador(interaction.user, context);
    const attachment = new AttachmentBuilder(buffer, { name: 'painel-jogador.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://painel-jogador.png')
        .setFooter({ text: 'Painel privado. Use os bot\u00F5es abaixo para navegar.' });

    return { embeds: [embed], files: [attachment], components: getPainelComponentsForView('inicio'), ephemeral: true };
}

function getValue(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function formatResource(currentKeys, maxKeys, source) {
    const current = getValue(source, currentKeys);
    const maximum = getValue(source, maxKeys);
    if (current === null && maximum === null) return null;
    if (maximum === null) return `${current}`;
    return `${current ?? 0}/${maximum}`;
}

function buildPainelV2Buttons(activeView = 'inicio') {
    const label = (view, text) => `${activeView === view ? '◆' : '◇'} ${text}`;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_menu_inicio').setLabel(label('inicio', 'Início')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_perfil').setLabel(label('perfil', 'Perfil')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_inventario').setLabel(label('inventario', 'Inventário')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_missoes').setLabel(label('missoes', 'Missões')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_enciclopedia').setLabel(label('enciclopedia', 'Enciclopédia')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_menu_pesquisa').setLabel(label('pesquisa', 'Pesquisa')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_ranking').setLabel(label('ranking', 'Rankings')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_guilda').setLabel(label('guilda', 'Guilda')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_rp').setLabel(label('rp', 'Cena RP')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_atualizar').setLabel('Atualizar painel').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('painel_v2_fechar').setLabel('Fechar teste').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function buildPainelV2View(context, view) {
    const personagem = context.personagem || {};
    if (view === 'perfil') {
        const vida = formatResource(['vida_atual', 'vidaAtual', 'hp_atual', 'hp'], ['vida_maxima', 'vidaMaxima', 'hp_maximo', 'hpMax'], personagem);
        const energia = formatResource(['energia_atual', 'energiaAtual', 'mana_atual', 'mana'], ['energia_maxima', 'energiaMaxima', 'mana_maxima', 'manaMax'], personagem);
        return [
            '**Perfil do personagem**',
            `**Nome** · ${personagem.nome || 'Não definido'}`,
            `**Nível** · ${getValue(personagem, ['nivel', 'level']) ?? 'Não informado'}`,
            `**Classe** · ${getValue(personagem, ['classe', 'className', 'arquetipo']) || 'Não informada'}`,
            `**Vida** · ${vida || 'Não informada'}`,
            `**Energia** · ${energia || 'Não informada'}`,
            `**Guilda** · ${getValue(personagem, ['guilda_nome', 'guildaNome', 'guilda']) || 'Sem guilda'}`
        ].join('\n');
    }

    if (view === 'inventario') {
        const itens = personagem.inventario || personagem.itens || [];
        if (!itens.length) return '**Inventário**\nNenhum item encontrado no personagem ativo.';
        return `**Inventário · ${itens.length} item(ns)**\n` + itens.slice(0, 12).map((item, index) => {
            const nome = typeof item === 'string' ? item : (item.nome || item.name || 'Item sem nome');
            return `${index + 1}. ${nome}`;
        }).join('\n') + (itens.length > 12 ? '\n\nMostrando os 12 primeiros itens.' : '');
    }

    if (view === 'missoes') {
        if (!context.missoes?.length) return '**Missões abertas**\nNenhuma missão aberta encontrada.';
        return `**Missões abertas · ${context.missoes.length}**\n` + context.missoes.slice(0, 8).map((missao, index) => {
            const nome = missao.nome || missao.titulo || 'Missão sem nome';
            const rank = missao.ranque || missao.rank;
            return `${index + 1}. ${rank ? `[${rank}] ` : ''}${nome}`;
        }).join('\n');
    }

    return [
        `**Aventureiro** · ${context.displayName}`,
        `**Personagem** · ${context.personagemNome || 'Nenhum personagem ativo'}`,
        `**Inventário** · ${Number.isFinite(context.inventarioQtd) ? `${context.inventarioQtd} item(ns)` : 'Indisponível'}`,
        `**Missões abertas** · ${Number.isFinite(context.missoesAbertas) ? context.missoesAbertas : 'Indisponível'}`,
        '',
        'Selecione uma seção acima para consultar mais detalhes.'
    ].join('\n');
}

async function renderPainelJogadorV2(interaction, view = 'inicio') {
    const context = await getPainelContext(interaction.user.id).catch(() => ({}));
    const displayName = interaction.user.globalName || interaction.user.username || 'Aventureiro';
    context.displayName = displayName;
    const buffer = await gerarBannerPainelJogador(interaction.user, context);
    const attachment = new AttachmentBuilder(buffer, { name: 'painel-jogador.png' });
    const summary = [
        `**Aventureiro** · ${displayName}`,
        `**Personagem** · ${context.personagemNome || 'Nenhum personagem ativo'}`,
        `**Inventário** · ${Number.isFinite(context.inventarioQtd) ? `${context.inventarioQtd} item(ns)` : 'Indisponível'}`,
        `**Missões abertas** · ${Number.isFinite(context.missoesAbertas) ? context.missoesAbertas : 'Indisponível'}`
    ].join('\n');

    const panel = new ContainerBuilder()
        .setAccentColor(0xD4AF37)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# Painel do jogador'),
            new TextDisplayBuilder().setContent(`## ${displayName}\nCentral experimental em Components V2.`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
                .setURL('attachment://painel-jogador.png')
                .setDescription('HUD do painel do jogador')
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(summary))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildPainelV2View(context, view)))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addActionRowComponents(...buildPainelV2Buttons(view))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Este é um teste isolado. O painel tradicional continua disponível pelo comando `/painel` novamente.'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_atualizar').setLabel('Atualizar painel').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('painel_v2_fechar').setLabel('Fechar teste').setStyle(ButtonStyle.Secondary)
        ));

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [panel],
        files: [attachment]
    };
}

async function renderPainelRanking(interaction, tipo = 'poder') {
    const rankingData = await getRankingData(tipo);
    const buffer = await gerarBannerRanking(tipo, rankingData);
    const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://ranking.png');

    return await interaction.editReply({
        content: null,
        embeds: [embed],
        files: [attachment],
        attachments: [],
        components: getPainelComponentsForView('ranking', [tipo])
    });
}

async function execute(interaction) {
    try {
        await interaction.reply(await renderPainelHome(interaction));
    } catch (e) {
        if (interaction.deferred) {
            const payload = await renderPainelHome(interaction);
            await interaction.editReply(payload);
        }
    }
}

async function handleButton(interaction) {
    if (interaction.customId === 'painel_v2_teste') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return await interaction.editReply(await renderPainelJogadorV2(interaction));
    }

    if (interaction.customId === 'painel_v2_atualizar') {
        await interaction.deferUpdate();
        return await interaction.editReply(await renderPainelJogadorV2(interaction));
    }

    if (interaction.customId.startsWith('painel_v2_menu_')) {
        await interaction.deferUpdate();
        const view = interaction.customId.replace('painel_v2_menu_', '');
        const validViews = new Set(['inicio', 'perfil', 'inventario', 'missoes', 'enciclopedia', 'pesquisa', 'ranking', 'guilda', 'rp']);
        return await interaction.editReply(await renderPainelJogadorV2(interaction, validViews.has(view) ? view : 'inicio'));
    }

    if (interaction.customId === 'painel_v2_fechar') {
        await interaction.deferUpdate();
        return await interaction.deleteReply();
    }

    if (interaction.customId.startsWith('painel_rank_switch_')) {
        await interaction.deferUpdate();
        const tipo = interaction.customId.replace('painel_rank_switch_', '');
        try {
            return await renderPainelRanking(interaction, tipo);
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao atualizar o ranking.')],
                attachments: [],
                components: getPainelComponentsForView('ranking', [tipo])
            });
        }
    }

    if (interaction.customId.startsWith('painel_inv_cat_') || interaction.customId.startsWith('painel_inv_pag_')) {
        const parts = interaction.customId.split('_');
        const isCategory = parts[2] === 'cat';
        const personagemId = parts[3];
        const categoria = parts[4];
        const pagina = isCategory ? 0 : parseInt(parts[5] || '0', 10);
        const cacheKey = `inventario_${interaction.user.id}_${personagemId}`;
        const cacheData = skillsCache.get(cacheKey);

        if (!cacheData) {
            return await interaction.reply({ embeds: [embedErro('Sua sessao de inventario expirou. Abra o `/painel` novamente.')], ephemeral: true });
        }

        await interaction.deferUpdate();
        return await renderInventarioPage(
            interaction,
            cacheData.personagem,
            cacheData.itens,
            categoria,
            pagina,
            { prefixComponents: getInicioOnlyRow(), customIdPrefix: 'painel_inv', useEditReply: true }
        );
    }

    if (!interaction.customId.startsWith('painel_menu_')) return;

    const menu = interaction.customId.replace('painel_menu_', '');
    await interaction.deferUpdate();

    if (menu === 'inicio') {
        const payload = await renderPainelHome(interaction);
        return await interaction.editReply({ ...payload, attachments: [] });
    }

    if (menu === 'guilda') {
        return await interaction.editReply({
            content: 'Para buscar os dados de uma guilda, digite no chat: `/guilda nome:`',
            embeds: [],
            files: [],
            attachments: [],
            components: getPainelComponentsForView('guilda')
        });
    }

    if (menu === 'rp') {
        return await interaction.editReply({
            content: 'Para iniciar uma cena de RP marcando os jogadores, digite no chat: `/rp iniciar`',
            embeds: [],
            files: [],
            attachments: [],
            components: getPainelComponentsForView('rp')
        });
    }

    if (menu === 'pesquisa') {
        const pesquisaCmd = require('./pesquisa');
        return await pesquisaCmd.renderPesquisaStatusForPainel(interaction);
    }

    if (menu === 'enciclopedia') {
        return await interaction.editReply({
            ...(await enciclopediaCmd.buildHomePayload({ panelMode: true })),
            attachments: []
        });
    }

    if (menu === 'missoes') {
        try {
            await setPainelStatus(interaction, getPainelComponentsForView('missoes'), 'Carregando missoes abertas...');
            const missoes = await getMissoesAbertas();

            if (missoes.length === 0) {
                return await interaction.editReply({
                    content: 'Nao ha missoes abertas no momento.',
                    embeds: [],
                    files: [],
                    attachments: [],
                    components: getPainelComponentsForView('missoes')
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('Quadro de Missoes de Arkandia')
                .setDescription(missoes.map(m => `**[${m.ranque || 'D'}]** ${m.nome}\n*${m.descricao || 'Sem descricao'}*`).join('\n\n'));

            return await interaction.editReply({
                content: null,
                embeds: [embed],
                files: [],
                attachments: [],
                components: getPainelComponentsForView('missoes')
            });
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao buscar as missoes.')],
                attachments: [],
                components: getPainelComponentsForView('missoes')
            });
        }
    }

    if (menu === 'ranking') {
        try {
            await setPainelStatus(interaction, getPainelComponentsForView('ranking', ['poder']), 'Carregando rankings...');
            return await renderPainelRanking(interaction, 'poder');
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao buscar o ranking.')],
                attachments: [],
                components: getPainelComponentsForView('ranking', ['poder'])
            });
        }
    }

    if (menu === 'perfil') {
        try {
            await setPainelStatus(interaction, getPainelComponentsForView('perfil'), 'Carregando perfil...');
            const p = await getPersonagemByDiscord(interaction.user.id);
            if (!p) {
                return await interaction.editReply({
                    embeds: [embedErro('Personagem nao encontrado.')],
                    attachments: [],
                    components: getPainelComponentsForView('perfil')
                });
            }

            const buffer = await gerarBannerPerfil(p);
            const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://perfil.png');

            const skillRow = buildProfileSkillRow(p);
            const components = getPainelComponentsForView('perfil', skillRow ? [skillRow] : []);

            return await interaction.editReply({
                content: null,
                embeds: [embed],
                files: [attachment],
                attachments: [],
                components
            });
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao buscar seu perfil.')],
                attachments: [],
                components: getPainelComponentsForView('perfil')
            });
        }
    }

    if (menu === 'inventario') {
        try {
            await setPainelStatus(interaction, getPainelComponentsForView('inventario'), 'Carregando inventario...');
            const p = await getPersonagemByDiscord(interaction.user.id);
            if (!p) {
                return await interaction.editReply({
                    embeds: [embedErro('Personagem nao encontrado.')],
                    attachments: [],
                    components: getPainelComponentsForView('inventario')
                });
            }

            const itens = p.inventario || p.itens || [];
            const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
            skillsCache.set(cacheKey, { personagem: p, itens });

            return await renderInventarioPage(
                interaction,
                p,
                itens,
                'todos',
                0,
                { prefixComponents: getInicioOnlyRow(), customIdPrefix: 'painel_inv', useEditReply: true }
            );
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao buscar seu inventario.')],
                attachments: [],
                components: getPainelComponentsForView('inventario')
            });
        }
    }
}

module.exports = { data, execute, handleButton };
