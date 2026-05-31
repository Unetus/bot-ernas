const profileCache = new Map();

function getProfile(personagemId) {
    const entry = profileCache.get(personagemId);
    if (!entry) return null;

    // Se o cache expirou (5 minutos = 300000 ms)
    if (Date.now() > entry.expiresAt) {
        profileCache.delete(personagemId);
        return null;
    }

    return entry.buffer;
}

function setProfile(personagemId, buffer, ttlMs = 300000) {
    profileCache.set(personagemId, {
        buffer,
        expiresAt: Date.now() + ttlMs
    });
}

function clearProfile(personagemId) {
    profileCache.delete(personagemId);
}

module.exports = {
    getProfile,
    setProfile,
    clearProfile
};
