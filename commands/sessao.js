const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const sessionStore = require('../utils/sessionStore');
const { replyAndDelete } = require('../utils/tempMessage');

const STATUS_CHOICES = [
    { name: 'Ativas', value: 'ativa' },
    { name: 'Encerradas', value: 'encerrada' },
    { name: 'Abandonadas', value: 'abandonada' }
];

const COR_PRINCIPAL = 0xD4AF37;
const MAX_LISTAR = 20;

const TIPO_INFO = {
    rp: { rotulo: 'RP' },
    cena: { rotulo: 'CENA' }
};

const STATUS_INFO = {
    ativa: { rotulo: 'ATIVA' },
    encerrada: { rotulo: 'ENCERRADA' },
    abandonada: { rotulo: 'ABANDONADA' }
};

const data = new SlashCommandBuilder()
    .setName('sessao')
    .setDescription('Consulta e gerenciamento de sessoes de RP/Cena')
    .addSubcommand(sub => sub
        .setName('historico')
        .setDescription('[Mestre/Admin] Exporta o historico de uma sessao (ID completo ou prefixo de 4+ caracteres)')
        .addStringOption(o => o
            .setName('id')
            .setDescription('ID completo da sessao ou prefixo de 4+ caracteres')
            .setRequired(true)))
    .addSubcommand(sub => sub
        .setName('listar')
        .setDescription('[Mestre/Admin] Lista sessoes registradas neste servidor')
        .addStringOption(o => o
            .setName('status')
            .setDescription('Filtrar por status')
            .setRequired(false)
            .addChoices(...STATUS_CHOICES))
        .addUserOption(o => o
            .setName('criador')
            .setDescription('Filtrar por criador')
            .setRequired(false)));

// ---------- Helpers de formatação ----------

