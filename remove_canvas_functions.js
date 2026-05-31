const fs = require('fs');
let code = fs.readFileSync('d:/bot-discord-rpg/index.js', 'utf8');

const funcsToExtract = [
    'async function gerarBannerPerfil(p) {',
    'async function gerarBannerLoot(item, qtd) {',
    'async function gerarBannerInventario(p, sliceItens, categoria, pag, totalPaginas) {',
    'async function gerarBannerRanking(tipo, dados) {',
    'async function gerarBannerGuilda(g) {',
    'async function gerarBannerPainelMestre(dados) {'
];

for (const signature of funcsToExtract) {
    const startIdx = code.indexOf(signature);
    if (startIdx === -1) {
        console.log('Nao encontrou:', signature);
        continue;
    }
    
    // Find the matching closing brace
    let braceCount = 0;
    let escape = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < code.length; i++) {
        const char = code[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            i++;
            while (i < code.length) {
                if (code[i] === '\\') { i += 2; continue; }
                if (code[i] === quote) break;
                i++;
            }
            continue;
        }
        
        if (char === '{') braceCount++;
        else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIdx = i;
                break;
            }
        }
    }
    
    if (endIdx !== -1) {
        code = code.substring(0, startIdx) + code.substring(endIdx + 1);
        console.log('Removido:', signature);
    }
}

// Ensure the require is there
if (!code.includes("require('./canvas/renderer')")) {
    code = code.replace(
        "const { formatarTexto, embedErro } = require('./utils/helpers');",
        "const { formatarTexto, embedErro } = require('./utils/helpers');\nconst { gerarBannerPerfil, gerarBannerLoot, gerarBannerInventario, gerarBannerRanking, gerarBannerGuilda, gerarBannerPainelMestre } = require('./canvas/renderer');"
    );
}

fs.writeFileSync('d:/bot-discord-rpg/index.js', code);
console.log('Refatoracao de Canvas no index.js concluida!');
