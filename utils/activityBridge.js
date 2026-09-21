const http = require('http');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

const PORT = Number(process.env.DISCORD_ACTIVITY_BOT_PORT || 3219);
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 24_000;
const requestTimes = [];

// O diretório de aplicativos (`/application-directory/...`) apenas mostra a
// vitrine do Discord e, dependendo do cliente, abre uma aba vazia. A rota de
// Activity é o atalho direto; o canal continua como fallback explícito para
// clientes que não suportam o deep-link.
const DEFAULT_ACTIVITY_CHANNEL_ID = '1547242590758510592';
const ANNOUNCEMENT_CHANNELS = Object.freeze({
    missoes: '1524529872322564196',
    arena: '1524529638590775588'
});
const REGISTRATION_CUSTOM_ID = /^toe_reg:v1:(join|leave):(mission|arc|tournament):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DISCORD_ID_RE = /^\d{15,22}$/;
const MISSION_ROOM_MARKER = 'Tales of Ernas · Sala de missão';
const MISSION_ROOM_CRON_MS = 5 * 60 * 1000;

function missionRoomId(value) {
    const id = String(value || '').trim();
    if (!MISSION_ID_RE.test(id)) throw Object.assign(new Error('Missão inválida.'), { status: 400 });
    return id;
}

function discordIds(values, max = 60) {
    return [...new Set(Array.isArray(values) ? values.filter(id => DISCORD_ID_RE.test(String(id))).map(String) : [])].slice(0, max);
}

function slugifyChannelName(value) {
    const slug = String(value || 'missao')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 62);
    return slug || 'missao';
}

function normalizarCategoria(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function missionGuild(client, guildId) {
    if (DISCORD_ID_RE.test(String(guildId || ''))) return client.guilds.fetch(String(guildId));
    // A instalação da Gaia também participa do servidor de staff. Quando o
    // site não tem um guild id configurado, escolha o servidor que realmente
    // possui a categoria GAMEPLAY em vez de depender da ordem do cache.
    const gameplayGuild = client.guilds.cache.find(guild => guild.channels.cache.some(channel => channel.type === ChannelType.GuildCategory && normalizarCategoria(channel.name).includes('gameplay')));
    const first = gameplayGuild || client.guilds.cache.first();
    if (!first) throw Object.assign(new Error('Nenhum servidor Discord disponível para a sala.'), { status: 503 });
    return first;
}

async function missionCategory(guild) {
    const configured = String(process.env.DISCORD_MISSION_CATEGORY_ID || '').trim();
    if (DISCORD_ID_RE.test(configured)) {
        const channel = await guild.channels.fetch(configured).catch(() => null);
        if (channel?.type === ChannelType.GuildCategory) return channel;
    }
    const category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && normalizarCategoria(channel.name).includes('gameplay'));
    if (!category) throw Object.assign(new Error('Categoria GAMEPLAY não encontrada no servidor.'), { status: 503 });
    return category;
}

function missionPermissionOverwrites(guild, roleId, gmId) {
    const allow = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
    ];
    return [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: roleId, allow },
        ...(DISCORD_ID_RE.test(String(gmId || '')) ? [{ id: gmId, allow }] : []),
    ];
}

async function ensureMissionRole(guild, name) {
    let role = guild.roles.cache.find(candidate => candidate.name === name);
    if (!role) {
        role = await guild.roles.create({ name, mentionable: true, color: 0xc89b3c, reason: 'Sala temporária de missão Tales of Ernas' });
    } else if (!role.mentionable) {
        await role.setMentionable(true, 'Menção inicial da sala temporária de missão').catch(() => null);
    }
    return role;
}

async function ensureMissionChannel(guild, category, role, input) {
    const slug = slugifyChannelName(input.missionName);
    const name = `missao-${slug}-${input.missionId.slice(0, 8).toLowerCase()}`.slice(0, 100);
    const topic = `toe:mission-room:${input.missionId}`;
    let channel = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildText && candidate.topic === topic);
    if (!channel) channel = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildText && candidate.name === name);
    if (!channel) {
        channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: category.id,
            topic,
            permissionOverwrites: missionPermissionOverwrites(guild, role.id, input.gmDiscordId),
            reason: 'Sala temporária de comunicação de missão',
        });
    } else {
        if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false }).catch(() => null);
        await channel.setTopic(topic).catch(() => null);
        await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => null);
        await channel.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true, AddReactions: true }).catch(() => null);
        if (DISCORD_ID_RE.test(String(input.gmDiscordId || ''))) await channel.permissionOverwrites.edit(input.gmDiscordId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true, AddReactions: true }).catch(() => null);
    }
    return { channel, name };
}

