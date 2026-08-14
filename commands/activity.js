const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Abre o tabuleiro experimental da Discord Activity.'),

    async execute(interaction) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('activity_launch')
                .setLabel('Abrir tabuleiro experimental')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
            content: [
                '**Discord Activity · Homologacao**',
                'Este teste abre um tabuleiro dentro do Discord e nao altera cenas ou sessoes reais.',
                'O estado e temporario e pode ser reiniciado durante a homologacao.'
            ].join('\n'),
            components: [row],
            ephemeral: true
        });
    },

    async handleButton(interaction) {
        if (interaction.customId !== 'activity_launch') return false;

        if (typeof interaction.launchActivity !== 'function') {
            await interaction.reply({
                content: 'Esta versao do bot ainda nao oferece suporte para abrir Activities.',
                ephemeral: true
            });
            return true;
        }

        await interaction.launchActivity();
        return true;
    }
};
