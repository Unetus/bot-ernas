const path = require('path');
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');

const { mestresNarrando } = require('./utils/state');
const catalogCache = require('./catalogCache');
const cooldown = require('./cooldown');
const { startSceneCleanup } = require('./utils/sceneCleanup');

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
    }
];
client.once('ready', async () => { 
    console.log(`✓ Bot logado como ${client.user.tag}!`);
    try {
        await catalogCache.preload();
        catalogCache.startAutoRefresh();
    } catch (err) {
        console.error('Erro ao inicializar o catalogCache:', err);
    }
    startSceneCleanup();
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
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

    if (interaction.isStringSelectMenu()) {
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
        for (const [name, command] of client.commands) {
            if (command.handleModal) {
                const handled = await runInteractionHandler(command, 'handleModal', interaction);
                if (handled) return;
            }
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
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
});

client.login(process.env.DISCORD_TOKEN);
