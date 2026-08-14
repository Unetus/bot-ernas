/**
 * pesquisa.js — Comando /pesquisa do BOT.
 *
 * Subcomandos:
 *   status              banner com saldo + 2 slots de pesquisa + 2 de registro
 *   arvore              banner com a arvore das 16 disciplinas
 *   detalhe <slug>      banner de detalhe de uma disciplina
 *   iniciar <slug>      modal para escolher slot e iniciar pesquisa
 *   coletar <id>        botao para coletar pesquisa pronta
 *   registro            banner com status de registro (2 slots + beneficios)
 *   registro iniciar <tipo>  modal para iniciar registro (forja, extracao, roleplay)
 *   registro coletar <id>     botao para coletar registro pronto
 *   saldo               embed com saldos (runas, libras, conhecimento)
 *
 * O Discord ID do jogador e resolvido automaticamente (interaction.user.id).
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const api = require('../utils/pesquisaApi');
const logic = require('../utils/pesquisaLogic');
const assets = require('../utils/pesquisaAssets');
const {
    gerarBannerPesquisaStatus,
    gerarBannerPesquisaArvore,
    gerarBannerPesquisaDetalhe,
} = require('../canvas/renderer');
const { replyAndDelete } = require('../utils/tempMessage');

// Cache de assets carregados (1h TTL)
const ASSET_TTL_MS = 60 * 60 * 1000;
const _iconCache = new Map();

async function getIcon(discSlug) {
    const cached = _iconCache.get(discSlug);
    if (cached && cached.value && Date.now() - cached.at < ASSET_TTL_MS) return cached.value;
    const url = await assets.assetUrl(`pesquisa/icon-${discSlug}.png`);
    try {
        const axios = require('axios');
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 8000,
            headers: { 'User-Agent': 'rpg-bot/2.0' }
        });
        const buf = Buffer.from(res.data);
        _iconCache.set(discSlug, { at: Date.now(), value: buf });
        return buf;
    } catch (e) {
        console.warn(`[getIcon] Erro ao carregar ícone para ${discSlug} de ${url}:`, e.message);
        // Fallback: retornar URL direta para o Canvas tentar carregar
        return url;
    }
}

async function loadAllIcons() {
    const out = {};
    await Promise.all(logic.DISCIPLINAS_LIST.map(async (d) => {
        out[d.slug] = await getIcon(d.slug);
    }));
    return out;
}

const data = new SlashCommandBuilder()
    .setName('pesquisa')
    .setDescription('Sistema de Pesquisa e Registro (oficios, beneficio, roleplay)')
    .addSubcommand((s) => s
        .setName('status')
        .setDescription('Mostra saldo de Conhecimento, 2 slots de pesquisa e 2 de registro'))
    .addSubcommand((s) => s
        .setName('arvore')
        .setDescription('Mostra a arvore das 16 disciplinas (bloqueado/desbloqueado)'))
    .addSubcommand((s) => s
        .setName('detalhe')
        .setDescription('Mostra o detalhe de uma disciplina')
        .addStringOption((o) => o
            .setName('disciplina')
            .setDescription('Slug da disciplina (ex.: ferraria, sintese)')
            .setRequired(true)))
    .addSubcommand((s) => s
        .setName('iniciar')
        .setDescription('Inicia uma pesquisa no proximo nivel de uma disciplina')
        .addStringOption((o) => o
            .setName('disciplina')
            .setDescription('Slug da disciplina')
            .setRequired(true)))
    .addSubcommand((s) => s
        .setName('coletar')
        .setDescription('Coleta uma pesquisa pronta')
        .addStringOption((o) => o
            .setName('id')
            .setDescription('ID da pesquisa ativa')
            .setRequired(true)))
    .addSubcommand((s) => s
        .setName('registro')
        .setDescription('Mostra os 2 slots de registro e os tipos desbloqueados'))
    .addSubcommand((s) => s
        .setName('registro_iniciar')
        .setDescription('Inicia um registro (forja, extracao ou roleplay)')
        .addStringOption((o) => o
            .setName('tipo')
            .setDescription('Tipo de registro')
            .setRequired(true)
            .addChoices(
                { name: 'Forja', value: 'forja' },
                { name: 'Extracao', value: 'extracao' },
                { name: 'Roleplay', value: 'roleplay' },
                { name: 'Alquimia', value: 'alquimia' },
                { name: 'Refino', value: 'refino' },
            )))
    .addSubcommand((s) => s
        .setName('registro_coletar')
        .setDescription('Coleta um registro pronto')
        .addStringOption((o) => o
            .setName('id')
            .setDescription('ID do registro')
            .setRequired(true)))
    .addSubcommand((s) => s
        .setName('saldo')
        .setDescription('Mostra saldos (runas, libras, conhecimento)'));

function discordId(interaction) {
    return interaction.user.id;
}

async function sendStatus(interaction, ephemeral = false) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral });
    }
    const did = discordId(interaction);
    try {
        const [pesquisa, registro] = await Promise.all([
            api.getPesquisaCached(did).catch((e) => ({ error: e.message })),
            api.getRegistroCached(did).catch((e) => ({ error: e.message })),
        ]);
        if (pesquisa.error) {
            return await replyAndDelete(interaction, `Erro ao consultar pesquisa: ${pesquisa.error}`, 8000);
        }
        if (registro.error) {
            return await replyAndDelete(interaction, `Erro ao consultar registro: ${registro.error}`, 8000);
        }
        const buffer = await gerarBannerPesquisaStatus(pesquisa, registro, {
            personagemNome: pesquisa.personagemNome,
        });
        const attachment = new AttachmentBuilder(buffer, { name: 'pesquisa-status.png' });
        const components = buildStatusComponents(pesquisa, registro);
        return await interaction.editReply({ files: [attachment], components });
    } catch (e) {
        console.error('[pesquisa status] erro:', e);
        return await replyAndDelete(interaction, 'Erro ao carregar o status.', 8000);
    }
}

async function renderPesquisaStatusForPainel(interaction) {
    return await sendStatus(interaction, true);
}

function buildRegistroUnlockedOptions(pesquisa) {
    const options = [];
    const niveis = {};
    for (const n of (pesquisa?.arvore || [])) {
        niveis[n.slug] = n.nivel ?? 0;
    }

    // Mineração
    const mineracaoNv = niveis.mineracao ?? 0;
    if (mineracaoNv >= 1) {
        const lingotes = [
            { req: 1, rar: 'comum', nome: 'Lingote de Ferro' },
            { req: 3, rar: 'raro', nome: 'Lingote de Aço' },
            { req: 5, rar: 'epico', nome: 'Lingote de Platina' },
            { req: 7, rar: 'lendario', nome: 'Lingote de Ferro Estígio' },
            { req: 9, rar: 'mitico', nome: 'Lingote de Prata Celestial' },
        ];
        for (const l of lingotes) {
            if (mineracaoNv >= l.req) {
                options.push({
                    label: `Mineração: ${l.nome} (${l.rar.toUpperCase()})`,
                    description: 'Extração idle de minério',
                    value: `extracao:mineracao:${l.rar}`,
                });
            }
        }
    }

    // Dendrologia
    const dendroNv = niveis.dendrologia ?? 0;
    if (dendroNv >= 1) {
        const madeiras = [
            { tier: 1, nome: 'Carvalho-Bravo (Tier 1)' },
            { tier: 2, nome: 'Freixo-Rubro (Tier 2)' },
            { tier: 3, nome: 'Teixo-Lunar (Tier 3)' },
            { tier: 4, nome: 'Ébano-Etéreo (Tier 4)' },
            { tier: 5, nome: 'Coração-do-Bosque (Tier 5)' },
        ];
        for (const m of madeiras) {
            if (dendroNv >= m.tier) {
                options.push({
                    label: `Dendrologia: ${m.nome}`,
                    description: 'Extração idle de madeira especial',
                    value: `extracao:dendrologia:${m.tier}`,
                });
            }
        }
    }

    // Geologia Arcana
    const geoNv = niveis.geologia_arcana ?? 0;
    if (geoNv >= 1) {
        options.push({
            label: 'Geologia Arcana: Cristal de Éter',
            description: 'Extração idle de cristais arcanos',
            value: 'extracao:geologia_arcana',
        });
    }

    // Herbologia
    const herboNv = niveis.herbologia ?? 0;
    if (herboNv >= 1) {
        const ervas = [
            { tier: 1, nome: 'Erva Salvabranca (Tier 1)' },
            { tier: 2, nome: 'Erva Vermilho (Tier 2)' },
            { tier: 3, nome: 'Erva Lumen (Tier 3)' },
            { tier: 4, nome: 'Erva Bruma-Eterna (Tier 4)' },
            { tier: 5, nome: 'Erva Lótus-do-Véu (Tier 5)' },
        ];
        for (const e of ervas) {
            if (herboNv >= e.tier) {
                options.push({
                    label: `Herbologia: ${e.nome}`,
                    description: 'Colheita idle de ervas para alquimia',
                    value: `extracao:herbologia:${e.tier}`,
                });
            }
        }
    }

    // Catalisação
    const catNv = niveis.catalisacao ?? 0;
    if (catNv >= 1) {
        const designios = ['marcial', 'elemental', 'cinetica', 'vital', 'mimetica', 'espiritual', 'arcana', 'psiquica', 'conceitual', 'incomum'];
        const numDes = Math.min(catNv, designios.length);
        for (let i = 0; i < numDes; i++) {
            const d = designios[i];
            const nomeD = d.charAt(0).toUpperCase() + d.slice(1);
            options.push({
                label: `Catalisação: Essência ${nomeD}`,
                description: 'Extração idle de essência de maestria',
                value: `extracao:catalisacao:essencia:${d}`,
            });
        }
        if (catNv >= 4) {
            options.push({ label: 'Catalisação: Catalisador Épico', description: 'Extração de catalisador arcano épico', value: 'extracao:catalisacao:catalisador:epico' });
        }
        if (catNv >= 7) {
            options.push({ label: 'Catalisação: Catalisador Lendário', description: 'Extração de catalisador arcano lendário', value: 'extracao:catalisacao:catalisador:lendario' });
        }
        if (catNv >= 10) {
            options.push({ label: 'Catalisação: Catalisador Mítico', description: 'Extração de catalisador arcano mítico', value: 'extracao:catalisacao:catalisador:mitico' });
        }
    }

    // Roleplay
    const rpNv = niveis.roleplay ?? 0;
    if (rpNv >= 1) {
        const duracoes = [4, 8, 12, 24];
        for (const h of duracoes) {
            options.push({
                label: `Roleplay: Sessão de ${h} horas`,
                description: `Ganho de XP idle acumulado durante ${h}h`,
                value: `roleplay:${h}`,
            });
        }
    }

    // Benefícios
    if ((niveis.metodologia_estudo ?? 0) >= 1) {
        options.push({
            label: 'Ativar Benefício: Metodologia de Estudo',
            description: 'Aumenta produção passiva de Conhecimento por 6h',
            value: 'beneficio:metodologia_estudo',
        });
    }
    if ((niveis.valoracao_comercial ?? 0) >= 1) {
        options.push({
            label: 'Ativar Benefício: Valoração Comercial',
            description: 'Bônus de % nas vendas à Loja NPC por 6h',
            value: 'beneficio:valoracao_comercial',
        });
    }
    if ((niveis.negociacao_mercantil ?? 0) >= 1) {
        options.push({
            label: 'Ativar Benefício: Negociação Mercantil',
            description: 'Desconto de % nas compras da Loja NPC por 6h',
            value: 'beneficio:negociacao_mercantil',
        });
    }

    return options;
}

function buildStatusComponents(pesquisa, registro, activeView = null) {
    const rows = [];
    const isRegView = activeView && activeView.startsWith('reg_');

    const label = (view, text) => `${activeView === view ? '◆' : '◇'} ${text}`;

    if (isRegView) {
        // Row 1: Botões de Navegação de Registro
        const navButtons = [
            new ButtonBuilder().setCustomId('pesq:reg_cat:extracao').setLabel(label('reg_extracao', 'Extração')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:reg_cat:producao').setLabel(label('reg_producao', 'Produção')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:reg_cat:treinos').setLabel(label('reg_treinos', 'Treinos & RP')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:tree_cat:oficios').setLabel(label('oficios', 'Árvore Pesquisa')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:show:status').setLabel(label('status', 'Painel')).setStyle(ButtonStyle.Secondary),
        ];
        rows.push(new ActionRowBuilder().addComponents(...navButtons));

        // Row 2: Select Menu - Iniciar Registro (Apenas desbloqueadas!)
        const regUnlocked = buildRegistroUnlockedOptions(pesquisa);
        if (regUnlocked.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('reg:select_iniciar')
                .setPlaceholder('Selecione um registro desbloqueado para iniciar...')
                .addOptions(regUnlocked.slice(0, 25));
            rows.push(new ActionRowBuilder().addComponents(selectMenu));
        } else {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('reg:select_iniciar_empty')
                .setPlaceholder('Nenhum registro desbloqueado (pesquise disciplinas primeiro)')
                .setDisabled(true)
                .addOptions([{ label: 'Sem registros desbloqueados', value: 'vazio' }]);
            rows.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        // Row 3: Select Menu - Ver Detalhes do Registro
        const detailOptions = [
            { label: 'Mineração', description: 'Extração de lingotes', value: 'mineracao' },
            { label: 'Dendrologia', description: 'Extração de madeiras especiais', value: 'dendrologia' },
            { label: 'Geologia Arcana', description: 'Extração de cristais de éter', value: 'geologia_arcana' },
            { label: 'Herbologia', description: 'Colheita de ervas', value: 'herbologia' },
            { label: 'Catalisação', description: 'Essências e catalisadores', value: 'catalisacao' },
            { label: 'Roleplay', description: 'XP idle narrativo', value: 'roleplay' },
            { label: 'Metodologia de Estudo', description: 'Buff de ganho de Conhecimento', value: 'metodologia_estudo' },
            { label: 'Valoração Comercial', description: 'Buff de vendas NPC', value: 'valoracao_comercial' },
            { label: 'Negociação Mercantil', description: 'Buff de compras NPC', value: 'negociacao_mercantil' },
        ];
        const detailSelect = new StringSelectMenuBuilder()
            .setCustomId('pesq:select_detalhe')
            .setPlaceholder('Ver detalhes de uma atividade de registro...')
            .addOptions(detailOptions);
        rows.push(new ActionRowBuilder().addComponents(detailSelect));
    } else {
        // Row 1: Botões de Navegação de Pesquisa
        const navButtons = [
            new ButtonBuilder().setCustomId('pesq:tree_cat:oficios').setLabel(label('oficios', 'Ofícios')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:tree_cat:desenvolvimento').setLabel(label('desenvolvimento', 'Desenvolvimento')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:tree_cat:beneficios').setLabel(label('beneficios', 'Benefícios')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:reg_cat:extracao').setLabel(label('reg_extracao', 'Hub Registro')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pesq:show:status').setLabel(label('status', 'Painel')).setStyle(ButtonStyle.Secondary),
        ];
        rows.push(new ActionRowBuilder().addComponents(...navButtons));

        // Row 2: Select Menu - Iniciar Pesquisa
        const availableOptions = [];
        for (const disc of logic.DISCIPLINAS_LIST) {
            const node = (pesquisa.arvore || []).find(n => n.slug === disc.slug);
            const statusDisc = logic.statusDisciplina(pesquisa, disc.slug);
            if (statusDisc === logic.STATUS.DESBLOQUEADO || statusDisc === logic.STATUS.PRONTO) {
                const nivelAtual = node?.nivel ?? 0;
                const proximoNivel = nivelAtual + 1;
                const custo = node?.proximo?.custo_conhecimento ? `${node.proximo.custo_conhecimento.toLocaleString('pt-BR')} pts` : '';
                const dur = node?.proximo?.duracao_segundos ? logic.formatDuracao(node.proximo.duracao_segundos) : '';
                const desc = [custo ? `Custo: ${custo}` : '', dur ? `Duração: ${dur}` : ''].filter(Boolean).join(' | ') || 'Pronto para iniciar';

                availableOptions.push({
                    label: `${disc.nome} (Nv ${nivelAtual} -> ${proximoNivel})`,
                    description: desc.slice(0, 100),
                    value: disc.slug,
                });
            }
        }

        if (availableOptions.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pesq:select_iniciar')
                .setPlaceholder('Selecione uma disciplina para iniciar a pesquisa...')
                .addOptions(availableOptions.slice(0, 25));
            rows.push(new ActionRowBuilder().addComponents(selectMenu));
        } else {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pesq:select_iniciar_empty')
                .setPlaceholder('Nenhuma disciplina disponível para iniciar no momento')
                .setDisabled(true)
                .addOptions([{ label: 'Sem pesquisas disponíveis', value: 'vazio' }]);
            rows.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        // Row 3: Select Menu - Ver Detalhes de Disciplina
        const detailOptions = logic.DISCIPLINAS_LIST.map(disc => {
            const node = (pesquisa.arvore || []).find(n => n.slug === disc.slug);
            const nivelAtual = node?.nivel ?? 0;
            return {
                label: `${disc.nome} (Nv ${nivelAtual}/${disc.nivelMax})`,
                description: logic.GRUPO_LABEL[disc.grupo] || 'Disciplina',
                value: disc.slug,
            };
        });

        const detailSelect = new StringSelectMenuBuilder()
            .setCustomId('pesq:select_detalhe')
            .setPlaceholder('Ver detalhes de uma disciplina...')
            .addOptions(detailOptions.slice(0, 25));
        rows.push(new ActionRowBuilder().addComponents(detailSelect));
    }

    // Row 4: Botões de Ação de Coleta (Se houver pesquisas ou registros prontos)
    const actionButtons = [];
    for (const ativa of pesquisa.slots?.ativas || []) {
        const terminou = new Date(ativa.termina_em).getTime() <= Date.now();
        if (terminou) {
            actionButtons.push(new ButtonBuilder()
                .setCustomId(`pesq:coletar:${ativa.id}`)
                .setLabel(`Coletar Pesquisa (Nv ${ativa.nivel_alvo})`)
                .setStyle(ButtonStyle.Success));
        }
    }
    for (const ativa of (registro?.slots?.ativas || [])) {
        const terminou = new Date(ativa.termina_em).getTime() <= Date.now();
        if (terminou) {
            actionButtons.push(new ButtonBuilder()
                .setCustomId(`reg:coletar:${ativa.id}`)
                .setLabel(`Coletar Registro (${ativa.tipo?.toUpperCase()})`)
                .setStyle(ButtonStyle.Success));
        }
    }

    if (actionButtons.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(...actionButtons.slice(0, 5)));
    }

    return rows;
}

async function sendArvore(interaction, grupo = 'oficios') {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    try {
        const [status, registro] = await Promise.all([
            api.getPesquisaCached(did),
            api.getRegistroCached(did).catch(() => null),
        ]);
        if (status.error) {
            return await replyAndDelete(interaction, `Erro: ${status.error}`, 8000);
        }
        const icons = await loadAllIcons();
        const buffer = await gerarBannerPesquisaArvore(status, { assets: icons, grupo });
        const attachment = new AttachmentBuilder(buffer, { name: `pesquisa-arvore-${grupo}.png` });
        const components = buildStatusComponents(status, registro || {}, grupo);
        return await interaction.editReply({ files: [attachment], components });
    } catch (e) {
        console.error('[pesquisa arvore] erro:', e);
        return await replyAndDelete(interaction, 'Erro ao carregar a arvore.', 8000);
    }
}

async function sendDetalhe(interaction, slug) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    const disc = logic.DISCIPLINAS[slug];
    if (!disc) {
        return await replyAndDelete(interaction, `Disciplina desconhecida: ${slug}`, 6000);
    }
    try {
        const [status, registro] = await Promise.all([
            api.getPesquisaCached(did),
            api.getRegistroCached(did).catch(() => null),
        ]);
        if (status.error) {
            return await replyAndDelete(interaction, `Erro: ${status.error}`, 8000);
        }
        const iconBuffer = await getIcon(slug);
        const buffer = await gerarBannerPesquisaDetalhe(disc, status, { iconBuffer });
        const attachment = new AttachmentBuilder(buffer, { name: `pesquisa-${slug}.png` });

        const components = buildStatusComponents(status, registro || {});
        return await interaction.editReply({ files: [attachment], components });
    } catch (e) {
        console.error('[pesquisa detalhe] erro:', e);
        return await replyAndDelete(interaction, 'Erro ao carregar o detalhe.', 8000);
    }
}

function buildIniciarModal(slug) {
    const disc = logic.DISCIPLINAS[slug];
    const slotInput = new TextInputBuilder()
        .setCustomId('slot')
        .setLabel('Slot (1 ou 2)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(1)
        .setValue('1');
    const modal = new ModalBuilder()
        .setCustomId(`pesq:iniciar_modal:${slug}`)
        .setTitle(`Pesquisar ${disc.nome}`);
    modal.addComponents(new ActionRowBuilder().addComponents(slotInput));
    return modal;
}

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status' || sub === 'arvore' || sub === 'detalhe' || sub === 'registro') {
        await interaction.deferReply({ ephemeral: true });
    }
    if (sub === 'status') return await sendStatus(interaction, true);
    if (sub === 'arvore') return await sendArvore(interaction);
    if (sub === 'detalhe') return await sendDetalhe(interaction, interaction.options.getString('disciplina', true).toLowerCase());

    if (sub === 'saldo') {
        await interaction.deferReply({ ephemeral: true });
        const did = discordId(interaction);
        try {
            const s = await api.getSaldo(did);
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('Saldos do Personagem')
                .addFields(
                    { name: 'Runas', value: String(s.runas ?? 0), inline: true },
                    { name: 'Libras', value: (s.libras ?? 0).toLocaleString('pt-BR'), inline: true },
                    { name: 'Conhecimento', value: (s.conhecimento ?? 0).toLocaleString('pt-BR'), inline: true },
                );
            if (s.conhecimento_pendente) {
                embed.addFields({ name: 'Conhecimento pendente', value: (s.conhecimento_pendente).toLocaleString('pt-BR'), inline: true });
            }
            embed.addFields({ name: 'Taxa/h', value: (s.taxa_hora ?? 0).toLocaleString('pt-BR'), inline: true });
            if (s.buff_metodologia) embed.addFields({ name: 'Buff Metodologia', value: `+${s.buff_metodologia.pct}%`, inline: true });
            return await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.error('[pesquisa saldo] erro:', e);
            return await replyAndDelete(interaction, 'Erro ao consultar saldo.', 8000);
        }
    }

    if (sub === 'iniciar') {
        const slug = interaction.options.getString('disciplina', true).toLowerCase();
        return await iniciarPesquisaAutomatica(interaction, slug);
    }

    if (sub === 'coletar') {
        const id = interaction.options.getString('id', true);
        return await coletarPesquisa(interaction, id);
    }

    if (sub === 'registro') {
        await interaction.deferReply({ ephemeral: true });
        return await sendStatus(interaction, true);
    }

    if (sub === 'registro_iniciar') {
        const tipo = interaction.options.getString('tipo', true);
        return await showRegistroIniciarModal(interaction, tipo);
    }

    if (sub === 'registro_coletar') {
        const id = interaction.options.getString('id', true);
        return await coletarRegistro(interaction, id);
    }
}

async function coletarPesquisa(interaction, id) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    try {
        const res = await api.postPesquisaColetar(did, id);
        if (res.error) {
            return await replyAndDelete(interaction, `Erro: ${res.error}`, 8000);
        }
        api.invalidateCache(did);
        return await replyAndDelete(interaction, `Pesquisa Nv ${res.nivel} de **${res.disciplina}** coletada! Efeito: ${res.efeito || ''}`, 8000);
    } catch (e) {
        const msg = e.response?.data?.error || e.message;
        return await replyAndDelete(interaction, `Erro ao coletar: ${msg}`, 8000);
    }
}

async function coletarRegistro(interaction, id) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    try {
        const res = await api.postRegistroColetar(did, id);
        if (res.error) {
            return await replyAndDelete(interaction, `Erro: ${res.error}`, 8000);
        }
        api.invalidateCache(did);
        return await replyAndDelete(interaction, `Registro do tipo **${res.tipo}** coletado!`, 8000);
    } catch (e) {
        const msg = e.response?.data?.error || e.message;
        return await replyAndDelete(interaction, `Erro ao coletar: ${msg}`, 8000);
    }
}

function showRegistroIniciarModal(interaction, tipo) {
    const cfg = logic.REGISTRO_TIPOS[tipo];
    if (!cfg) return replyAndDelete(interaction, `Tipo desconhecido: ${tipo}`, 6000);
    // Payload minimo: { tipo, slot }. Para forja precisa molde+lingote (site faz).
    const modal = new ModalBuilder()
        .setCustomId(`reg:iniciar_modal:${tipo}`)
        .setTitle(`Registro: ${cfg.rotulo}`);
    const slotInput = new TextInputBuilder()
        .setCustomId('slot')
        .setLabel('Slot (1 ou 2)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue('1');
    modal.addComponents(new ActionRowBuilder().addComponents(slotInput));
    if (tipo === 'roleplay') {
        const duracao = new TextInputBuilder()
            .setCustomId('duracao_horas')
            .setLabel('Duracao em horas (4, 8, 12 ou 24)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('4');
        modal.addComponents(new ActionRowBuilder().addComponents(duracao));
    }
    return interaction.showModal(modal);
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('pesq:') && !interaction.customId.startsWith('reg:')) return false;
    const [cat, action, ...rest] = interaction.customId.split(':');
    if (action === 'tree_cat' && cat === 'pesq') {
        const grupo = rest[0] || 'oficios';
        await interaction.deferUpdate().catch(() => {});
        await sendArvore(interaction, grupo);
        return true;
    }
    if (action === 'show' && rest[0] === 'arvore') {
        await interaction.deferUpdate().catch(() => {});
        await sendArvore(interaction, 'oficios');
        return true;
    }
    if (action === 'show' && rest[0] === 'status') {
        await interaction.deferUpdate().catch(() => {});
        await sendStatus(interaction, true);
        return true;
    }
    if (action === 'coletar' && cat === 'pesq') {
        const id = rest[0];
        if (!id) return false;
        await interaction.deferUpdate().catch(() => {});
        return await coletarPesquisa(interaction, id);
    }
    if (action === 'coletar' && cat === 'reg') {
        const id = rest[0];
        if (!id) return false;
        await interaction.deferUpdate().catch(() => {});
        return await coletarRegistro(interaction, id);
    }
    if (action === 'reg_cat' && cat === 'pesq') {
        const subCat = rest[0] || 'extracao';
        await interaction.deferUpdate().catch(() => {});
        await sendArvore(interaction, 'reg_' + subCat);
        return true;
    }
    if (action === 'iniciar' && cat === 'pesq') {
        const slug = rest[0];
        if (!slug) return false;
        await iniciarPesquisaAutomatica(interaction, slug);
        return true;
    }
    return false;
}

async function iniciarPesquisaAutomatica(interaction, slug) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    try {
        const status = await api.getPesquisaCached(did).catch(() => null);
        if (!status || status.error) {
            return await replyAndDelete(interaction, 'Erro ao consultar seu status de pesquisa. Tente novamente.', 8000);
        }

        const disc = logic.DISCIPLINAS[slug];
        if (!disc) {
            return await replyAndDelete(interaction, `Disciplina desconhecida: ${slug}`, 6000);
        }

        const statusDisc = logic.statusDisciplina(status, slug);
        if (statusDisc === logic.STATUS.BLOQUEADO) {
            return await replyAndDelete(interaction, `${disc.nome} ainda não está desbloqueada.`, 6000);
        }
        if (statusDisc === logic.STATUS.MAXIMO) {
            return await replyAndDelete(interaction, `${disc.nome} já está no nível máximo.`, 6000);
        }
        if (statusDisc === logic.STATUS.EM_ANDAMENTO) {
            return await replyAndDelete(interaction, `${disc.nome} já está sendo pesquisada no momento.`, 6000);
        }

        const ativas = status.slots?.ativas || [];
        const slot1Ocupado = ativas.some((a) => a.slot === 1 && new Date(a.termina_em).getTime() > Date.now());
        const slot2Ocupado = ativas.some((a) => a.slot === 2 && new Date(a.termina_em).getTime() > Date.now());
        const slot2Ativo = status.slots?.slot2_ativo;

        let freeSlot = null;
        if (!slot1Ocupado) {
            freeSlot = 1;
        } else if (slot2Ativo && !slot2Ocupado) {
            freeSlot = 2;
        }

        if (!freeSlot) {
            if (!slot2Ativo) {
                return await replyAndDelete(interaction, `Seu **Slot 1** está ocupado. O **Slot 2** é pago (1.500 Runas / 15 dias) e precisa ser ativado no site (ernas.com.br/pesquisa).`, 10000);
            }
            return await replyAndDelete(interaction, `Ambos os seus 2 slots de pesquisa já estão ocupados no momento. Aguarde uma pesquisa concluir.`, 8000);
        }

        const res = await api.postPesquisaIniciar(did, { disciplina: slug, slot: freeSlot });
        if (res.error) {
            return await replyAndDelete(interaction, `Erro ao iniciar pesquisa: ${res.error}`, 8000);
        }

        api.invalidateCache(did);
        const updatedStatus = await api.getPesquisaCached(did).catch(() => null);
        const node = updatedStatus?.arvore?.find((n) => n.slug === slug);
        const nivelNovo = res.nivel_alvo ?? ((node?.nivel ?? 0) + 1);

        const dataFim = res.termina_em
            ? new Date(res.termina_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : 'em breve';

        const saldoStr = res.novo_saldo_conhecimento != null
            ? res.novo_saldo_conhecimento.toLocaleString('pt-BR')
            : '?';

        return await replyAndDelete(interaction, `Pesquisa de **${disc.nome}** iniciada no **Slot ${freeSlot}** (Nv ${nivelNovo - 1} → Nv ${nivelNovo})!\nConclusão em: ${dataFim}\nSaldo restante: ${saldoStr} Conhecimento`, 12000);
    } catch (e) {
        console.error('[iniciarPesquisaAutomatica] erro:', e);
        const msg = e.response?.data?.error || e.message;
        return await replyAndDelete(interaction, `Erro ao iniciar pesquisa: ${msg}`, 8000);
    }
}

async function iniciarRegistroAutomatico(interaction, actionValue) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const did = discordId(interaction);
    try {
        const registroStatus = await api.getRegistroCached(did).catch(() => null);
        if (!registroStatus || registroStatus.error) {
            return await replyAndDelete(interaction, 'Erro ao consultar seu status de registro. Tente novamente.', 8000);
        }

        const ativas = registroStatus.slots?.ativas || [];
        const slot1Ocupado = ativas.some((a) => a.slot === 1 && new Date(a.termina_em).getTime() > Date.now());
        const slot2Ocupado = ativas.some((a) => a.slot === 2 && new Date(a.termina_em).getTime() > Date.now());
        const slot2Ativo = registroStatus.slots?.slot2_ativo;

        let freeSlot = null;
        if (!slot1Ocupado) {
            freeSlot = 1;
        } else if (slot2Ativo && !slot2Ocupado) {
            freeSlot = 2;
        }

        if (!freeSlot) {
            if (!slot2Ativo) {
                return await replyAndDelete(interaction, `Seu **Slot 1** de Registro está ocupado. O **Slot 2** é pago (1.500 Runas / 15 dias) e precisa ser ativado no site (ernas.com.br/registro).`, 10000);
            }
            return await replyAndDelete(interaction, `Ambos os seus 2 slots de registro já estão ocupados no momento. Aguarde uma tarefa concluir.`, 8000);
        }

        const parts = actionValue.split(':');
        const mainTipo = parts[0];
        let payload = {};

        if (mainTipo === 'extracao') {
            const oficio = parts[1];
            if (oficio === 'mineracao') {
                payload = { oficio: 'mineracao', raridade: parts[2] || 'comum' };
            } else if (oficio === 'dendrologia' || oficio === 'herbologia') {
                payload = { oficio, tier: parseInt(parts[2] || '1', 10) };
            } else if (oficio === 'geologia_arcana') {
                payload = { oficio: 'geologia_arcana' };
            } else if (oficio === 'catalisacao') {
                if (parts[2] === 'essencia') {
                    payload = { oficio: 'catalisacao', designio: parts[3] };
                } else if (parts[2] === 'catalisador') {
                    payload = { oficio: 'catalisacao', raridade_catalisador: parts[3] };
                }
            }
        } else if (mainTipo === 'roleplay') {
            payload = { duracao_h: parseInt(parts[1] || '4', 10) };
        } else if (mainTipo === 'beneficio') {
            payload = { beneficio: parts[1] };
        }

        const body = { tipo: mainTipo, slot: freeSlot, payload };
        const res = await api.postRegistroIniciar(did, body);
        if (res.error) {
            return await replyAndDelete(interaction, `Erro ao iniciar registro: ${res.error}`, 8000);
        }

        api.invalidateCache(did);
        const rotulo = res.rotulo || 'Tarefa de Registro';
        const dataFim = res.termina_em
            ? new Date(res.termina_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : 'em breve';

        return await replyAndDelete(interaction, `**${rotulo}** iniciado no **Slot ${freeSlot}**!\nConclusão prevista: ${dataFim}`, 12000);
    } catch (e) {
        console.error('[iniciarRegistroAutomatico] erro:', e);
        const msg = e.response?.data?.error || e.message;
        return await replyAndDelete(interaction, `Erro ao iniciar registro: ${msg}`, 8000);
    }
}

async function handleSelect(interaction) {
    if (!interaction.customId.startsWith('pesq:select_') && !interaction.customId.startsWith('reg:select_')) return false;

    if (interaction.customId === 'reg:select_iniciar') {
        const actionValue = interaction.values[0];
        if (!actionValue) return false;
        await iniciarRegistroAutomatico(interaction, actionValue);
        return true;
    }

    if (interaction.customId === 'pesq:select_iniciar') {
        const slug = interaction.values[0];
        if (!slug) return false;
        await iniciarPesquisaAutomatica(interaction, slug);
        return true;
    }

    if (interaction.customId === 'pesq:select_detalhe' || interaction.customId === 'reg:select_detalhe') {
        const slug = interaction.values[0];
        if (!slug) return false;
        await interaction.deferUpdate().catch(() => {});
        if (logic.DISCIPLINAS[slug]) {
            await sendDetalhe(interaction, slug);
        } else {
            await sendArvore(interaction, 'reg_extracao');
        }
        return true;
    }

    return false;
}

async function handleModal(interaction) {
    if (interaction.customId.startsWith('pesq:iniciar_modal:')) {
        const slug = interaction.customId.replace('pesq:iniciar_modal:', '');
        const slotRaw = interaction.fields.getTextInputValue('slot')?.trim();
        const slot = slotRaw === '2' ? 2 : 1;
        await interaction.deferReply({ ephemeral: true });
        const did = discordId(interaction);
        try {
            const res = await api.postPesquisaIniciar(did, { disciplina: slug, slot });
            if (res.error) return await interaction.editReply({ content: `Erro: ${res.error}` });
            api.invalidateCache(did);
            const node = (await api.getPesquisaCached(did))?.arvore?.find((n) => n.slug === slug);
            const nivel = node?.nivel ?? 0;
            return await interaction.editReply({
                content: `Pesquisa de **${slug}** iniciada (Nv ${nivel} -> Nv ${nivel + 1}). Termina em ${res.termina_em ? new Date(res.termina_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'em breve'}. Saldo: ${res.novo_saldo_conhecimento?.toLocaleString('pt-BR') || '?'}`,
            });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            return await interaction.editReply({ content: `Erro: ${msg}` });
        }
    }

    if (interaction.customId.startsWith('reg:iniciar_modal:')) {
        const tipo = interaction.customId.replace('reg:iniciar_modal:', '');
        const slotRaw = interaction.fields.getTextInputValue('slot')?.trim();
        const slot = slotRaw === '2' ? 2 : 1;
        const payload = { tipo, slot };
        if (tipo === 'roleplay') {
            const dur = parseInt(interaction.fields.getTextInputValue('duracao_horas')?.trim() || '4', 10);
            const valid = [4, 8, 12, 24].includes(dur) ? dur : 4;
            payload.payload = { duracao_horas: valid };
        } else {
            payload.payload = {};
        }
        await interaction.deferReply({ ephemeral: true });
        const did = discordId(interaction);
        try {
            const res = await api.postRegistroIniciar(did, payload);
            if (res.error) return await interaction.editReply({ content: `Erro: ${res.error}` });
            api.invalidateCache(did);
            return await interaction.editReply({ content: `Registro de **${tipo}** iniciado no slot ${slot}. Termina em ${res.termina_em ? new Date(res.termina_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'em breve'}.` });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            return await interaction.editReply({ content: `Erro: ${msg}` });
        }
    }

    return false;
}

module.exports = {
    data,
    execute,
    handleButton,
    handleSelect,
    handleModal,
    renderPesquisaStatusForPainel,
    buildRegistroUnlockedOptions,
    getIcon,
    loadAllIcons
};
