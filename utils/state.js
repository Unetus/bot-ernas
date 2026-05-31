/**
 * Gerenciador de Estado Global
 * Variáveis, mapas e caches que precisam ser acessados por múltiplos comandos dinâmicos.
 */
module.exports = {
    skillsCache: new Map(),
    cenasAtivas: new Map(),
    missoesPreparacao: new Map(),
    renderTimers: new Map(),
    arenasDraft: new Map(),
    timersTurno: new Map(),
    mestresNarrando: new Map(),
    lootsEmProcessamento: new Set(),
    lootsColetados: new Set()
};
