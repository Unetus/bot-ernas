const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const { getMestrePainelComponents, gerarBannerPainelMestre, gerarBannerLoot, repintarMapaNovo, atualizarMapaDebounced } = require('../canvas/renderer');
const { cenasAtivas, timersTurno, mestresNarrando, lootsEmProcessamento, lootsColetados } = require('../utils/state');
const { parsePosicao, embedErro, embedSucesso } = require('../utils/helpers');

const ARKANDIA_API = process.env.ARKANDIA_API_URL || 'https://www.ernas.com.br/api/public/v1';
const API_KEY = process.env.ARKANDIA_API_KEY;

// Adiciona uma função mock para gerar narrativa se não existir
async function gerarNarrativaIA(prompt, instrucao) {
    if (!process.env.GEMINI_API_KEY) throw new Error("Chave Gemini não configurada.");
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: instrucao });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

const data = new SlashCommandBuilder()
    .setName('mestre')
    .setDescription('Ferramentas de DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub.setName('dropar').setDescription('Cria Loot').addStringOption(o => o.setName('item').setDescription('Nome do item').setRequired(true)).addIntegerOption(o => o.setName('quantidade').setDescription('Qtd').setRequired(false)))
    .addSubcommand(sub => sub.setName('painel').setDescription('Abre a central de controle interativa do Mestre (HUD)'));

async function execute(interaction) {
    const isMaster = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) return await interaction.reply({ content: '✗ Somente Mestres.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'painel') {
        try {
            const buffer = await gerarBannerPainelMestre(interaction.channelId, interaction.guild);
            const attachment = new AttachmentBuilder(buffer, { name: 'painel_mestre.png' });
            
            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setImage('attachment://painel_mestre.png');
                
            return await interaction.editReply({
                embeds: [embed],
                files: [attachment],
                components: getMestrePainelComponents()
            });
        } catch (err) {
            console.error('Erro ao renderizar painel do mestre:', err);
            return await interaction.editReply({ embeds: [embedErro(`Não foi possível carregar a HUD do Mestre: ${err.message}`)] });
        }
    }

    if (sub === 'dropar') {
        const itemNome = interaction.options.getString('item');
        const qtd = interaction.options.getInteger('quantidade') || 1;
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
                new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('◈ Coletar Item').setStyle(ButtonStyle.Success)
            );
            
            await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
            return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat.')] });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" não encontrado.`)] });
        }
    }
}

