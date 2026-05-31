const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const axios = require('axios');
const { MAPAS_ARENA } = require('../utils/helpers');
const { cenasAtivas, timersTurno, arenasDraft } = require('../utils/state');
const { renderDraft, renderMap, repintarMapaNovo } = require('../canvas/renderer');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

const data = new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Sistema de Arena com Picks/Bans e Timer')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub.setName('iniciar').setDescription('[Mestre] Inicia o draft da Arena')
        .addStringOption(o => o.setName('jogadores').setDescription('Mencione os jogadores (Ex: @J1 @J2)').setRequired(true))
        .addIntegerOption(o => o.setName('tempo_turno').setDescription('Tempo de turno em segundos').setRequired(true)))
    .addSubcommand(sub => sub.setName('encerrar').setDescription('[Mestre] Encerra o combate na arena e remove o mapa'));

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });

    if (sub === 'iniciar') {
        const jogadoresRaw = interaction.options.getString('jogadores');
        const tempoTurno = interaction.options.getInteger('tempo_turno');

        const regex = /<@!?(\d+)>/g;
        const matches = [...jogadoresRaw.matchAll(regex)];
        const capitaesIds = matches.map(m => m[1]).slice(0, 2);

        if (capitaesIds.length < 2) return await interaction.reply({ content: '✗ Você precisa mencionar pelo menos 2 jogadores (@J1 @J2) para serem os capitães do Draft.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor(0x8B0000)
            .setTitle('⚔ Arena - Fase de Picks & Bans')
            .setDescription(`Capitães: <@${capitaesIds[0]}> e <@${capitaesIds[1]}>\nTempo de Turno: ${tempoTurno}s\n\nÉ a vez de <@${capitaesIds[0]}> banir um mapa!`);

        const rows = [];
        let currentRow = new ActionRowBuilder();
        MAPAS_ARENA.forEach((mapa, index) => {
            currentRow.addComponents(new ButtonBuilder().setCustomId(`arena_ban_${mapa.id}`).setLabel(`Banir ${mapa.nome}`).setStyle(ButtonStyle.Danger));
            if (currentRow.components.length === 5 || index === MAPAS_ARENA.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        await interaction.reply({ content: 'Iniciando Draft...', ephemeral: true });
        
        const draftData = {
            capitaes: capitaesIds,
            turnoCapitao: 0,
            mapasRestantes: [...MAPAS_ARENA],
            tempoTurnoMs: tempoTurno * 1000
        };

        const buffer = await renderDraft(draftData);
        const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

        const msg = await interaction.channel.send({ content: `<@${capitaesIds[0]}> <@${capitaesIds[1]}> O Draft da Arena começou!`, embeds: [embed], files: [attachment], components: rows });
        
        arenasDraft.set(msg.id, draftData);

        return;
    }

    if (sub === 'encerrar') {
        const cid = interaction.channelId;
        const cena = cenasAtivas.get(cid);

        if (cena) {
            if (cena.msgId) {
                if (timersTurno.has(cena.msgId)) {
                    clearTimeout(timersTurno.get(cena.msgId));
                    timersTurno.delete(cena.msgId);
                }
                try { 
                    const msg = await interaction.channel.messages.fetch(cena.msgId);
                    await msg.delete(); 
                } catch(e){}
            }
            cenasAtivas.delete(cid);
            return await interaction.reply({ content: '✓ Arena encerrada e o combate foi finalizado com sucesso!' });
        }

        return await interaction.reply({ content: '✗ Nenhuma arena ou combate ativo encontrado neste canal.', ephemeral: true });
    }
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith('arena_ban_')) {
        const draft = arenasDraft.get(interaction.message.id);
        if (!draft) return await interaction.reply({ content: '✗ Este draft já terminou ou expirou.', ephemeral: true });

        const capitaoAtual = draft.capitaes[draft.turnoCapitao];
        if (interaction.user.id !== capitaoAtual) return await interaction.reply({ content: `✗ Não é a sua vez! É a vez de <@${capitaoAtual}>.`, ephemeral: true });

        const mapaId = interaction.customId.replace('arena_ban_', '');
        const mapaIndex = draft.mapasRestantes.findIndex(m => m.id === mapaId);
        if (mapaIndex === -1) return await interaction.reply({ content: '✗ Este mapa já foi banido.', ephemeral: true });

        const mapaBanido = draft.mapasRestantes.splice(mapaIndex, 1)[0];
        draft.turnoCapitao = draft.turnoCapitao === 0 ? 1 : 0;

        if (draft.mapasRestantes.length === 1) {
            const mapaEscolhido = draft.mapasRestantes[0];
            arenasDraft.delete(interaction.message.id);

            const buffer = await renderDraft(draft);
            const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

            const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0])
                .setDescription(`**${mapaBanido.nome}** foi banido.\n\n❖ O mapa escolhido foi: **${mapaEscolhido.nome}**! O Mestre está configurando o mapa...`);
            await interaction.update({ embeds: [embedOriginal], files: [attachment], components: [] });

            const previewId = "preview_" + interaction.message.id;
            let fundoUsado = mapaEscolhido.fundoUrl;
            if (fs.existsSync(fundoUsado.replace('.png', ' - Tabletop Version.png'))) {
                fundoUsado = fundoUsado.replace('.png', ' - Tabletop Version.png');
            }

            cenasAtivas.set(previewId, {
                isPreview: true,
                linhas: mapaEscolhido.linhas,
                colunas: mapaEscolhido.colunas,
                fundoUrl: fundoUsado,
                estado: 'CONFIGURACAO',
                rodada: 1,
                turnoAtual: 0,
                players: [],
                msgId: null,
                tempoTurnoMs: draft.tempoTurnoMs,
                channelIdOriginal: interaction.channelId
            });

            const cena = cenasAtivas.get(previewId);
            
            try {
                for (let i = 0; i < draft.capitaes.length; i++) {
                    const res = await axios.get(`${ARKANDIA_API}/personagens/discord/${draft.capitaes[i]}`, { headers: { 'X-API-Key': API_KEY } }).catch(() => null);
                    if (res && res.data) {
                        cena.players.push({
                            discordId: draft.capitaes[i],
                            name: res.data.nome,
                            avatarUrl: res.data.avatar_url || 'https://i.imgur.com/vHqB3q0.png',
                            x: i === 0 ? 0 : mapaEscolhido.colunas - 1,
                            y: i === 0 ? 0 : mapaEscolhido.linhas - 1,
                            isNpc: false,
                            incapacitado: false
                        });
                    }
                }
            } catch(e) { console.error('Erro ao adicionar jogadores na arena', e); }

            const bufferPreview = await renderMap(cena);
            const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
            
            const rowSetup = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`preview_resize_${previewId}`).setLabel('⌖ Redimensionar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`preview_pos_${previewId}`).setLabel('⌖ Mover Jogadores').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`preview_start_${previewId}`).setLabel('⚔ Iniciar Oficial').setStyle(ButtonStyle.Success)
            );

            await interaction.followUp({ content: `⚙ **Preview do Mestre:** Configure as posições e o tamanho do mapa tabletop antes de enviar aos jogadores.`, files: [attachmentPreview], components: [rowSetup], ephemeral: true });
            return;
        }

        const buffer = await renderDraft(draft);
        const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

        const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0])
            .setDescription(`Capitães: <@${draft.capitaes[0]}> e <@${draft.capitaes[1]}>\n\n**${mapaBanido.nome}** foi banido.\n\nAgora é a vez de <@${draft.capitaes[draft.turnoCapitao]}> banir um mapa!`);
        
        const oldRows = interaction.message.components.map(row => ActionRowBuilder.from(row));
        oldRows.forEach(row => {
            row.components.forEach(btn => {
                if (btn.data.custom_id === interaction.customId) {
                    btn.setDisabled(true);
                }
            });
        });

        await interaction.update({ embeds: [embedOriginal], files: [attachment], components: oldRows });
        return;
    }

    if (interaction.customId.startsWith('preview_resize_')) {
        const previewId = interaction.customId.replace('preview_resize_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_preview_resize_submit_${previewId}`).setTitle('Redimensionar Mapa');
        const colInput = new TextInputBuilder().setCustomId('colunas_input').setLabel('Colunas (Largura)').setStyle(TextInputStyle.Short).setValue(cena.colunas.toString()).setRequired(true);
        const linInput = new TextInputBuilder().setCustomId('linhas_input').setLabel('Linhas (Altura)').setStyle(TextInputStyle.Short).setValue(cena.linhas.toString()).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(colInput), new ActionRowBuilder().addComponents(linInput));
        
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('preview_pos_')) {
        const previewId = interaction.customId.replace('preview_pos_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_preview_pos_submit_${previewId}`).setTitle('Mover Jogadores');
        for (let i = 0; i < Math.min(cena.players.length, 5); i++) {
            const p = cena.players[i];
            const letra = String.fromCharCode(65 + p.x);
            const numero = p.y + 1;
            const posInput = new TextInputBuilder().setCustomId(`pos_input_${i}`).setLabel(`Posição de ${p.name} (ex: A1)`).setStyle(TextInputStyle.Short).setValue(`${letra}${numero}`).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(posInput));
        }
        
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('preview_start_')) {
        const previewId = interaction.customId.replace('preview_start_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        await interaction.deferUpdate();

        cena.isPreview = false;
        cena.estado = 'COMBATE';
        
        const cid = cena.channelIdOriginal;
        cenasAtivas.set(cid, cena);
        cenasAtivas.delete(previewId);

        const channel = interaction.guild.channels.cache.get(cid);
        if (channel) {
            await repintarMapaNovo(channel, cena);
        }

        await interaction.editReply({ content: '✅ Arena inicializada e enviada para o canal oficial!', components: [] });
        return;
    }
}