function formatData(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDataCurta(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const dia = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return `${dia} ${hora}`;
}

function tipoInfo(type) {
    return TIPO_INFO[type] || { rotulo: String(type || '?').toUpperCase() };
}

function statusInfo(status) {
    return STATUS_INFO[status] || { rotulo: String(status || '?').toUpperCase() };
}

function truncar(texto, max) {
    const t = String(texto || '');
    return t.length > max ? `${t.slice(0, max - 1)}...` : t;
}

function campo(rotulo, valor) {
    return `${String(rotulo + ':').padEnd(15, ' ')} ${valor}`;
}

function linhaSep(ch = '-', len = 60) {
    return ch.repeat(len);
}

// ---------- Listar ----------

function buildListarEmbed(sessions, { status, creator }, totalFiltrado) {
    const embed = new EmbedBuilder()
        .setColor(COR_PRINCIPAL)
        .setTitle('Sessoes registradas')
        .setTimestamp(new Date());

    const filtros = [];
    if (status) filtros.push(`status: ${statusInfo(status).rotulo}`);
    if (creator) filtros.push(`criador: <@${creator.id}>`);

    const desc = [];
    desc.push('Use `/sessao historico id:` com o ID completo ou os primeiros 4+ caracteres do ID.');
    if (filtros.length) desc.push(`Filtros: ${filtros.join(' | ')}`);
    embed.setDescription(desc.join('\n'));

    if (sessions.length === 0) {
        embed.addFields({ name: ' ', value: '*Nenhuma sessao encontrada.*' });
        embed.setFooter({ text: `Total: 0` });
        return embed;
    }

    for (const s of sessions.slice(0, MAX_LISTAR)) {
        const t = tipoInfo(s.type);
        const st = statusInfo(s.status);
        const linhas = [
            campo('Status', st.rotulo),
            campo('ID', s.id),
            campo('Topico', `<#${s.discord_thread_id}>`),
            campo('Mensagens', String(s.message_count)),
            campo('Criada em', formatData(s.created_at)),
            campo('Encerrada em', s.finished_at ? formatData(s.finished_at) : '-'),
            campo('Criador', `<@${s.creator_discord_id}>`)
        ];
        if (s.parent_session_id) {
            linhas.push(campo('Sessao pai', s.parent_session_id));
        }
        embed.addFields({
            name: `[${t.rotulo}] ${truncar(s.title, 70)}`,
            value: linhas.join('\n'),
            inline: false
        });
    }

    const exibidas = Math.min(sessions.length, MAX_LISTAR);
    const rodape = sessions.length > MAX_LISTAR
        ? `Total: ${sessions.length} (exibindo ${exibidas}). Use filtros para reduzir.`
        : `Total: ${sessions.length}`;
    embed.setFooter({ text: rodape });

    return embed;
}

// ---------- Texto do historico (resposta em chat) ----------

function textoHistorico(session, participants, messages) {
    const t = tipoInfo(session.type);
    const st = statusInfo(session.status);
    const L = [];
    L.push('HISTORICO DA SESSAO');
    L.push(linhaSep('=', 60));
    L.push('');
    L.push(campo('Tipo', t.rotulo));
    L.push(campo('Titulo', session.title));
    if (session.subtitle) L.push(campo('Subtitulo', session.subtitle));
    L.push(campo('Status', st.rotulo));
    L.push(campo('ID', session.id));
    L.push(campo('Topico', `<#${session.discord_thread_id}>`));
    L.push(campo('Mensagens', String(messages.length)));
    L.push(campo('Participantes', String(participants.length)));
    L.push(campo('Criada em', formatData(session.created_at)));
    if (session.finished_at) L.push(campo('Encerrada em', formatData(session.finished_at)));
    L.push(campo('Criador', `<@${session.creator_discord_id}>`));
    if (session.finished_by) L.push(campo('Encerrada por', `<@${session.finished_by}>`));
    L.push('');
    L.push('Participantes:');
    if (participants.length === 0) {
        L.push('  (nenhum registrado)');
    } else {
        for (const p of participants) {
            L.push(`  - <@${p.discord_id}> (${p.display_name})`);
        }
    }
    L.push('');
    L.push(linhaSep('-', 60));
    L.push('A transcricao completa esta no arquivo .txt anexado.');
    L.push(linhaSep('=', 60));
    return L.join('\n');
}

// ---------- Transcricao .txt ----------

function renderTranscript(session, participants, messages, childSessions = []) {
    const t = tipoInfo(session.type);
    const st = statusInfo(session.status);
    const L = [];

    L.push(linhaSep('=', 60));
    L.push('  HISTORICO DE SESSAO - TALES OF ERNAS');
    L.push(linhaSep('=', 60));
    L.push(campo('ID', session.id));
    L.push(campo('Tipo', t.rotulo));
    if (session.parent_session_id) L.push(campo('Sessao pai', session.parent_session_id));
    L.push(campo('Titulo', session.title));
    if (session.subtitle) L.push(campo('Subtitulo', session.subtitle));
    if (session.ambiance) L.push(campo('Ambientacao', session.ambiance));
    L.push(campo('Status', st.rotulo));
    L.push(campo('Criador', `<@${session.creator_discord_id}>`));
    L.push(campo('Criada em', formatData(session.created_at)));
    if (session.finished_at) {
        L.push(campo('Encerrada em', formatData(session.finished_at)));
        L.push(campo('Encerrada por', session.finished_by ? `<@${session.finished_by}>` : 'N/A'));
    }
    L.push(campo('Mensagens', String(messages.length)));
    if (childSessions.length) {
        L.push(campo('Cenas filhas', childSessions.map(c => `\`${c.id.slice(0, 8)}\` (${c.title})`).join(', ')));
    }

    L.push('');
    L.push(linhaSep('-', 60));
    L.push(`  PARTICIPANTES (${participants.length})`);
    L.push(linhaSep('-', 60));
    if (participants.length === 0) {
        L.push('  (nenhum participante registrado)');
    } else {
        for (const p of participants) {
            L.push(`  - ${p.display_name}  <@${p.discord_id}>`);
        }
    }

    L.push('');
    L.push(linhaSep('-', 60));
    L.push(`  MENSAGENS (${messages.length})`);
    L.push(linhaSep('-', 60));
    if (messages.length === 0) {
        L.push('  (nenhuma mensagem registrada)');
    } else {
        for (const m of messages) {
            L.push(`[${formatDataCurta(m.sent_at)}] ${m.author_name}:`);
            L.push(`  ${m.content}`);
            L.push('');
        }
    }

    L.push(linhaSep('=', 60));
    L.push('  Fim do historico');
    L.push(linhaSep('=', 60));
    return L.join('\n');
}

// ---------- Execucao ----------

async function execute(interaction) {
    const isMaster = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!isMaster && !isAdmin) {
        return await replyAndDelete(interaction, 'Apenas mestres ou administradores podem usar este comando.', 6000);
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'listar') {
        await interaction.deferReply();
        const status = interaction.options.getString('status');
        const creator = interaction.options.getUser('criador');
        try {
            const sessions = sessionStore.listSessions({
                guildId: interaction.guild.id,
                status: status || undefined,
                creatorId: creator?.id || undefined,
                limit: MAX_LISTAR + 1
            });
            return await interaction.editReply({ embeds: [buildListarEmbed(sessions, { status, creator })] });
        } catch (e) {
            console.error('[sessao listar] Erro:', e);
            return await replyAndDelete(interaction, 'Erro ao listar sessoes.');
        }
    }

    if (sub === 'historico') {
        await interaction.deferReply();
        const rawId = interaction.options.getString('id')?.trim();
        if (!rawId) {
            return await replyAndDelete(interaction, 'Informe o ID da sessao (completo ou prefixo de 4+ caracteres).');
        }

        try {
            let session = sessionStore.getSession(rawId);

            if (!session) {
                const matches = sessionStore.findSessionsByPrefix(rawId, interaction.guild.id);
                if (matches.length === 1) {
                    session = matches[0];
                } else if (matches.length > 1) {
                    const lista = matches.map(m => `  - \`${m.id}\` [${tipoInfo(m.type).rotulo}] ${m.title}`).join('\n');
                    return await replyAndDelete(interaction, `Prefixo ambigo. ${matches.length} sessoes correspondem a "${rawId}". Use o ID completo de uma delas:\n${lista}`, 10000);
                }
            }

            if (!session) {
                return await replyAndDelete(interaction, `Sessao nao encontrada para o ID/prefixo "${rawId}" neste servidor.`);
            }

            if (!sessionStore.canViewHistory(session, interaction.user.id, interaction.member.permissions)) {
                return await replyAndDelete(interaction, 'Voce nao tem permissao para visualizar este historico.');
            }

            const participants = sessionStore.getSessionParticipants(session.id);
            const messages = sessionStore.getSessionHistory(session.id);
            const childSessions = session.type === 'rp' ? sessionStore.listChildSessions(session.id) : [];

            const transcript = renderTranscript(session, participants, messages, childSessions);
            const buffer = Buffer.from(transcript, 'utf-8');
            const filename = `historico_${session.type}_${session.id.slice(0, 8)}.txt`;
            const attachment = new AttachmentBuilder(buffer, { name: filename });

            const resumo = textoHistorico(session, participants, messages);

            return await interaction.editReply({
                content: `${resumo}\nArquivo: **${filename}**`,
                files: [attachment]
            });
        } catch (e) {
            console.error('[sessao historico] Erro:', e);
            return await replyAndDelete(interaction, 'Erro ao exportar historico.');
        }
    }
}

module.exports = { data, execute };
