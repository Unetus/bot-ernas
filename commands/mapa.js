const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), 'mapa_config.json');

function loadMapaConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error('Erro ao ler mapa_config.json:', e);
    }
    return [];
}

function saveMapaConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

const data = new SlashCommandBuilder()
    .setName('mapa')
    .setDescription('Sistema de Navegação do Mundo')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub.setName('painel').setDescription('[Mestre] Cria o Painel de Viagem Rápida neste canal'))
    .addSubcommand(sub => sub.setName('configurar').setDescription('[Mestre] Define quais categorias pertencem ao mapa'));

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);

    if (sub === 'configurar') {
        if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const mapaConfig = loadMapaConfig();
        const canaisTexto = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.parentId);
        const parentIds = new Set(canaisTexto.map(c => c.parentId));
        
        const categorias = interaction.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory && parentIds.has(c.id))
            .sort((a, b) => a.position - b.position)
            .first(25);
        
        const options = categorias.map(c => ({ 
            label: c.name.substring(0, 100), 
            value: c.id, 
            default: mapaConfig.includes(c.id) 
        }));
        
        if (options.length === 0) return await interaction.editReply('✗ Nenhuma região configurada no servidor.');
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('mapa_config_categorias')
            .setPlaceholder('Selecione as categorias do Mapa...')
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options);
            
        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.channel.send({ content: '⚙️ **Configuração do Mapa:** Selecione as categorias que fazem parte da navegação do RPG:', components: [row] });
        return await interaction.editReply('✓ Menu de configuração criado!');
    }

    if (sub === 'painel') {
        if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });
        
        const mapImgPath = path.join(process.cwd(), 'mapa.png');
        if (!fs.existsSync(mapImgPath)) {
            return await interaction.reply({ content: '✗ Arquivo `mapa.png` não encontrado no diretório do bot.', ephemeral: true });
        }
        
        const attachment = new AttachmentBuilder(mapImgPath, { name: 'mapa.png' });
        const embed = new EmbedBuilder()
            .setTitle('❖ Mapa do Mundo')
            .setDescription('Bem-vindo ao portal de viagem! Clique no botão abaixo para explorar as regiões e viajar para o seu destino.\n\n*Nota: Ao viajar, seu personagem sairá da área atual e entrará na nova área (seus canais antigos serão ocultados).*')
            .setColor(0x2B4C7E)
            .setImage('attachment://mapa.png');
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mapa_viajar_btn').setLabel('❖ Iniciar Viagem').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('mapa_sair_btn').setLabel('⏏ Sair do Local Atual').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
        return await interaction.reply({ content: '✓ Painel do Mapa criado!', ephemeral: true });
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('mapa_')) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'mapa_config_categorias') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });
        
        const newConfig = interaction.values;
        saveMapaConfig(newConfig);
        
        return await interaction.update({ content: `✓ **Configuração Salva!**\nO mapa agora exibe ${newConfig.length} região(ões) configurada(s).`, components: [] });
    }

    if (interaction.isButton() && interaction.customId === 'mapa_viajar_btn') {
        const mapaConfig = loadMapaConfig();
        const canaisTexto = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.parentId);
        const parentIds = new Set(canaisTexto.map(c => c.parentId));
        
        const categorias = interaction.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory && parentIds.has(c.id) && (mapaConfig.length === 0 || mapaConfig.includes(c.id)))
            .sort((a, b) => a.position - b.position)
            .first(25);
            
        const options = categorias.map(c => ({ label: `❖ ${c.name.substring(0, 95)}`, value: c.id }));
        if (options.length === 0) return await interaction.reply({ content: '✗ Nenhuma região configurada no servidor.', ephemeral: true });
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('mapa_viajar_select')
            .setPlaceholder('Selecione uma Região...')
            .addOptions(options);
            
        const row = new ActionRowBuilder().addComponents(select);
        
        return await interaction.reply({ content: 'Para onde você deseja viajar? Selecione a região abaixo:', components: [row], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'mapa_viajar_select') {
        const destinoId = interaction.values[0];
        const destino = interaction.guild.channels.cache.get(destinoId);
        
        if (!destino) return await interaction.update({ content: '✗ A região selecionada não existe mais.', components: [] });
        
        await interaction.update({ content: '⧖ Viajando...', components: [] });
        
        const oldChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory);
        for (const [id, ch] of oldChannels) {
            const overwrite = ch.permissionOverwrites.cache.get(interaction.user.id);
            if (overwrite && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
                try { await ch.permissionOverwrites.delete(interaction.user.id); } catch(e) {}
            }
        }
        
        try {
            await destino.permissionOverwrites.create(interaction.user.id, { ViewChannel: true });
            await interaction.editReply({ content: `✓ **Você viajou para a região ${destino.name}!** Todos os locais da área revelaram-se para você na barra lateral.` });
        } catch (e) {
            await interaction.editReply({ content: `✗ Erro ao viajar. Certifique-se que o bot tem permissão de "Gerenciar Canais" e "Gerenciar Cargos" no servidor.` });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'mapa_sair_btn') {
        await interaction.reply({ content: '⧖ Saindo da região...', ephemeral: true });
        
        const oldChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory);
        let removed = 0;
        for (const [id, ch] of oldChannels) {
            const overwrite = ch.permissionOverwrites.cache.get(interaction.user.id);
            if (overwrite && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
                try { 
                    await ch.permissionOverwrites.delete(interaction.user.id); 
                    removed++;
                } catch(e) {}
            }
        }
        
        if (removed > 0) {
            await interaction.editReply({ content: `✓ **Você saiu da área de Roleplay.** A região onde você estava foi ocultada da barra lateral.` });
        } else {
            await interaction.editReply({ content: `ℹ Você não estava em nenhuma região restrita no momento.` });
        }
        return;
    }
}

module.exports = { data, execute, handleButton };
