/**
 * cooldown.js — Sistema de cooldown por usuário/comando.
 * 
 * Previne spam de comandos pesados como /perfil, /ranking, /inventario.
 */

// Map: `${userId}_${commandName}` -> timestamp de quando o cooldown expira
const cooldowns = new Map();

// Cooldowns padrão por comando (em milissegundos)
const COOLDOWN_MS = {
    perfil: 5000,
    inventario: 4000,
    ranking: 8000,
    guilda: 5000,
    missoes: 5000,
    bestiario: 3000,
    catalogo: 3000,
    painel: 5000,
};

const DEFAULT_COOLDOWN = 3000;

/**
 * Verifica se o usuário está em cooldown para um comando.
 * @param {string} userId - Discord user ID
 * @param {string} commandName - Nome do slash command
 * @returns {{ onCooldown: boolean, remaining: number }} 
 *   onCooldown: true se bloqueado, remaining: ms restantes
 */
function check(userId, commandName) {
    const key = `${userId}_${commandName}`;
    const expiry = cooldowns.get(key);
    if (!expiry) return { onCooldown: false, remaining: 0 };

    const now = Date.now();
    if (now >= expiry) {
        cooldowns.delete(key);
        return { onCooldown: false, remaining: 0 };
    }

    return { onCooldown: true, remaining: expiry - now };
}

/**
 * Aplica cooldown para o usuário neste comando.
 * @param {string} userId
 * @param {string} commandName
 */
function apply(userId, commandName) {
    const key = `${userId}_${commandName}`;
    const ms = COOLDOWN_MS[commandName] || DEFAULT_COOLDOWN;
    cooldowns.set(key, Date.now() + ms);
}

/**
 * Limpeza periódica de entries expirados (evita memory leak).
 */
function cleanup() {
    const now = Date.now();
    for (const [key, expiry] of cooldowns) {
        if (now >= expiry) cooldowns.delete(key);
    }
}

// Limpa cooldowns expirados a cada 30 segundos
setInterval(cleanup, 30000);

module.exports = { check, apply, COOLDOWN_MS };
