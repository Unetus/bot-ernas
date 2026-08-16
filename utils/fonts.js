/**
 * fonts.js — Registro e padronizacao de fontes para o Canvas (@napi-rs/canvas).
 *
 * Padrao tipografico do bot (alinhado ao site Arkandia):
 *   - Header / Display (titulos, banners, numeros grandes): Cinzel
 *   - Body (textos, paragrafos, descricoes):                  Nunito
 *   - UI (menus, chrome, labels, numeros, botoes):            Baloo 2
 *
 * As fontes vivem em assets/fonts/ e sao registradas via GlobalFonts.
 * Os pesos cobrem o que o site usa em next/font/google (Cinzel 400/600/700/900,
 * Nunito 400/700/800, Baloo 2 500/600/700/800). Mantemos os principais.
 */

const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const FAMILIES = {
    header: 'Cinzel',
    body: 'Nunito',
    ui: 'Baloo 2'
};

const FONT_FILES = [
    ['Cinzel-Regular.ttf', 'Cinzel'],
    ['Cinzel-SemiBold.ttf', 'Cinzel'],
    ['Cinzel-Bold.ttf', 'Cinzel'],
    ['Cinzel-Black.ttf', 'Cinzel'],
    ['Nunito-Regular.ttf', 'Nunito'],
    ['Nunito-Bold.ttf', 'Nunito'],
    ['Nunito-ExtraBold.ttf', 'Nunito'],
    ['Baloo2-Regular.ttf', 'Baloo 2'],
    ['Baloo2-Bold.ttf', 'Baloo 2'],
    ['Baloo2-ExtraBold.ttf', 'Baloo 2']
];

let registered = false;

function registerFonts() {
    if (registered) return true;
    const dir = path.join(__dirname, '..', 'assets', 'fonts');
    let ok = 0;
    for (const [file, family] of FONT_FILES) {
        const p = path.join(dir, file);
        try {
            GlobalFonts.registerFromPath(p, family);
            ok++;
        } catch (e) {
            console.warn(`[fonts] Falha ao registrar ${file}:`, e.message);
        }
    }
    registered = ok > 0;
    console.log(`[fonts] ${ok}/${FONT_FILES.length} fontes registradas.`);
    return registered;
}

function header(px, weight) {
    const w = weight ? `${weight} ` : '';
    return `${w}${px}px "${FAMILIES.header}"`;
}

function body(px, weight) {
    const w = weight ? `${weight} ` : '';
    return `${w}${px}px "${FAMILIES.body}"`;
}

function ui(px, weight) {
    const w = weight ? `${weight} ` : '';
    return `${w}${px}px "${FAMILIES.ui}"`;
}

module.exports = {
    registerFonts,
    FAMILIES,
    header,
    body,
    ui
};
