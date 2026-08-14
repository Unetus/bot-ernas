const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder
} = require('discord.js');

function estadoLabel(cena) {
    if (cena.estado === 'COMBATE') return 'EM COMBATE';
    if (cena.estado === 'FECHADA') return 'ENTRADA FECHADA';
    return 'ABERTA';
}

function buildSceneV2Panel(cena) {
    const active = cena.estado === 'COMBATE' ? cena.players[cena.turnoAtual] : null;
    const vivos = cena.players.filter(player => !player.incapacitado).length;
    const incapacitados = cena.players.length - vivos;
    const turnText = active ? `Rodada **${cena.rodada}** · turno de **${active.name}**` : 'A cena ainda não iniciou o combate';

    const panel = new ContainerBuilder()
        .setAccentColor(cena.estado === 'COMBATE' ? 0xB3261E : 0xD4AF37)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# Cena tática'),
            new TextDisplayBuilder().setContent(`## ${cena.nome}\n${cena.descricao || 'Painel de controle da cena.'}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (cena.fundoUrl) {
        panel.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Cenário**\nImagem configurada para esta cena.'))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(cena.fundoUrl))
        );
        panel.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    }

    panel
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Status** · ${estadoLabel(cena)}\n` +
            `**Mapa** · ${cena.colunas} × ${cena.linhas}\n` +
            `**Participantes** · ${cena.players.length} tokens (${vivos} ativos${incapacitados ? `, ${incapacitados} incapacitado(s)` : ''})\n` +
            `**Turnos** · ${turnText}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Use os controles abaixo para entrar, movimentar seu token e acompanhar o turno. Ações de mestre continuam protegidas por permissão.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cena_toggle_entrar').setLabel('Entrar / Sair').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_toggle_aberta').setLabel(cena.estado === 'FECHADA' ? 'Abrir cena' : 'Fechar cena').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_toggle_combate').setLabel(cena.estado === 'COMBATE' ? 'Encerrar combate' : 'Iniciar combate').setStyle(cena.estado === 'COMBATE' ? ButtonStyle.Danger : ButtonStyle.Success)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cena_move_up').setLabel('▲').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_move_down').setLabel('▼').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_move_left').setLabel('◀').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_move_right').setLabel('▶').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cena_modal_mover_coord').setLabel('Coordenada').setStyle(ButtonStyle.Secondary)
            )
        );

    if (cena.estado === 'COMBATE') {
        panel.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cena_passar_turno').setLabel('Passar turno').setStyle(ButtonStyle.Primary)
        ));
    }

    if (cena.sessionId) {
        panel.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`encerrar_sessao_${cena.sessionId}`).setLabel('Encerrar cena').setStyle(ButtonStyle.Danger)
        ));
    }

    panel.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent('Components V2 · painel experimental da cena tática'));
    return panel;
}

async function refreshSceneV2Panel(channel, cena) {
    if (!channel?.messages || !cena) return null;
    const payload = { flags: MessageFlags.IsComponentsV2, components: [buildSceneV2Panel(cena)] };
    if (cena.panelMsgId) {
        try {
            const panelMessage = await channel.messages.fetch(cena.panelMsgId);
            await panelMessage.edit(payload);
            return panelMessage;
        } catch (error) {
            cena.panelMsgId = null;
        }
    }
    const panelMessage = await channel.send(payload);
    cena.panelMsgId = panelMessage.id;
    return panelMessage;
}

async function deleteSceneV2Panel(channel, cena) {
    if (!channel?.messages || !cena?.panelMsgId) return;
    try {
        const panelMessage = await channel.messages.fetch(cena.panelMsgId);
        await panelMessage.delete();
    } catch (error) {}
    cena.panelMsgId = null;
}

module.exports = { buildSceneV2Panel, refreshSceneV2Panel, deleteSceneV2Panel };
