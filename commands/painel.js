const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { gerarBannerRanking, gerarBannerPerfil, gerarBannerPainelJogador, renderInventarioPage } = require('../canvas/renderer');
const { buildProfileSkillRow } = require('./perfil');
const { embedErro } = require('../utils/helpers');
const { skillsCache } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Abre a sua central de jogador (HUD)');

function getPainelComponents(activeMenu = null) {
    const label = (menu, text) => `${activeMenu === menu ? '◆' : '◇'} ${text}`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_perfil').setLabel(label('perfil', 'Perfil')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_inventario').setLabel(label('inventario', 'Inventário')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_missoes').setLabel(label('missoes', 'Missões')).setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_ranking').setLabel(label('ranking', 'Rankings')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_guilda').setLabel(label('guilda', 'Guilda')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_rp').setLabel(label('rp', 'Cena RP')).setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

function getPainelRankingButtons(tipo) {
    const options = [
        ['poder', 'Poder'],
        ['nivel', 'Nível'],
        ['guildas', 'Guildas'],
        ['arena', 'Arena']
    ];

    return new ActionRowBuilder().addComponents(
        ...options.map(([value, label]) => new ButtonBuilder()
            .setCustomId(`painel_rank_switch_${value}`)
            .setLabel(`${tipo === value ? '◆' : '◇'} ${label}`)
            .setStyle(ButtonStyle.Secondary))
    );
}

async function renderPainelHome(interaction) {
    const buffer = await gerarBannerPainelJogador(interaction.user);
    const attachment = new AttachmentBuilder(buffer, { name: 'painel-jogador.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://painel-jogador.png')
        .setFooter({ text: 'Painel privado. Use os botões abaixo para navegar.' });

    return { embeds: [embed], files: [attachment], components: getPainelComponents(), ephemeral: true };
}

async function renderPainelRanking(interaction, tipo = 'poder') {
    const res = await axios.get(`${ARKANDIA_API}/rankings/${tipo}`, { headers: { 'X-API-Key': API_KEY } });
    const buffer = await gerarBannerRanking(tipo, res.data);
    const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://ranking.png');

    return await interaction.editReply({
        content: null,
        embeds: [embed],
        files: [attachment],
        attachments: [],
        components: [...getPainelComponents('ranking'), getPainelRankingButtons(tipo)]
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
    if (interaction.customId.startsWith('painel_rank_switch_')) {
        await interaction.deferUpdate();
        const tipo = interaction.customId.replace('painel_rank_switch_', '');
        try {
            return await renderPainelRanking(interaction, tipo);
        } catch (e) {
            return await interaction.editReply({
                embeds: [embedErro('Erro ao atualizar o ranking.')],
                attachments: [],
                components: [...getPainelComponents('ranking'), getPainelRankingButtons(tipo)]
            });
        }
    }

    if (interaction.customId.startsWith('painel_inv_cat_') || interaction.customId.startsWith('painel_inv_pag_')) {
        const parts = interaction.customId.split('_');
        const isCat = parts[2] === 'cat';
        const personagemId = parts[3];
        const categoria = isCat ? parts[4] : parts[4];
        const pagina = isCat ? 0 : parseInt(parts[5] || '0', 10);
        const cacheKey = `inventario_${interaction.user.id}_${personagemId}`;
        const cacheData = skillsCache.get(cacheKey);

        if (!cacheData) {
            return await interaction.reply({ embeds: [embedErro('Sua sessão de inventário expirou. Abra o `/painel` novamente.')], ephemeral: true });
        }

        await interaction.deferUpdate();
        return await renderInventarioPage(
            interaction,
            cacheData.personagem,
            cacheData.itens,
            categoria,
            pagina,
            { prefixComponents: getPainelComponents('inventario'), customIdPrefix: 'painel_inv', useEditReply: true }
        );
    }

    if (!interaction.customId.startsWith('painel_menu_')) return;

    const menu = interaction.customId.replace('painel_menu_', '');
    await interaction.deferUpdate();
    
    if (menu === 'guilda') {
        return await interaction.editReply({
            content: 'Para buscar os dados de uma guilda, digite no chat: `/guilda nome:`',
            embeds: [],
            files: [],
            attachments: [],
            components: getPainelComponents('guilda')
        });
    }
    
    if (menu === 'rp') {
        return await interaction.editReply({
            content: 'Para iniciar uma cena de RP marcando os jogadores, digite no chat: `/rp iniciar`',
            embeds: [],
            files: [],
            attachments: [],
            components: getPainelComponents('rp')
        });
    }
    
    if (menu === 'missoes') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/missoes`, { headers: { 'X-API-Key': API_KEY } });
            const missoes = res.data.filter(m => m.status === 'aberta');
            
            if (missoes.length === 0) {
                return await interaction.editReply({
                    content: 'Não há missões abertas no momento.',
                    embeds: [],
                    files: [],
                    attachments: [],
                    components: getPainelComponents('missoes')
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('Quadro de Missões de Arkandia')
                .setDescription(missoes.map(m => `**[${m.ranque || 'D'}]** ${m.nome}\n*${m.descricao || 'Sem descrição'}*`).join('\n\n'));
            return await interaction.editReply({
                content: null,
                embeds: [embed],
                files: [],
                attachments: [],
                components: getPainelComponents('missoes')
            });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar as missões.')], attachments: [], components: getPainelComponents('missoes') });
        }
    }
    
    if (menu === 'ranking') {
        try {
            return await renderPainelRanking(interaction, 'poder');
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar o ranking.')], attachments: [], components: getPainelComponents('ranking') });
        }
    }
    
    if (menu === 'perfil') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')], attachments: [], components: getPainelComponents('perfil') });
            
            const buffer = await gerarBannerPerfil(p);
            const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://perfil.png');

            const skillRow = buildProfileSkillRow(p);
            const components = getPainelComponents('perfil');
            if (skillRow) components.push(skillRow);
                
            return await interaction.editReply({
                content: null,
                embeds: [embed],
                files: [attachment],
                attachments: [],
                components
            });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu perfil.')], attachments: [], components: getPainelComponents('perfil') });
        }
    }
    
    if (menu === 'inventario') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')], attachments: [], components: getPainelComponents('inventario') });
            
            const itens = p.inventario || p.itens || [];
            const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
            skillsCache.set(cacheKey, { personagem: p, itens });

            return await renderInventarioPage(
                interaction,
                p,
                itens,
                'todos',
                0,
                { prefixComponents: getPainelComponents('inventario'), customIdPrefix: 'painel_inv', useEditReply: true }
            );
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu inventário.')], attachments: [], components: getPainelComponents('inventario') });
        }
    }
}

module.exports = { data, execute, handleButton };
