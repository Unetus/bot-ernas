/**
 * pesquisaAssets.js — Resolve URLs dos assets visuais do site Arkandia.
 *
 * O site serve assets em https://www.ernas.com.br/assets/static/<key>.<hash>.webp
 * e mantém um manifesto (asset-manifest.json) mapeando chaves lógicas → URLs
 * versionadas. Aqui fazemos:
 *   1. Fetch do manifesto (uma vez, cache em memória com TTL de 1h).
 *   2. Resolução key → URL absoluta.
 *   3. Fallback: se a chave não estiver no manifesto, monta a URL padrão.
 *
 * Uso:
 *   const url = await assetUrl('pesquisa/icon-ferraria.png')
 */

const axios = require('axios');
const SITE_BASE = 'https://www.ernas.com.br';
const MANIFEST_URL = `${SITE_BASE}/asset-manifest.json`;
const MANIFEST_TTL_MS = 60 * 60 * 1000; // 1h

let _manifest = null;
let _manifestAt = 0;
let _manifestPromise = null;

async function loadManifest() {
    if (_manifest && Date.now() - _manifestAt < MANIFEST_TTL_MS) return _manifest;
    if (_manifestPromise) return _manifestPromise;
    _manifestPromise = axios.get(MANIFEST_URL, { timeout: 8000 })
        .then((res) => {
            _manifest = (res.data && typeof res.data === 'object') ? res.data : {};
            _manifestAt = Date.now();
            return _manifest;
        })
        .catch((e) => {
            console.warn('[pesquisaAssets] Falha ao carregar manifesto, usando fallback:', e.message);
            _manifest = {};
            _manifestAt = Date.now();
            return _manifest;
        })
        .finally(() => { _manifestPromise = null; });
    return _manifestPromise;
}

/**
 * Resolve a URL absoluta de um asset pela chave lógica.
 * @param {string} key  ex.: 'pesquisa/icon-ferraria.png'
 * @returns {Promise<string>} URL absoluta
 */
async function assetUrl(key) {
    const manifest = await loadManifest();
    const mapped = manifest[key];
    if (mapped) return mapped;
    // Fallback: URL padrao sem hash (o nginx serve o path direto em dev,
    // mas em prod pode nao existir). Mantem o prefixo correto.
    return `${SITE_BASE}/assets/static/${key}`;
}

module.exports = { assetUrl, loadManifest };
