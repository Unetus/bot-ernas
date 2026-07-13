/**
 * sceneCleanup.js — Limpeza periódica de cenas, drafts de arena e timers órfãos.
 *
 * Resolve memory leaks causados por cenas e timers que nunca expiravam,
 * prevenindo OOM e crash do processo.
 */

const { cenasAtivas, timersTurno, renderTimers, arenasDraft } = require('./state');

const SCENE_MAX_AGE_MS = 4 * 60 * 60 * 1000;      // 4 horas sem atividade
const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;      // 2 horas
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;        // roda a cada 5 min
const MAX_ACTIVE_SCENES = 100;                    // limite global de segurança

function clearSceneResources(cena) {
    if (!cena) return;

    const ids = [cena.msgId, cena.bannerMsgId].filter(Boolean);
    for (const id of ids) {
        if (timersTurno.has(id)) {
            clearInterval(timersTurno.get(id));
            timersTurno.delete(id);
        }
        if (renderTimers.has(id)) {
            clearTimeout(renderTimers.get(id));
            renderTimers.delete(id);
        }
    }
}

function cleanup() {
    const now = Date.now();
    let removed = 0;

    // Expira cenas antigas
    for (const [channelId, cena] of cenasAtivas.entries()) {
        const lastActivity = cena.ultimaAtividade || cena.criadaEm || now;
        if (now - lastActivity > SCENE_MAX_AGE_MS) {
            clearSceneResources(cena);
            cenasAtivas.delete(channelId);
            removed++;
        }
    }

    // Expira drafts de arena antigos
    for (const [msgId, draft] of arenasDraft.entries()) {
        const created = draft.criadoEm || now;
        if (now - created > DRAFT_MAX_AGE_MS) {
            arenasDraft.delete(msgId);
            removed++;
        }
    }

    // Limita número total de cenas ativas (remove as mais inativas)
    if (cenasAtivas.size > MAX_ACTIVE_SCENES) {
        const sorted = [...cenasAtivas.entries()].sort((a, b) => {
            const tA = a[1].ultimaAtividade || a[1].criadaEm || 0;
            const tB = b[1].ultimaAtividade || b[1].criadaEm || 0;
            return tA - tB;
        });
        const excess = cenasAtivas.size - MAX_ACTIVE_SCENES;
        for (let i = 0; i < excess; i++) {
            const [channelId, cena] = sorted[i];
            clearSceneResources(cena);
            cenasAtivas.delete(channelId);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`[sceneCleanup] ${removed} cena(s)/draft(s) removido(s). Cenas ativas: ${cenasAtivas.size}`);
    }
}

function safeCleanup() {
    try {
        cleanup();
    } catch (err) {
        console.error('[sceneCleanup] Erro durante limpeza:', err);
    }
}

function startSceneCleanup() {
    safeCleanup();
    const interval = setInterval(safeCleanup, CLEANUP_INTERVAL_MS);
    // Permite o processo encerrar naturalmente se só o timer estiver ativo
    if (interval.unref) interval.unref();
}

module.exports = { startSceneCleanup };
