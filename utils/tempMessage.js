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

/**
 * Responde uma interaction com uma mensagem normal (visivel no canal)
 * e agenda a delecao automatica. Substitui o padrao de mensagens
 * efêmeras (ephemeral: true) — o feedback continua aparecendo para o
 * usuario, mas temporariamente, sem persistir no canal.
 *
 * Usa editReply se a interaction ja foi diferida, ou reply caso contrario.
 */
async function replyAndDelete(interaction, content, ms = DEFAULT_DELAY_MS) {
    let msg;
    try {
        if (interaction.deferred || interaction.replied) {
            msg = await interaction.editReply(content);
        } else {
            msg = await interaction.reply(content);
        }
    } catch (e) {
        // fallback: envia no canal
        try {
            msg = await interaction.channel.send(content);
        } catch {}
    }
    if (msg) deleteAfterDelay(msg, ms);
    return msg;
}

module.exports = { deleteAfterDelay, replyAndDelete, DEFAULT_DELAY_MS };
