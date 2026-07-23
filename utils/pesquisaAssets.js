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
const MANIFEST_URL = `${SITE_BASE}/api/public/v1/asset-manifest`;
const MANIFEST_TTL_MS = 60 * 60 * 1000; // 1h

const PESQUISA_ICON_FALLBACKS = {
    'pesquisa/icon-alquimia.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-alquimia.71d45ec6d1.webp',
    'pesquisa/icon-catalisacao.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-catalisacao.35dfc81308.webp',
    'pesquisa/icon-conhecimento.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-conhecimento.b86da00467.webp',
    'pesquisa/icon-dendrologia.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-dendrologia.0ccc815256.webp',
    'pesquisa/icon-engenharia_habilidades.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-engenharia_habilidades.dfcaeb4855.webp',
    'pesquisa/icon-estudo_designios.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-estudo_designios.802012b87e.webp',
    'pesquisa/icon-ferraria.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-ferraria.a353c9a93b.webp',
    'pesquisa/icon-forja_magica.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-forja_magica.706b5e3772.webp',
    'pesquisa/icon-generico.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-generico.714bcac678.webp',
    'pesquisa/icon-geologia_arcana.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-geologia_arcana.5d749493f4.webp',
    'pesquisa/icon-herbologia.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-herbologia.62a4c4a406.webp',
    'pesquisa/icon-metodologia_estudo.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-metodologia_estudo.8c0a73444b.webp',
    'pesquisa/icon-mineracao.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-mineracao.e219632e49.webp',
    'pesquisa/icon-negociacao_mercantil.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-negociacao_mercantil.d0ec12c83d.webp',
    'pesquisa/icon-potencial.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-potencial.d5603cf36b.webp',
    'pesquisa/icon-roleplay.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-roleplay.b9692c9f99.webp',
    'pesquisa/icon-runografia.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-runografia.b6095b7396.webp',
    'pesquisa/icon-sintetizacao.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-sintetizacao.74b456ba42.webp',
    'pesquisa/icon-valoracao_comercial.png': 'https://www.ernas.com.br/assets/static/pesquisa/icon-valoracao_comercial.a433126ac5.webp',
};

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
            console.warn('[pesquisaAssets] Falha ao carregar manifesto da API, usando fallback:', e.message);
            _manifest = PESQUISA_ICON_FALLBACKS;
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
    const mapped = manifest[key] || PESQUISA_ICON_FALLBACKS[key];
    if (mapped) return mapped;
    return `${SITE_BASE}/assets/static/${key}`;
}

module.exports = { assetUrl, loadManifest };
