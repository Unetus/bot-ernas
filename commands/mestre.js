const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const axios = require('axios');
const {
    getMestrePainelComponentsModern,
    gerarBannerPainelMestreModern,
    gerarBannerLoot,
    repintarMapaNovo,
    atualizarMapaDebounced
} = require('../canvas/renderer');
const {
    cenasAtivas,
    timersTurno,
    mestresNarrando,
    lootsEmProcessamento,
    lootsColetados
} = require('../utils/state');
const { parsePosicao, embedErro, embedSucesso } = require('../utils/helpers');
const sessionStore = require('../utils/sessionStore');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;
const MAX_LOOT_QUANTITY = 999;
const MAX_LIBRAS_CREDIT = 10000000;

function parsePositiveInt(value, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) return null;
    return parsed;
}

const data = new SlashCommandBuilder()
    .setName('mestre')
    .setDescription('Ferramentas de DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
        sub
            .setName('dropar')
            .setDescription('Cria loot no canal')
            .addStringOption(o => o.setName('item').setDescription('Nome do item').setRequired(true))
            .addIntegerOption(o => o
                .setName('quantidade')
                .setDescription('Quantidade')
                .setMinValue(1)
                .setMaxValue(MAX_LOOT_QUANTITY)
                .setRequired(false))
    )
    .addSubcommand(sub => sub.setName('painel').setDescription('Abre a central do mestre'));

