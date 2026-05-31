const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { renderInventarioPage } = require('../canvas/renderer');
const { embedErro } = require('../utils/helpers');
const { skillsCache } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

function getUrlRequisicao(interaction) {
    const nomeFornecido = interaction.options?.getString('nome');
    const usuarioMencionado = interaction.options?.getUser('jogador');
    if (nomeFornecido) return `${ARKANDIA_API}/personagens/${encodeURIComponent(nomeFornecido)}`;
    if (usuarioMencionado) return `${ARKANDIA_API}/personagens/discord/${usuarioMencionado.id}`;
    return `${ARKANDIA_API}/personagens/discord/${interaction.user.id}`;
}

const data = new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Visualiza o inventário de itens do personagem no site')
    .addUserOption(o => o.setName('jogador').setDescription('@jogador (Opcional)'))
    .addStringOption(o => o.setName('nome').setDescription('Nome exato do personagem (Opcional)'));

async function execute(interaction) {
    const usuarioMencionado = interaction.options.getUser('jogador');
    const nomeFornecido = interaction.options.getString('nome');

    const member = interaction.member;
    const isUserAdmin = member && (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.some(r => ['admin', 'administrador'].includes(r.name.toLowerCase()))
    );

    if ((nomeFornecido || (usuarioMencionado && usuarioMencionado.id !== interaction.user.id)) && !isUserAdmin) {
        return await interaction.reply({ embeds: [embedErro("Apenas administradores podem consultar o inventário de outros jogadores!")], ephemeral: true });
    }

    try {
        await interaction.deferReply();
        const res = await axios.get(getUrlRequisicao(interaction), { headers: { 'X-API-Key': API_KEY } });
        const p = res.data;

        if (!p) {
            return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado.')] });
        }

        const itens = p.inventario || p.itens || [];

        // Armazenar inventário completo no cache
        const cacheKey = `inventario_${interaction.user.id}_${p.id}`;
        skillsCache.set(cacheKey, { personagem: p, itens });

        return await renderInventarioPage(interaction, p, itens, 'todos', 0);
    } catch (e) {
        console.error(e);
        const erroMsg = e.response?.data?.error || e.message;
        if (interaction.deferred) {
            return await interaction.editReply({ embeds: [embedErro(`Erro ao carregar o inventário: ${erroMsg}`)] });
        } else {
            return await interaction.reply({ embeds: [embedErro(`Erro ao carregar o inventário: ${erroMsg}`)], ephemeral: true });
        }
    }
}

async function handleButton(interaction) {
    const isCat = interaction.customId.startsWith('inventario_cat_');
    
    let personagemId, categoria, pagina;
    if (isCat) {
        const parts = interaction.customId.split('_');
        personagemId = parts[2];
        categoria = parts[3];
        pagina = 0;
    } else {
        const parts = interaction.customId.split('_');
        personagemId = parts[2];
        categoria = parts[3];
        pagina = parseInt(parts[4] || '0', 10);
    }

    const cacheKey = `inventario_${interaction.user.id}_${personagemId}`;
    const cacheData = skillsCache.get(cacheKey);

    if (!cacheData) {
        return await interaction.reply({ embeds: [embedErro('Sua sessão de inventário expirou. Por favor, execute o comando `/inventario` novamente.')], ephemeral: true });
    }

    await interaction.deferUpdate();
    return await renderInventarioPage(interaction, cacheData.personagem, cacheData.itens, categoria, pagina);
}

module.exports = { data, execute, handleButton };
