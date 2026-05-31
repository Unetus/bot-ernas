const fs = require('fs');
const path = require('path');
let code = fs.readFileSync('d:/bot-discord-rpg/index.js', 'utf8');

// 1. Add Collection to requires
if (!code.includes('Collection')) {
    code = code.replace(
        "const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');",
        "const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, Collection } = require('discord.js');"
    );
}

// 2. Add client.commands mapping and dynamic reading
const dynamicLoading = `
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(\`[WARNING] O comando em \${filePath} nao possui as propriedades "data" ou "execute".\`);
    }
}
`;

if (!code.includes('client.commands = new Collection();')) {
    code = code.replace('const ARKANDIA_API', dynamicLoading + '\nconst ARKANDIA_API');
}

// 3. Rename hardcoded commands array to legacyCommands and merge with dynamic commands
code = code.replace('const commands = [', 'const legacyCommands = [');
code = code.replace(
    '].map(command => command.toJSON());', 
    '].map(command => command.toJSON());\n\nconst commands = [...legacyCommands, ...client.commands.map(cmd => cmd.data.toJSON())];'
);

// 4. Update the interaction router
const interactionLogic = `
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) {
            try {
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

        // LEGACY COMMANDS ROUTER
        if (interaction.commandName === 'perfil') {`;

if (!code.includes('client.commands.get(interaction.commandName)')) {
    code = code.replace(
        "if (interaction.isChatInputCommand()) {\r\n        if (interaction.commandName === 'perfil') {",
        interactionLogic
    );
    // Support non-CRLF replacing just in case
    code = code.replace(
        "if (interaction.isChatInputCommand()) {\n        if (interaction.commandName === 'perfil') {",
        interactionLogic
    );
}

// 5. Route buttons dynamically if the command exports handleButton
const buttonRouterLogic = `
    if (interaction.isButton()) {
        // Dynamic Button Routing
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
`;
if (!code.includes('Dynamic Button Routing')) {
    code = code.replace('if (interaction.isButton()) {', buttonRouterLogic);
}

// 6. Route select menus dynamically
const selectRouterLogic = `
    if (interaction.isStringSelectMenu()) {
        // Dynamic Select Routing
        for (const [name, command] of client.commands) {
            if (command.handleSelect && interaction.customId.startsWith('select_' + name)) {
                return command.handleSelect(interaction);
            }
        }

        if (interaction.customId.startsWith('select_catalogo_')) {
            const catalogoCmd = client.commands.get('catalogo');
            if (catalogoCmd) return catalogoCmd.handleSelect(interaction);
        }
        if (interaction.customId === 'select_bestiario_mob') {
            const bestiarioCmd = client.commands.get('bestiario');
            if (bestiarioCmd) return bestiarioCmd.handleSelect(interaction);
        }
`;
if (!code.includes('Dynamic Select Routing')) {
    code = code.replace('if (interaction.isStringSelectMenu()) {', selectRouterLogic);
}

// 7. Remove the manual reference to `catalogo`
code = code.replace("const commandCatalogo = require('./commands/catalogo');", "");
code = code.replace("return commandCatalogo.handleButton(interaction);", "return; // handled by dynamic router");
code = code.replace("return commandCatalogo.handleSelect(interaction);", "return; // handled by dynamic router");

// Remove hardcoded catalogo execution
const oldCatalogoExecution = `        // =====================================
        // COMANDO /catalogo (Fase 3)
        // =====================================
        if (interaction.commandName === 'catalogo') {
            return commandCatalogo.execute(interaction);
        }`;

code = code.replace(oldCatalogoExecution, "");

fs.writeFileSync('d:/bot-discord-rpg/index.js', code);
console.log('index.js successfully refactored for Autoloader.');
