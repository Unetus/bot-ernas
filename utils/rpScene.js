/**
 * rpScene.js — Lógica compartilhada de criação de cena de RP.
 *
 * Usado por:
 *   - commands/rp.js (subcomando /rp iniciar)
 *
 * Centraliza: extração de menções, busca de participantes, renderização
 * do banner unificado (mesmo padrão visual do card de localidade),
 * criação da thread, envio como o bot do Discord, persistência da
 * sessão no banco e o botão de encerramento.
 *
 * Tudo é postado com o perfil do bot (não webhook). O banner unificado
 * inclui o cenário como background; o que for opcional (subtitulo,
 * ambientacao) e nao for preenchido simplesmente nao aparece.
 */

const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gerarBannerRpUnificado } = require('../canvas/renderer');
const sessionStore = require('./sessionStore');
const { deleteAfterDelay } = require('./tempMessage');

const MENTION_REGEX = /<@!?(\d+)>/g;
const FALLBACK_AVATAR = 'https://i.imgur.com/vHqB3q0.png';

function extrairMencoes(texto) {
    if (!texto) return [];
    const matches = [...texto.matchAll(MENTION_REGEX)];
    return [...new Set(matches.map(m => m[1]))];
}

async function buscarParticipantes(guild, ids) {
    const resultado = [];
    for (const id of ids) {
        try {
            const member = await guild.members.fetch(id);
            resultado.push({
                id,
                displayName: member.displayName || member.user.username,
                avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 })
            });
        } catch {
            resultado.push({ id, displayName: 'Aventureiro', avatarUrl: FALLBACK_AVATAR });
        }
    }
    return resultado;
}

/**
 * Cria a cena de RP: banner unificado, thread, sessão e botão de encerramento.
 *
 * @param {Object} params
 * @param {Guild} params.guild
 * @param {TextChannel} params.targetChannel  Canal que suporta threads
 * @param {{id:string, tag:string, displayName:string}} params.criador
 * @param {boolean} params.isMestre
 * @param {string} params.titulo
 * @param {string} params.participantesRaw   String com menções <@id>
 * @param {string|null} params.subtitulo
 * @param {string|null} params.ambientacao
 * @param {string|null} params.cenarioUrl     URL da imagem de cenário (vira background; null = fundo padrao)
 * @returns {Promise<{ok:true, threadId:string, sessionId:string|null} | {ok:false, error:string}>}
 */
