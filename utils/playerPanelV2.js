const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    SeparatorBuilder
} = require('discord.js');
const axios = require('axios');
const {
    gerarBannerEnciclopedia,
    gerarBannerGuilda,
    gerarBannerInventario,
    gerarBannerMissoesPainel,
    gerarBannerPainelJogador,
    gerarBannerPerfil,
    gerarBannerPesquisaArvore,
    gerarBannerPesquisaDetalhe,
    gerarBannerPesquisaStatus,
    gerarBannerRanking,
    gerarBannerRpTitulo
} = require('../canvas/renderer');
const { formatarTexto } = require('./helpers');
const catalogCache = require('../catalogCache');
const pesquisaApi = require('./pesquisaApi');
const pesquisaLogic = require('./pesquisaLogic');
const pesquisaCommand = require('../commands/pesquisa');
const sessionStore = require('./sessionStore');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;
const CACHE_TTL = 60 * 1000;
const cache = new Map();

const VALID_VIEWS = new Set(['inicio', 'perfil', 'inventario', 'missoes', 'enciclopedia', 'pesquisa', 'ranking', 'guilda', 'rp']);
const ENCYCLOPEDIA_CATEGORIES = {
    itens: { label: 'Itens', list: () => catalogCache.listItens() },
    skills: { label: 'Habilidades', list: () => catalogCache.listSkills() },
    mobs: { label: 'Bestiário', list: () => catalogCache.listBestiario() },
    npcs: { label: 'Cânones', list: () => catalogCache.listNpcs() }
};

function cacheKey(scope, id) {
    return `${scope}:${id}`;
}

async function cached(scope, id, loader, refresh = false) {
    const key = cacheKey(scope, id);
    if (refresh) cache.delete(key);
    const current = cache.get(key);
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = await loader();
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
}

async function apiGet(path, timeout = 8000) {
    const response = await axios.get(`${ARKANDIA_API}${path}`, {
        headers: { 'X-API-Key': API_KEY },
        timeout
    });
    return response.data;
}

async function getCharacter(userId, refresh = false) {
    return cached('character', userId, () => apiGet(`/personagens/discord/${userId}`), refresh);
}

async function getMissions(refresh = false) {
    return cached('missions', 'open', async () => {
        const data = await apiGet('/missoes/abertas?incluir_arcos=true');
        if (Array.isArray(data)) return data;
        return data.missoes || data.data || [];
    }, refresh);
}

async function getRanking(type, refresh = false) {
    return cached('ranking', type, () => apiGet(`/rankings/${type}`), refresh);
}

function firstValue(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function safeText(value, fallback = '-') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function truncate(value, max = 4000) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function safeMediaUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
    } catch (error) {
        return null;
    }
}

function buildGlobalRows(activeView, refreshId = `painel_v2_refresh_${activeView}`) {
    const mark = (view, label) => `${activeView === view ? '\u25C6' : '\u25C7'} ${label}`;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_menu_inicio').setLabel(mark('inicio', 'Início')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_perfil').setLabel(mark('perfil', 'Perfil')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_inventario').setLabel(mark('inventario', 'Inventário')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_missoes').setLabel(mark('missoes', 'Missões')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_enciclopedia').setLabel(mark('enciclopedia', 'Enciclopédia')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('painel_v2_menu_pesquisa').setLabel(mark('pesquisa', 'Pesquisa')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_ranking').setLabel(mark('ranking', 'Rankings')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_guilda').setLabel(mark('guilda', 'Guilda')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_menu_rp').setLabel(mark('rp', 'Cena RP')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(refreshId).setLabel('Atualizar').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('painel_v2_fechar').setLabel('Fechar painel').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function buildPayload({
    view,
    title,
    subtitle,
    buffer,
    fileName,
    imageDescription,
    refreshId,
    localRows = [],
    textBlocks = [],
    extraMediaUrls = []
}) {
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`).setDescription(imageDescription || title)
    );
    for (const value of extraMediaUrls.slice(0, 2)) {
        const mediaUrl = safeMediaUrl(value);
        if (mediaUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(mediaUrl));
    }

    const panel = new ContainerBuilder()
        .setAccentColor(0xD4AF37)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${subtitle || ''}`.trim()))
        .addMediaGalleryComponents(gallery)
        .addActionRowComponents(...buildGlobalRows(view, refreshId))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (localRows.length) panel.addActionRowComponents(...localRows);
    for (const block of textBlocks.filter(Boolean)) {
        panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(block)));
    }
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel privado · dados sincronizados com Arkandia'));

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [panel],
        files: [attachment],
        attachments: []
    };
}

function profileSkillRow(character) {
    const skills = (character?.build_skills || []).filter(skill => skill?.id);
    if (!skills.length) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`painel_v2_skill_${character.id}`)
            .setPlaceholder('Consultar habilidade equipada')
            .addOptions(skills.slice(0, 25).map(skill => ({
                label: `${formatarTexto(skill.nome || 'Habilidade')} (Grau ${skill.grau || 1})`.slice(0, 100),
                description: (formatarTexto(skill.tipo) || 'Habilidade equipada').slice(0, 100),
                value: String(skill.id)
            })))
    );
}

function skillDetail(skill) {
    if (!skill) return 'A habilidade selecionada não foi encontrada.';
    const rows = [
        `### ${formatarTexto(skill.nome || 'Habilidade')}`,
        skill.descricao || '*Sem descrição disponível.*',
        '',
        `**Tipo** · ${formatarTexto(skill.tipo) || '-'}`,
        `**Origem** · ${formatarTexto(skill.origem) || '-'}`
    ];
    if (skill.classe) rows.push(`**Classe** · ${formatarTexto(skill.classe)}`);
    if (skill.nivel_min) rows.push(`**Nível mínimo** · ${skill.nivel_min}`);
    if (skill.grau) rows.push(`**Grau máximo** · ${skill.grau}`);
    if (skill.custo_runas) rows.push(`**Custo de runas** · ${skill.custo_runas}`);
    return rows.join('\n');
}