async function handleModal(interaction) {
    if (interaction.customId.startsWith('modal_preview_resize_submit_')) {
        const previewId = interaction.customId.replace('modal_preview_resize_submit_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });
        
        const colunas = parseInt(interaction.fields.getTextInputValue('colunas_input'), 10);
        const linhas = parseInt(interaction.fields.getTextInputValue('linhas_input'), 10);
        
        if (colunas > 0 && linhas > 0) {
            cena.colunas = colunas;
            cena.linhas = linhas;
            
            for (const p of cena.players) {
                p.x = Math.min(p.x, colunas - 1);
                p.y = Math.min(p.y, linhas - 1);
            }
        }

        await interaction.deferUpdate();
        const bufferPreview = await renderMap(cena);
        const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
        await interaction.editReply({ files: [attachmentPreview] });
        return;
    }

    if (interaction.customId.startsWith('modal_preview_pos_submit_')) {
        const previewId = interaction.customId.replace('modal_preview_pos_submit_', '');
        const cena = cenasAtivas.get(previewId);
        if (!cena) return await interaction.reply({ content: '✗ Preview expirada.', ephemeral: true });

        for (let i = 0; i < cena.players.length; i++) {
            try {
                const coord = interaction.fields.getTextInputValue(`pos_input_${i}`).toUpperCase().trim();
                const letras = coord.match(/[A-Z]+/);
                const numeros = coord.match(/[0-9]+/);
                if (letras && numeros) {
                    let letra = letras[0];
                    let nx = 0;
                    for (let j = 0; j < letra.length; j++) {
                        nx = nx * 26 + (letra.charCodeAt(j) - 64);
                    }
                    nx -= 1;
                    let ny = parseInt(numeros[0], 10) - 1;
                    if (nx >= 0 && ny >= 0 && nx < cena.colunas && ny < cena.linhas) {
                        cena.players[i].x = nx;
                        cena.players[i].y = ny;
                    }
                }
            } catch(e) {}
        }

        await interaction.deferUpdate();
        const bufferPreview = await renderMap(cena);
        const attachmentPreview = new AttachmentBuilder(bufferPreview, { name: 'preview.png' });
        await interaction.editReply({ files: [attachmentPreview] });
        return;
    }
}

module.exports = { data, execute, handleButton, handleModal };
