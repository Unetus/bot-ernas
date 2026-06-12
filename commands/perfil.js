const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');
const { gerarBannerPerfil } = require('../canvas/renderer');
const profileCache = require('../utils/profileCache');
const { formatarTexto, embedErro } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

function getUrlRequisicao(interaction) {
    const usuarioMencionado = interaction.options.getUser('jogador');
    const nomeFornecido = interaction.options.getString('nome');
    if (usuarioMencionado) return `${ARKANDIA_API}/personagens/discord/${usuarioMencionado.id}`;
    if (nomeFornecido) return `${ARKANDIA_API}/personagens/${encodeURIComponent(nomeFornecido)}`;
    return `${ARKANDIA_API}/personagens/discord/${interaction.user.id}`;
}

const data = new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Busca a ficha do personagem')
    .addUserOption(o => o.setName('jogador').setDescription('@nome'))
    .addStringOption(o => o.setName('nome').setDescription('nome exato'));

function buildProfileSkillRow(p) {
    if (!p.build_skills || p.build_skills.length === 0) return null;

    const options = p.build_skills.slice(0, 25).map(s => ({
        label: `${formatarTexto(s.nome)} (Grau ${s.grau || 1})`,
        description: formatarTexto(s.tipo) || 'Habilidade',
        value: s.id
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`select_perfil_skill_${p.id}`)
            .setPlaceholder('Selecione uma habilidade equipada para ver detalhes')
            .addOptions(options)
    );
}

function buildSkillDetailEmbed(skill) {
    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setTitle(formatarTexto(skill.nome))
        .setDescription(skill.descricao || '*Sem descrição.*')
        .addFields(
            { name: 'Tipo', value: formatarTexto(skill.tipo) || '-', inline: true },
            { name: 'Origem', value: formatarTexto(skill.origem) || '-', inline: true }
        );

    if (skill.classe) embed.addFields({ name: 'Classe', value: formatarTexto(skill.classe), inline: true });
    if (skill.nivel_min) embed.addFields({ name: 'Nível Mínimo', value: String(skill.nivel_min), inline: true });
    if (skill.grau) embed.addFields({ name: 'Grau Máximo', value: String(skill.grau), inline: true });
    if (skill.custo_runas) embed.addFields({ name: 'Custo de Runas', value: String(skill.custo_runas), inline: true });

    return embed;
}

async function execute(interaction) {
    try {
        await interaction.deferReply();
        
        const apiUrl = getUrlRequisicao(interaction);
        const res = await axios.get(apiUrl, { headers: { 'X-API-Key': API_KEY } });
        const p = res.data;
        const personagemId = p.id; // Supondo que a API retorne o ID unico

        let buffer = profileCache.getProfile(personagemId);
        
        if (!buffer) {
            buffer = await gerarBannerPerfil(p);
            profileCache.setProfile(personagemId, buffer, 5 * 60 * 1000); // Cache de 5 min
        }

        const attachment = new AttachmentBuilder(buffer, { name: 'perfil.png' });
        
        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://perfil.png');
        
        const skillRow = buildProfileSkillRow(p);
        const components = skillRow ? [skillRow] : [];

        await interaction.editReply({ embeds: [embed], files: [attachment], components });
    } catch (e) {
        console.error('[Perfil] Erro ao buscar perfil:', e.message);
        if (interaction.deferred) {
            return await interaction.editReply({ embeds: [embedErro('Personagem não encontrado ou erro na API.')] });
        } else {
            return await interaction.reply({ embeds: [embedErro('Personagem não encontrado ou erro na API.')], ephemeral: true });
        }
    }
}

// O handleSelect precisará buscar a skill. No index.js antigo ele usava skillsCache (um Map global de message.id).
// Como refatoramos, podemos apenas bater no catalogCache que agora carrega todas as skills!
async function handleSelect(interaction) {
    const selectedId = interaction.values[0];
    if (selectedId === 'empty') return await interaction.deferUpdate();

    // ID esperado: select_perfil_skill_{personagemId}
    if (interaction.customId.startsWith('select_perfil_skill_')) {
        const catalogCache = require('../catalogCache');
        const skill = catalogCache.findSkill(selectedId);
        if (!skill) return await interaction.reply({ embeds: [embedErro('Habilidade não encontrada.')], ephemeral: true });
        
        return await interaction.update({
            embeds: [buildSkillDetailEmbed(skill)],
            files: [],
            attachments: [],
            components: interaction.message.components
        });
    }
}

module.exports = {
    data,
    execute,
    handleSelect,
    buildProfileSkillRow,
    buildSkillDetailEmbed
};