function filterInventory(items, category) {
    if (category === 'todos') return items;
    const keywords = {
        armas: ['arma', 'espada', 'arco', 'bastao', 'lanca', 'machado', 'principal', 'secundaria', 'weapon'],
        armaduras: ['armadura', 'peito', 'elmo', 'capacete', 'bota', 'sapato', 'escudo', 'luvas', 'calca', 'armor', 'shield', 'helmet', 'boots'],
        consumiveis: ['consumivel', 'pocao', 'comida', 'potion', 'scroll', 'pergaminho'],
        materiais: ['material', 'minerio', 'couro', 'essencia', 'ore', 'herb', 'planta']
    };
    return items.filter(item => {
        const value = normalizeSearch(item.categoria || item.item?.categoria);
        return (keywords[category] || []).some(keyword => value.includes(keyword));
    });
}

function inventoryRows(characterId, category, page, totalPages) {
    const label = (value, text) => `${category === value ? '\u25C6' : '\u25C7'} ${text}`;
    const rows = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`painel_v2_inv_cat_${characterId}_todos`).setLabel(label('todos', 'Tudo')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`painel_v2_inv_cat_${characterId}_armas`).setLabel(label('armas', 'Armas')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`painel_v2_inv_cat_${characterId}_armaduras`).setLabel(label('armaduras', 'Defesas')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`painel_v2_inv_cat_${characterId}_consumiveis`).setLabel(label('consumiveis', 'Consumíveis')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`painel_v2_inv_cat_${characterId}_materiais`).setLabel(label('materiais', 'Materiais')).setStyle(ButtonStyle.Secondary)
    )];
    if (totalPages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`painel_v2_inv_page_${characterId}_${category}_${page - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
            new ButtonBuilder().setCustomId(`painel_v2_inv_page_${characterId}_${category}_${page + 1}`).setLabel('Próximo').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
        ));
    }
    return rows;
}

function rankingRow(activeType) {
    const types = [['poder', 'Poder'], ['nivel', 'Nível'], ['guildas', 'Guildas'], ['arena', 'Arena']];
    return new ActionRowBuilder().addComponents(...types.map(([type, label]) =>
        new ButtonBuilder()
            .setCustomId(`painel_v2_rank_${type}`)
            .setLabel(`${activeType === type ? '\u25C6' : '\u25C7'} ${label}`)
            .setStyle(ButtonStyle.Secondary)
    ));
}

function missionDetail(mission) {
    if (!mission) return null;
    return [
        `### ${safeText(mission.nome || mission.titulo, 'Missão')}`,
        mission.descricao || '*Sem descrição disponível.*',
        '',
        `**Rank** · ${mission.ranque || mission.rank_minimo || mission.rank || 'D'}`,
        `**Nível mínimo** · ${mission.nivel_minimo || mission.nivel_min || 1}`,
        `**Vagas** · ${mission.vagas_restantes ?? mission.limite_jogadores ?? '-'}`,
        `**Risco** · ${mission.morte_permanente ? 'Morte permanente' : 'Sem morte permanente'}`,
        `**Sessão** · ${mission.data_sessao || mission['data_sessão'] || 'A agendar'}`
    ].join('\n');
}

function missionRows(missions, page, totalPages) {
    const rows = [];
    const selectableMissions = missions.filter(mission => mission?.id !== undefined && mission?.id !== null);
    if (selectableMissions.length) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`painel_v2_mission_select_${page}`)
                .setPlaceholder('Ver detalhes de uma missão')
                .addOptions(selectableMissions.map(mission => ({
                    label: safeText(mission.nome || mission.titulo, 'Missão').slice(0, 100),
                    description: `Rank ${mission.ranque || mission.rank_minimo || mission.rank || 'D'} · ${mission.vagas_restantes ?? mission.limite_jogadores ?? '-'} vaga(s)`.slice(0, 100),
                    value: String(mission.id)
                })))
        ));
    }
    if (totalPages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`painel_v2_mission_page_${page - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
            new ButtonBuilder().setCustomId(`painel_v2_mission_page_${page + 1}`).setLabel('Próximo').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
        ));
    }
    return rows;
}

function encyclopediaList(category) {
    return ENCYCLOPEDIA_CATEGORIES[category]?.list() || [];
}

function encyclopediaImage(item) {
    return firstValue(item, ['ilustracao_url', 'imagem_url', 'avatar_url', 'retrato_url', 'icone_url', 'image_url']);
}

function encyclopediaDetail(category, item) {
    if (!item) return null;
    const lines = [`### ${formatarTexto(item.nome || 'Registro')}`, item.descricao || item.lore || item.flavor_text || '*Sem descrição registrada.*', ''];
    if (category === 'itens') {
        lines.push(`**Categoria** · ${formatarTexto(item.categoria) || '-'}`, `**Raridade** · ${formatarTexto(item.raridade) || '-'}`);
    } else if (category === 'skills') {
        lines.push(`**Tipo** · ${formatarTexto(item.tipo) || '-'}`, `**Classe** · ${formatarTexto(item.classe) || '-'}`, `**Origem** · ${formatarTexto(item.origem) || '-'}`);
    } else if (category === 'mobs') {
        lines.push(`**Tipo** · ${formatarTexto(item.tipo || item.classificacao) || '-'}`, `**Rank** · ${item.rank || '-'}`);
    } else {
        lines.push(`**Raça** · ${formatarTexto(item.raca) || '-'}`, `**Classe** · ${formatarTexto(item.classe) || '-'}`, `**Região** · ${formatarTexto(item.regiao) || '-'}`);
    }
    return lines.join('\n');
}

