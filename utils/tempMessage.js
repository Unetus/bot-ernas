/**
 * tempMessage.js — Utilidade para deletar mensagens após um intervalo.
 *
 * Usado para manter canais "limpos" (e.g. canais de localidade fixos),
 * onde apenas mensagens fixadas devem permanecer.
 */

const DEFAULT_DELAY_MS = 8000;

function deleteAfterDelay(message, ms = DEFAULT_DELAY_MS) {
    if (!message) return;
    const delay = Math.max(1000, ms);
    setTimeout(async () => {
        try {
            await message.delete();
        } catch (e) {
            // mensagem ja deletada ou sem permissao
        }
    }, delay);
}

module.exports = { deleteAfterDelay, DEFAULT_DELAY_MS };
