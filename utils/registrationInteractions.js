const crypto = require('crypto');
const fs = require('fs');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const GUILD_ID = '1514745357463195759';
const CUSTOM_ID = /^toe_reg:v1:(join|leave):(mission|arc|tournament):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const REQUEST_TIMEOUT_MS = 12_000;

const routes = {
    'join:mission': ['/api/missoes/inscrever', 'anuncio_id'],
    'leave:mission': ['/api/missoes/desistir', 'anuncio_id'],
    'join:arc': ['/api/missoes/arcos/inscrever', 'arco_id'],
    'leave:arc': ['/api/missoes/arcos/desistir', 'arco_id'],
    'join:tournament': ['/api/torneios/inscrever', 'torneio_id'],
    'leave:tournament': ['/api/torneios/cancelar-inscricao', 'torneio_id']
};

function appBaseUrl() {
    return String(process.env.ARKANDIA_INTERNAL_URL || process.env.ARKANDIA_API_URL || '')
        .trim()
        .replace(/\/api\/public\/v1\/?$/, '')
        .replace(/\/+$/, '');
}

function registrationApiBaseUrl() {
    return String(process.env.ARKANDIA_REGISTRATION_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

function registrationSecret() {
    try {
        const base = fs.readFileSync('/var/tmp/ernas-activity-bot.secret', 'utf8').trim();
        return base ? crypto.createHmac('sha256', base).update('discord-registration-actions').digest('hex') : '';
    } catch {
        return '';
    }
}

function detailUrl(kind) {
    const base = appBaseUrl() || 'https://toe.ernas.com.br';
    return kind === 'tournament' ? `${base}/eventos/torneios` : `${base}/missoes`;
}

function fallbackRow(kind) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ver detalhes no site').setURL(detailUrl(kind))
    );
}

function successCopy(action, kind, payload) {
    if (typeof payload?.mensagem === 'string' && payload.mensagem.trim()) return payload.mensagem.trim();
    if (action === 'leave') return kind === 'tournament'
        ? 'Sua inscrição foi cancelada. Se houve custo, o reembolso foi processado.'
        : 'Sua inscrição foi removida com sucesso.';
    if (kind === 'tournament') return payload?.bracket_gerado
        ? 'Inscrição confirmada. As vagas foram preenchidas e o chaveamento foi gerado.'
        : 'Inscrição confirmada no torneio.';
    return 'Inscrição confirmada.';
}

async function handleRegistrationInteraction(interaction) {
    const match = CUSTOM_ID.exec(String(interaction.customId || ''));
    if (!match) return false;

    await interaction.deferReply({ ephemeral: true });
    const [, action, kind, resourceId] = match;
    if (interaction.guildId !== GUILD_ID) {
        await interaction.editReply({ content: 'Este botão pertence ao servidor Tales of Ernas.', components: [] });
        return true;
    }

    const base = appBaseUrl();
    const apiBase = registrationApiBaseUrl();
    const secret = registrationSecret();
    const route = routes[`${action}:${kind}`];
    if (!base || secret.length < 32 || !route) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xc98b3c).setTitle('Ação temporariamente indisponível').setDescription('A Gaia não conseguiu alcançar o sistema de inscrições. Tente novamente em instantes.')],
            components: [fallbackRow(kind)]
        });
        return true;
    }

    const timestamp = String(Date.now());
    const signature = crypto.createHmac('sha256', secret)
        .update(`${timestamp}.${interaction.guildId}.${interaction.user.id}.${interaction.id}.${route[0]}`)
        .digest('hex');

    let response;
    let payload = null;
    try {
        response = await fetch(`${apiBase}${route[0]}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                // As rotas públicas mantêm a proteção CSRF do site. A
                // assinatura prova a Gaia; Origin/Referer satisfazem a mesma
                // política aplicada aos formulários legítimos do domínio.
                'origin': base,
                'referer': `${base}/`,
                'x-discord-registration-guild': interaction.guildId,
                'x-discord-registration-user': interaction.user.id,
                'x-discord-registration-interaction': interaction.id,
                'x-discord-registration-path': route[0],
                'x-discord-registration-timestamp': timestamp,
                'x-discord-registration-signature': signature
            },
            body: JSON.stringify({ [route[1]]: resourceId }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        payload = await response.json().catch(() => null);
    } catch (error) {
        console.error('[registration-interaction] site indisponível:', error.message);
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xc98b3c).setTitle('Não foi possível concluir agora').setDescription('A conexão com o sistema de inscrições falhou. Nenhuma alteração foi feita; tente novamente em instantes.')],
            components: [fallbackRow(kind)]
        });
        return true;
    }

    if (!response.ok || !payload?.ok) {
        let message = typeof payload?.error === 'string' ? payload.error : 'Não foi possível concluir esta ação.';
        if (response.status === 401) message = 'Sua conta Discord ainda não está vinculada a um cadastro ativo no Tales of Ernas.';
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(response.status >= 500 ? 0xc94a4a : 0xc98b3c)
                .setTitle('Ação não concluída')
                .setDescription(message)
                .setFooter({ text: 'Gaia · Tales of Ernas' })],
            components: [fallbackRow(kind)]
        });
        return true;
    }

    const title = action === 'join' ? 'Inscrição confirmada' : 'Inscrição removida';
    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(action === 'join' ? 0x3fae6f : 0x8a8173)
            .setTitle(title)
            .setDescription(successCopy(action, kind, payload))
            .setFooter({ text: 'Gaia · Tales of Ernas' })
            .setTimestamp()],
        components: []
    });
    return true;
}

module.exports = { handleRegistrationInteraction };
