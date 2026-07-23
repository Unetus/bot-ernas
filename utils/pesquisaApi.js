/**
 * pesquisaApi.js — Cliente HTTP para os endpoints de Pesquisa/Registro do site.
 *
 * Endpoints expostos em /api/public/v1/personagens/discord/[discord_id]/...
 * (criados na Fase 1). Reusa o apiClient centralizado (X-API-Key + Idempotency-Key
 * automáticos + retry em 429).
 *
 * Endpoints consumidos:
 *   GET  /personagens/discord/[id]/pesquisa           (scope: pesquisa:read)
 *   POST /personagens/discord/[id]/pesquisa/iniciar  (scope: pesquisa:write)
 *   POST /personagens/discord/[id]/pesquisa/coletar  (scope: pesquisa:write)
 *   GET  /personagens/discord/[id]/registro           (scope: registro:read)
 *   POST /personagens/discord/[id]/registro/iniciar  (scope: registro:write)
 *   POST /personagens/discord/[id]/registro/coletar  (scope: registro:write)
 *   GET  /personagens/discord/[id]/saldo              (scope: conhecimento:read)
 */

const apiClient = require('../apiClient');

const TIMEOUT_PESQUISA = 12000; // 12s (operações podem envolver RPC + banco)

function path(discordId, suffix) {
    return `/personagens/discord/${discordId}${suffix}`;
}

async function getPesquisa(discordId) {
    const { data } = await apiClient.get(path(discordId, '/pesquisa'), { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function postPesquisaIniciar(discordId, body) {
    const { data } = await apiClient.post(path(discordId, '/pesquisa/iniciar'), body, { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function postPesquisaColetar(discordId, id) {
    const { data } = await apiClient.post(path(discordId, '/pesquisa/coletar'), { id }, { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function getRegistro(discordId) {
    const { data } = await apiClient.get(path(discordId, '/registro'), { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function postRegistroIniciar(discordId, body) {
    const { data } = await apiClient.post(path(discordId, '/registro/iniciar'), body, { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function postRegistroColetar(discordId, id) {
    const { data } = await apiClient.post(path(discordId, '/registro/coletar'), { id }, { timeout: TIMEOUT_PESQUISA });
    return data;
}

async function getSaldo(discordId) {
    const { data } = await apiClient.get(path(discordId, '/saldo'), { timeout: TIMEOUT_PESQUISA });
    return data;
}

/**
 * Cache curto por personagem (15s) para evitar bater o rate-limit global quando
 * muitos jogadores consultam /pesquisa status.
 */
const _statusCache = new Map();
const STATUS_TTL_MS = 15000;

async function getPesquisaCached(discordId) {
    const cached = _statusCache.get(discordId);
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;
    const value = await getPesquisa(discordId);
    _statusCache.set(discordId, { at: Date.now(), value });
    return value;
}

async function getRegistroCached(discordId) {
    const cached = _statusCache.get(discordId + ':registro');
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;
    const value = await getRegistro(discordId);
    _statusCache.set(discordId + ':registro', { at: Date.now(), value });
    return value;
}

function invalidateCache(discordId) {
    _statusCache.delete(discordId);
    _statusCache.delete(discordId + ':registro');
}

module.exports = {
    getPesquisa,
    getPesquisaCached,
    postPesquisaIniciar,
    postPesquisaColetar,
    getRegistro,
    getRegistroCached,
    postRegistroIniciar,
    postRegistroColetar,
    getSaldo,
    invalidateCache,
};
