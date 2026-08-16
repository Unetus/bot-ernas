const path = require('path');
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Collection, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const { mestresNarrando, cenasAtivas, timersTurno, renderTimers } = require('./utils/state');
const catalogCache = require('./catalogCache');
const cooldown = require('./cooldown');
const { startSceneCleanup } = require('./utils/sceneCleanup');
const sessionStore = require('./utils/sessionStore');
const { deleteAfterDelay } = require('./utils/tempMessage');
const { deleteThreadCreationNotice } = require('./utils/threadNotice');
const { deleteSceneV2Panel } = require('./utils/cenaPanelV2');
const { startActivityBridge } = require('./utils/activityBridge');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildWebhooks
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] O comando em ${filePath} nao possui as propriedades "data" ou "execute".`);
    }
}

const commands = client.commands.map(cmd => cmd.data.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerApplicationCommands(applicationId) {
    // Ao habilitar Activities, o Discord cria um PRIMARY_ENTRY_POINT (tipo 4).
    // O bulk overwrite antigo removia qualquer comando que nao estivesse no
    // array local, inclusive esse entry point. Preservamos apenas esse tipo e
    // continuamos substituindo os slash commands normalmente.
    // Se a consulta falhar, abortamos o overwrite. Continuar sem conhecer os
    // comandos atuais poderia apagar o Entry Point criado pelo Discord.
    const existing = await rest.get(Routes.applicationCommands(applicationId));
    const entryPoints = existing
        .filter(command => command.type === 4)
        .map(command => ({
            name: command.name,
            description: command.description,
            type: command.type,
            handler: command.handler,
            integration_types: command.integration_types,
            contexts: command.contexts
        }));

    await rest.put(Routes.applicationCommands(applicationId), {
        body: [...commands, ...entryPoints]
    });
}

function isAcked(interaction) {
    return interaction.replied || interaction.deferred;
}

async function replyWithInteractionError(interaction) {
    const payload = { content: 'Houve um erro ao processar essa interacao.', ephemeral: true };
    try {
        if (isAcked(interaction)) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (err) {
        console.error('Falha ao responder erro de interacao:', err);
    }
}

async function runInteractionHandler(command, handlerName, interaction) {
    const wasAcked = isAcked(interaction);
    try {
        const result = await command[handlerName](interaction);
        return result !== undefined || (!wasAcked && isAcked(interaction));
    } catch (error) {
        console.error(`Erro em ${command.data?.name || 'comando desconhecido'}.${handlerName}:`, error);
        await replyWithInteractionError(interaction);
        return true;
    }
}

const genericButtonRoutes = [
    { commandName: 'catalogo', matches: customId => customId.startsWith('catalogo_') },
    { commandName: 'bestiario', matches: customId => customId.startsWith('bestiario_') },
    { commandName: 'guilda', matches: customId => customId.startsWith('guild_') },
    { commandName: 'arena', matches: customId => customId.startsWith('arena_ban_') || customId.startsWith('preview_') },
    { commandName: 'inventario', matches: customId => customId.startsWith('inv_cat_') || customId.startsWith('inv_pag_') },
    { commandName: 'mestre', matches: customId => customId.startsWith('pegar_loot_') },
    { commandName: 'missao', matches: customId => customId.startsWith('missao_') },
    {
        commandName: 'cena',
        matches: customId => customId === 'move_up'
            || customId === 'move_down'
            || customId === 'move_left'
            || customId === 'move_right'
            || customId === 'modal_mover_coord'
            || customId === 'passar_turno'
    },
    { commandName: 'pesquisa', matches: customId => customId.startsWith('pesq:') || customId.startsWith('reg:') }
];
client.once('ready', async () => { 
    console.log(`✓ Bot logado como ${client.user.tag}!`);
    startActivityBridge(client);
    try {
        sessionStore.init();
        console.log('✓ sessionStore inicializado.');
    } catch (err) {
        console.error('Erro ao inicializar o sessionStore:', err);
    }
    try {
        await catalogCache.preload();
        catalogCache.startAutoRefresh();
    } catch (err) {
        console.error('Erro ao inicializar o catalogCache:', err);
    }
    startSceneCleanup();
    try {
        await registerApplicationCommands(client.user.id);
        console.log('✓ Comandos globais registrados.');
    } catch (error) {
        console.error('Erro ao registrar comandos globais:', error);
    }
});

client.on('interactionCreate', async interaction => {
    console.log(`[DEBUG] Recebeu interacao: ${interaction.type}`);
    if (interaction.isChatInputCommand()) {
        console.log(`[DEBUG] Comando: ${interaction.commandName}`);
        const command = client.commands.get(interaction.commandName);
        if (command) {
            try {
                const cd = cooldown.check(interaction.user.id, interaction.commandName);
                if (cd.onCooldown) {
                    return await interaction.reply({
                        content: `Aguarde ${Math.ceil(cd.remaining / 1000)}s antes de usar /${interaction.commandName} novamente.`,
                        ephemeral: true
                    });
                }
                cooldown.apply(interaction.user.id, interaction.commandName);
                console.log(`[DEBUG] Executando comando ${interaction.commandName}...`);
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Houve um erro ao executar esse comando!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Houve um erro ao executar esse comando!', ephemeral: true });
                }
            }
            return;
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('encerrar_sessao_')) {
            const sessionId = interaction.customId.replace('encerrar_sessao_', '');
            const session = sessionStore.getSession(sessionId);
            if (!session || session.status !== 'ativa') {
                return interaction.reply({ content: 'Esta sessao ja foi encerrada ou nao existe.', ephemeral: true });
            }
            const canFinish = session.creator_discord_id === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!canFinish) {
                return interaction.reply({ content: 'Apenas o criador da sessao ou um administrador pode encerra-la.', ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confirmar_encerrar_sessao_${sessionId}`).setLabel('Confirmar encerramento').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`cancelar_encerrar_sessao_${sessionId}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ content: 'Tem certeza que deseja encerrar esta sessao? O RP sera finalizado e, no caso do RP, a thread sera removida.', components: [row], ephemeral: true });
        }

        if (interaction.customId.startsWith('cancelar_encerrar_sessao_')) {
            return interaction.update({ content: 'Encerramento cancelado.', components: [] });
        }

        const confirmedEncerramento = interaction.customId.startsWith('confirmar_encerrar_sessao_');
        if (interaction.customId.startsWith('encerrar_sessao_') || confirmedEncerramento) {
            const sessionId = confirmedEncerramento
                ? interaction.customId.replace('confirmar_encerrar_sessao_', '')
                : interaction.customId.replace('encerrar_sessao_', '');
            const session = sessionStore.getSession(sessionId);
            if (!session || session.status !== 'ativa') {
                return interaction.reply({ content: 'Esta sessão já foi encerrada ou não existe.', ephemeral: true });
            }
            const canFinish = session.creator_discord_id === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!canFinish) {
                return interaction.reply({ content: 'Apenas o criador da sessão ou um administrador pode encerrá-la.', ephemeral: true });
            }
            try {
                if (session.type === 'rp') {
                    await deleteThreadCreationNotice(interaction.channel?.parent, interaction.channelId, session.title);
                    sessionStore.deleteSession(sessionId);
                    await interaction.reply({ content: 'Sessão encerrada e registros removidos com sucesso!', ephemeral: true });

                    // Deleta o tópico do RP
                    try {
                        if (interaction.channel?.isThread?.() && interaction.channel.delete) {
                            await interaction.channel.delete(`Sessão de RP encerrada por ${interaction.user.tag}`);
                        }
                    } catch (e) {
                        console.warn('[session] Não foi possível deletar o tópico do RP:', e.message);
                    }
                } else if (session.type === 'cena') {
                    sessionStore.finishSession(sessionId, interaction.user.id);
                    await interaction.reply({ content: 'Sessão encerrada e histórico salvo com sucesso!', ephemeral: true });

                    // O tópico é compartilhado com o RP: limpa a cena em memória, não deleta o tópico
                    try {
                        const cena = cenasAtivas.get(session.discord_thread_id);
                        if (cena) {
                            if (timersTurno.has(cena.msgId)) { clearInterval(timersTurno.get(cena.msgId)); timersTurno.delete(cena.msgId); }
                            if (renderTimers.has(cena.msgId)) { clearTimeout(renderTimers.get(cena.msgId)); renderTimers.delete(cena.msgId); }
                            if (cena.msgId) {
                                try { await (await interaction.channel.messages.fetch(cena.msgId)).delete(); } catch {}
                        }
                        if (cena) await deleteSceneV2Panel(interaction.channel, cena);
                        cenasAtivas.delete(session.discord_thread_id);
                        await deleteThreadCreationNotice(interaction.channel?.parent, interaction.channelId, interaction.channel?.name);
                        }
                        const cenaFimMsg = await interaction.channel.send('🛑 **Cena encerrada.** O histórico foi salvo e pode ser consultado com `/sessao historico`.');
                        deleteAfterDelay(cenaFimMsg, 10000);
                    } catch (e) {
                        console.warn('[session] Falha ao limpar cena ao encerrar:', e.message);
                    }
                }
            } catch (err) {
                console.error('[session] Erro ao encerrar sessão:', err);
                await replyWithInteractionError(interaction);
            }
            return;
        }

        for (const [name, command] of client.commands) {
            if (command.handleButton && interaction.customId.startsWith(name + '_')) {
                await runInteractionHandler(command, 'handleButton', interaction);
                return;
            }
        }

        for (const route of genericButtonRoutes) {
            if (!route.matches(interaction.customId)) continue;
            const command = client.commands.get(route.commandName);
            if (command?.handleButton) {
                await runInteractionHandler(command, 'handleButton', interaction);
                return;
            }
        }
    }

    if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
        if (interaction.customId.startsWith('rp_')) {
            const command = client.commands.get('rp');
            if (command?.handleSelect) {
                await runInteractionHandler(command, 'handleSelect', interaction);
                return;
            }
        }

        for (const [name, command] of client.commands) {
            if (command.handleSelect) {
                const handled = await runInteractionHandler(command, 'handleSelect', interaction);
                if (handled) return;
            }
        }

        for (const [name, command] of client.commands) {
            if (command.handleButton && interaction.customId.startsWith(name + '_')) {
                const handled = await runInteractionHandler(command, 'handleButton', interaction);
                if (handled) return;
            }
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('rp_')) {
            const command = client.commands.get('rp');
            if (command?.handleModal) {
                await runInteractionHandler(command, 'handleModal', interaction);
                return;
            }
        }

        for (const [name, command] of client.commands) {
            if (command.handleModal) {
                const handled = await runInteractionHandler(command, 'handleModal', interaction);
                if (handled) return;
            }
        }
    }
});

client.on('threadDelete', async thread => {
    try {
        console.log(`[DEBUG] Tópico deletado: ${thread.id} (${thread.name})`);
        sessionStore.deleteSessionByThreadId(thread.id);

        if (cenasAtivas.has(thread.id)) {
            const cena = cenasAtivas.get(thread.id);
            if (cena) {
                if (timersTurno.has(cena.msgId)) { clearInterval(timersTurno.get(cena.msgId)); timersTurno.delete(cena.msgId); }
                if (renderTimers.has(cena.msgId)) { clearTimeout(renderTimers.get(cena.msgId)); renderTimers.delete(cena.msgId); }
            }
            cenasAtivas.delete(thread.id);
        }
    } catch (e) {
        console.error('[threadDelete] Erro ao limpar registros do tópico deletado:', e);
    }
});

client.on('messageCreate', async message => {
    // Deleta notificacoes automaticas de pin do Discord
    // ("X fixou uma mensagem", MessageType.ChannelPinnedMessage = 6)
    // para manter canais (especialmente de localidade) limpos.
    if (message.type === 6) {
        try { await message.delete(); } catch (e) { /* sem permissao */ }
        return;
    }
    if (message.author.id === client.user.id) return;
    if (!message.guild) return;

    const key = `${message.channel.id}-${message.author.id}`;
    if (mestresNarrando.has(key)) {
        if (message.content.startsWith('/')) return;
        if (!message.content.trim()) return;

        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
            mestresNarrando.delete(key);
            return;
        }

        const botMember = message.guild.members.me;
        const botPermissions = message.channel.permissionsFor(botMember);
        if (!botPermissions?.has(PermissionFlagsBits.ManageMessages) || !botPermissions?.has(PermissionFlagsBits.ManageWebhooks)) {
            console.warn(`[mestre voz] Permissoes insuficientes no canal ${message.channel.id}.`);
            return;
        }

        const npcData = mestresNarrando.get(key);

        try {
            await message.delete().catch(() => null);

            const webhooks = await message.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);
            if (!webhook) {
                webhook = await message.channel.createWebhook({ name: 'Arkandia System' });
            }

            await webhook.send({
                content: message.content,
                username: npcData.nome,
                avatarURL: npcData.avatarUrl
            });
        } catch (e) {
            console.error('Erro na interpretação de fala do Mestre:', e);
        }
    }

    // Persistir mensagens de sessões ativas
    try {
        if (message.author.id !== client.user.id && message.channelId) {
            const activeSession = sessionStore.findActiveSessionByChannel(message.channelId);
            if (activeSession && message.content && message.content.trim()) {
                sessionStore.addMessage(activeSession.id, {
                    discordMessageId: message.id,
                    authorDiscordId: message.author.id,
                    authorName: message.author.tag || message.author.username,
                    content: message.content,
                    sentAt: message.createdAt.toISOString()
                });
            }
        }
    } catch (e) {
        console.error('[session] Erro ao persistir mensagem:', e);
    }
});

client.login(process.env.DISCORD_TOKEN);