function hasMasterAccess(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

async function execute(interaction) {
    if (!hasMasterAccess(interaction)) {
        return await interaction.reply({ content: 'Somente mestres podem usar este comando.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'painel') {
        try {
            const buffer = await gerarBannerPainelMestreModern(interaction.channelId, interaction.guild);
            const attachment = new AttachmentBuilder(buffer, { name: 'painel_mestre.png' });
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://painel_mestre.png');

            return await interaction.editReply({
                embeds: [embed],
                files: [attachment],
                components: getMestrePainelComponentsModern()
            });
        } catch (err) {
            console.error('Erro ao renderizar painel do mestre:', err);
            return await interaction.editReply({ embeds: [embedErro(`Nao foi possivel carregar a HUD do mestre: ${err.message}`)] });
        }
    }

    if (sub === 'dropar') {
        const itemNome = interaction.options.getString('item');
        const qtd = interaction.options.getInteger('quantidade') || 1;
        if (!parsePositiveInt(qtd, MAX_LOOT_QUANTITY)) {
            return await interaction.editReply({ embeds: [embedErro(`A quantidade precisa estar entre 1 e ${MAX_LOOT_QUANTITY}.`)] });
        }
        try {
            const res = await axios.get(`${ARKANDIA_API}/itens/${encodeURIComponent(itemNome)}`, { headers: { 'X-API-Key': API_KEY } });
            const item = res.data;
            const buffer = await gerarBannerLoot(item, qtd);
            const attachment = new AttachmentBuilder(buffer, { name: 'loot.png' });
            const raridades = { comum: 0x8B949E, raro: 0x3498DB, epico: 0x8B5CF6, lendario: 0xF59E0B, mitico: 0xE74C3C };
            const embed = new EmbedBuilder()
                .setColor(raridades[item.raridade?.toLowerCase()] || 0xB8860B)
                .setImage('attachment://loot.png');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('Coletar Item').setStyle(ButtonStyle.Success)
            );

            await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
            return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat.')] });
        } catch {
            return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" nao encontrado.`)] });
        }
    }
}

async function handleSelect(interaction) {
    if (!interaction.customId.startsWith('mestre_menu_')) return;
    if (!hasMasterAccess(interaction)) {
        return await interaction.reply({ content: 'Apenas mestres podem usar estes controles.', ephemeral: true });
    }

    if (interaction.customId === 'mestre_menu_vtt') {
        const action = interaction.values[0];
        const channelId = interaction.channelId;
        const cena = cenasAtivas.get(channelId);

        if (action === 'iniciar_cena') {
            return await interaction.reply({ content: 'Use `/cena iniciar` no chat para abrir uma nova cena tática.', ephemeral: true });
        }

        if (action === 'iniciar_arena') {
            return await interaction.reply({ content: 'Use `/arena iniciar` no chat para abrir o draft da arena.', ephemeral: true });
        }

        if (action === 'combate_iniciar') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.players.length === 0) return await interaction.reply({ content: 'Nao ha tokens suficientes para iniciar o combate.', ephemeral: true });
            cena.estado = 'COMBATE';
            cena.rodada = 1;
            cena.turnoAtual = 0;
            await interaction.deferReply({ ephemeral: true });
            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: 'Combate iniciado. A ordem de turnos foi travada.' });
        }

        if (action === 'combate_proximo') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.estado !== 'COMBATE') return await interaction.reply({ content: 'O combate nao esta ativo neste canal.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            do {
                cena.turnoAtual++;
                if (cena.turnoAtual >= cena.players.length) {
                    cena.turnoAtual = 0;
                    cena.rodada++;
                }
            } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));

            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: `Turno passado para ${cena.players[cena.turnoAtual].name}.` });
        }

        if (action === 'status_vida') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_vida').setTitle('Alterar Status de Vida');
            const tokenInput = new TextInputBuilder()
                .setCustomId('token_input')
                .setLabel('Nome ou parte do nome do token')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'mover_livre') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_teleport').setTitle('Mover Token');
            const tokenInput = new TextInputBuilder().setCustomId('token_input').setLabel('Nome do token').setStyle(TextInputStyle.Short).setRequired(true);
            const posInput = new TextInputBuilder().setCustomId('pos_input').setLabel('Coordenada (ex: A1)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput), new ActionRowBuilder().addComponents(posInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'fechar') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            cena.estado = 'FECHADA';
            return await interaction.reply({ content: 'Cena fechada. Novas entradas foram bloqueadas.', ephemeral: true });
        }

        if (action === 'encerrar') {
            if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.msgId) {
                if (timersTurno.has(cena.msgId)) {
                    clearTimeout(timersTurno.get(cena.msgId));
                    timersTurno.delete(cena.msgId);
                }
                try {
                    await (await interaction.channel.messages.fetch(cena.msgId)).delete();
                } catch {}
            }
            try {
                const session = sessionStore.findActiveSessionByChannel(channelId);
                if (session && session.type === 'cena') {
                    sessionStore.finishSession(session.id, interaction.user.id);
                }
            } catch (e) {
                console.error('[mestre encerrar] Erro ao finalizar sessao da cena:', e);
            }
            cenasAtivas.delete(channelId);
            return await interaction.reply({ content: 'Cena encerrada com sucesso.', ephemeral: true });
        }
    }

    if (interaction.customId === 'mestre_menu_voz') {
        const action = interaction.values[0];
        const key = `${interaction.channelId}-${interaction.user.id}`;

        if (action === 'visualizar_perfil') {
            return await interaction.reply({ content: 'Use `/perfil` no chat para abrir a ficha de um jogador.', ephemeral: true });
        }

        if (action === 'visualizar_inventario') {
            return await interaction.reply({ content: 'Use `/inventario` no chat para abrir a mochila de um jogador.', ephemeral: true });
        }

        if (action === 'assumir_npc') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_npc').setTitle('Assumir Voz');
            const npcInput = new TextInputBuilder()
                .setCustomId('npc_input')
                .setLabel('Nome do NPC ou criatura (vazio = Narrador)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(npcInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'voltar_mestre') {
            if (mestresNarrando.has(key)) {
                mestresNarrando.delete(key);
                return await interaction.reply({ content: 'Voz desativada. Suas mensagens voltaram ao normal.', ephemeral: true });
            }
            return await interaction.reply({ content: 'Nenhuma identidade ativa neste canal.', ephemeral: true });
        }

        if (action === 'consultar_bestiario') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_bestiario').setTitle('Consultar Bestiario');
            const nomeInput = new TextInputBuilder().setCustomId('nome_input').setLabel('Nome do NPC ou monstro').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'historico_sessao') {
            try {
                const sessions = sessionStore.listSessions({
                    guildId: interaction.guild.id,
                    status: 'ativa',
                    limit: 10
                }).filter(s => s.discord_thread_id === interaction.channelId || s.discord_channel_id === interaction.channelId);
                let content = 'Use `/sessao historico id:<id>` para exportar o historico completo de uma sessao.\n\n';
                if (sessions.length === 0) {
                    content += 'Nenhuma sessao ativa registrada neste canal.';
                } else {
                    content += '**Sessoes ativas neste canal:**\n' + sessions.map(s => `\`${s.id}\` — ${s.type.toUpperCase()} — ${s.title}`).join('\n');
                }
                return await interaction.reply({ content, ephemeral: true });
            } catch (e) {
                console.error('[mestre historico_sessao] Erro:', e);
                return await interaction.reply({ content: 'Erro ao consultar sessoes.', ephemeral: true });
            }
        }
    }

    if (interaction.customId === 'mestre_menu_economia') {
        const action = interaction.values[0];

        if (action === 'dropar_item') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_drop').setTitle('Dropar Item');
            const itemInput = new TextInputBuilder().setCustomId('item_input').setLabel('Nome do item').setStyle(TextInputStyle.Short).setRequired(true);
            const qtdInput = new TextInputBuilder().setCustomId('qtd_input').setLabel('Quantidade').setStyle(TextInputStyle.Short).setValue('1').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(qtdInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'creditar_libras') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_libras').setTitle('Creditar Libras');
            const charInput = new TextInputBuilder().setCustomId('char_input').setLabel('Nome do personagem').setStyle(TextInputStyle.Short).setRequired(true);
            const valorInput = new TextInputBuilder().setCustomId('valor_input').setLabel('Quantidade de libras').setStyle(TextInputStyle.Short).setRequired(true);
            const motivoInput = new TextInputBuilder().setCustomId('motivo_input').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(charInput),
                new ActionRowBuilder().addComponents(valorInput),
                new ActionRowBuilder().addComponents(motivoInput)
            );
            await interaction.showModal(modal);
            return;
        }
    }
}

