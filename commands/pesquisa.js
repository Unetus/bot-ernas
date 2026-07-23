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
    if (cached && Date.now() - cached.at < ASSET_TTL_MS) return cached.value;
    const url = await assets.assetUrl(`pesquisa/icon-${discSlug}.png`);
    try {
        const axios = require('axios');
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 6000 });
        _iconCache.set(discSlug, { at: Date.now(), value: res.data });
        return res.data;
    } catch {
        _iconCache.set(discSlug, { at: Date.now(), value: null });
        return null;
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
        const row = buildStatusRow(pesquisa, registro);
        return await interaction.editReply({ files: [attachment], components: row ? [row] : [] });
    } catch (e) {
        console.error('[pesquisa status] erro:', e);
        return await replyAndDelete(interaction, 'Erro ao carregar o status.', 8000);
    }
}

async function renderPesquisaStatusForPainel(interaction) {
    return await sendStatus(interaction, true);
}

function buildStatusRow(pesquisa, registro) {
    const buttons = [];
    for (const ativa of pesquisa.slots?.ativas || []) {
        const terminou = new Date(ativa.termina_em).getTime() <= Date.now();
        if (terminou) {
            buttons.push(new ButtonBuilder()
                .setCustomId(`pesq:coletar:${ativa.id}`)
                .setLabel(`Coletar Nv ${ativa.nivel_alvo}`)
                .setStyle(ButtonStyle.Success));
        }
    }
    for (const ativa of registro.slots?.ativas || []) {
        const terminou = new Date(ativa.termina_em).getTime() <= Date.now();
        if (terminou) {
            buttons.push(new ButtonBuilder()
                .setCustomId(`reg:coletar:${ativa.id}`)
                .setLabel(`Coletar Registro`)
                .setStyle(ButtonStyle.Success));
        }
    }
    buttons.push(new ButtonBuilder()
        .setCustomId('pesq:show:arvore')
        .setLabel('Ver Arvore')
        .setStyle(ButtonStyle.Secondary));
    if (buttons.length === 0) return null;
    return new ActionRowBuilder().addComponents(...buttons.slice(0, 5));
}

async function sendArvore(interaction) {
    const did = discordId(interaction);
    try {
        const status = await api.getPesquisaCached(did);
        if (status.error) {
            return await replyAndDelete(interaction, `Erro: ${status.error}`, 8000);
        }
        const icons = await loadAllIcons();
        const buffer = await gerarBannerPesquisaArvore(status, { assets: icons });
        const attachment = new AttachmentBuilder(buffer, { name: 'pesquisa-arvore.png' });
        return await interaction.editReply({ files: [attachment] });
    } catch (e) {
        console.error('[pesquisa arvore] erro:', e);
        return await replyAndDelete(interaction, 'Erro ao carregar a arvore.', 8000);
    }
}

async function sendDetalhe(interaction, slug) {
    const did = discordId(interaction);
    const disc = logic.DISCIPLINAS[slug];
    if (!disc) {
        return await replyAndDelete(interaction, `Disciplina desconhecida: ${slug}`, 6000);
    }
    try {
        const status = await api.getPesquisaCached(did);
        if (status.error) {
            return await replyAndDelete(interaction, `Erro: ${status.error}`, 8000);
        }
        const iconBuffer = await getIcon(slug);
        const buffer = await gerarBannerPesquisaDetalhe(disc, status, { iconBuffer });
        const attachment = new AttachmentBuilder(buffer, { name: `pesquisa-${slug}.png` });

        const node = (status.arvore || []).find((n) => n.slug === slug);
        const statusDisc = logic.statusDisciplina({ ...status, arvore: status.arvore || [] }, slug);
        const podeIniciar = statusDisc === logic.STATUS.DESBLOQUEADO || statusDisc === logic.STATUS.PRONTO;
        const buttons = [];
        if (podeIniciar) {
            buttons.push(new ButtonBuilder()
                .setCustomId(`pesq:iniciar:${slug}`)
                .setLabel('Pesquisar aqui')
                .setStyle(ButtonStyle.Success));
        }
        const ativa = (status.slots?.ativas || []).find((a) => a.disciplina === slug);
        if (ativa && new Date(ativa.termina_em).getTime() <= Date.now()) {
            buttons.push(new ButtonBuilder()
                .setCustomId(`pesq:coletar:${ativa.id}`)
                .setLabel('Coletar')
                .setStyle(ButtonStyle.Primary));
        }
        buttons.push(new ButtonBuilder()
            .setCustomId('pesq:show:arvore')
            .setLabel('Voltar a Arvore')
            .setStyle(ButtonStyle.Secondary));
        return await interaction.editReply({ files: [attachment], components: [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))] });
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
        const disc = logic.DISCIPLINAS[slug];
        if (!disc) {
            return await replyAndDelete(interaction, `Disciplina desconhecida: ${slug}`, 6000);
        }
        const did = discordId(interaction);
        const status = await api.getPesquisaCached(did).catch(() => null);
        if (!status || status.error) {
            return await replyAndDelete(interaction, 'Erro ao consultar seu status. Tente novamente.', 6000);
        }
        const statusDisc = logic.statusDisciplina({ ...status, arvore: status.arvore || [] }, slug);
        if (statusDisc === logic.STATUS.BLOQUEADO) {
            return await replyAndDelete(interaction, `${disc.nome} ainda nao esta desbloqueada.`, 6000);
        }
        if (statusDisc === logic.STATUS.MAXIMO) {
            return await replyAndDelete(interaction, `${disc.nome} ja esta no nivel maximo.`, 6000);
        }
        if (statusDisc === logic.STATUS.EM_ANDAMENTO) {
            return await replyAndDelete(interaction, `${disc.nome} ja esta sendo pesquisada.`, 6000);
        }
        return await interaction.showModal(buildIniciarModal(slug));
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
    await interaction.deferReply({ ephemeral: true });
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
    await interaction.deferReply({ ephemeral: true });
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
    if (action === 'show' && rest[0] === 'arvore') {
        await interaction.deferUpdate().catch(() => {});
        await sendArvore(interaction);
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
    if (action === 'iniciar' && cat === 'pesq') {
        const slug = rest[0];
        if (!slug) return false;
        const did = discordId(interaction);
        const status = await api.getPesquisaCached(did).catch(() => null);
        if (!status || status.error) {
            await interaction.reply({ content: 'Erro ao consultar status.', ephemeral: true });
            return true;
        }
        const statusDisc = logic.statusDisciplina({ ...status, arvore: status.arvore || [] }, slug);
        if (statusDisc === logic.STATUS.BLOQUEADO || statusDisc === logic.STATUS.MAXIMO || statusDisc === logic.STATUS.EM_ANDAMENTO) {
            await interaction.reply({ content: 'Esta disciplina nao pode ser pesquisada agora.', ephemeral: true });
            return true;
        }
        await interaction.showModal(buildIniciarModal(slug));
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

module.exports = { data, execute, handleButton, handleModal, renderPesquisaStatusForPainel };
