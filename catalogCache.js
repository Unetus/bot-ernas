/**
 * catalogCache.js — Cache inteligente com preload e TTL para catálogos da API.
 * 
 * Ao iniciar o bot, pré-carrega Bestiário, NPCs, Itens (assinatura) e Skills
 * na memória RAM com índices por nome, slug e ID. Consultas subsequentes
 * são resolvidas localmente sem rede.
 * 
 * TTL padrão: 10 minutos para catálogos, 2 minutos para rankings.
 * Re-fetch automático em background via setInterval.
 */

const apiClient = require('./apiClient');

// Configuração de TTL (em milissegundos)
const TTL = {
    catalogo: 10 * 60 * 1000,   // 10 minutos
    ranking: 2 * 60 * 1000,     // 2 minutos
    personagem: 60 * 1000,      // 1 minuto
};

// Stores internos
const stores = {
    bestiario: { data: [], byId: new Map(), bySlug: new Map(), byNome: new Map(), lastFetch: 0 },
    npcs: { data: [], byId: new Map(), bySlug: new Map(), byNome: new Map(), lastFetch: 0 },
    itens: { data: [], byId: new Map(), bySlug: new Map(), byNome: new Map(), lastFetch: 0 },
    skills: { data: [], byId: new Map(), byNome: new Map(), lastFetch: 0 },
};

// Cache genérico para rankings e personagens (TTL curto)
const genericCache = new Map(); // key -> { data, expiry }
const GENERIC_CACHE_MAX_ENTRIES = 500;

/**
 * Indexa um array de objetos em Maps por id, slug e nome (lowercase).
 */
function indexar(store, items) {
    store.data = items;
    store.byId.clear();
    if (store.bySlug) store.bySlug.clear();
    store.byNome.clear();
    for (const item of items) {
        if (item.id) store.byId.set(item.id, item);
        if (item.slug && store.bySlug) store.bySlug.set(item.slug.toLowerCase(), item);
        if (item.nome) {
            const key = item.nome.toLowerCase();
            // Pode haver itens com mesmo nome (raridades diferentes)
            if (!store.byNome.has(key)) {
                store.byNome.set(key, item);
            }
        }
    }
    store.lastFetch = Date.now();
}

/**
 * Fetch paginado completo: busca todas as páginas de um endpoint até esgotar.
 */
async function fetchAll(path, arrayKey, maxLimit = 200) {
    const all = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
        const separator = path.includes('?') ? '&' : '?';
        const res = await apiClient.get(`${path}${separator}limit=${maxLimit}&offset=${offset}`);
        const d = res.data;
        total = d.total ?? d[arrayKey]?.length ?? 0;
        const items = d[arrayKey] ?? [];
        all.push(...items);
        offset += items.length;
        if (items.length === 0) break; // safety
    }
    return all;
}

/**
 * Pré-carrega todos os catálogos ao iniciar o bot.
 */
async function preload() {
    console.log('[catalogCache] Iniciando preload dos catálogos...');
    const t0 = Date.now();

    try {
        const [bestiario, npcs, itens, skills] = await Promise.allSettled([
            fetchAll('/bestiario', 'bestiario', 100),
            fetchAll('/npcs', 'npcs', 100),
            fetchAll('/itens?so_assinatura=true', 'itens', 200),
            fetchAll('/skills', 'skills', 200),
        ]);

        if (bestiario.status === 'fulfilled') {
            indexar(stores.bestiario, bestiario.value);
            console.log(`[catalogCache]   ✓ Bestiário: ${bestiario.value.length} criaturas`);
        } else {
            console.error('[catalogCache]   ✗ Bestiário falhou:', bestiario.reason?.message);
        }

        if (npcs.status === 'fulfilled') {
            indexar(stores.npcs, npcs.value);
            console.log(`[catalogCache]   ✓ NPCs: ${npcs.value.length} personagens`);
        } else {
            console.error('[catalogCache]   ✗ NPCs falhou:', npcs.reason?.message);
        }

        if (itens.status === 'fulfilled') {
            indexar(stores.itens, itens.value);
            console.log(`[catalogCache]   ✓ Itens: ${itens.value.length} itens (assinatura)`);
        } else {
            console.error('[catalogCache]   ✗ Itens falhou:', itens.reason?.message);
        }

        if (skills.status === 'fulfilled') {
            indexar(stores.skills, skills.value);
            console.log(`[catalogCache]   ✓ Skills: ${skills.value.length} habilidades`);
        } else {
            console.error('[catalogCache]   ✗ Skills falhou:', skills.reason?.message);
        }

        console.log(`[catalogCache] Preload concluído em ${Date.now() - t0}ms`);
    } catch (err) {
        console.error('[catalogCache] Erro fatal no preload:', err.message);
    }
}