async function syncMissionMembers(guild, role, ids, gmId) {
    const desired = new Set([...ids, ...(DISCORD_ID_RE.test(String(gmId || '')) ? [String(gmId)] : [])]);
    let assigned = 0;
    let missing = 0;
    for (const id of desired) {
        try {
            const member = await guild.members.fetch(id);
            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role, 'Participante confirmado da missão');
                assigned += 1;
            }
        } catch (error) {
            missing += 1;
            console.warn(`[activity-bridge] membro ${id} não encontrado para cargo de missão: ${error.code || error.message}`);
        }
    }
    let removed = 0;
    for (const member of role.members.values()) {
        if (!desired.has(member.id)) {
            await member.roles.remove(role, 'Participante removido da missão').then(() => { removed += 1; }).catch(() => null);
        }
    }
    return { assigned, removed, missing };
}

async function sendMissionOpeningMessage(client, channel, role, input, gmName) {
    const marker = `${MISSION_ROOM_MARKER} · ${input.missionId}`;
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const previous = recent?.find(message => message.author?.id === client.user?.id && message.embeds?.some(embed => embed.footer?.text === marker));
    if (previous) return previous;
    const timestamp = Math.floor(new Date(input.scheduledAt).getTime() / 1000);
    const when = Number.isFinite(timestamp) ? `<t:${timestamp}:F> (<t:${timestamp}:R>)` : 'Horário ainda não definido';
    const embed = new EmbedBuilder()
        .setColor(0xc89b3c)
        .setTitle(`Missão · ${String(input.missionName || 'Missão').slice(0, 180)}`)
        .setDescription('Este é o canal privado de comunicação da missão. Use-o para orientações, preparação, atrasos e dúvidas antes e durante a sessão.')
        .addFields(
            { name: 'Início', value: when, inline: true },
            { name: 'Mestre', value: String(gmName || 'Mestre').slice(0, 100), inline: true },
        )
        .setFooter({ text: marker });
    return channel.send({
        content: `<@&${role.id}>`,
        embeds: [embed],
        allowedMentions: { roles: [role.id], users: [], parse: [] },
    });
}

async function openMissionRoom(client, body) {
    const missionId = missionRoomId(body.missionId);
    const guild = await missionGuild(client, body.guildId);
    const category = await missionCategory(guild);
    const short = missionId.slice(0, 8).toLowerCase();
    const role = await ensureMissionRole(guild, `MISSÃO · ${short}`);
    const { channel } = await ensureMissionChannel(guild, category, role, { ...body, missionId });
    const ids = discordIds(body.participantDiscordIds);
    const members = await syncMissionMembers(guild, role, ids, body.gmDiscordId);
    const message = await sendMissionOpeningMessage(client, channel, role, { ...body, missionId }, body.gmName);
    return { ok: true, guildId: guild.id, categoryId: category.id, channelId: channel.id, roleId: role.id, openingMessageId: message.id, ...members };
}

async function syncMissionRoom(client, body) {
    const missionId = missionRoomId(body.missionId);
    const guild = await missionGuild(client, body.guildId);
    const role = await guild.roles.fetch(String(body.roleId || '')).catch(() => null);
    if (!role) throw Object.assign(new Error('Cargo temporário da missão não encontrado.'), { status: 404 });
    const channel = await guild.channels.fetch(String(body.channelId || '')).catch(() => null);
    if (!channel?.isTextBased()) throw Object.assign(new Error('Canal temporário da missão não encontrado.'), { status: 404 });
    const members = await syncMissionMembers(guild, role, discordIds(body.participantDiscordIds), body.gmDiscordId);
    return { ok: true, missionId, ...members };
}

async function closeMissionRoom(client, body) {
    const missionId = missionRoomId(body.missionId);
    const guild = await missionGuild(client, body.guildId);
    let channelDeleted = true;
    let roleDeleted = true;
    if (DISCORD_ID_RE.test(String(body.channelId || ''))) {
        const channel = await guild.channels.fetch(String(body.channelId)).catch(() => null);
        if (channel) await channel.delete('Fim da janela da sala temporária da missão').catch(() => { channelDeleted = false; });
    }
    if (DISCORD_ID_RE.test(String(body.roleId || ''))) {
        const role = await guild.roles.fetch(String(body.roleId)).catch(() => null);
        if (role) await role.delete('Fim da janela da sala temporária da missão').catch(() => { roleDeleted = false; });
    }
    return { ok: channelDeleted && roleDeleted, missionId, channelDeleted, roleDeleted };
}

function activityChannelUrl(guildId) {
    const customUrl = String(process.env.DISCORD_ACTIVITY_CHANNEL_URL || '').trim();
    if (/^https:\/\/discord\.com\/channels\/\d{15,22}\/\d{15,22}$/.test(customUrl)) return customUrl;
    const channelId = String(process.env.DISCORD_ACTIVITY_CHANNEL_ID || DEFAULT_ACTIVITY_CHANNEL_ID).trim();
    if (!/^\d{15,22}$/.test(channelId) || !/^\d{15,22}$/.test(String(guildId || ''))) return null;
    return `https://discord.com/channels/${guildId}/${channelId}`;
}

