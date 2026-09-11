const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const MAX_LEVEL = 100;
const MAX_DAILY_XP = 300;
const XP_MIN_PER_MESSAGE = 2;
const XP_MAX_PER_MESSAGE = 5;
const RANKS = [
    { key: 'bronze', name: 'Bronze', level: 1 },
    { key: 'silver', name: 'Silver', level: 10 },
    { key: 'gold', name: 'Gold', level: 25 },
    { key: 'platinum', name: 'Platinum', level: 40 },
    { key: 'mithril', name: 'Mithril', level: 55 },
    { key: 'obsidian', name: 'Obsidian', level: 75 },
    { key: 'adamantite', name: 'Adamantite', level: 100 },
];

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.GAIA_SOCIAL_XP_DB_PATH || path.join(DB_DIR, 'social-xp.db');
let db = null;

function init() {
    if (db) return db;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS social_progression (
            guild_id TEXT NOT NULL,
            discord_user_id TEXT NOT NULL,
            xp_total INTEGER NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
            level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
            daily_xp INTEGER NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
            daily_key TEXT NOT NULL DEFAULT '',
            last_message_hash TEXT,
            last_message_at INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (guild_id, discord_user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_social_progression_xp
            ON social_progression (guild_id, xp_total DESC);
    `);
    return db;
}

function dayKey(now = Date.now()) {
    return new Date(now).toISOString().slice(0, 10);
}

/** XP acumulado para alcançar um nível. O teto é finito (nível 100). */
function xpForLevel(level) {
    const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 1)));
    if (safeLevel >= MAX_LEVEL) return 150000;
    const progress = (safeLevel - 1) / (MAX_LEVEL - 1);
    return Math.max(0, Math.ceil(150000 * Math.pow(progress, 1.6)));
}

function levelFromXp(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    for (let candidate = 2; candidate <= MAX_LEVEL; candidate += 1) {
        if (total < xpForLevel(candidate)) break;
        level = candidate;
    }
    return level;
}

function rankForLevel(level) {
    const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 1)));
    return [...RANKS].reverse().find(rank => safeLevel >= rank.level) || RANKS[0];
}

function emptyProgression() {
    return {
        xpTotal: 0,
        level: 1,
        rank: RANKS[0],
        nextLevelXp: xpForLevel(2),
        xpToNext: xpForLevel(2),
        dailyXp: 0,
        dailyCap: MAX_DAILY_XP,
        maxLevel: MAX_LEVEL,
    };
}

function toProgression(row) {
    if (!row) return emptyProgression();
    const xpTotal = Math.max(0, Number(row.xp_total) || 0);
    const level = levelFromXp(xpTotal);
    const nextLevelXp = level >= MAX_LEVEL ? xpForLevel(MAX_LEVEL) : xpForLevel(level + 1);
    return {
        xpTotal,
        level,
        rank: rankForLevel(level),
        nextLevelXp,
        xpToNext: level >= MAX_LEVEL ? 0 : Math.max(0, nextLevelXp - xpTotal),
        dailyXp: Math.max(0, Number(row.daily_xp) || 0),
        dailyCap: MAX_DAILY_XP,
        maxLevel: MAX_LEVEL,
    };
}

function getProgression(guildId, discordUserId) {
    if (!/^\d{15,22}$/.test(String(guildId || '')) || !/^\d{15,22}$/.test(String(discordUserId || ''))) {
        return emptyProgression();
    }
    const row = init().prepare('SELECT * FROM social_progression WHERE guild_id = ? AND discord_user_id = ?').get(String(guildId), String(discordUserId));
    return toProgression(row);
}

function messageHash(content) {
    return crypto.createHash('sha256').update(String(content || '').trim().toLocaleLowerCase('pt-BR')).digest('hex');
}

function rollMessageXp() {
    return XP_MIN_PER_MESSAGE + Math.floor(Math.random() * (XP_MAX_PER_MESSAGE - XP_MIN_PER_MESSAGE + 1));
}

/**
 * Registra uma mensagem elegível. Não há cooldown global: cada mensagem
 * válida pode conceder XP imediatamente, limitada pelo teto diário e por
 * repetição de conteúdo.
 */
function recordMessage({ guildId, discordUserId, content, now = Date.now(), xp = rollMessageXp() }) {
    if (!/^\d{15,22}$/.test(String(guildId || '')) || !/^\d{15,22}$/.test(String(discordUserId || ''))) return { granted: false, reason: 'invalid_identity' };
    const text = String(content || '').trim();
    if (text.length < 8 || text.startsWith('/')) return { granted: false, reason: 'ineligible_message' };

    const database = init();
    const timestamp = new Date(now).toISOString();
    const today = dayKey(now);
    const hash = messageHash(text);
    const transaction = database.transaction(() => {
        let row = database.prepare('SELECT * FROM social_progression WHERE guild_id = ? AND discord_user_id = ?').get(String(guildId), String(discordUserId));
        if (!row) {
            database.prepare(`INSERT INTO social_progression
                (guild_id, discord_user_id, created_at, updated_at, daily_key)
                VALUES (?, ?, ?, ?, ?)`).run(String(guildId), String(discordUserId), timestamp, timestamp, today);
            row = database.prepare('SELECT * FROM social_progression WHERE guild_id = ? AND discord_user_id = ?').get(String(guildId), String(discordUserId));
        }

        const dailyXp = row.daily_key === today ? Number(row.daily_xp) || 0 : 0;
        if (row.last_message_hash === hash && Number(row.last_message_at) > now - 86_400_000) {
            return { granted: false, reason: 'duplicate_message', progression: toProgression({ ...row, daily_xp: dailyXp }) };
        }
        if (dailyXp >= MAX_DAILY_XP) {
            return { granted: false, reason: 'daily_cap', progression: toProgression({ ...row, daily_xp: dailyXp }) };
        }

        const amount = Math.max(1, Math.min(MAX_DAILY_XP - dailyXp, Math.trunc(Number(xp) || XP_MIN_PER_MESSAGE)));
        const xpTotalBefore = Number(row.xp_total) || 0;
        const levelBefore = levelFromXp(xpTotalBefore);
        const xpTotal = Math.min(xpForLevel(MAX_LEVEL), xpTotalBefore + amount);
        const level = levelFromXp(xpTotal);
        database.prepare(`UPDATE social_progression
            SET xp_total = ?, level = ?, daily_xp = ?, daily_key = ?,
                last_message_hash = ?, last_message_at = ?, updated_at = ?
            WHERE guild_id = ? AND discord_user_id = ?`).run(
            xpTotal, level, dailyXp + amount, today, hash, now, timestamp,
            String(guildId), String(discordUserId),
        );
        const updated = { ...row, xp_total: xpTotal, level, daily_xp: dailyXp + amount, daily_key: today };
        return {
            granted: true,
            amount,
            levelUp: level > levelBefore,
            previousLevel: levelBefore,
            progression: toProgression(updated),
        };
    });
    return transaction();
}

function listProgression(guildId, limit = 10) {
    if (!/^\d{15,22}$/.test(String(guildId || ''))) return [];
    const rows = init().prepare('SELECT * FROM social_progression WHERE guild_id = ? ORDER BY xp_total DESC, updated_at ASC LIMIT ?').all(String(guildId), Math.max(1, Math.min(100, Math.trunc(Number(limit) || 10))));
    return rows.map((row, index) => ({ position: index + 1, discordUserId: row.discord_user_id, ...toProgression(row) }));
}

module.exports = {
    MAX_LEVEL,
    MAX_DAILY_XP,
    XP_MIN_PER_MESSAGE,
    XP_MAX_PER_MESSAGE,
    RANKS,
    xpForLevel,
    levelFromXp,
    rankForLevel,
    getProgression,
    recordMessage,
    listProgression,
};
