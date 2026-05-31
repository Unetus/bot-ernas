const path = require('path');
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Collection } = require('discord.js');
const fs = require('fs');

const { mestresNarrando } = require('./utils/state');

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
client.once('ready', async () => { 
    console.log(`✓ Bot logado como ${client.user.tag}!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
});

client.on('interactionCreate', async interaction => {
    console.log(`[DEBUG] Recebeu interacao: ${interaction.type}`);
    if (interaction.isChatInputCommand()) {
        console.log(`[DEBUG] Comando: ${interaction.commandName}`);
        const command = client.commands.get(interaction.commandName);
        if (command) {
            try {
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
                return command.handleButton(interaction);
            }
        }
        
        // Custom generic dynamic logic for commands that use prefix
        if (interaction.customId.startsWith('catalogo_')) {
            const catalogoCmd = client.commands.get('catalogo');
            if (catalogoCmd) return catalogoCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('bestiario_')) {
            const bestiarioCmd = client.commands.get('bestiario');
            if (bestiarioCmd) return bestiarioCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('guild_')) {
            const guildaCmd = client.commands.get('guilda');
            if (guildaCmd) return guildaCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('arena_ban_') || interaction.customId.startsWith('preview_')) {
            const arenaCmd = client.commands.get('arena');
            if (arenaCmd) return arenaCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('inv_cat_') || interaction.customId.startsWith('inv_pag_')) {
            const invCmd = client.commands.get('inventario');
            if (invCmd) return invCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('pegar_loot_')) {
            const mestreCmd = client.commands.get('mestre');
            if (mestreCmd) return mestreCmd.handleButton(interaction);
        }
        if (interaction.customId.startsWith('missao_')) {
            const missaoCmd = client.commands.get('missao');
            if (missaoCmd) return missaoCmd.handleButton(interaction);
        }
        if (interaction.customId === 'move_up' || interaction.customId === 'move_down' || interaction.customId === 'move_left' || interaction.customId === 'move_right' || interaction.customId === 'modal_mover_coord' || interaction.customId === 'passar_turno') {
            const cenaCmd = client.commands.get('cena');
            if (cenaCmd) return cenaCmd.handleButton(interaction);
        }
    }

    if (interaction.isStringSelectMenu()) {
        for (const [name, command] of client.commands) {
            if (command.handleSelect) {
                await command.handleSelect(interaction);
            }
        }
    }

    if (interaction.isModalSubmit()) {
        for (const [name, command] of client.commands) {
            if (command.handleModal) {
                await command.handleModal(interaction);
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
