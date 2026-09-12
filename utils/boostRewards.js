const crypto = require('crypto');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

// Primeira etapa do rollout: nenhuma varredura global e nenhum membro além do
// usuário de homologação pode ser premiado. A abertura precisa ser intencional.
const TEST_GUILD_ID = '1514745357463195759';
const TEST_BOOSTER_DISCORD_ID = '187348111729885184'; // unetinhus
const RUNAS_PER_BOOST = 30;

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

function isTestBooster(member) {
  return member?.guild?.id === TEST_GUILD_ID && member.id === TEST_BOOSTER_DISCORD_ID;
}

function boostStartedAt(member) {
  return member?.premiumSince instanceof Date && Number.isFinite(member.premiumSince.getTime())
    ? member.premiumSince.toISOString()
    : null;
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

async function processIsolatedBoostReward(member, source) {
  if (!isTestBooster(member)) return { skipped: 'not-test-booster' };

  const startedAt = boostStartedAt(member);
  if (!startedAt) return { skipped: 'not-boosting' };

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
        boost_started_at: startedAt,
      }),
    });
  } catch (error) {
    console.error('[boost-rewards] site indisponível:', error.message);
    return { skipped: 'request-failed' };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.warn(`[boost-rewards] crédito recusado (${source}): HTTP ${response.status} ${payload?.code || payload?.error || ''}`);
    return { skipped: 'rejected' };
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

async function runIsolatedBoostRewardTest(client) {
  const guild = await client.guilds.fetch(TEST_GUILD_ID).catch(() => null);
  if (!guild) return console.warn('[boost-rewards] servidor de teste indisponível.');
  const member = await guild.members.fetch(TEST_BOOSTER_DISCORD_ID).catch(() => null);
  if (!member) return console.warn('[boost-rewards] membro de teste indisponível.');
  return processIsolatedBoostReward(member, 'startup-test');
}

async function handleBoostMemberUpdate(oldMember, newMember) {
  if (!isTestBooster(newMember)) return;
  const before = boostStartedAt(oldMember);
  const after = boostStartedAt(newMember);
  if (!after || before === after) return;
  return processIsolatedBoostReward(newMember, 'boost-update');
}

module.exports = {
  handleBoostMemberUpdate,
  runIsolatedBoostRewardTest,
};
