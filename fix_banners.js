const fs = require('fs');
const content = fs.readFileSync('index_old.js', 'utf-8');

const startIndex = content.indexOf('async function loadImage(source)');
const endIndex = content.indexOf('function getUrlRequisicao(interaction)');

let canvasCode = content.substring(startIndex, endIndex);

// Remover formatarTexto
canvasCode = canvasCode.replace(/const formatarTexto[\s\S]*?};\n/, '');
// Remover embedErro
canvasCode = canvasCode.replace(/const embedErro[\s\S]*?;\n/, '');
// Remover embedSucesso
canvasCode = canvasCode.replace(/const embedSucesso[\s\S]*?;\n/, '');

const header = `const { createCanvas, loadImage: _originalLoadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { formatarTexto } = require('../utils/helpers');

`;

const exportsCode = `\nmodule.exports = { loadImage, gerarBannerPerfil, gerarBannerLoot, gerarBannerInventario, gerarBannerRanking, gerarBannerGuilda, gerarBannerPainelMestre };\n`;

fs.writeFileSync('canvas/banners.js', header + canvasCode + exportsCode);
console.log('Fixed banners.js successfully');