async function iniciarCenaRp({
    guild,
    targetChannel,
    criador,
    isMestre,
    titulo,
    participantesRaw,
    subtitulo,
    ambientacao,
    cenarioUrl
}) {
    const ids = extrairMencoes(participantesRaw);
    if (ids.length === 0) {
        return { ok: false, error: 'Marque pelo menos um participante usando @usuario.' };
    }
    if (ids.length > 15) {
        return { ok: false, error: 'Limite de 15 participantes por cena.' };
    }
    if (!targetChannel.threads) {
        try {
            targetChannel = await guild.channels.fetch(targetChannel.id);
        } catch {}
        if (!targetChannel.threads) {
            return { ok: false, error: 'Este tipo de canal nao suporta a criacao de topicos de RP.' };
        }
    }

    let participantes;
    try {
        participantes = await buscarParticipantes(guild, ids);
    } catch (e) {
        console.error('[rpScene] Erro ao buscar participantes:', e);
        participantes = ids.map(id => ({ id, displayName: 'Aventureiro', avatarUrl: FALLBACK_AVATAR }));
    }

    // Inclui o criador na lista de participantes exibidos no banner.
    const participantesParaBanner = [
        { id: criador.id, displayName: criador.displayName, avatarUrl: null },
        ...participantes.map(p => ({ id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl }))
    ];

    let bannerBuffer;
    try {
        bannerBuffer = await gerarBannerRpUnificado({
            titulo,
            subtitulo,
            ambientacao,
            criador: { tag: criador.tag },
            mestre: isMestre,
            participantes: participantesParaBanner,
            cenarioUrl
        });
    } catch (e) {
        console.error('[rpScene] Erro ao renderizar banner unificado:', e);
        return { ok: false, error: 'Erro ao gerar a imagem da cena de RP.' };
    }

    let thread;
    try {
        thread = await targetChannel.threads.create({
            name: titulo.substring(0, 100),
            autoArchiveDuration: 1440,
            reason: `Cena de RP: ${titulo}`
        });
    } catch (e) {
        console.error('[rpScene] Erro ao criar topico:', e);
        return { ok: false, error: 'Houve um erro ao criar a cena de RP.' };
    }

    // Deleta a mensagem automatica do Discord "X started a thread: ... See all threads"
    // para manter o canal limpo.
    try {
        const recent = await targetChannel.messages.fetch({ limit: 3 });
        const startedMsg = recent.find(m =>
            m.author.id === targetChannel.client.user.id
            && m.type === 0
            && /started a thread|iniciou um t\u00f3pico/i.test(m.content || '')
        );
        if (startedMsg) {
            deleteAfterDelay(startedMsg, 5000);
        }
    } catch (e) {
        console.warn('[rpScene] Nao foi possivel deletar a mensagem de thread criada:', e.message);
    }

    // Garante que o topico e gravavel mesmo que o canal-pai seja read-only
    try {
        await thread.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    } catch (e) {
        console.warn('[rpScene] Nao foi possivel ajustar permissoes do topico:', e.message);
    }

    // O painel fixo da localidade permanece intacto no canal principal.

    // Envia o banner unificado como o bot do Discord e fixa
    try {
        const attachment = new AttachmentBuilder(bannerBuffer, { name: 'rp-cena.png' });
        const bannerMsg = await thread.send({ files: [attachment] });
        try {
            await bannerMsg.pin();
        } catch (pinErr) {
            console.warn('[rpScene] Nao foi possivel fixar a mensagem de titulo:', pinErr.message);
        }
    } catch (e) {
        console.error('[rpScene] Erro ao enviar banner:', e);
    }

    // Cria a sessao e o botao de encerramento
    let sessionId = null;
    try {
        const sessionParticipants = [
            { discordId: criador.id, displayName: criador.displayName },
            ...participantes.map(p => ({ discordId: p.id, displayName: p.displayName }))
        ];
        sessionId = sessionStore.createSession({
            type: 'rp',
            discordThreadId: thread.id,
            discordChannelId: targetChannel.id,
            discordGuildId: guild.id,
            title: titulo,
            subtitle: subtitulo,
            ambiance: ambientacao,
            scenarioUrl: cenarioUrl || null,
            creatorDiscordId: criador.id,
            creatorIsMaster: isMestre,
            participants: sessionParticipants
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`encerrar_sessao_${sessionId}`)
                .setLabel('Encerrar sessao')
                .setStyle(ButtonStyle.Danger)
        );
        const instrucaoMsg = await thread.send({
            content: 'A sessao foi iniciada. Todas as mensagens de texto deste topico serao salvas. Clique no botao abaixo para encerrar e guardar o historico. (Use `/rp encerrar` tambem.)',
            components: [row]
        });
        // A mensagem de instrucao some apos 15s para manter o topico limpo.
        // (Os banners fixados e o registro da sessao continuam normalmente.)
        deleteAfterDelay(instrucaoMsg, 15000);

        const painelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rp_participantes_${sessionId}`).setLabel(`Participantes (${sessionParticipants.length})`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rp_convidar_${sessionId}`).setLabel('Convidar jogador').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rp_cena_tatica_${sessionId}`).setLabel('Iniciar cena tatica').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rp_ver_ficha_${sessionId}`).setLabel('Ver ficha').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`encerrar_sessao_${sessionId}`).setLabel('Encerrar sessao').setStyle(ButtonStyle.Danger)
        );
        await thread.send({
            content: `**Painel da sessao**\nParticipantes: **${sessionParticipants.length}**\nCena tatica: **nao iniciada**\n\nUse os botoes para consultar jogadores, convidar participantes, abrir uma cena tatica ou encerrar o RP.`,
            components: [painelRow]
        });
    } catch (sessionErr) {
        console.error('[rpScene] Erro ao criar sessao no banco:', sessionErr);
    }

    return { ok: true, threadId: thread.id, sessionId };
}

module.exports = {
    extrairMencoes,
    buscarParticipantes,
    iniciarCenaRp
};
