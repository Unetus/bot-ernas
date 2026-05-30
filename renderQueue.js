/**
 * renderQueue.js — Fila de renderização Canvas com controle de concorrência.
 * 
 * Limita o número de renders Canvas simultâneos para evitar picos de RAM
 * quando muitos jogadores executam /perfil, /ranking, /guilda ao mesmo tempo.
 */

const MAX_CONCURRENT = 3;
const QUEUE_TIMEOUT = 15000; // 15 segundos

let activeCount = 0;
const queue = [];

/**
 * Enfileira uma tarefa de renderização.
 * @param {Function} renderFn - Função async que retorna o buffer do Canvas.
 * @returns {Promise<Buffer>} O buffer gerado pela renderFn.
 */
function enqueue(renderFn) {
    return new Promise((resolve, reject) => {
        const task = { renderFn, resolve, reject };

        // Timeout de segurança
        task.timer = setTimeout(() => {
            const idx = queue.indexOf(task);
            if (idx !== -1) queue.splice(idx, 1);
            reject(new Error('Render timeout: fila congestionada'));
        }, QUEUE_TIMEOUT);

        queue.push(task);
        processQueue();
    });
}

async function processQueue() {
    if (activeCount >= MAX_CONCURRENT || queue.length === 0) return;

    const task = queue.shift();
    clearTimeout(task.timer);
    activeCount++;

    try {
        const result = await task.renderFn();
        task.resolve(result);
    } catch (err) {
        task.reject(err);
    } finally {
        activeCount--;
        // Processa próximo na fila
        if (queue.length > 0) processQueue();
    }
}

/**
 * Métricas da fila (para /mestre painel).
 */
function metrics() {
    return {
        active: activeCount,
        pending: queue.length,
        maxConcurrent: MAX_CONCURRENT,
    };
}

module.exports = { enqueue, metrics };