/**
 * Re-fetch de catálogos em background (chamado pelo setInterval).
 */
async function refresh() {
    try {
        const [bestiario, npcs, itens, skills] = await Promise.allSettled([
            fetchAll('/bestiario', 'bestiario', 100),
            fetchAll('/npcs', 'npcs', 100),
            fetchAll('/itens?so_assinatura=true', 'itens', 200),
            fetchAll('/skills', 'skills', 200),
        ]);
        if (bestiario.status === 'fulfilled') indexar(stores.bestiario, bestiario.value);
        if (npcs.status === 'fulfilled') indexar(stores.npcs, npcs.value);
        if (itens.status === 'fulfilled') indexar(stores.itens, itens.value);
        if (skills.status === 'fulfilled') indexar(stores.skills, skills.value);
        cleanupGenericCache();
        console.log(`[catalogCache] Refresh concluído (${new Date().toISOString()})`);
    } catch (err) {
        console.error('[catalogCache] Erro no refresh:', err.message);
    }
}

/**
 * Inicia o timer de refresh automático.
 */
function startAutoRefresh() {
    setInterval(refresh, TTL.catalogo);
}

function cleanupGenericCache(now = Date.now()) {
    for (const [key, entry] of genericCache) {
        if (now > entry.expiry) genericCache.delete(key);
    }

    if (genericCache.size <= GENERIC_CACHE_MAX_ENTRIES) return;

    const entriesByExpiry = [...genericCache.entries()].sort((a, b) => a[1].expiry - b[1].expiry);
    const excess = genericCache.size - GENERIC_CACHE_MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
        genericCache.delete(entriesByExpiry[i][0]);
    }
}

// ===========================
// Funções de Lookup Local
// ===========================

/**
 * Busca uma criatura no bestiário por nome, slug ou ID.
 * Retorna null se não encontrada.
 */
function findBestiario(ref) {
    if (!ref) return null;
    const s = stores.bestiario;
    // UUID?
    if (/^[0-9a-f]{8}-/.test(ref)) return s.byId.get(ref) || null;
    const lower = ref.toLowerCase();
    return s.bySlug.get(lower) || s.byNome.get(lower) || null;
}

/**
 * Busca um NPC por nome, slug ou ID.
 */
function findNpc(ref) {
    if (!ref) return null;
    const s = stores.npcs;
    if (/^[0-9a-f]{8}-/.test(ref)) return s.byId.get(ref) || null;
    const lower = ref.toLowerCase();
    return s.bySlug.get(lower) || s.byNome.get(lower) || null;
}

/**
 * Busca um item por nome, slug ou ID.
 */
function findItem(ref) {
    if (!ref) return null;
    const s = stores.itens;
    if (/^[0-9a-f]{8}-/.test(ref)) return s.byId.get(ref) || null;
    const lower = ref.toLowerCase();
    return s.bySlug.get(lower) || s.byNome.get(lower) || null;
}

/**
 * Busca uma skill por nome ou ID.
 */
function findSkill(ref) {
    if (!ref) return null;
    const s = stores.skills;
    if (/^[0-9a-f]{8}-/.test(ref)) return s.byId.get(ref) || null;
    return s.byNome.get(ref.toLowerCase()) || null;
}

