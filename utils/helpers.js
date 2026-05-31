const { EmbedBuilder } = require('discord.js');

const formatarTexto = (str) => {
    if (!str) return '';
    const stringVal = String(str);
    return stringVal.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const embedErro = (msg) => new EmbedBuilder().setColor(0xE74C3C).setTitle('✗ Erro').setDescription(msg);
const embedSucesso = (msg) => new EmbedBuilder().setColor(0x2E5A36).setTitle('✓ Sucesso').setDescription(msg);

const MAPAS_ARENA = [
    { id: 'coliseu', nome: 'Coliseu de Vermécia', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Coliseu de Vermécia.png' },
    { id: 'cordilheira', nome: 'Cordilheira de Canaban', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Cordilheira de Canaban.png' },
    { id: 'floresta', nome: 'Floresta Mágica de Serdin', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Floresta Mágica de Serdin.png' },
    { id: 'planicies', nome: 'Planícies da Eternidade de Kastulle', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Planícies da Eternidade de Kastulle.png' },
    { id: 'patio', nome: 'Pátio da Academia Arcana', colunas: 12, linhas: 10, fundoUrl: './mapas-arena/Pátio da Academia Arcana.png' }
];

function parsePosicao(posStr) {
    if (!posStr) return null;
    const match = posStr.toUpperCase().match(/^([A-Z])(\d+)$/);
    if (!match) return null;
    const colStr = match[1];
    const rowStr = match[2];
    const x = colStr.charCodeAt(0) - 65;
    const y = parseInt(rowStr, 10) - 1;
    if (x < 0 || x > 25 || y < 0 || y > 99) return null;
    return { x, y };
}

module.exports = {
    formatarTexto,
    embedErro,
    embedSucesso,
    MAPAS_ARENA,
    parsePosicao
};