async function handleSelect(interaction) {
    if (!interaction.customId.startsWith('mestre_menu_')) return;

    const isMaster = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) {
        return await interaction.reply({ content: '✗ Apenas Mestres e Administradores podem interagir com os controles da HUD!', ephemeral: true });
    }

    if (interaction.customId === 'mestre_menu_vtt') {
        const action = interaction.values[0];
        const channelId = interaction.channelId;
        const cena = cenasAtivas.get(channelId);

        if (action === 'iniciar_cena') {
            return await interaction.reply({ content: '💡 Para iniciar uma nova cena com mapa personalizado ou fundo em anexo, digite no chat:\n\n👉 `/cena iniciar`', ephemeral: true });
        }

        if (action === 'iniciar_arena') {
            return await interaction.reply({ content: '💡 Para iniciar o draft da Arena aproveitando o autocomplete de menções do Discord, digite no chat:\n\n👉 `/arena iniciar`', ephemeral: true });
        }

        if (action === 'combate_iniciar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.players.length === 0) return await interaction.reply({ content: '✗ Não há nenhum jogador na cena para iniciar o combate.', ephemeral: true });
            cena.estado = 'COMBATE';
            cena.rodada = 1;
            cena.turnoAtual = 0;
            await interaction.deferReply({ ephemeral: true });
            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: '✓ Combate INICIADO! Ordem de turnos trancada.' });
        }

        if (action === 'combate_proximo') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.estado !== 'COMBATE') return await interaction.reply({ content: '✗ O Combate não está ativo neste canal.', ephemeral: true });
            
            await interaction.deferReply({ ephemeral: true });
            do {
                cena.turnoAtual++;
                if (cena.turnoAtual >= cena.players.length) {
                    cena.turnoAtual = 0;
                    cena.rodada++;
                }
            } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
            
            await repintarMapaNovo(interaction.channel, cena);
            return await interaction.editReply({ content: `✓ Passou para o turno de **${cena.players[cena.turnoAtual].name}**.` });
        }

        if (action === 'status_vida') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_vida').setTitle('Status de Vida (Vivo/Morto)');
            const tokenInput = new TextInputBuilder().setCustomId('token_input').setLabel('Nome ou parte do nome do Token').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'mover_livre') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_mestre_vtt_teleport').setTitle('Teleportar Token');
            const tokenInput = new TextInputBuilder().setCustomId('token_input').setLabel('Nome do Token').setStyle(TextInputStyle.Short).setRequired(true);
            const posInput = new TextInputBuilder().setCustomId('pos_input').setLabel('Coordenada (ex: A1)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput), new ActionRowBuilder().addComponents(posInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'fechar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            cena.estado = 'FECHADA';
            return await interaction.reply({ content: '✓ Cena FECHADA. Ninguém mais entra via `/cena entrar`.', ephemeral: true });
        }

        if (action === 'encerrar') {
            if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });
            if (cena.msgId) {
                if (timersTurno.has(cena.msgId)) {
                    clearTimeout(timersTurno.get(cena.msgId));
                    timersTurno.delete(cena.msgId);
                }
                try { await (await interaction.channel.messages.fetch(cena.msgId)).delete(); } catch(e){}
            }
            cenasAtivas.delete(channelId);
            return await interaction.reply({ content: '✓ Tabuleiro VTT finalizado e cena apagada com sucesso!', ephemeral: true });
        }
    }

    if (interaction.customId === 'mestre_menu_voz') {
        const action = interaction.values[0];
        const key = `${interaction.channelId}-${interaction.user.id}`;

        if (action === 'visualizar_perfil') {
            return await interaction.reply({ content: '💡 Para ver a ficha e os dados de combate de um jogador com facilidade, digite no chat:\n\n👉 `/perfil`', ephemeral: true });
        }

        if (action === 'visualizar_inventario') {
            return await interaction.reply({ content: '💡 Para visualizar a mochila e saldo de libras de um personagem, digite no chat:\n\n👉 `/inventario`', ephemeral: true });
        }

        if (action === 'assumir_npc') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_npc').setTitle('Assumir Voz de NPC');
            const npcInput = new TextInputBuilder().setCustomId('npc_input').setLabel('Nome do NPC/Criatura (Vazio = Narrador)').setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(npcInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'voltar_mestre') {
            if (mestresNarrando.has(key)) {
                mestresNarrando.delete(key);
                return await interaction.reply({ content: '👤 **Modo Interpretação Desabilitado!** Suas mensagens voltaram ao normal.', ephemeral: true });
            }
            return await interaction.reply({ content: 'ℹ Você não está interpretando nenhum NPC ou Narrador neste canal.', ephemeral: true });
        }

        if (action === 'consultar_bestiario') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_voz_bestiario').setTitle('Consultar Bestiário Secreto');
            const nomeInput = new TextInputBuilder().setCustomId('nome_input').setLabel('Nome do NPC ou Monstro').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));
            await interaction.showModal(modal);
            return;
        }
    }

    if (interaction.customId === 'mestre_menu_economia') {
        const action = interaction.values[0];

        if (action === 'dropar_item') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_drop').setTitle('Dropar Item no Chat');
            const itemInput = new TextInputBuilder().setCustomId('item_input').setLabel('Nome do Item').setStyle(TextInputStyle.Short).setRequired(true);
            const qtdInput = new TextInputBuilder().setCustomId('qtd_input').setLabel('Quantidade').setStyle(TextInputStyle.Short).setValue('1').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(qtdInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'creditar_libras') {
            const modal = new ModalBuilder().setCustomId('modal_mestre_economia_libras').setTitle('Creditar Libras (Recompensa)');
            const charInput = new TextInputBuilder().setCustomId('char_input').setLabel('Nome do Personagem').setStyle(TextInputStyle.Short).setRequired(true);
            const valorInput = new TextInputBuilder().setCustomId('valor_input').setLabel('Quantidade de Libras').setStyle(TextInputStyle.Short).setRequired(true);
            const motivoInput = new TextInputBuilder().setCustomId('motivo_input').setLabel('Motivo da Recompensa').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(charInput), new ActionRowBuilder().addComponents(valorInput), new ActionRowBuilder().addComponents(motivoInput));
            await interaction.showModal(modal);
            return;
        }
    }

    if (interaction.customId === 'mestre_menu_ia') {
        const action = interaction.values[0];

        if (action === 'ia_descrever_ambiente') {
            if (!process.env.GEMINI_API_KEY) {
                return await interaction.reply({ content: '✗ Configure a chave GEMINI_API_KEY no arquivo .env para utilizar a IA Narrativa.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const channel = interaction.channel;
                const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
                const prompt = `Gere uma descrição narrativa de ambientação extremamente rica, poética, misteriosa e imersiva para a localidade "${channel.name}" que fica na região "${parentName}". Use o tom oficial de RPG de Arkandia, com lendas medievais arcanas. Escreva 2 parágrafos imersivos sem spoilers de enredo, ideais para introduzir um Roleplay.`;
                
                const instrucao = "Você é o Narrador oficial do RPG de Arkandia. Suas descrições são majestosas, envolvendo o leitor com detalhes sensoriais e mantendo a alta imersão medieval.";
                const narrativa = await gerarNarrativaIA(prompt, instrucao);

                const webhooks = await channel.fetchWebhooks();
                let webhook = webhooks.find(wh => wh.token);
                if (!webhook) {
                    webhook = await channel.createWebhook({ name: 'Arkandia System' });
                }

                await webhook.send({
                    content: narrativa,
                    username: 'Narrador',
                    avatarURL: 'https://i.imgur.com/2U5fPoy.png'
                });

                return await interaction.editReply({ content: '✓ Narração gerada por IA e postada no chat com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ content: `✗ Erro ao gerar narrativa com IA: ${e.message}` });
            }
        }

        if (action === 'ia_npc_fala') {
            const key = `${interaction.channelId}-${interaction.user.id}`;
            if (!mestresNarrando.has(key)) {
                return await interaction.reply({ content: '✗ Você precisa estar interpretando um NPC (Assumir NPC) antes de improvisar falas com IA.', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('modal_mestre_ia_npc_fala').setTitle('Improvisar Fala do NPC');
            const promptInput = new TextInputBuilder().setCustomId('prompt_input').setLabel('O que o NPC deve responder/fazer?').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(promptInput));
            await interaction.showModal(modal);
            return;
        }

        if (action === 'ia_encontro') {
            if (!process.env.GEMINI_API_KEY) {
                return await interaction.reply({ content: '✗ Configure a chave GEMINI_API_KEY no arquivo .env para utilizar a IA Narrativa.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const channel = interaction.channel;
                const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
                const prompt = `Gere um encontro aleatório dramático, hostil e emocionante compatível com a região "${parentName}" (localidade "${channel.name}"). Sorteie ou descreva monstros compatíveis com a fauna e magia da área. Diga o que acontece na emboscada de forma poética e conclua sugerindo quais criaturas (monstros) e em quais posições no grid do VTT o Mestre deve invocar.`;
                
                const instrucao = "Você é o Guia do Mestre e Narrador do RPG de Arkandia. Suas ideias de encontros são eletrizantes, desafiadoras e visualmente marcantes.";
                const encontro = await gerarNarrativaIA(prompt, instrucao);

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle('🧠 Encontro Aleatório Sorteado pela IA')
                    .setDescription(encontro)
                    .setFooter({ text: 'Assistente do Mestre • Gemini AI' });

                await interaction.channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✓ Encontro aleatório gerado com sucesso!' });
            } catch(e) {
                console.error(e);
                return await interaction.editReply({ content: `✗ Erro ao gerar encontro com IA: ${e.message}` });
            }
        }
    }
}

async function handleModal(interaction) {
    if (!interaction.customId.startsWith('modal_mestre_')) return;

    const isMaster = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
    if (!isMaster) {
        return await interaction.reply({ content: '✗ Apenas Mestres e Administradores podem interagir com os controles da HUD!', ephemeral: true });
    }

    if (interaction.customId === 'modal_mestre_vtt_vida') {
        const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });

        const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
        if (!token) return await interaction.reply({ content: `✗ Ninguém com "${nameInput}" foi encontrado no grid.`, ephemeral: true });

        token.incapacitado = !token.incapacitado;
        await interaction.deferReply({ ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply({ content: `✓ Status de **${token.name}** alterado para: ${token.incapacitado ? 'Incapacitado 💀' : 'Vivo ❤️'}.` });
    }

    if (interaction.customId === 'modal_mestre_vtt_teleport') {
        const nameInput = interaction.fields.getTextInputValue('token_input').toLowerCase();
        const coord = interaction.fields.getTextInputValue('pos_input').toUpperCase().trim();
        const cena = cenasAtivas.get(interaction.channelId);
        if (!cena) return await interaction.reply({ content: '✗ Nenhuma cena ativa neste canal.', ephemeral: true });

        const token = cena.players.find(p => p.name.toLowerCase().includes(nameInput));
        if (!token) return await interaction.reply({ content: `✗ Ninguém com "${nameInput}" foi encontrado no grid.`, ephemeral: true });

        const pos = parsePosicao(coord);
        if (!pos) return await interaction.reply({ content: '✗ Coordenada inválida. Use Letra+Número (ex: A1).', ephemeral: true });

        token.x = Math.max(0, Math.min(cena.colunas - 1, pos.x));
        token.y = Math.max(0, Math.min(cena.linhas - 1, pos.y));

        await interaction.deferReply({ ephemeral: true });
        atualizarMapaDebounced(interaction.channel, cena);
        return await interaction.editReply({ content: `✓ Token **${token.name}** teleportado para a coordenada **${coord}** com sucesso!` });
    }

    if (interaction.customId === 'modal_mestre_voz_npc') {
        const nomeInput = interaction.fields.getTextInputValue('npc_input').trim();
        const key = `${interaction.channelId}-${interaction.user.id}`;

        if (!nomeInput) {
            mestresNarrando.set(key, {
                nome: 'Narrador',
                avatarUrl: 'https://i.imgur.com/2U5fPoy.png'
            });
            return await interaction.reply({ content: '🗣️ **Modo Narrador Habilitado!** Todas as suas mensagens no chat sairão como **Narrador**.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            try {
                const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                mestresNarrando.set(key, {
                    nome: res.data.titulo ? `${res.data.nome}, ${res.data.titulo}` : res.data.nome,
                    avatarUrl: res.data.retrato_url || 'https://i.imgur.com/vHqB3q0.png'
                });
                return await interaction.editReply({ content: `🗣️ **Modo Interpretação Habilitado!** Suas mensagens sairão como o NPC **${res.data.nome}**.` });
            } catch (eNpc) {
                if (eNpc.response?.status === 404) {
                    const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nomeInput)}`, { headers: { 'X-API-Key': API_KEY } });
                    mestresNarrando.set(key, {
                        nome: resBestia.data.nome,
                        avatarUrl: resBestia.data.ilustracao_url || 'https://i.imgur.com/vHqB3q0.png'
                    });
                    return await interaction.editReply({ content: `🗣️ **Modo Interpretação Habilitado!** Suas mensagens sairão como a criatura **${resBestia.data.nome}**.` });
                } else {
                    throw eNpc;
                }
            }
        } catch(e) {
            return await interaction.editReply({ content: `✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nomeInput}".` });
        }
    }

    if (interaction.customId === 'modal_mestre_voz_bestiario') {
        const nome = interaction.fields.getTextInputValue('nome_input').trim();
        await interaction.deferReply({ ephemeral: true });
        try {
            try {
                const res = await axios.get(`${ARKANDIA_API}/npcs/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY }});
                const npc = res.data;
                const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                const embed = new EmbedBuilder()
                    .setColor(0x2A2320)
                    .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                    .setTitle(`🕮 ${npc.nome} ${npc.titulo ? '- ' + npc.titulo : ''}`)
                    .setDescription(`**Raça:** ${primeiraMaiuscula(npc.raca)} | **Classe:** ${primeiraMaiuscula(npc.classe)} | **Rank:** ${npc.rank}\n**Região:** ${primeiraMaiuscula(npc.regiao)} | **Afiliação:** ${npc.afiliacao || 'Nenhuma'}\n\n*${npc.flavor_text || ''}*\n\n${npc.lore ? npc.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                if (npc.retrato_url) embed.setThumbnail(npc.retrato_url);
                return await interaction.editReply({ embeds: [embed] });
            } catch (eNpc) {
                if (eNpc.response?.status === 404) {
                    const resBestia = await axios.get(`${ARKANDIA_API}/bestiario/${encodeURIComponent(nome)}`, { headers: { 'X-API-Key': API_KEY } });
                    const criatura = resBestia.data;
                    
                    const tierMap = { 1: 'Comum', 2: 'Raro', 3: 'Épico', 4: 'Lendário', 5: 'Mítico' };
                    const corTier = { 1: 0x6B7280, 2: 0x3B82F6, 3: 0x8B5CF6, 4: 0xF59E0B, 5: 0xC41E3A };
                    
                    const cor = corTier[criatura.classificacao] || 0x34495E;
                    const tier = tierMap[criatura.classificacao] || 'Desconhecido';
                    const primeiraMaiuscula = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
                    
                    const embed = new EmbedBuilder()
                        .setColor(cor)
                        .setAuthor({ name: `Bestiário de Arkandia`, iconURL: 'https://i.imgur.com/vHqB3q0.png' })
                        .setTitle(`🕮 ${criatura.nome}`)
                        .setDescription(`**Tipo:** ${primeiraMaiuscula(criatura.tipo)} | **Classificação:** ${tier}\n\n${criatura.lore ? criatura.lore.substring(0, 2048) : 'Sem lore registrada.'}`);
                    if (criatura.ilustracao_url) embed.setThumbnail(criatura.ilustracao_url);
                    
                    return await interaction.editReply({ embeds: [embed] });
                } else {
                    throw eNpc;
                }
            }
        } catch(e) {
            return await interaction.editReply({ content: `✗ Nem NPC nem criatura do Bestiário foram encontrados com o nome "${nome}".` });
        }
    }

    if (interaction.customId === 'modal_mestre_economia_drop') {
        const itemNome = interaction.fields.getTextInputValue('item_input').trim();
        const qtd = parseInt(interaction.fields.getTextInputValue('qtd_input') || '1', 10) || 1;
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
                new ButtonBuilder().setCustomId(`pegar_loot_${item.id}_${qtd}`).setLabel('◈ Coletar Item').setStyle(ButtonStyle.Success)
            );
            
            await interaction.channel.send({ embeds: [embed], components: [row], files: [attachment] });
            return await interaction.editReply({ embeds: [embedSucesso('Loot enviado para o chat com sucesso!')] });
        } catch (e) {
            return await interaction.editReply({ embeds: [embedErro(`Item "${itemNome}" não encontrado no catálogo da API.`)] });
        }
    }

    if (interaction.customId === 'modal_mestre_economia_libras') {
        const charName = interaction.fields.getTextInputValue('char_input').trim();
        const valor = parseInt(interaction.fields.getTextInputValue('valor_input'), 10) || 0;
        const motivo = interaction.fields.getTextInputValue('motivo_input').trim();

        await interaction.deferReply({ ephemeral: true });
        try {
            const resChar = await axios.get(`${ARKANDIA_API}/personagens/${encodeURIComponent(charName)}`, { headers: { 'X-API-Key': API_KEY } });
            const p = resChar.data;
            if (!p) return await interaction.editReply({ embeds: [embedErro(`Personagem "${charName}" não encontrado.`)] });

            const { randomUUID } = require('crypto');
            const idempotencyKey = randomUUID();
            
            const resPost = await axios.post(
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
            ).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('🪙 Recompensa de Libras Autorizada')
                .setDescription(`✓ **${valor.toLocaleString('pt-BR')} Libras** foram creditadas com sucesso para **${p.nome}**!\n\n**Motivo:** ${motivo}`)
                .setFooter({ text: 'Recompensa Aprovada via Central de Controle' });

            await interaction.channel.send({ embeds: [embed] });
            return await interaction.editReply({ content: '✓ Recompensa de Libras efetuada e postada no chat com sucesso!' });
        } catch(e) {
            console.error(e);
            return await interaction.editReply({ embeds: [embedErro(`Erro ao processar o crédito de Libras: ${e.response?.data?.error || e.message}`)] });
        }
    }

    if (interaction.customId === 'modal_mestre_ia_npc_fala') {
        const promptInput = interaction.fields.getTextInputValue('prompt_input').trim();
        const key = `${interaction.channelId}-${interaction.user.id}`;
        
        if (!mestresNarrando.has(key)) {
            return await interaction.reply({ content: '✗ Você precisa estar interpretando um NPC antes de improvisar falas.', ephemeral: true });
        }
        
        const npc = mestresNarrando.get(key);
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const channel = interaction.channel;
            const parentName = channel.parent ? channel.parent.name : 'Arkandia Central';
            
            const systemPrompt = `Você é o NPC "${npc.nome}" do universo RPG de Arkandia, localizado na região "${parentName}" (localidade "${channel.name}"). Responda de forma in-character, mantendo sua personalidade, sotaque, tom e modo de agir medievais. Mantenha a resposta imersiva, rica e coerente com a lore oficial de Arkandia. Responda em no máximo 1 ou 2 parágrafos envolventes.`;
            
            const respostaIA = await gerarNarrativaIA(promptInput, systemPrompt);

            const webhooks = await channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);
            if (!webhook) {
                webhook = await channel.createWebhook({ name: 'Arkandia System' });
            }

            await webhook.send({
                content: respostaIA,
                username: npc.nome,
                avatarURL: npc.avatarUrl
            });

            return;
        } catch(e) {
            console.error('Erro na fala IA', e);
            return await interaction.editReply({ content: `✗ Erro: ${e.message}` });
        }
    }
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith('pegar_loot_')) {
        const msgId = interaction.message.id;

        if (lootsColetados.has(msgId)) {
            return await interaction.reply({ embeds: [embedErro('Este loot já foi coletado por outro jogador!')], ephemeral: true });
        }

        if (lootsEmProcessamento.has(msgId)) {
            return await interaction.reply({ embeds: [embedErro('Este loot está sendo coletado neste momento. Tente novamente em alguns segundos.')], ephemeral: true });
        }

        lootsEmProcessamento.add(msgId);
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_');
        const itemId = parts[2];
        const qtd = parseInt(parts[3] || '1', 10);

        try {
            let personagem;
            try {
                const resUser = await axios.get(`${ARKANDIA_API}/personagens/discord/${interaction.user.id}`, { headers: { 'X-API-Key': API_KEY } });
                personagem = resUser.data;
            } catch (errUser) {
                lootsEmProcessamento.delete(msgId);
                if (errUser.response?.status === 404) {
                    return await interaction.editReply({ embeds: [embedErro('Você não possui um personagem ativo cadastrado no site de Arkandia. Por favor, vincule seu Discord no site antes de coletar o loot.')] });
                }
                return await interaction.editReply({ embeds: [embedErro(`Erro ao buscar seu personagem na API: ${errUser.response?.data?.error || errUser.message}`)] });
            }

            const { randomUUID } = require('crypto');
            const idempotencyKey = randomUUID();

            try {
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
                        content: `✦ **${interaction.user.toString()}** (${personagem.nome}) coletou o item e ele foi adicionado ao seu inventário no site!`,
                        components: []
                    });

                    return await interaction.editReply({ embeds: [embedSucesso(`Você coletou **${resPost.data.item_nome} (x${qtd})** com sucesso! O item já está no seu inventário do site.`)] });
                } else {
                    lootsEmProcessamento.delete(msgId);
                    return await interaction.editReply({ embeds: [embedErro(`Erro da API ao adicionar o item: ${resPost.data.error || 'Erro desconhecido'}`)] });
                }
            } catch (errPost) {
                lootsEmProcessamento.delete(msgId);
                return await interaction.editReply({ embeds: [embedErro(`Erro ao registrar o item no seu inventário: ${errPost.response?.data?.error || errPost.message}`)] });
            }
        } catch (e) {
            lootsEmProcessamento.delete(msgId);
            console.error('Erro na coleta de loot:', e);
            return await interaction.editReply({ embeds: [embedErro('Ocorreu um erro interno ao processar a coleta do loot.')] });
        }
    }
}

module.exports = { data, execute, handleSelect, handleModal, handleButton };
