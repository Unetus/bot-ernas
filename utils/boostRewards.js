const crypto = require('crypto');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

const GUILD_ID = '1514745357463195759';
const BOOST_LOG_CHANNEL_ID = process.env.DISCORD_BOOST_LOG_CHANNEL_ID || '1548444809256239234';
const RUNAS_PER_BOOST = 30;
const BOOST_MESSAGE_TYPE = 8; // Discord MessageType.GuildBoost
const seenEvents = new Set();

function appBaseUrl() {
  const configured = String(process.env.ARKANDIA_INTERNAL_URL || process.env.ARKANDIA_API_URL || '').trim();
  return configured.replace(/\/api\/public\/v1\/?$/, '').replace(/\/+$/, '');
}

function boostSecret() {
  try {
    const base = fs.readFileSync('/var/tmp/ernas-activity-bot.secret', 'utf8').trim();
    return base ? crypto.createHmac('sha256', base).update('discord-boost-reward').digest('hex') : '';
  } catch {
    return '';
  }
}

function rewardEmbed(member, personagem, saldo) {
  return new EmbedBuilder()
    .setColor(0xD4AF37)
    .setTitle('A bênção de Gaia chegou')
    .setDescription([
      `Obrigado por fortalecer **Tales of Ernas** com seu boost, ${member.displayName}!`,
      '',
      `**+${RUNAS_PER_BOOST} Runas** foram creditadas para **${personagem}**.`,
      'Seu apoio mantém o reino vivo e ajuda a expandir novas histórias.',
    ].join('\n'))
    .addFields(
      { name: 'Recompensa', value: `${RUNAS_PER_BOOST} Runas`, inline: true },
      { name: 'Saldo atual', value: `${saldo} Runas`, inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
    .setFooter({ text: 'Gaia · Tales of Ernas' })
    .setTimestamp();
}

function rememberEvent(eventId) {
  seenEvents.add(eventId);
  if (seenEvents.size > 1000) seenEvents.delete(seenEvents.values().next().value);
}

async function processBoostReward(member, boostStartedAt, eventId, source) {
  if (!member?.guild || member.guild.id !== GUILD_ID) return { skipped: 'wrong-guild' };

  const base = appBaseUrl();
  const secret = boostSecret();
  if (!base || secret.length < 32) {
    console.warn('[boost-rewards] configuração interna indisponível.');
    return { skipped: 'not-configured' };
  }

  let response;
  try {
    response = await fetch(`${base}/api/internal/discord/boost-reward`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-discord-boost-secret': secret,
      },
      body: JSON.stringify({
        guild_id: member.guild.id,
        discord_user_id: member.id,
        discord_event_id: eventId,
        boost_started_at: boostStartedAt,
      }),
    });
  } catch (error) {
    console.error('[boost-rewards] site indisponível:', error.message);
    return { skipped: 'request-failed' };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const code = payload?.code || payload?.error || '';
    console.warn(`[boost-rewards] crédito pendente (${source}): HTTP ${response.status} ${code}`);
    return { skipped: 'rejected', code };
  }

  if (!payload.credited) {
    console.log(`[boost-rewards] boost já premiado para ${member.user.tag} (${source}).`);
    return { credited: false };
  }

  await member.user.send({
    embeds: [rewardEmbed(member, String(payload.personagem || 'seu personagem'), Number(payload.saldo || 0))],
  }).catch((error) => {
    console.warn(`[boost-rewards] DM não entregue para ${member.user.tag}: ${error.code || error.message}`);
  });

  console.log(`[boost-rewards] +${RUNAS_PER_BOOST} Runas para ${member.user.tag} (${source}).`);
  return { credited: true };
}

function extractBoosterId(message, client) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned?.id) return mentioned.id;

  const contentMention = String(message.content || '').match(/<@!?([0-9]{15,22})>/);
  if (contentMention) return contentMention[1];

  const authorId = message.author?.id;
  if (authorId && authorId !== client.user.id && /^[0-9]{15,22}$/.test(authorId)) return authorId;
  return null;
}

function isBoostMessage(message) {
  return Boolean(
    message?.guild?.id === GUILD_ID &&
    message.channel?.id === BOOST_LOG_CHANNEL_ID &&
    message.type === BOOST_MESSAGE_TYPE
  );
}

async function processBoostMessage(client, message) {
  if (!isBoostMessage(message)) return { skipped: 'not-boost-message' };
  if (seenEvents.has(message.id)) return { skipped: 'duplicate-event' };

  const boosterId = extractBoosterId(message, client);
  if (!boosterId) {
    console.warn(`[boost-rewards] não foi possível identificar o booster na mensagem ${message.id}.`);
    return { skipped: 'booster-not-found' };
  }

  const member = await message.guild.members.fetch(boosterId).catch(() => null);
  if (!member) return { skipped: 'member-not-found' };

  // Cada mensagem de boost tem um timestamp próprio. Isso permite creditar
  // dois boosts do mesmo usuário como eventos distintos sem confiar apenas em
  // premiumSince, que representa somente a assinatura ativa do membro.
  const result = await processBoostReward(member, message.createdAt.toISOString(), message.id, `message:${message.id}`);
  // Só marca como concluído após crédito ou deduplicação confirmada. Falhas
  // transitórias, conta sem personagem ou indisponibilidade do site poderão
  // ser reprocessadas pelo próximo ciclo de reconciliação.
  if (result?.credited === true || result?.credited === false) rememberEvent(message.id);
  return result;
}

function retroactiveEventId(member, boostStartedAt) {
  // Identificador determinístico para o ciclo de boost ativo no momento da
  // reconciliação. O RPC continua protegendo contra duplicidade no banco.
  const timestamp = Date.parse(boostStartedAt);
  const suffix = Number.isFinite(timestamp) ? Math.abs(timestamp) : 0;
  return (BigInt(member.id) + BigInt(suffix)).toString();
}

async function processRetroactiveBoost(member) {
  if (!member?.premiumSince) return { skipped: 'not-boosting' };
  const boostStartedAt = member.premiumSince.toISOString();
  const eventId = retroactiveEventId(member, boostStartedAt);
  return processBoostReward(member, boostStartedAt, eventId, 'retroactive-active-boost');
}

async function scanBoostLog(client) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const channel = await guild?.channels.fetch(BOOST_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  for (const message of ordered) {
    await processBoostMessage(client, message).catch((error) => {
      console.error('[boost-rewards] erro ao processar evento do canal:', error.message);
    });
  }
}

module.exports = {
  BOOST_LOG_CHANNEL_ID,
  processBoostMessage,
  processRetroactiveBoost,
  scanBoostLog,
};
