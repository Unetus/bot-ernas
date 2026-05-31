const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { mestresNarrando } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('narrar')
    .setDescription('Sistema de Narração e Interpretação Imersiva para o Mestre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
        .setName('habilitar')
        .setDescription('[Mestre] Habilita o modo de interpretação neste canal')
        .addStringOption(o => o
            .setName('nome')
            .setDescription('Nome do NPC ou Monstro do Bestiário (Deixe vazio para ser o Narrador)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub => sub
        .setName('desabilitar')
        .setDescription('[Mestre] Desabilita o modo de interpretação neste canal')
    );

async function execute(interaction) {
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const cid = interaction.channelId;
    const key = `${cid}-${interaction.user.id}`;

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'habilitar') {
        const nomeInput = interaction.options.getString('nome');

        if (!nomeInput) {
            mestresNarrando.set(key, {
                nome: 'Narrador',
                avatarUrl: 'https://i.imgur.com/2U5fPoy.png'
            });
            return await interaction.editReply('🗣️ **Modo Narrador Habilitado!**\nA partir de agora, suas mensagens enviadas normalmente neste canal sairão como **Narrador**.');
        }

        try {
            try {
                const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                mestresNarrando.set(key, {
                    nome: res.data.titulo ? `${res.data.nome}, ${res.data.titulo}` : res.data.nome,
                    avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png'
                });
                return await interaction.editReply(`🗣️ **Modo Interpretação Habilitado!**\nSuas mensagens neste canal sairão como o NPC **${res.data.nome}**.`);
            } catch (eNpc) {
                if (eNpc.response?.status === 404) {
                    const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                    mestresNarrando.set(key, {
                        nome: resBestia.data.nome,
                        avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png'
                    });
                    return await interaction.editReply(`🗣️ **Modo Interpretação Habilitado!**\nSuas mensagens neste canal sairão como a criatura **${resBestia.data.nome}**.`);
                } else {
                    throw eNpc;
                }
            }
        } catch(e) {
            return await interaction.editReply(`✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nomeInput}".`);
        }
    }

    if (sub === 'desabilitar') {
        if (mestresNarrando.has(key)) {
            mestresNarrando.delete(key);
            return await interaction.editReply('👤 **Modo Interpretação Desabilitado!**\nSuas mensagens voltaram ao normal.');
        }
        return await interaction.editReply('ℹ Você não está interpretando nenhum NPC ou Narrador neste canal.');
    }
}

module.exports = { data, execute };
