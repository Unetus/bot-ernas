const http = require('http');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const PORT = Number(process.env.DISCORD_ACTIVITY_BOT_PORT || 3219);
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 24_000;
const requestTimes = [];

function bridgeSecret() {
    if (process.env.DISCORD_ACTIVITY_BOT_SECRET) return process.env.DISCORD_ACTIVITY_BOT_SECRET.trim();
    try { return require('fs').readFileSync('/var/tmp/ernas-activity-bot.secret', 'utf8').trim(); } catch { return ''; }
}

function json(response, status, payload) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payload));
}

function authorized(request) {
    const secret = bridgeSecret();
    const supplied = request.headers['x-activity-secret'] || '';
    return secret.length >= 24 && supplied.length === secret.length
        && require('crypto').timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

function withinRateLimit() {
    const now = Date.now();
    while (requestTimes.length && requestTimes[0] < now - 60_000) requestTimes.shift();
    if (requestTimes.length >= 60) return false;
    requestTimes.push(now);
    return true;
}

async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Payload muito grande.'), { status: 413 });
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function notificationCopy(type, session) {
    const title = String(session?.title || 'Sessão de Tales of Ernas').slice(0, 100);
    const copies = {
        session_invite: { heading: 'Convite para uma sessão privada', color: 0xe2be65, text: `O Mestre convidou você para participar de **${title}**.` },
        session_opened: { heading: 'A sessão foi aberta', color: 0x74c7ec, text: `A sessão **${title}** está aberta para entrada.` },
        session_reopened: { heading: 'A sessão foi reaberta', color: 0xa6e3a1, text: `A sessão **${title}** foi reaberta pelo Mestre. O histórico anterior foi preservado.` },
        session_closed: { heading: 'A sessão foi encerrada', color: 0xf38ba8, text: `A sessão **${title}** foi encerrada pelo Mestre e já está disponível no Histórico da Activity.` }
    };
    return copies[type] || null;
}

async function searchMembers(client, url) {
    const guildId = url.searchParams.get('guild_id') || '';
    const query = (url.searchParams.get('query') || '').trim().slice(0, 80);
    if (!/^\d{15,22}$/.test(guildId)) throw Object.assign(new Error('Servidor inválido.'), { status: 400 });
    const guild = await client.guilds.fetch(guildId);
    const collection = query
        ? await guild.members.search({ query, limit: 25 })
        : await guild.members.fetch({ limit: 100 });
    return [...collection.values()]
        .filter(member => !member.user.bot)
        .slice(0, 25)
        .map(member => ({
            id: member.id,
            displayName: member.displayName,
            username: member.user.username,
            avatarUrl: member.displayAvatarURL({ extension: 'webp', size: 128 })
        }));
}

async function sendNotifications(client, body) {
    const copy = notificationCopy(body.type, body.session);
    if (!copy || !/^\d{15,22}$/.test(String(body.guildId || ''))) throw Object.assign(new Error('Notificação inválida.'), { status: 400 });
    const userIds = [...new Set(Array.isArray(body.userIds) ? body.userIds.filter(id => /^\d{15,22}$/.test(id)) : [])].slice(0, 15);
    const session = body.session || {};
    const details = [
        session.regionId ? `**Localidade**\n${String(session.regionId).slice(0, 64)}` : null,
        session.scheduledAt ? `**Quando**\n<t:${Math.floor(new Date(session.scheduledAt).getTime() / 1000)}:F>` : null,
        session.description ? `**Sobre a sessão**\n${String(session.description).slice(0, 500)}` : null,
        'Abra a Activity **Tales of Ernas** no servidor para entrar na sessão.'
    ].filter(Boolean).join('\n\n');
    const embed = new EmbedBuilder().setColor(copy.color).setTitle(copy.heading).setDescription(`${copy.text}\n\n${details}`).setFooter({ text: 'Tales of Ernas · Discord Activity' }).setTimestamp();
    const directoryUrl = client.application?.id ? `https://discord.com/application-directory/${client.application.id}` : null;
    const components = directoryUrl ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir Tales of Ernas').setURL(directoryUrl))] : [];
    let sent = 0;
    let failed = 0;
    await Promise.all(userIds.map(async id => {
        try {
            const user = await client.users.fetch(id);
            await user.send({ embeds: [embed], components });
            sent += 1;
        } catch (error) {
            failed += 1;
            console.warn(`[activity-bridge] DM não entregue para ${id}: ${error.code || error.message}`);
        }
    }));
    return { sent, failed };
}

function startActivityBridge(client) {
    const secret = bridgeSecret();
    if (secret.length < 24) {
        console.warn('[activity-bridge] desativado: DISCORD_ACTIVITY_BOT_SECRET ausente ou curto.');
        return null;
    }
    const server = http.createServer(async (request, response) => {
        try {
            if (!authorized(request)) return json(response, 401, { error: 'Não autorizado.' });
            if (!withinRateLimit()) return json(response, 429, { error: 'Muitas requisições.' });
            const url = new URL(request.url, `http://${HOST}:${PORT}`);
            if (request.method === 'GET' && url.pathname === '/activity/members') return json(response, 200, { members: await searchMembers(client, url) });
            if (request.method === 'POST' && url.pathname === '/activity/notifications') return json(response, 200, await sendNotifications(client, await readBody(request)));
            if (request.method === 'GET' && url.pathname === '/activity/health') return json(response, 200, { ok: true, ready: client.isReady() });
            return json(response, 404, { error: 'Rota não encontrada.' });
        } catch (error) {
            console.error('[activity-bridge]', error);
            return json(response, error.status || 500, { error: error.status ? error.message : 'Falha interna do BOT.' });
        }
    });
    server.listen(PORT, HOST, () => console.log(`[activity-bridge] ouvindo em http://${HOST}:${PORT}`));
    server.on('error', error => console.error('[activity-bridge] servidor:', error));
    return server;
}

module.exports = { startActivityBridge };