/**
 * Retorna todas as criaturas do bestiário, opcionalmente filtradas.
 * @param {Object} filtros - { tipo?, classificacao?, classificacao_min?, busca? }
 */
function listBestiario(filtros = {}) {
    let items = stores.bestiario.data;
    if (filtros.tipo) items = items.filter(i => i.tipo === filtros.tipo);
    if (filtros.classificacao) items = items.filter(i => i.classificacao === filtros.classificacao);
    if (filtros.classificacao_min) items = items.filter(i => i.classificacao >= filtros.classificacao_min);
    if (filtros.busca) {
        const q = filtros.busca.toLowerCase();
        items = items.filter(i => i.nome?.toLowerCase().includes(q));
    }
    return items;
}

/**
 * Retorna todos os NPCs, opcionalmente filtrados.
 */
function listNpcs(filtros = {}) {
    let items = stores.npcs.data;
    if (filtros.regiao) items = items.filter(i => i.regiao === filtros.regiao);
    if (filtros.rank) items = items.filter(i => i.rank === filtros.rank);
    if (filtros.busca) {
        const q = filtros.busca.toLowerCase();
        items = items.filter(i => i.nome?.toLowerCase().includes(q) || i.titulo?.toLowerCase().includes(q));
    }
    return items;
}

/**
 * Retorna todos os itens, opcionalmente filtrados.
 */
function listItens(filtros = {}) {
    let items = stores.itens.data;
    if (filtros.categoria) items = items.filter(i => i.categoria === filtros.categoria);
    if (filtros.raridade) items = items.filter(i => i.raridade === filtros.raridade);
    if (filtros.busca) {
        const q = filtros.busca.toLowerCase();
        items = items.filter(i => i.nome?.toLowerCase().includes(q));
    }
    return items;
}

/**
 * Retorna todas as skills, opcionalmente filtradas.
 */
function listSkills(filtros = {}) {
    let items = stores.skills.data;
    if (filtros.classe) items = items.filter(i => i.classe === filtros.classe);
    if (filtros.tipo) items = items.filter(i => i.tipo === filtros.tipo);
    if (filtros.origem) items = items.filter(i => i.origem === filtros.origem);
    if (filtros.busca) {
        const q = filtros.busca.toLowerCase();
        items = items.filter(i => i.nome?.toLowerCase().includes(q));
    }
    return items;
}

// ===========================
// Cache genérico com TTL
// ===========================

/**
 * Busca no cache genérico. Retorna null se expirado ou inexistente.
 */
function getGeneric(key) {
    const entry = genericCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        genericCache.delete(key);
        return null;
    }
    return entry.data;
}

/**
 * Armazena no cache genérico com TTL.
 */
function setGeneric(key, data, ttlMs) {
    cleanupGenericCache();
    genericCache.set(key, { data, expiry: Date.now() + ttlMs });
    if (genericCache.size > GENERIC_CACHE_MAX_ENTRIES) cleanupGenericCache();
}

/**
 * Estatísticas do cache (para /mestre painel).
 */
function stats() {
    return {
        bestiario: stores.bestiario.data.length,
        npcs: stores.npcs.data.length,
        itens: stores.itens.data.length,
        skills: stores.skills.data.length,
        genericEntries: genericCache.size,
        lastRefresh: Math.max(
            stores.bestiario.lastFetch,
            stores.npcs.lastFetch,
            stores.itens.lastFetch,
            stores.skills.lastFetch
        ),
    };
}

module.exports = {
    preload,
    startAutoRefresh,
    refresh,
    // Lookups individuais
    findBestiario,
    findNpc,
    findItem,
    findSkill,
    // Listagens com filtro
    listBestiario,
    listNpcs,
    listItens,
    listSkills,
    // Cache genérico
    getGeneric,
    setGeneric,
    TTL,
    // Stats
    stats,
};
