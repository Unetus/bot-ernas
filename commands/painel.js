const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { gerarBannerRanking, gerarBannerPerfil, gerarBannerPainelJogador, renderInventarioPage } = require('../canvas/renderer');
const { embedErro } = require('../utils/helpers');
const { skillsCache } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Abre a sua central de jogador (HUD)');

async function execute(interaction) {
    const buffer = await gerarBannerPainelJogador(interaction.user);
    const attachment = new AttachmentBuilder(buffer, { name: 'painel-jogador.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://painel-jogador.png')
        .setFooter({ text: 'Painel privado. Use os botões abaixo para navegar.' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_perfil').setLabel('◇ Perfil').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_inventario').setLabel('▣ Inventário').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_missoes').setLabel('※ Missões').setStyle(ButtonStyle.Secondary)
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('painel_menu_ranking').setLabel('△ Rankings').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_guilda').setLabel('♜ Guilda').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('painel_menu_rp').setLabel('✦ Cena RP').setStyle(ButtonStyle.Secondary)
    );

    try {
        await interaction.reply({ embeds: [embed], files: [attachment], components: [row1, row2], ephemeral: true });
    } catch (e) {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed], files: [attachment], components: [row1, row2] });
        }
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('painel_menu_')) return;

    const menu = interaction.customId.replace('painel_menu_', '');
    
    if (menu === 'guilda') {
        return await interaction.reply({ content: '✦ Para buscar os dados de uma guilda, digite no chat: `/guilda nome:`', ephemeral: true });
    }
    
    if (menu === 'rp') {
        return await interaction.reply({ content: '✦ Para iniciar uma cena de RP marcando os jogadores, digite no chat: `/rp iniciar`', ephemeral: true });
    }
    
    if (menu === 'missoes') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/missoes`, { headers: { 'X-API-Key': API_KEY } });
            const missoes = res.data.filter(m => m.status === 'aberta');
            
            if (missoes.length === 0) return await interaction.editReply({ content: '✦ Não há missões abertas no momento.' });
            
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('✦ Quadro de Missões de Arkandia ✦')
                .setDescription(missoes.map(m => `**[${m.ranque || 'D'}]** ${m.nome}\n*${m.descricao || 'Sem descrição'}*`).join('\n\n'));
            return await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar as missões.')] });
        }
    }
    
    if (menu === 'ranking') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/rankings/poder`, { headers: { 'X-API-Key': API_KEY } });
            const buffer = await gerarBannerRanking('poder', res.data);
            const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });
            
            const embed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setImage('attachment://ranking.png');
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ranking_switch_poder').setLabel('◆ Poder').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ranking_switch_riqueza').setLabel('◇ Riqueza').setStyle(ButtonStyle.Secondary)
            );
            
            return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar o ranking.')] });
        }
    }
    
    if (menu === 'perfil') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
            
            const buffer = await gerarBannerPerfil(p);
            const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
            
            const embed = new EmbedBuilder()
                .setColor(p.indice_poder_cor || 0x3498DB)
                .setImage('attachment://perfil.png');
                
            return await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu perfil.')] });
        }
    }
    
    if (menu === 'inventario') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
            
            const itens = p.inventario || p.itens || [];
            const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
            skillsCache.set(cacheKey, { personagem: p, itens });
            
            return await renderInventarioPage(interaction, p, itens, 'todos', 0);
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro('Erro ao buscar seu inventário.')] });
        }
    }
}

module.exports = { data, execute, handleButton };