async function handleModal(interaction) {
    if (!interaction.customId.startsWith('modal_mestre_')) return;
    if (!hasMasterAccess(interaction)) {
        return await interaction.reply({ content: 'Apenas mestres podem usar estes controles.', ephemeral: true });
    }

    if (interaction.customId === 'modal_mestre_vtt_vida') {
        const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });

        const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
        if (!token) return await interaction.reply({ content: `Nenhum token com "${nameInput}" foi encontrado.`, ephemeral: true });

        token.incapacitado = !token.incapacitado;
        await interaction.deferReply({ ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply({ content: `Status de ${token.name} alterado com sucesso.` });
    }

    if (interaction.customId === 'modal_mestre_vtt_teleport') {
        const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
        const coord = interaction.fields.getTextInputValue('pos_input').toUpperCase().trim();
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: 'Nenhuma cena ativa neste canal.', ephemeral: true });

        const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
        if (!token) return await interaction.reply({ content: `Nenhum token com "${nameInput}" foi encontrado.`, ephemeral: true });

        const pos = parsePosicao(coord);
        if (!pos) return await interaction.reply({ content: 'Coordenada invalida. Use o formato A1.', ephemeral: true });

        token.x = Math.max(0, Math.min(cena.colunas - 1, pos.x));
        token.y = Math.max(0, Math.min(cena.linhas - 1, pos.y));
        await interaction.deferReply({ ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply({ content: `Token ${token.name} movido para ${coord}.` });
    }

    if (interaction.customId === 'modal_mestre_voz_npc') {
        const nomeInput = interaction.fields.getTextInputValue('npc_input').trim();
        const key = `${interaction.channelId}-${interaction.user.id}`;

        if (!nomeInput) {
            mestresNarrando.set(key, {
                nome: 'Narrador',
                avatarUrl: 'https://i.imgur.com/2U5fPoy.png'
            });
            return await interaction.reply({ content: 'Modo narrador ativado neste canal.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            try {
                const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                mestresNarrando.set(key, {
                    nome: res.data.titulo ? `${res.data.nome}, ${res.data.titulo}` : res.data.nome,
                    avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png'
                });
                return await interaction.editReply({ content: `Voz ativada como ${res.data.nome}.` });
            } catch (eNpc) {
                if (eNpc.response?.status === 404) {
                    const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                    mestresNarrando.set(key, {
                        nome: resBestia.data.nome,
                        avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png'
                    });
                    return await interaction.editReply({ content: `Voz ativada como ${resBestia.data.nome}.` });
                }
                throw eNpc;
            }
        } catch {
            return await interaction.editReply({ content: `Nenhum NPC ou criatura foi encontrado com o nome "${nomeInput}".` });
        }
    }

    if (interaction.customId === 'modal_mestre_voz_bestiario') {
        const nome = interaction.fields.getTextInputValue('nome_input').trim();
        await interaction.deferReply({ ephemeral: true });
        try {
            try {
                const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY } });
                const npc = res.data;
                const cap = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                const embed = new EmbedBuilder()
                    .setColor(0x2A2320)
                    .setTitle(`${npc.nome}${npc.titulo ? ` - ${npc.titulo}` : ''}`)
                    .setDescription(`**Raca:** ${cap(npc.raca)} | **Classe:** ${cap(npc.classe)} | **Rank:** ${npc.rank}\n**Regiao:** ${cap(npc.regiao)} | **Afiliacao:** ${npc.afiliacao || 'Nenhuma'}\n\n*${npc.flavor_text || ''}*\n\n${npc.lore ? npc.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                if (npc.retrato_url) embed.setThumbnail(npc.retrato_url);
                return await interaction.editReply({ embeds: [embed] });
            } catch (eNpc) {
                if (eNpc.response?.status === 404) {
                    const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY } });
                    const criatura = resBestia.data;
                    const tierMap = { 1: 'Comum', 2: 'Raro', 3: 'Epico', 4: 'Lendario', 5: 'Mitico' };
                    const corTier = { 1: 0x6B7280, 2: 0x3B82F6, 3: 0x8B5CF6, 4: 0xF59E0B, 5: 0xC41E3A };
                    const embed = new EmbedBuilder()
                        .setColor(corTier[criatura.classificacao] || 0x34495E)
                        .setTitle(criatura.nome)
                        .setDescription(`**Tipo:** ${criatura.tipo || 'Desconhecido'} | **Classificacao:** ${tierMap[criatura.classificacao] || 'Desconhecido'}\n\n${criatura.lore ? criatura.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                    if (criatura.ilustracao_url) embed.setThumbnail(criatura.ilustracao_url);
                    return await interaction.editReply({ embeds: [embed] });
                }
                throw eNpc;
            }
        } catch {
            return await interaction.editReply({ content: `Nenhum NPC ou criatura foi encontrado com o nome "${nome}".` });
        }
    }

    if (interaction.customId === 'modal_mestre_economia_drop') {
        const itemNome = interaction.fields.getTextInputValue('item_input').trim();
        const qtd = parsePositiveInt(interaction.fields.getTextInputValue('qtd_input') || '1', MAX_LOOT_QUANTITY);
        if (!qtd) {
            return await interaction.reply({ embeds: [embedErro(`A quantidade precisa estar entre 1 e ${MAX_LOOT_QUANTITY}.`)], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await axios.get(`${ARKANDIA_API}/itens/${encodeURIComponent(itemNome)}`, { headers: { 'X-API-Key': API_KEY } });
            const item = res.data;
            const buffer = await gerarBannerLoot(item, qtd);
            const attachment = new AttachmentBuilder(buffer, { name: 'loot.png' });
            const raridades = { comum: 0x8B949E, raro: 0x3498DB, epico: 0x8B5CF6, lendario: 0xF59E0B, mitico: 0xE74C3C };
            const embed = new EmbedBuilder()
                .setColor(raridades[item.raridade?.toLowerCase()] || 0xB8860B)
                .setImage('attachment://loot.png');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('Coletar Item').setStyle(ButtonStyle.Success)
            );

            await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
            return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat.')] });
        } catch {
            return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" nao encontrado no catalogo.`)] });
        }
    }

    if (interaction.customId === 'modal_mestre_economia_libras') {
        const charName = interaction.fields.getTextInputValue('char_input').trim();
        const valor = parsePositiveInt(interaction.fields.getTextInputValue('valor_input'), MAX_LIBRAS_CREDIT);
        const motivo = interaction.fields.getTextInputValue('motivo_input').trim();
        if (!valor) {
            return await interaction.reply({ embeds: [embedErro(`Informe um valor de libras entre 1 e ${MAX_LIBRAS_CREDIT.toLocaleString('pt-BR')}.`)], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const resChar = await axios.get(`${ARKANDIA_API}/personagens/${encodeURIComponent(charName)}`, { headers: { 'X-API-Key': API_KEY } });
            const p = resChar.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro(`Personagem "${charName}" nao encontrado.`)] });

            const { randomUUID } = require('crypto');
            const idempotencyKey = randomUUID();
            await axios.post(
                `${ARKANDIA_API}/personagens/${p.id}/libras/creditar`,
                { quantidade: valor, motivo },
                {
                    headers: {
                        'X-API-Key': API_KEY,
                        'Content-Type': 'application/json',
                        'Idempotency-Key': idempotencyKey,
                        'User-Agent': 'rpg-bot/1.0'
                    }
                }
            );

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('Recompensa de Libras')
                .setDescription(`**${valor.toLocaleString('pt-BR')} libras** foram creditadas para **${p.nome}**.\n\n**Motivo:** ${motivo}`);
            await interaction.channel.send({ embeds: [embed] });
            return await interaction.editReply({ content: 'Recompensa registrada com sucesso.' });
        } catch (e) {
            console.error(e);
            return await interaction.editReply({ embeds: [embedErro(`Erro ao creditar libras: ${e.response?.data?.error || e.message}`)] });
        }
    }
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith('pegar_loot_')) return;

    const msgId = interaction.message.id;
    if (lootsColetados.has(msgId)) {
        return await interaction.reply({ embeds: [embedErro('Este loot ja foi coletado por outro jogador.')], ephemeral: true });
    }
    if (lootsEmProcessamento.has(msgId)) {
        return await interaction.reply({ embeds: [embedErro('Este loot esta sendo processado neste momento.')], ephemeral: true });
    }

    lootsEmProcessamento.add(msgId);
    await interaction.deferReply({ ephemeral: true });
    const parts = interaction.customId.split('_');
    const itemId = parts[2];
    const qtd = parsePositiveInt(parts[3] || '1', MAX_LOOT_QUANTITY);
    if (!qtd) {
        lootsEmProcessamento.delete(msgId);
        return await interaction.editReply({ embeds: [embedErro('A quantidade deste loot e invalida. Peça para o mestre gerar o drop novamente.')] });
    }

    try {
        let personagem;
        try {
            const resUser = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
            personagem = resUser.data;
        } catch (errUser) {
            lootsEmProcessamento.delete(msgId);
            if (errUser.response?.status === 404) {
                return await interaction.editReply({ embeds: [embedErro('Voce nao possui um personagem ativo vinculado ao Discord.')] });
            }
            return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar seu personagem: ${errUser.response?.data?.error || errUser.message}`)] });
        }

        const { randomUUID } = require('crypto');
        const idempotencyKey = randomUUID();
        const resPost = await axios.post(
            `${ARKANDIA_API}/personagens/${personagem.id}/inventario/adicionar`,
            { item_id: itemId, quantidade: qtd },
            {
                headers: {
                    'X-API-Key': API_KEY,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                    'User-Agent': 'rpg-bot/1.0'
                }
            }
        );

        if (resPost.data.ok) {
            lootsColetados.add(msgId);
            lootsEmProcessamento.delete(msgId);
            await interaction.message.edit({
                content: `${interaction.user.toString()} (${personagem.nome}) coletou o loot.`,
                components: []
            });
            return await interaction.editReply({ embeds: [embedSucesso(`Item coletado com sucesso: ${resPost.data.item_nome} x${qtd}.`)] });
        }

        lootsEmProcessamento.delete(msgId);
        return await interaction.editReply({ embeds: [embedErro(`Erro da API ao adicionar o item: ${resPost.data.error || 'erro desconhecido'}`)] });
    } catch (e) {
        lootsEmProcessamento.delete(msgId);
        console.error('Erro na coleta de loot:', e);
        return await interaction.editReply({ embeds: [embedErro('Ocorreu um erro ao processar a coleta do loot.')] });
    }
}

module.exports = { data, execute, handleSelect, handleModal, handleButton };
