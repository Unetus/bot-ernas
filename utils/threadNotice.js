const THREAD_NOTICE_TYPES = new Set([0, 18, 21]);

async function deleteThreadCreationNotice(parentChannel, threadId, threadTitle) {
    if (!parentChannel?.messages?.fetch) return 0;

    let messages;
    try {
        messages = await parentChannel.messages.fetch({ limit: 100 });
    } catch (error) {
        console.warn('[thread notice] Nao foi possivel buscar notificacoes do canal-pai:', error.message);
        return 0;
    }

    const normalizedTitle = String(threadTitle || '').toLowerCase();
    const candidates = messages.filter(message => {
        if (!THREAD_NOTICE_TYPES.has(message.type)) return false;
        if (message.thread?.id === threadId || message.channelId === threadId) return true;
        const content = String(message.content || '').toLowerCase();
        const mentionsThread = content.includes('iniciou um topico')
            || content.includes('iniciou um tópico')
            || content.includes('started a thread');
        return mentionsThread && (!normalizedTitle || content.includes(normalizedTitle));
    });

    let deleted = 0;
    for (const message of candidates) {
        try {
            await message.delete();
            deleted++;
        } catch (error) {
            console.warn(`[thread notice] Nao foi possivel remover ${message.id}:`, error.message);
        }
    }
    return deleted;
}

module.exports = { deleteThreadCreationNotice };
