const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { formatarTexto, embedErro } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('missoes')
    .setDescription('Consulta a lista de missões ativas e abertas em Arkandia');

async function execute(interaction) {
    try {
        await interaction.deferReply();
        const res = await axios.get(`${ARKANDIA_API}/missoes/abertas?incluir_arcos=true`, { headers: { 'X-API-Key': API_KEY } });
        const missoes = res.data.missoes || [];

        if (missoes.length === 0) {
            return await interaction.editReply({ embeds: [embedErro('Nenhuma missão aberta encontrada no momento.')] });
        }

        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setTitle('Quadro de Missões de Arkandia')
            .setDescription('Missões abertas atualmente na guilda.')
            .setThumbnail('https://i.imgur.com/vHqB3q0.png');

        const rows = [];
        let row = new ActionRowBuilder();

        missoes.slice(0, 5).forEach((m, idx) => {
            const statusPerigo = m.morte_permanente ? 'Perigo extremo (Morte Permanente)' : 'Seguro (Sem Morte Permanente)';
            embed.addFields({
                name: `${idx + 1}. ${m.nome}`,
                value: `> **Nível Mínimo:** ${m.nivel_minimo || 1} | **Rank:** ${m.rank_minimo || 'Iniciante'}\n> **Risco:** ${statusPerigo}\n> **Status:** ${m.status || 'Aberta'} | **Vagas:** ${m.vagas_restantes || m.limite_jogadores || 5}\n> **Sessão:** ${m.data_sessão || 'A agendar'}`
            });

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`missoes_inscritos_${m.id}`)
                    .setLabel(`◇ Inscritos: ${m.nome.substring(0, 15)}`)
                    .setStyle(ButtonStyle.Secondary)
            );

            if (row.components.length === 2 || idx === missoes.length - 1 || idx === 4) {
                rows.push(row);
                row = new ActionRowBuilder();
            }
        });

        return await interaction.editReply({ embeds: [embed], components: rows });
    } catch (e) {
        console.error(e);
        const erroMsg = e.response?.data?.error || e.message;
        if (interaction.deferred) {
            return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar o quadro de missões: ${erroMsg}`)] });
        } else {
            return await interaction.reply({ embeds: [embedErro(`Erro ao buscar o quadro de missões: ${erroMsg}`)], ephemeral: true });
        }
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('missoes_inscritos_')) return;

    const missaoId = interaction.customId.replace('missoes_inscritos_', '');
    await interaction.deferReply({ ephemeral: true });
    try {
        const resInscritos = await axios.get(`${ARKANDIA_API}/missoes/${missaoId}/inscritos`, { headers: { 'X-API-Key': API_KEY } });
        const confirmados = resInscritos.data.confirmados || [];

        if (confirmados.length === 0) {
            return await interaction.editReply({ embeds: [embedErro('Nenhum aventureiro confirmado ou inscrito nesta missão ainda.')] });
        }

        const listaInscritos = confirmados.map((c, idx) => {
            const nomePersonagem = c.personagem ? c.personagem.nome : 'Desconhecido';
            const discStr = c.discord_id || (c.personagem && c.personagem.discord_id) ? `<@${c.discord_id || c.personagem.discord_id}>` : '*Sem Discord*';
            const racaClasse = c.personagem ? ` (${formatarTexto(c.personagem.raca)} • ${formatarTexto(c.personagem.classe)})` : '';
            return `${idx + 1}. **${formatarTexto(nomePersonagem)}** ${discStr}${racaClasse}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setTitle('Aventureiros Convocados')
            .setDescription(`Estes são os heróis confirmados para esta expedição:\n\n${listaInscritos}`);

        return await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error(e);
        return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar inscritos: ${e.message}`)] });
    }
}

module.exports = { data, execute, handleButton };
