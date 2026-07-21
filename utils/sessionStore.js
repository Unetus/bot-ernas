/**
 * sessionStore.js — Persistência local de sessões de RP/Cena.
 *
 * Usa better-sqlite3 para registrar metadados, participantes e todas as
 * mensagens trocadas em sessões criadas por /rp iniciar e /cena iniciar.
 * O banco fica em ./data/sessions.db (não versionado).
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { PermissionFlagsBits } = require('discord.js');

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'sessions.db');

let db = null;

function init() {
    if (db) return db;

    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('rp','cena')),
            status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','encerrada','abandonada')),
            parent_session_id TEXT,
            discord_thread_id TEXT,
            discord_channel_id TEXT NOT NULL,
            discord_guild_id TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT,
            ambiance TEXT,
            scenario_url TEXT,
            creator_discord_id TEXT NOT NULL,
            creator_is_master INTEGER DEFAULT 0,
            finished_at TEXT,
            finished_by TEXT,
            message_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_thread ON sessions(discord_thread_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_guild_created ON sessions(discord_guild_id, created_at);

        CREATE TABLE IF NOT EXISTS session_participants (
            session_id TEXT NOT NULL,
            discord_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            PRIMARY KEY (session_id, discord_id),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS session_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            discord_message_id TEXT NOT NULL,
            author_discord_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            content TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON session_messages(sent_at);

        CREATE TABLE IF NOT EXISTS localities (
            discord_channel_id TEXT PRIMARY KEY,
            discord_guild_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            panel_message_id TEXT
        );
    `);

    // Migra DBs antigos (a coluna panel_message_id foi adicionada depois).
    try {
        db.exec(`ALTER TABLE localities ADD COLUMN panel_message_id TEXT`);
    } catch (e) {
        // coluna ja existe
    }

    return db;
}

function createSession({
    type,
    parentSessionId = null,
    discordThreadId,
    discordChannelId,
    discordGuildId,
    title,
    subtitle = null,
    ambiance = null,
    scenarioUrl = null,
    creatorDiscordId,
    creatorIsMaster = false,
    participants = []
}) {
    if (!db) init();

    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const insertSession = db.prepare(`
        INSERT INTO sessions (
            id, type, status, parent_session_id, discord_thread_id, discord_channel_id,
            discord_guild_id, title, subtitle, ambiance, scenario_url,
            creator_discord_id, creator_is_master, created_at
        ) VALUES (
            @id, @type, 'ativa', @parentSessionId, @discordThreadId, @discordChannelId,
            @discordGuildId, @title, @subtitle, @ambiance, @scenarioUrl,
            @creatorDiscordId, @creatorIsMaster, @createdAt
        )
    `);

    const insertParticipant = db.prepare(`
        INSERT OR IGNORE INTO session_participants (session_id, discord_id, display_name)
        VALUES (@sessionId, @discordId, @displayName)
    `);

    insertSession.run({
        id,
        type,
        parentSessionId,
        discordThreadId,
        discordChannelId,
        discordGuildId,
        title,
        subtitle,
        ambiance,
        scenarioUrl,
        creatorDiscordId,
        creatorIsMaster: creatorIsMaster ? 1 : 0,
        createdAt
    });

    for (const p of participants) {
        insertParticipant.run({
            sessionId: id,
            discordId: p.discordId,
            displayName: p.displayName || 'Aventureiro'
        });
    }

    return id;
}

function addMessage(sessionId, { discordMessageId, authorDiscordId, authorName, content, sentAt }) {
    if (!db) init();

    const insert = db.prepare(`
        INSERT INTO session_messages (session_id, discord_message_id, author_discord_id, author_name, content, sent_at)
        VALUES (@sessionId, @discordMessageId, @authorDiscordId, @authorName, @content, @sentAt)
    `);
    const updateCount = db.prepare(`
        UPDATE sessions SET message_count = message_count + 1 WHERE id = @sessionId
    `);

    insert.run({ sessionId, discordMessageId, authorDiscordId, authorName, content, sentAt });
    updateCount.run({ sessionId });
}

function finishSession(sessionId, finishedByDiscordId) {
    if (!db) init();

    const finishedAt = new Date().toISOString();

    const finish = db.prepare(`
        UPDATE sessions
        SET status = 'encerrada', finished_at = @finishedAt, finished_by = @finishedBy
        WHERE id = @sessionId
    `);
    finish.run({ sessionId, finishedAt, finishedBy: finishedByDiscordId });

    // Encerra cenas filhas ativas automaticamente
    const finishChildren = db.prepare(`
        UPDATE sessions
        SET status = 'encerrada', finished_at = @finishedAt, finished_by = @finishedBy
        WHERE parent_session_id = @sessionId AND status = 'ativa'
    `);
    finishChildren.run({ sessionId, finishedAt, finishedBy: finishedByDiscordId });
}

function getSession(sessionId) {
    if (!db) init();
    return db.prepare(`SELECT * FROM sessions WHERE id = @sessionId`).get({ sessionId });
}

function getSessionParticipants(sessionId) {
    if (!db) init();
    return db.prepare(`SELECT * FROM session_participants WHERE session_id = @sessionId`).all({ sessionId });
}

function addParticipant(sessionId, discordId, displayName) {
    if (!db) init();
    const insert = db.prepare(`
        INSERT OR IGNORE INTO session_participants (session_id, discord_id, display_name)
        VALUES (@sessionId, @discordId, @displayName)
    `);
    insert.run({ sessionId, discordId, displayName: displayName || 'Aventureiro' });
}

function findActiveSessionByChannel(discordThreadId) {
    if (!db) init();

    // Preferencia: cena ativa mais recente, depois rp ativo mais recente
    const cena = db.prepare(`
        SELECT * FROM sessions
        WHERE discord_thread_id = @discordThreadId AND status = 'ativa' AND type = 'cena'
        ORDER BY created_at DESC LIMIT 1
    `).get({ discordThreadId });

    if (cena) return cena;

    return db.prepare(`
        SELECT * FROM sessions
        WHERE discord_thread_id = @discordThreadId AND status = 'ativa' AND type = 'rp'
        ORDER BY created_at DESC LIMIT 1
    `).get({ discordThreadId });
}

function findActiveRpSessionByChannel(discordThreadId) {
    if (!db) init();
    return db.prepare(`
        SELECT * FROM sessions
        WHERE discord_thread_id = @discordThreadId AND status = 'ativa' AND type = 'rp'
        ORDER BY created_at DESC LIMIT 1
    `).get({ discordThreadId });
}

function listChildSessions(parentSessionId) {
    if (!db) init();
    return db.prepare(`
        SELECT * FROM sessions
        WHERE parent_session_id = @parentSessionId
        ORDER BY created_at ASC
    `).all({ parentSessionId });
}

function findSessionsByPrefix(prefix, guildId) {
    if (!db) init();
    const safe = String(prefix || '').toLowerCase().replace(/[^0-9a-f-]/g, '');
    if (safe.length < 4) return [];
    const escaped = safe.replace(/[%_\\]/g, ch => '\\' + ch);
    return db.prepare(`
        SELECT * FROM sessions
        WHERE LOWER(id) LIKE @like ESCAPE '\\'
          AND discord_guild_id = @guildId
        ORDER BY created_at DESC LIMIT 10
    `).all({ like: escaped + '%', guildId });
}

function upsertLocality({ discordChannelId, discordGuildId, title, description, imageUrl, updatedBy }) {
    if (!db) init();
    const updatedAt = new Date().toISOString();
    db.prepare(`
        INSERT INTO localities (discord_channel_id, discord_guild_id, title, description, image_url, updated_at, updated_by)
        VALUES (@discordChannelId, @discordGuildId, @title, @description, @imageUrl, @updatedAt, @updatedBy)
        ON CONFLICT(discord_channel_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            image_url = excluded.image_url,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
    `).run({ discordChannelId, discordGuildId, title, description, imageUrl: imageUrl || null, updatedAt, updatedBy });
}

function getLocality(discordChannelId) {
    if (!db) init();
    return db.prepare(`SELECT * FROM localities WHERE discord_channel_id = @discordChannelId`).get({ discordChannelId });
}

function setLocalityPanelMessageId(discordChannelId, messageId) {
    if (!db) init();
    db.prepare(`UPDATE localities SET panel_message_id = @messageId WHERE discord_channel_id = @discordChannelId`)
        .run({ discordChannelId, messageId: messageId || null });
}

function listSessions({ guildId, status, creatorId, participantId, limit = 20, offset = 0 }) {
    if (!db) init();

    let sql = `SELECT DISTINCT s.* FROM sessions s`;
    const params = {};
    const where = [];

    if (participantId) {
        sql += ` JOIN session_participants p ON p.session_id = s.id`;
        where.push(`p.discord_id = @participantId`);
        params.participantId = participantId;
    }

    if (guildId) {
        where.push(`s.discord_guild_id = @guildId`);
        params.guildId = guildId;
    }

    if (status) {
        where.push(`s.status = @status`);
        params.status = status;
    }

    if (creatorId) {
        where.push(`s.creator_discord_id = @creatorId`);
        params.creatorId = creatorId;
    }

    if (where.length > 0) {
        sql += ` WHERE ` + where.join(' AND ');
    }

    sql += ` ORDER BY s.created_at DESC LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;

    return db.prepare(sql).all(params);
}

function getSessionHistory(sessionId) {
    if (!db) init();

    return db.prepare(`
        SELECT m.* FROM session_messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.id = @sessionId OR s.parent_session_id = @sessionId
        ORDER BY m.sent_at ASC, m.id ASC
    `).all({ sessionId });
}

function countSessions({ guildId, status, creatorId, participantId }) {
    if (!db) init();

    let sql = `SELECT COUNT(DISTINCT s.id) as total FROM sessions s`;
    const params = {};
    const where = [];

    if (participantId) {
        sql += ` JOIN session_participants p ON p.session_id = s.id`;
        where.push(`p.discord_id = @participantId`);
        params.participantId = participantId;
    }

    if (guildId) {
        where.push(`s.discord_guild_id = @guildId`);
        params.guildId = guildId;
    }

    if (status) {
        where.push(`s.status = @status`);
        params.status = status;
    }

    if (creatorId) {
        where.push(`s.creator_discord_id = @creatorId`);
        params.creatorId = creatorId;
    }

    if (where.length > 0) {
        sql += ` WHERE ` + where.join(' AND ');
    }

    return db.prepare(sql).get(params).total;
}

function canFinishSession(session, userId, memberPermissions) {
    if (!session) return false;
    if (session.status !== 'ativa') return false;

    // Admin pode encerrar qualquer sessao
    if (memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

    // Criador pode encerrar a propria sessao
    if (session.creator_discord_id === userId) return true;

    return false;
}

function canViewHistory(session, userId, memberPermissions) {
    if (!session) return false;

    // Admin e mestre podem consultar qualquer historico
    if (memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return true;

    // Participante pode ver proprio historico
    if (!db) init();
    const participant = db.prepare(`
        SELECT 1 FROM session_participants
        WHERE session_id = @sessionId AND discord_id = @userId
    `).get({ sessionId: session.id, userId });

    return !!participant;
}

module.exports = {
    init,
    createSession,
    addMessage,
    addParticipant,
    finishSession,
    getSession,
    getSessionParticipants,
    findActiveSessionByChannel,
    findActiveRpSessionByChannel,
    listChildSessions,
    findSessionsByPrefix,
    listSessions,
    countSessions,
    getSessionHistory,
    canFinishSession,
    canViewHistory,
    upsertLocality,
    getLocality,
    setLocalityPanelMessageId
};