function bridgeSecret() {
    if (process.env.DISCORD_ACTIVITY_BOT_SECRET) return process.env.DISCORD_ACTIVITY_BOT_SECRET.trim();
    try { return require('fs').readFileSync('/var/tmp/ernas-activity-bot.secret', 'utf8').trim(); } catch { return ''; }
}

function activitySiteUrl() {
    const configured = String(process.env.DISCORD_ACTIVITY_SITE_URL || '').trim().replace(/\/$/, '');
    return configured || 'https://toe.ernas.com.br';
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
    const ids = (url.searchParams.get('ids') || '').split(',').filter(id => /^\d{15,22}$/.test(id)).slice(0, 25);
    const collection = ids.length
        ? await guild.members.fetch({ user: ids })
        : query
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
    const sessionId = typeof session.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(session.id)
        ? session.id
        : null;
    const activityUrl = client.application?.id
        ? `https://discord.com/activities/${client.application.id}${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`
        : null;
    const channelUrl = activityChannelUrl(body.guildId);
    const buttons = [];
    if (activityUrl) {
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir Tales of Ernas').setURL(activityUrl));
    }
    if (channelUrl) {
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir canal do Tabletop').setURL(channelUrl));
    }
    const components = buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
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

async function sendAnnouncement(client, body) {
    const channelId = ANNOUNCEMENT_CHANNELS[body.channel];
    if (!channelId) throw Object.assign(new Error('Canal de aviso inválido.'), { status: 400 });
    const embeds = Array.isArray(body.embeds) ? body.embeds.slice(0, 10) : [];
    const rawButtons = Array.isArray(body.buttons) ? body.buttons.slice(0, 5) : [];
    if (!embeds.length || !rawButtons.length) throw Object.assign(new Error('Aviso interativo inválido.'), { status: 400 });

    const styles = {
        primary: ButtonStyle.Primary,
        secondary: ButtonStyle.Secondary,
        success: ButtonStyle.Success,
        danger: ButtonStyle.Danger
    };
    const buttons = rawButtons.map(raw => {
        const customId = String(raw?.customId || '');
        const label = String(raw?.label || '').trim().slice(0, 80);
        const style = styles[String(raw?.style || '')];
        if (!REGISTRATION_CUSTOM_ID.test(customId) || !label || !style) {
            throw Object.assign(new Error('Botão de aviso inválido.'), { status: 400 });
        }
        return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
    });

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw Object.assign(new Error('Canal de aviso indisponível.'), { status: 503 });
    }
    const rawContent = String(body.content || '');
    const content = (body.everyone === true ? `@everyone${rawContent ? ` ${rawContent}` : ''}` : rawContent).slice(0, 2000) || undefined;
    const message = await channel.send({
        content,
        embeds,
        components: [new ActionRowBuilder().addComponents(...buttons)],
        allowedMentions: { parse: body.everyone === true ? ['everyone'] : [] }
    });
    return { sent: true, messageId: message.id };
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
            if (request.method === 'POST' && url.pathname === '/activity/announcements') return json(response, 200, await sendAnnouncement(client, await readBody(request)));
            if (request.method === 'POST' && url.pathname === '/activity/mission-rooms/open') return json(response, 200, await openMissionRoom(client, await readBody(request)));
            if (request.method === 'POST' && url.pathname === '/activity/mission-rooms/sync') return json(response, 200, await syncMissionRoom(client, await readBody(request)));
            if (request.method === 'POST' && url.pathname === '/activity/mission-rooms/close') return json(response, 200, await closeMissionRoom(client, await readBody(request)));
            if (request.method === 'GET' && url.pathname === '/activity/health') return json(response, 200, { ok: true, ready: client.isReady() });
            return json(response, 404, { error: 'Rota não encontrada.' });
        } catch (error) {
            console.error('[activity-bridge]', error);
            return json(response, error.status || 500, { error: error.status ? error.message : 'Falha interna do BOT.' });
        }
    });
    server.listen(PORT, HOST, () => console.log(`[activity-bridge] ouvindo em http://${HOST}:${PORT}`));
    server.on('error', error => console.error('[activity-bridge] servidor:', error));
    // O processo do Gaia é persistente e funciona como o worker da rotina de
    // salas. O endpoint também aceita o CRON_SECRET da VPS, então é possível
    // migrar para o crontab sem alterar o ciclo nem o contrato.
    const runMissionRoomCron = async () => {
        try {
            const response = await fetch(`${activitySiteUrl()}/api/cron/missoes-salas-discord`, {
                headers: { 'x-activity-secret': secret },
                signal: AbortSignal.timeout(45_000),
            });
            if (!response.ok) console.warn(`[activity-bridge] cron de salas retornou HTTP ${response.status}`);
        } catch (error) {
            console.warn(`[activity-bridge] cron de salas indisponível: ${error.code || error.message}`);
        }
    };
    const scheduler = setInterval(runMissionRoomCron, MISSION_ROOM_CRON_MS);
    scheduler.unref?.();
    setTimeout(runMissionRoomCron, 15_000).unref?.();
    return server;
}

module.exports = { startActivityBridge };
