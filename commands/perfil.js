const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { gerarBannerPerfilSocial } = require('../canvas/renderer');
const { formatarTexto, embedErro } = require('../utils/helpers');
const socialProgression = require('../utils/socialProgression');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;
const PROFILE_WEBHOOK_NAME = 'Tales of Ernas · Perfis';

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

function avatarDoDiscord(user) {
    if (!user || typeof user.displayAvatarURL !== 'function') return null;
    return user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
}

async function buscarUsuarioPerfil(interaction, personagem) {
    const mencionado = interaction.options.getUser('jogador');
    const idPersonagem = personagem?.discord_id;
    const id = mencionado?.id || idPersonagem || interaction.user.id;
    if (id === interaction.user.id) return interaction.user;
    return interaction.client.users.fetch(id).catch(() => mencionado || interaction.user);
}

async function obterWebhookPerfil(channel) {
    if (!channel?.guild || typeof channel.fetchWebhooks !== 'function') return null;
    const botMember = channel.guild.members.me;
    const permissions = botMember ? channel.permissionsFor(botMember) : null;
    if (!permissions?.has(PermissionFlagsBits.ManageWebhooks)) return null;

    const webhooks = await channel.fetchWebhooks();
    const proprio = webhooks.find(webhook => webhook.name === PROFILE_WEBHOOK_NAME && webhook.token);
    if (proprio) return proprio;
    return channel.createWebhook({ name: PROFILE_WEBHOOK_NAME, reason: 'Perfil visual da Gaia' });
}

async function enviarPerfilPorWebhook(interaction, personagem, social, buffer, avatarUrl) {
    try {
        const webhook = await obterWebhookPerfil(interaction.channel);
        if (!webhook) return false;

        const nome = formatarTexto(personagem.nome || 'Aventureiro');
        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://perfil-social.png')
            .setFooter({ text: `Gaia · ${social.rank.name} · nível ${social.level}/${social.maxLevel}` });

        await webhook.send({
            username: `${nome} · Perfil`.slice(0, 80),
            avatarURL: avatarUrl || undefined,
            embeds: [embed],
            files: [new AttachmentBuilder(buffer, { name: 'perfil-social.png' })],
            allowedMentions: { parse: [] }
        });
        return true;
    } catch (error) {
        console.warn('[Perfil] Webhook visual indisponível, usando resposta padrão:', error.message);
        return false;
    }
}

async function execute(interaction) {
    try {
        await interaction.deferReply();
        
        const apiUrl = getUrlRequisicao(interaction);
        const res = await axios.get(apiUrl, { headers: { 'X-API-Key': API_KEY } });
        const p = res.data;

        const usuarioMencionado = interaction.options.getUser('jogador');
        const nomeFornecido = interaction.options.getString('nome');
        const discordId = usuarioMencionado?.id || (nomeFornecido ? p.discord_id : interaction.user.id);
        const social = interaction.guildId && /^\d{15,22}$/.test(String(discordId || ''))
            ? socialProgression.getProgression(interaction.guildId, discordId)
            : null;

        const usuarioPerfil = await buscarUsuarioPerfil(interaction, p);
        const fallbackAvatarUrl = avatarDoDiscord(usuarioPerfil);
        const personagemComAvatar = {
            ...p,
            avatar_url: p.avatar_url || p.imagem_url || p.retrato_url || fallbackAvatarUrl
        };
        const progression = social || socialProgression.getProgression(interaction.guildId, interaction.user.id);
        const buffer = await gerarBannerPerfilSocial(personagemComAvatar, progression, fallbackAvatarUrl);

        // O deck/seleção de habilidades não faz mais parte da resposta do /perfil.
        const embed = new EmbedBuilder()
            .setColor(0xD4AF37)
            .setImage('attachment://perfil-social.png')
            .setFooter({ text: 'Perfil visual · Tales of Ernas' });

        const publicado = await enviarPerfilPorWebhook(interaction, personagemComAvatar, progression, buffer, personagemComAvatar.avatar_url);
        if (publicado) {
            await interaction.deleteReply().catch(() => null);
            return;
        }

        await interaction.editReply({
            embeds: [embed],
            files: [new AttachmentBuilder(buffer, { name: 'perfil-social.png' })],
            components: []
        });
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