function encyclopediaRows(category, page, pageItems, totalPages) {
    const active = value => category === value ? '\u25C6' : '\u25C7';
    const rows = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_v2_ency_cat_itens').setLabel(`${active('itens')} Itens`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_v2_ency_cat_skills').setLabel(`${active('skills')} Habilidades`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_v2_ency_cat_mobs').setLabel(`${active('mobs')} Bestiário`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_v2_ency_cat_npcs').setLabel(`${active('npcs')} Cânones`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`painel_v2_ency_search_${category || 'all'}`).setLabel('Buscar').setStyle(ButtonStyle.Primary)
    )];
    const selectableItems = pageItems.filter(item => item?.id !== undefined && item?.id !== null);
    if (category && selectableItems.length) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`painel_v2_ency_select_${category}_${page}`)
                .setPlaceholder('Abrir registro')
                .addOptions(selectableItems.map(item => ({
                    label: formatarTexto(item.nome || 'Registro').slice(0, 100),
                    description: safeText(item.categoria || item.tipo || item.classe || item.regiao, ENCYCLOPEDIA_CATEGORIES[category].label).slice(0, 100),
                    value: String(item.id)
                })))
        ));
    }
    if (category && totalPages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`painel_v2_ency_page_${category}_${page - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
            new ButtonBuilder().setCustomId(`painel_v2_ency_page_${category}_${page + 1}`).setLabel('Próximo').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
        ));
    }
    return rows;
}

function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function levenshtein(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= right.length; j++) {
            const above = previous[j];
            previous[j] = Math.min(
                previous[j] + 1,
                previous[j - 1] + 1,
                diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
            );
            diagonal = above;
        }
    }
    return previous[right.length];
}

function encyclopediaSearchScore(query, candidate) {
    if (query === candidate) return 1000;
    if (candidate.startsWith(query)) return 800 - Math.max(0, candidate.length - query.length);
    if (candidate.includes(query)) return 680 - candidate.indexOf(query);
    const distance = levenshtein(query, candidate);
    const longest = Math.max(query.length, candidate.length) || 1;
    return Math.round((1 - distance / longest) * 260);
}

function searchEncyclopedia(query, preferredCategory = null) {
    const normalized = normalizeSearch(query);
    if (!normalized) return null;
    const categories = preferredCategory && ENCYCLOPEDIA_CATEGORIES[preferredCategory]
        ? [preferredCategory]
        : Object.keys(ENCYCLOPEDIA_CATEGORIES);
    const matches = [];
    for (const category of categories) {
        for (const item of encyclopediaList(category)) {
            const name = normalizeSearch(item.nome);
            if (!name) continue;
            const score = encyclopediaSearchScore(normalized, name);
            if (score < 180) continue;
            matches.push({ category, item, score });
        }
    }
    return matches.sort((a, b) => b.score - a.score || String(a.item.nome).localeCompare(String(b.item.nome)))[0] || null;
}

const REGISTER_DETAILS = [
    ['mineracao', 'Mineração', 'Extração de lingotes'],
    ['dendrologia', 'Dendrologia', 'Extração de madeiras especiais'],
    ['geologia_arcana', 'Geologia Arcana', 'Extração de cristais de éter'],
    ['herbologia', 'Herbologia', 'Colheita de ervas'],
    ['catalisacao', 'Catalisação', 'Essências e catalisadores'],
    ['roleplay', 'Roleplay', 'XP idle narrativo'],
    ['metodologia_estudo', 'Metodologia de Estudo', 'Bônus de Conhecimento'],
    ['valoracao_comercial', 'Valoração Comercial', 'Bônus de vendas NPC'],
    ['negociacao_mercantil', 'Negociação Mercantil', 'Desconto em compras NPC']
];

function researchRows(status, registro, mode) {
    const mark = (value, text) => `${mode === value ? '\u25C6' : '\u25C7'} ${text}`;
    const registerMode = mode.startsWith('reg_');
    const navigation = registerMode
        ? [
            new ButtonBuilder().setCustomId('painel_v2_pesq_status').setLabel(mark('status', 'Painel')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_reg_extracao').setLabel(mark('reg_extracao', 'Extração')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_reg_producao').setLabel(mark('reg_producao', 'Produção')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_reg_treinos').setLabel(mark('reg_treinos', 'Treinos & RP')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_tree_oficios').setLabel('◇ Pesquisa').setStyle(ButtonStyle.Secondary)
        ]
        : [
            new ButtonBuilder().setCustomId('painel_v2_pesq_status').setLabel(mark('status', 'Painel')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_tree_oficios').setLabel(mark('tree_oficios', 'Ofícios')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_tree_desenvolvimento').setLabel(mark('tree_desenvolvimento', 'Desenvolvimento')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_tree_beneficios').setLabel(mark('tree_beneficios', 'Benefícios')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('painel_v2_pesq_reg_extracao').setLabel('◇ Registro').setStyle(ButtonStyle.Secondary)
        ];
    const rows = [new ActionRowBuilder().addComponents(...navigation)];

    if (registerMode) {
        const unlocked = pesquisaCommand.buildRegistroUnlockedOptions(status).slice(0, 25).map(option => ({
            label: safeText(option.label, 'Registro').slice(0, 100),
            description: safeText(option.description, 'Atividade desbloqueada').slice(0, 100),
            value: String(option.value).slice(0, 72)
        }));
        if (unlocked.length) {
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('painel_v2_reg_start').setPlaceholder('Iniciar atividade de registro').addOptions(unlocked)
            ));
        }
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('painel_v2_reg_detail').setPlaceholder('Consultar atividade de registro').addOptions(
                REGISTER_DETAILS.map(([value, label, description]) => ({ value, label, description }))
            )
        ));
    } else {
        const detailOptions = pesquisaLogic.DISCIPLINAS_LIST.slice(0, 25).map(disc => {
            const node = (status.arvore || []).find(entry => entry.slug === disc.slug);
            return {
                label: `${disc.nome} (Nv ${node?.nivel || 0}/${disc.nivelMax})`.slice(0, 100),
                description: safeText(pesquisaLogic.GRUPO_LABEL[disc.grupo], 'Disciplina').slice(0, 100),
                value: disc.slug
            };
        });
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('painel_v2_pesq_detail').setPlaceholder('Ver disciplina').addOptions(detailOptions)
        ));

        const startOptions = pesquisaLogic.DISCIPLINAS_LIST.flatMap(disc => {
            const state = pesquisaLogic.statusDisciplina(status, disc.slug);
            if (state !== pesquisaLogic.STATUS.DESBLOQUEADO && state !== pesquisaLogic.STATUS.PRONTO) return [];
            const node = (status.arvore || []).find(entry => entry.slug === disc.slug);
            return [{
                label: `Iniciar ${disc.nome} · Nv ${(node?.nivel || 0) + 1}`.slice(0, 100),
                description: 'Escolher slot de pesquisa',
                value: disc.slug
            }];
        }).slice(0, 25);
        if (startOptions.length) {
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('painel_v2_pesq_start').setPlaceholder('Iniciar nova pesquisa').addOptions(startOptions)
            ));
        }
    }

    const collect = [];
    for (const active of status.slots?.ativas || []) {
        if (new Date(active.termina_em).getTime() <= Date.now()) {
            collect.push(new ButtonBuilder().setCustomId(`painel_v2_pesq_collect_p_${active.id}`).setLabel('Coletar pesquisa').setStyle(ButtonStyle.Success));
        }
    }
    for (const active of registro?.slots?.ativas || []) {
        if (new Date(active.termina_em).getTime() <= Date.now()) {
            collect.push(new ButtonBuilder().setCustomId(`painel_v2_pesq_collect_r_${active.id}`).setLabel('Coletar registro').setStyle(ButtonStyle.Success));
        }
    }
    if (collect.length) rows.push(new ActionRowBuilder().addComponents(...collect.slice(0, 5)));
    return rows;
}

async function resolveGuild(character, refresh = false) {
    const embedded = typeof character?.guilda === 'object' ? character.guilda : null;
    if (embedded?.id && (embedded.membros || embedded.perks || embedded.nome)) {
        try { return await cached('guild', embedded.id, () => apiGet(`/guildas/${embedded.id}`), refresh); } catch (error) { return embedded; }
    }
    const guildId = firstValue(character, ['guilda_id', 'guildaId', 'id_guilda']) || embedded?.id;
    if (guildId) return cached('guild', guildId, () => apiGet(`/guildas/${guildId}`), refresh);
    const guildName = typeof character?.guilda === 'string'
        ? character.guilda
        : firstValue(character, ['guilda_nome', 'guildaNome']) || embedded?.nome || embedded?.sigla;
    if (!guildName) return null;
    const ranking = await cached('ranking', 'guildas', () => apiGet('/rankings/guildas?limit=50'), refresh);
    const list = Array.isArray(ranking) ? ranking : ranking.guildas || [];
    const normalized = normalizeSearch(guildName);
    const match = list.find(entry => normalizeSearch(entry.nome) === normalized || normalizeSearch(entry.sigla) === normalized)
        || list.find(entry => normalizeSearch(entry.nome).includes(normalized));
    if (!match?.id) return embedded || null;
    return cached('guild', match.id, () => apiGet(`/guildas/${match.id}`), refresh);
}

async function renderHome(interaction, refresh = false) {
    const [characterResult, missionsResult] = await Promise.allSettled([getCharacter(interaction.user.id, refresh), getMissions(refresh)]);
    const character = characterResult.status === 'fulfilled' ? characterResult.value : null;
    const missions = missionsResult.status === 'fulfilled' ? missionsResult.value : [];
    const context = {
        personagemNome: character?.nome || null,
        inventarioQtd: (character?.inventario || character?.itens || []).length,
        missoesAbertas: missions.length
    };
    const buffer = await gerarBannerPainelJogador(interaction.user, context);
    const text = [
        `**Personagem ativo** · ${character?.nome || 'Não encontrado'}`,
        `**Inventário** · ${context.inventarioQtd} item(ns)`,
        `**Missões abertas** · ${missions.length}`,
        '',
        'Escolha uma seção pelos botões logo abaixo da imagem.'
    ].join('\n');
    return buildPayload({ view: 'inicio', title: 'Painel do jogador', subtitle: `Central privada de ${interaction.user.globalName || interaction.user.username}`, buffer, fileName: 'painel-jogador.png', imageDescription: 'Central do jogador', refreshId: 'painel_v2_refresh_inicio', textBlocks: [text] });
}

async function renderProfile(interaction, state = {}, refresh = false) {
    const character = await getCharacter(interaction.user.id, refresh);
    const buffer = await gerarBannerPerfil(character);
    const row = profileSkillRow(character);
    const equippedSkill = state.skillId
        ? (character.build_skills || []).find(skill => String(skill.id) === String(state.skillId))
        : null;
    const selected = state.skillId ? (catalogCache.findSkill(state.skillId) || equippedSkill) : null;
    const text = selected ? skillDetail(selected) : (row ? 'Selecione uma habilidade equipada para ver os detalhes sem sair da ficha.' : 'Este personagem não possui habilidades equipadas.');
    return buildPayload({ view: 'perfil', title: `Perfil · ${formatarTexto(character.nome)}`, subtitle: 'Ficha personalizada do personagem ativo', buffer, fileName: 'perfil.png', imageDescription: `Ficha de ${formatarTexto(character.nome)}`, refreshId: 'painel_v2_refresh_perfil', localRows: row ? [row] : [], textBlocks: [text] });
}

async function renderInventory(interaction, state = {}, refresh = false) {
    const character = await getCharacter(interaction.user.id, refresh);
    const category = ['todos', 'armas', 'armaduras', 'consumiveis', 'materiais'].includes(state.category) ? state.category : 'todos';
    const allItems = character.inventario || character.itens || [];
    const filtered = filterInventory(allItems, category);
    const totalPages = Math.max(1, Math.ceil(filtered.length / 8));
    const page = Math.max(0, Math.min(Number(state.page || 0), totalPages - 1));
    const visible = filtered.slice(page * 8, page * 8 + 8);
    const buffer = await gerarBannerInventario(character, visible, category, page, totalPages);
    return buildPayload({
        view: 'inventario', title: `Inventário · ${formatarTexto(character.nome)}`, subtitle: `${filtered.length} item(ns) nesta categoria`, buffer, fileName: 'inventario.png', imageDescription: `Inventário de ${formatarTexto(character.nome)}`,
        refreshId: `painel_v2_refresh_inventario_${category}_${page}`, localRows: inventoryRows(character.id, category, page, totalPages), textBlocks: [`Página **${page + 1}/${totalPages}** · categoria **${formatarTexto(category)}**`]
    });
}

async function renderRanking(interaction, state = {}, refresh = false) {
    const type = ['poder', 'nivel', 'guildas', 'arena'].includes(state.type) ? state.type : 'poder';
    const data = await getRanking(type, refresh);
    const buffer = await gerarBannerRanking(type, data);
    return buildPayload({ view: 'ranking', title: 'Rankings de Arkandia', subtitle: `Classificação por ${formatarTexto(type)}`, buffer, fileName: 'ranking.png', imageDescription: `Ranking de ${type}`, refreshId: `painel_v2_refresh_ranking_${type}`, localRows: [rankingRow(type)], textBlocks: ['Alterne a categoria mantendo a classificação em destaque.'] });
}

async function renderMissions(interaction, state = {}, refresh = false) {
    const [missions, character] = await Promise.all([getMissions(refresh), getCharacter(interaction.user.id, refresh).catch(() => null)]);
    const totalPages = Math.max(1, Math.ceil(missions.length / 4));
    const page = Math.max(0, Math.min(Number(state.page || 0), totalPages - 1));
    const visible = missions.slice(page * 4, page * 4 + 4);
    const selected = state.missionId ? missions.find(mission => String(mission.id) === String(state.missionId)) : null;
    const buffer = await gerarBannerMissoesPainel(visible, { page, totalPages, personagemNome: character?.nome });
    return buildPayload({ view: 'missoes', title: 'Quadro de missões', subtitle: `${missions.length} oportunidade(s) disponível(is)`, buffer, fileName: 'missoes.png', imageDescription: 'Quadro de missões de Arkandia', refreshId: `painel_v2_refresh_missoes_${page}`, localRows: missionRows(visible, page, totalPages), textBlocks: [selected ? missionDetail(selected) : 'Selecione uma missão para consultar requisitos, risco e vagas.'] });
}

async function renderEncyclopedia(interaction, state = {}) {
    const category = ENCYCLOPEDIA_CATEGORIES[state.category] ? state.category : null;
    const allItems = category ? encyclopediaList(category) : [];
    const totalPages = Math.max(1, Math.ceil(allItems.length / 8));
    const page = Math.max(0, Math.min(Number(state.page || 0), totalPages - 1));
    const pageItems = allItems.slice(page * 8, page * 8 + 8);
    const selected = state.itemId ? allItems.find(item => String(item.id) === String(state.itemId)) : state.item || null;
    const buffer = await gerarBannerEnciclopedia();
    const listText = category && !selected
        ? `### ${ENCYCLOPEDIA_CATEGORIES[category].label}\n${pageItems.map((item, index) => `**${page * 8 + index + 1}.** ${formatarTexto(item.nome)}`).join('\n') || 'Nenhum registro encontrado.'}`
        : 'Consulte itens, habilidades, criaturas e personagens canônicos sem sair do painel.';
    return buildPayload({
        view: 'enciclopedia', title: 'Enciclopédia de Ernas', subtitle: category ? `${ENCYCLOPEDIA_CATEGORIES[category].label} · página ${page + 1}/${totalPages}` : 'Acervo oficial do universo',
        buffer, fileName: 'enciclopedia.png', imageDescription: 'Enciclopédia de Ernas', refreshId: `painel_v2_refresh_enciclopedia_${category || 'home'}_${page}`,
        localRows: encyclopediaRows(category, page, pageItems, totalPages), textBlocks: [state.notice, selected ? encyclopediaDetail(state.itemCategory || category, selected) : listText], extraMediaUrls: selected ? [encyclopediaImage(selected)] : []
    });
}

