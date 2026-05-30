const { EmbedBuilder } = require('discord.js');

const formatarTexto = (str) => {
    if (!str) return '';
    const stringVal = String(str);
    return stringVal.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const embedErro = (msg) => new EmbedBuilder().setColor(0xE74C3C).setTitle('✗ Erro').setDescription(msg);
const embedSucesso = (msg) => new EmbedBuilder().setColor(0x2E5A36).setTitle('✓ Sucesso').setDescription(msg);

module.exports = {
    formatarTexto,
    embedErro,
    embedSucesso
};
