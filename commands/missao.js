const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { missoesPreparacao } = require('../utils/state');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('missao')
    .setDescription('Sistema de Missões')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
        .setName('preparar')
        .setDescription('[Mestre] Prepara a HUD de uma missão da API')
        .addStringOption(o => o.setName('nome').setDescription('Nome da Missão').setRequired(true))
    )
    .addSubcommand(sub => sub
        .setName('iniciar')
        .setDescription('[Mestre] Inicia a missão que está em preparação')
        .addStringOption(o => o.setName('nome').setDescription('Nome da Missão').setRequired(true))
    );

async function execute(interaction) {
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'preparar') {
        const nome = interaction.options.getString('nome');

        try {
            const resMissoes = await axios.get(`${ARKANDIA_API}/missoes/abertas?incluir_arcos=true`, { headers: { 'X-API-Key': API_KEY } });
            const missaoEncontrada = resMissoes.data.missoes.find(m => m.nome.toLowerCase() === nome.toLowerCase());
            
            if (!missaoEncontrada) return await interaction.editReply(`✗ Missão "${nome}" não encontrada nas missões abertas.`);

            const resInscritos = await axios.get(`${ARKANDIA_API}/missoes/${missaoEncontrada.id}/inscritos`, { headers: { 'X-API-Key': API_KEY } });
            const confirmados = resInscritos.data.confirmados;

            if (!confirmados || confirmados.length === 0) {
                return await interaction.editReply(`✗ A missão "${missaoEncontrada.nome}" não possui nenhum jogador confirmado na API.`);
            }

            const jogadores = confirmados.map(c => {
                const discordId = c.discord_id || (c.personagem && c.personagem.discord_id) || 'desconhecido';
                const nomePersonagem = c.personagem ? c.personagem.nome : 'Personagem Desconhecido';
                return { id: discordId, nomePersonagem, pronto: false };
            }).filter(p => p.id !== 'desconhecido');

            if (jogadores.length === 0) {
                return await interaction.editReply(`✗ Nenhum jogador confirmado possui um Discord ID atrelado na API.`);
            }

            const embed = new EmbedBuilder()
                .setColor(0x4A2B7E)
                .setTitle(`❖ Preparação de Missão: ${missaoEncontrada.nome}`)
                .setDescription(`Os jogadores confirmados pela API foram convocados. Confirme que você está pronto!\n\n` + jogadores.map(p => `[ ] **[${p.nomePersonagem}]** <@${p.id}>`).join('\n'));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('missao_pronto').setLabel('✓ PRONTO').setStyle(ButtonStyle.Success)
            );

            const mencoesStr = jogadores.map(p => `<@${p.id}>`).join(' ');
            const msg = await interaction.channel.send({ content: `${mencoesStr}`, embeds: [embed], components: [row] });
            
            missoesPreparacao.set(msg.id, {
                msgId: msg.id,
                nome: missaoEncontrada.nome,
                jogadores,
                channelId: interaction.channelId
            });

            return await interaction.editReply('✓ HUD de preparação criada 100% via API!');
        } catch (e) {
            console.error(e);
            return await interaction.editReply(`✗ Erro ao comunicar com a API do Arkandia. ${e.message}`);
        }
    }

    if (sub === 'iniciar') {
        const nomeMissao = interaction.options.getString('nome');
        let missao = null;
        let missaoKey = null;

        for (const [key, m] of missoesPreparacao.entries()) {
            if (m.nome.toLowerCase() === nomeMissao.toLowerCase() && m.channelId === interaction.channelId) {
                missao = m;
                missaoKey = key;
                break;
            }
        }

        if (!missao) return await interaction.editReply(`✗ Não há nenhuma missão chamada "${nomeMissao}" em preparação neste canal.`);

        try {
            const velhaMsg = await interaction.channel.messages.fetch(missao.msgId);
            await velhaMsg.delete();
        } catch(e) {}

        const mencoes = missao.jogadores.map(p => `**[${p.nomePersonagem}]** <@${p.id}>`).join(' | ');
        missoesPreparacao.delete(missaoKey);

        await interaction.channel.send({ content: `⚔ **A missão \`${missao.nome}\` foi INICIADA!**\nParticipantes convocados: ${mencoes}` });
        return await interaction.editReply('✓ Missão iniciada com sucesso.');
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('missao_')) return;

    if (interaction.isButton() && interaction.customId === 'missao_pronto') {
        const missao = missoesPreparacao.get(interaction.message.id);
        if (!missao) return await interaction.reply({ content: '✗ Não há nenhuma missão em preparação nesta mensagem.', ephemeral: true });

        const pIndex = missao.jogadores.findIndex(p => p.id === interaction.user.id);
        if (pIndex === -1) return await interaction.reply({ content: '✗ Você não faz parte desta missão.', ephemeral: true });

        if (missao.jogadores[pIndex].pronto) return await interaction.reply({ content: '✓ Você já está pronto.', ephemeral: true });

        missao.jogadores[pIndex].pronto = true;

        const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0]);
        let descricao = `Os jogadores abaixo foram convocados. Confirme que você está pronto!\n\n`;
        let todosProntos = true;
        for (const p of missao.jogadores) {
            const status = p.pronto ? '[x]' : '[ ]';
            descricao += `${status} **[${p.nomePersonagem}]** <@${p.id}>\n`;
            if (!p.pronto) todosProntos = false;
        }

        if (todosProntos) {
            descricao += `\n**Todos os jogadores estão prontos!** O Mestre já pode usar \`/missao iniciar\`.`;
        }

        embedOriginal.setDescription(descricao);
        await interaction.update({ embeds: [embedOriginal] });
    }
}

module.exports = { data, execute, handleButton };