async function renderResearch(interaction, state = {}, refresh = false) {
    if (refresh) pesquisaApi.invalidateCache(interaction.user.id);
    const [status, registro] = await Promise.all([pesquisaApi.getPesquisaCached(interaction.user.id), pesquisaApi.getRegistroCached(interaction.user.id).catch(() => ({}))]);
    const mode = state.mode || 'status';
    let buffer;
    let fileName;
    let title;
    let subtitle;
    if (mode.startsWith('detail_')) {
        const slug = mode.replace('detail_', '');
        const discipline = pesquisaLogic.DISCIPLINAS[slug];
        if (!discipline) return renderResearch(interaction, { mode: 'status' }, refresh);
        buffer = await gerarBannerPesquisaDetalhe(discipline, status, { iconBuffer: await pesquisaCommand.getIcon(slug) });
        fileName = `pesquisa-${slug}.png`;
        title = `Pesquisa · ${discipline.nome}`;
        subtitle = 'Detalhes e progressão da disciplina';
    } else if (mode.startsWith('tree_')) {
        const group = mode.replace('tree_', '');
        buffer = await gerarBannerPesquisaArvore(status, { assets: await pesquisaCommand.loadAllIcons(), grupo: group });
        fileName = `pesquisa-${group}.png`;
        title = 'Árvore de pesquisa';
        subtitle = pesquisaLogic.GRUPO_LABEL[group] || formatarTexto(group);
    } else if (mode.startsWith('reg_')) {
        const registerLabels = {
            reg_extracao: 'Extração',
            reg_producao: 'Produção',
            reg_treinos: 'Treinos & RP'
        };
        const registerMode = registerLabels[mode] ? mode : 'reg_extracao';
        buffer = await gerarBannerPesquisaArvore(status, { assets: await pesquisaCommand.loadAllIcons(), grupo: registerMode });
        fileName = `registro-${registerMode.replace('reg_', '')}.png`;
        title = 'Hub de registro';
        subtitle = registerLabels[registerMode];
    } else {
        buffer = await gerarBannerPesquisaStatus(status, registro, { personagemNome: status.personagemNome });
        fileName = 'pesquisa-status.png';
        title = 'Pesquisa e registro';
        subtitle = 'Conhecimento, slots e atividades';
    }
    const guidance = mode.startsWith('reg_')
        ? 'Inicie atividades desbloqueadas, acompanhe os registros e colete resultados pelo mesmo painel.'
        : 'Consulte a árvore, inicie pesquisas e colete resultados pelos controles abaixo.';
    return buildPayload({ view: 'pesquisa', title, subtitle, buffer, fileName, imageDescription: title, refreshId: `painel_v2_refresh_pesquisa_${mode}`, localRows: researchRows(status, registro, mode), textBlocks: [state.notice, guidance] });
}

