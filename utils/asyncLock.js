/**
 * asyncLock.js — Lock por chave para evitar double-click e race conditions.
 *
 * Uso típico: botoes que disparam POSTs idempotentes (coletar pesquisa,
 * iniciar RP) onde double-click do usuario causaria duplicacao.
 *
 * O lock e por chave + usuario. Quando o lock esta ativo, a funcao
 * retorna `false` (em vez de esperar) para que o caller possa dar feedback
 * imediato ("Operacao em andamento"). Apos a conclusao, o lock libera.
 *
 * Uso:
 *   const locked = tryAcquire('collect:user:123:pesq:abc');
 *   if (!locked) return reply('Aguarde a operacao anterior...', ephemeral);
 *   try {
 *       // ... operacao ...
 *   } finally {
 *       release('collect:user:123:pesq:abc');
 *   }
 *
 * Alternativa com Promise (espera):
 *   const release = await acquire('collect:user:123:pesq:abc');
 *   try { ... } finally { release(); }
 */

const _locks = new Map();
const _ttls = new Map();
const DEFAULT_LOCK_TTL_MS = 30000;

function tryAcquire(key, ttlMs = DEFAULT_LOCK_TTL_MS) {
    if (_locks.has(key)) {
        const exp = _ttls.get(key);
        if (exp && exp > Date.now()) return false;
        // Lock expirou; libera e tenta de novo
        _locks.delete(key);
        _ttls.delete(key);
    }
    _locks.set(key, true);
    _ttls.set(key, Date.now() + ttlMs);
    return true;
}

function release(key) {
    _locks.delete(key);
    _ttls.delete(key);
}

function isLocked(key) {
    if (!_locks.has(key)) return false;
    const exp = _ttls.get(key);
    if (!exp || exp <= Date.now()) {
        _locks.delete(key);
        _ttls.delete(key);
        return false;
    }
    return true;
}

module.exports = { tryAcquire, release, isLocked };
