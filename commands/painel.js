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

async function execute(interaction) {
    const buffer = await gerarBannerPainelJogador(interaction.user);
    const attachment = new AttachmentBuilder(buffer, { name: 'painel-jogador.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://painel-jogador.png')
        .setFooter({ text: 'Painel privado. Use os botões abaixo para navegar.' });

    const components = getPainelComponents();

    try {
        await interaction.reply({ embeds: [embed], files: [attachment], components, ephemeral: true });
    } catch (e) {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed], files: [attachment], components });
        }
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('painel_menu_')) return;

    const menu = interaction.customId.replace('painel_menu_', '');
    await interaction.deferUpdate();
    await interaction.editReply({ components: getPainelComponents(menu) });
    
    if (menu === 'guilda') {
        return await interaction.followUp({ content: 'Para buscar os dados de uma guilda, digite no chat: `/guilda nome:`', ephemeral: true });
    }
    
    if (menu === 'rp') {
        return await interaction.followUp({ content: 'Para iniciar uma cena de RP marcando os jogadores, digite no chat: `/rp iniciar`', ephemeral: true });
    }
    
    if (menu === 'missoes') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/missoes`, { headers: { 'X-API-Key': API_KEY } });
            const missoes = res.data.filter(m => m.status === 'aberta');
            
            if (missoes.length === 0) return await interaction.followUp({ content: 'Não há missões abertas no momento.', ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('Quadro de Missões de Arkandia')
                .setDescription(missoes.map(m => `**[${m.ranque || 'D'}]** ${m.nome}\n*${m.descricao || 'Sem descrição'}*`).join('\n\n'));
            return await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (e) {
            return await interaction.followUp({ embeds: [embedErro('Erro ao buscar as missões.')], ephemeral: true });
        }
    }
    
    if (menu === 'ranking') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/rankings/poder`, { headers: { 'X-API-Key': API_KEY } });
            const buffer = await gerarBannerRanking('poder', res.data);
            const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://ranking.png');
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ranking_switch_poder').setLabel('◆ Poder').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ranking_switch_riqueza').setLabel('◇ Riqueza').setStyle(ButtonStyle.Secondary)
            );
            
            return await interaction.followUp({ embeds: [embed], files: [attachment], components: [row], ephemeral: true });
        } catch (e) {
            return await interaction.followUp({ embeds: [embedErro('Erro ao buscar o ranking.')], ephemeral: true });
        }
    }
    
    if (menu === 'perfil') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.followUp({ embeds: [embedErro('Personagem não encontrado.')], ephemeral: true });
            
            const buffer = await gerarBannerPerfil(p);
            const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://perfil.png');
                
            return await interaction.followUp({ embeds: [embed], files: [attachment], ephemeral: true });
        } catch (e) {
            return await interaction.followUp({ embeds: [embedErro('Erro ao buscar seu perfil.')], ephemeral: true });
        }
    }
    
    if (menu === 'inventario') {
        try {
            const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            const p = res.data;
            if (!p) return await interaction.followUp({ embeds: [embedErro('Personagem não encontrado.')], ephemeral: true });
            
            const itens = p.inventario || p.itens || [];
            const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
            skillsCache.set(cacheKey, { personagem: p, itens });

            const inventoryTarget = {
                ...interaction,
                deferred: false,
                replied: false,
                update: payload => interaction.followUp({ ...payload, ephemeral: true })
            };

            return await renderInventarioPage(inventoryTarget, p, itens, 'todos', 0);
        } catch (e) {
            return await interaction.followUp({ embeds: [embedErro('Erro ao buscar seu inventário.')], ephemeral: true });
        }
    }
}

module.exports = { data, execute, handleButton };