async function renderGuild(interaction, refresh = false) {
    const character = await getCharacter(interaction.user.id, refresh);
    const guild = await resolveGuild(character, refresh);
    if (!guild) {
        const buffer = await gerarBannerPainelJogador(interaction.user, { personagemNome: character.nome, inventarioQtd: (character.inventario || []).length, missoesAbertas: 0 });
        return buildPayload({ view: 'guilda', title: 'Guilda', subtitle: 'Nenhuma guilda vinculada ao personagem ativo', buffer, fileName: 'guilda-vazia.png', imageDescription: 'Painel do jogador sem guilda', refreshId: 'painel_v2_refresh_guilda', textBlocks: ['Quando o personagem entrar em uma guilda, seus dados, membros e benefícios aparecerão automaticamente aqui.'] });
    }
    const buffer = await gerarBannerGuilda(guild);
    const members = guild.membros || guild.members;
    const memberCount = Array.isArray(members)
        ? members.length
        : guild.total_membros ?? guild.totalMembros ?? (typeof members === 'number' ? members : '-');
    return buildPayload({ view: 'guilda', title: `Guilda · ${formatarTexto(guild.nome || guild.sigla)}`, subtitle: guild.sigla ? `[${guild.sigla}] Informações e benefícios` : 'Informações e benefícios', buffer, fileName: 'guilda.png', imageDescription: `Guilda ${guild.nome || guild.sigla}`, refreshId: 'painel_v2_refresh_guilda', textBlocks: [`**Membros** · ${memberCount}\n**Nível** · ${guild.nivel || guild.level || '-'}\n**Ranking** · ${guild.posicao_ranking || guild.ranking || '-'}`] });
}

async function renderRp(interaction) {
    let sessions = [];
    try {
        sessions = sessionStore.listSessions({ guildId: interaction.guildId, status: 'ativa', participantId: interaction.user.id, limit: 10, offset: 0 }).filter(session => session.type === 'rp');
    } catch (error) {}
    const character = await getCharacter(interaction.user.id).catch(() => null);
    if (!sessions.length) {
        const buffer = await gerarBannerPainelJogador(interaction.user, { personagemNome: character?.nome, inventarioQtd: (character?.inventario || []).length, missoesAbertas: 0 });
        return buildPayload({ view: 'rp', title: 'Cenas de RP', subtitle: 'Nenhuma sessão ativa encontrada', buffer, fileName: 'rp-vazio.png', imageDescription: 'Painel de cenas de RP', refreshId: 'painel_v2_refresh_rp', textBlocks: ['Use os painéis das localidades ou `/rp iniciar` para abrir uma nova sessão.'] });
    }
    const current = sessions[0];
    const buffer = await gerarBannerRpTitulo({ titulo: current.title, subtitulo: current.subtitle, criador: { tag: character?.nome || interaction.user.username }, mestre: Boolean(current.creator_is_master) });
    const linkRows = sessions.slice(0, 3).map(session => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel(`Abrir · ${safeText(session.title, 'Sessão').slice(0, 60)}`).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${session.discord_guild_id}/${session.discord_thread_id}`)
    ));
    return buildPayload({ view: 'rp', title: 'Cenas de RP', subtitle: `${sessions.length} sessão(ões) ativa(s)`, buffer, fileName: 'rp.png', imageDescription: `Cena ${current.title}`, refreshId: 'painel_v2_refresh_rp', localRows: linkRows, textBlocks: [sessions.map((session, index) => `**${index + 1}. ${session.title}** · ${session.created_at ? new Date(session.created_at).toLocaleDateString('pt-BR') : 'ativa'}`).join('\n')], extraMediaUrls: [current.scenario_url] });
}

async function renderView(interaction, view = 'inicio', state = {}, refresh = false) {
    const safeView = VALID_VIEWS.has(view) ? view : 'inicio';
    try {
        if (safeView === 'perfil') return await renderProfile(interaction, state, refresh);
        if (safeView === 'inventario') return await renderInventory(interaction, state, refresh);
        if (safeView === 'missoes') return await renderMissions(interaction, state, refresh);
        if (safeView === 'enciclopedia') return await renderEncyclopedia(interaction, state);
        if (safeView === 'pesquisa') return await renderResearch(interaction, state, refresh);
        if (safeView === 'ranking') return await renderRanking(interaction, state, refresh);
        if (safeView === 'guilda') return await renderGuild(interaction, refresh);
        if (safeView === 'rp') return await renderRp(interaction);
        return await renderHome(interaction, refresh);
    } catch (error) {
        console.error(`[painel v2] Erro ao renderizar ${safeView}:`, error);
        const fallbackBuffer = await gerarBannerPainelJogador(interaction.user, {});
        return buildPayload({ view: safeView, title: 'Painel temporariamente indisponível', subtitle: 'Não foi possível sincronizar esta seção', buffer: fallbackBuffer, fileName: 'painel-erro.png', imageDescription: 'Painel do jogador', refreshId: `painel_v2_refresh_${safeView}`, textBlocks: [`Ocorreu um erro ao consultar **${formatarTexto(safeView)}**. Tente atualizar ou use o comando individual correspondente.`] });
    }
}

function encyclopediaModal(category) {
    const input = new TextInputBuilder().setCustomId('query').setLabel('O que você procura?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex.: Guram, adaga, lobo...');
    return new ModalBuilder().setCustomId(`painel_v2_ency_modal_${category || 'all'}`).setTitle('Buscar na Enciclopédia').addComponents(new ActionRowBuilder().addComponents(input));
}

function researchStartModal(slug) {
    const discipline = pesquisaLogic.DISCIPLINAS[slug];
    const input = new TextInputBuilder().setCustomId('slot').setLabel('Slot de pesquisa (1 ou 2)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setValue('1');
    return new ModalBuilder().setCustomId(`painel_v2_pesq_modal_${slug}`).setTitle(`Pesquisar ${discipline?.nome || slug}`.slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(input));
}

function registerStartModal(actionValue) {
    const input = new TextInputBuilder().setCustomId('slot').setLabel('Slot de registro (1 ou 2)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setValue('1');
    return new ModalBuilder().setCustomId(`painel_v2_reg_modal_${actionValue}`).setTitle('Iniciar atividade de registro').addComponents(new ActionRowBuilder().addComponents(input));
}

function buildRegisterBody(actionValue, slot) {
    const parts = String(actionValue || '').split(':');
    const type = parts[0];
    let payload;
    if (type === 'extracao') {
        const oficio = parts[1];
        if (oficio === 'mineracao') payload = { oficio, raridade: parts[2] || 'comum' };
        else if (oficio === 'dendrologia' || oficio === 'herbologia') payload = { oficio, tier: Number.parseInt(parts[2] || '1', 10) };
        else if (oficio === 'geologia_arcana') payload = { oficio };
        else if (oficio === 'catalisacao' && parts[2] === 'essencia') payload = { oficio, designio: parts[3] };
        else if (oficio === 'catalisacao' && parts[2] === 'catalisador') payload = { oficio, raridade_catalisador: parts[3] };
    } else if (type === 'roleplay') {
        payload = { duracao_h: Number.parseInt(parts[1] || '4', 10) };
    } else if (type === 'beneficio') {
        payload = { beneficio: parts[1] };
    }
    return payload ? { tipo: type, slot, payload } : null;
}

function operationErrorMessage(error) {
    return safeText(error?.response?.data?.error || error?.response?.data?.message || error?.message, 'Não foi possível concluir a operação.').slice(0, 300);
}

async function update(interaction, view, state = {}, refresh = false) {
    await interaction.deferUpdate();
    return interaction.editReply(await renderView(interaction, view, state, refresh));
}

async function handleButton(interaction) {
    const id = interaction.customId;
    if (id === 'painel_v2_fechar') {
        await interaction.deferUpdate();
        await interaction.deleteReply();
        return true;
    }
    if (id.startsWith('painel_v2_menu_')) return update(interaction, id.replace('painel_v2_menu_', ''), {});
    if (id === 'painel_v2_refresh_inicio') return update(interaction, 'inicio', {}, true);
    if (id === 'painel_v2_refresh_perfil') return update(interaction, 'perfil', {}, true);
    if (id.startsWith('painel_v2_refresh_inventario_')) {
        const [, category, page] = id.match(/^painel_v2_refresh_inventario_([^_]+)_(-?\d+)$/) || [];
        return update(interaction, 'inventario', { category, page }, true);
    }
    if (id.startsWith('painel_v2_refresh_missoes_')) return update(interaction, 'missoes', { page: id.replace('painel_v2_refresh_missoes_', '') }, true);
    if (id.startsWith('painel_v2_refresh_ranking_')) return update(interaction, 'ranking', { type: id.replace('painel_v2_refresh_ranking_', '') }, true);
    if (id.startsWith('painel_v2_refresh_enciclopedia_')) {
        const match = id.match(/^painel_v2_refresh_enciclopedia_([^_]+)_(-?\d+)$/);
        return update(interaction, 'enciclopedia', { category: match?.[1] === 'home' ? null : match?.[1], page: match?.[2] });
    }
    if (id.startsWith('painel_v2_refresh_pesquisa_')) return update(interaction, 'pesquisa', { mode: id.replace('painel_v2_refresh_pesquisa_', '') }, true);
    if (id === 'painel_v2_refresh_guilda') return update(interaction, 'guilda', {}, true);
    if (id === 'painel_v2_refresh_rp') return update(interaction, 'rp', {});
    if (id.startsWith('painel_v2_inv_cat_')) {
        const match = id.match(/^painel_v2_inv_cat_([^_]+)_([^_]+)$/);
        return update(interaction, 'inventario', { category: match?.[2], page: 0 });
    }
    if (id.startsWith('painel_v2_inv_page_')) {
        const match = id.match(/^painel_v2_inv_page_([^_]+)_([^_]+)_(-?\d+)$/);
        return update(interaction, 'inventario', { category: match?.[2], page: match?.[3] });
    }
    if (id.startsWith('painel_v2_rank_')) return update(interaction, 'ranking', { type: id.replace('painel_v2_rank_', '') });
    if (id.startsWith('painel_v2_mission_page_')) return update(interaction, 'missoes', { page: id.replace('painel_v2_mission_page_', '') });
    if (id.startsWith('painel_v2_ency_cat_')) return update(interaction, 'enciclopedia', { category: id.replace('painel_v2_ency_cat_', ''), page: 0 });
    if (id.startsWith('painel_v2_ency_page_')) {
        const match = id.match(/^painel_v2_ency_page_([^_]+)_(-?\d+)$/);
        return update(interaction, 'enciclopedia', { category: match?.[1], page: match?.[2] });
    }
    if (id.startsWith('painel_v2_ency_search_')) {
        await interaction.showModal(encyclopediaModal(id.replace('painel_v2_ency_search_', '')));
        return true;
    }
    if (id === 'painel_v2_pesq_status') return update(interaction, 'pesquisa', { mode: 'status' });
    if (id.startsWith('painel_v2_pesq_tree_')) return update(interaction, 'pesquisa', { mode: `tree_${id.replace('painel_v2_pesq_tree_', '')}` });
    if (id.startsWith('painel_v2_pesq_reg_')) return update(interaction, 'pesquisa', { mode: `reg_${id.replace('painel_v2_pesq_reg_', '')}` });
    if (id.startsWith('painel_v2_pesq_collect_')) {
        await interaction.deferUpdate();
        const match = id.match(/^painel_v2_pesq_collect_([pr])_(.+)$/);
        try {
            if (!match) throw new Error('A atividade selecionada não é válida.');
            const result = match[1] === 'p'
                ? await pesquisaApi.postPesquisaColetar(interaction.user.id, match[2])
                : await pesquisaApi.postRegistroColetar(interaction.user.id, match[2]);
            if (result?.error) throw new Error(result.error);
            pesquisaApi.invalidateCache(interaction.user.id);
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'status', notice: '✅ **Coleta concluída.** Saldo, slots e progresso foram sincronizados.' }, true));
        } catch (error) {
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'status', notice: `⚠️ **Não foi possível coletar:** ${operationErrorMessage(error)}` }, true));
        }
    }
    return undefined;
}

async function handleSelect(interaction) {
    const id = interaction.customId;
    if (id.startsWith('painel_v2_skill_')) return update(interaction, 'perfil', { skillId: interaction.values[0] });
    if (id.startsWith('painel_v2_mission_select_')) return update(interaction, 'missoes', { page: id.replace('painel_v2_mission_select_', ''), missionId: interaction.values[0] });
    if (id.startsWith('painel_v2_ency_select_')) {
        const match = id.match(/^painel_v2_ency_select_([^_]+)_(-?\d+)$/);
        return update(interaction, 'enciclopedia', { category: match?.[1], page: match?.[2], itemId: interaction.values[0] });
    }
    if (id === 'painel_v2_pesq_detail') return update(interaction, 'pesquisa', { mode: `detail_${interaction.values[0]}` });
    if (id === 'painel_v2_reg_detail') return update(interaction, 'pesquisa', { mode: `detail_${interaction.values[0]}` });
    if (id === 'painel_v2_pesq_start') {
        await interaction.showModal(researchStartModal(interaction.values[0]));
        return true;
    }
    if (id === 'painel_v2_reg_start') {
        await interaction.showModal(registerStartModal(interaction.values[0]));
        return true;
    }
    return undefined;
}

async function handleModal(interaction) {
    const id = interaction.customId;
    if (id.startsWith('painel_v2_ency_modal_')) {
        const category = id.replace('painel_v2_ency_modal_', '');
        const result = searchEncyclopedia(interaction.fields.getTextInputValue('query'), category === 'all' ? null : category);
        await interaction.deferUpdate();
        if (!result) return interaction.editReply(await renderView(interaction, 'enciclopedia', { category: category === 'all' ? null : category, notice: '⚠️ Nenhum registro semelhante foi encontrado. Tente outra palavra.' }));
        return interaction.editReply(await renderView(interaction, 'enciclopedia', { category: result.category, itemCategory: result.category, item: result.item }));
    }
    if (id.startsWith('painel_v2_pesq_modal_')) {
        const slug = id.replace('painel_v2_pesq_modal_', '');
        const slot = interaction.fields.getTextInputValue('slot')?.trim() === '2' ? 2 : 1;
        await interaction.deferUpdate();
        try {
            const result = await pesquisaApi.postPesquisaIniciar(interaction.user.id, { disciplina: slug, slot });
            if (result?.error) throw new Error(result.error);
            pesquisaApi.invalidateCache(interaction.user.id);
            const discipline = pesquisaLogic.DISCIPLINAS[slug];
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'status', notice: `✅ **Pesquisa iniciada:** ${discipline?.nome || formatarTexto(slug)} no slot ${slot}.` }, true));
        } catch (error) {
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'status', notice: `⚠️ **Não foi possível iniciar a pesquisa:** ${operationErrorMessage(error)}` }, true));
        }
    }
    if (id.startsWith('painel_v2_reg_modal_')) {
        const actionValue = id.replace('painel_v2_reg_modal_', '');
        const slot = interaction.fields.getTextInputValue('slot')?.trim() === '2' ? 2 : 1;
        await interaction.deferUpdate();
        try {
            const body = buildRegisterBody(actionValue, slot);
            if (!body) throw new Error('A atividade selecionada não é válida.');
            const result = await pesquisaApi.postRegistroIniciar(interaction.user.id, body);
            if (result?.error) throw new Error(result.error);
            pesquisaApi.invalidateCache(interaction.user.id);
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'status', notice: `✅ **Registro iniciado:** ${result?.rotulo || 'atividade'} no slot ${slot}.` }, true));
        } catch (error) {
            return interaction.editReply(await renderView(interaction, 'pesquisa', { mode: 'reg_extracao', notice: `⚠️ **Não foi possível iniciar o registro:** ${operationErrorMessage(error)}` }, true));
        }
    }
    return undefined;
}

module.exports = { renderView, handleButton, handleSelect, handleModal };
