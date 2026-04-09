import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = process.env.USERMAP_DATA_DIR ?? path.join(os.homedir(), '.usermap');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'usermap.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tool        TEXT    NOT NULL,
      account_id  TEXT    NOT NULL,
      scopes      TEXT    NOT NULL DEFAULT '',
      access_token TEXT   NOT NULL DEFAULT '',
      token_type  TEXT    NOT NULL DEFAULT 'bearer',
      connected_at TEXT   NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tool, account_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tool        TEXT    NOT NULL,
      doc_id      TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tool, doc_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      content,
      metadata,
      content='documents',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, content, metadata)
        VALUES (new.id, new.content, new.metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, content, metadata)
        VALUES ('delete', old.id, old.content, old.metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, content, metadata)
        VALUES ('delete', old.id, old.content, old.metadata);
      INSERT INTO documents_fts(rowid, content, metadata)
        VALUES (new.id, new.content, new.metadata);
    END;

    -- Lifecycle event logs (Phase 5 Final)
    CREATE TABLE IF NOT EXISTS logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type   TEXT    NOT NULL,
      source_tool  TEXT,
      actor        TEXT    NOT NULL DEFAULT 'system',
      object_ref   TEXT,
      summary      TEXT,
      before_state TEXT,
      after_state  TEXT,
      severity     TEXT    NOT NULL DEFAULT 'info',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-source sync checkpoints (Phase 5 Final)
    CREATE TABLE IF NOT EXISTS sync_state (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tool         TEXT    NOT NULL UNIQUE,
      last_cursor  TEXT,
      last_synced  TEXT,
      status       TEXT    NOT NULL DEFAULT 'idle',
      error_msg    TEXT,
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Connector configuration: pull, push, and ai engines
    CREATE TABLE IF NOT EXISTS connector_config (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL UNIQUE,
      direction    TEXT    NOT NULL CHECK(direction IN ('pull', 'push', 'ai')),
      connector_type TEXT  NOT NULL,
      config       TEXT    NOT NULL DEFAULT '{}',
      enabled      INTEGER NOT NULL DEFAULT 1,
      frequency_sec INTEGER NOT NULL DEFAULT 60,
      last_run     TEXT,
      last_status  TEXT,
      last_error   TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Import jobs: file uploads through the canonical ingestion pipeline
    CREATE TABLE IF NOT EXISTS import_jobs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT    NOT NULL,
      mimetype     TEXT    NOT NULL DEFAULT '',
      size_bytes   INTEGER NOT NULL DEFAULT 0,
      notes        TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT 'received' CHECK(status IN ('received','parsing','classifying','indexed','error')),
      document_ids TEXT    NOT NULL DEFAULT '[]',
      error_msg    TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Custom API definitions (user-defined pull/push endpoints)
    CREATE TABLE IF NOT EXISTS custom_apis (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL UNIQUE,
      direction    TEXT    NOT NULL CHECK(direction IN ('pull', 'push')),
      url          TEXT    NOT NULL,
      method       TEXT    NOT NULL DEFAULT 'GET',
      headers      TEXT    NOT NULL DEFAULT '{}',
      body_template TEXT   NOT NULL DEFAULT '',
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default connector configs if they don't exist
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM connector_config').get() as { c: number }).c;
  if (existingCount === 0) {
    const seedConnectors = [
      { name: 'slack-pull', direction: 'pull', connector_type: 'slack', config: '{}', frequency_sec: 60 },
      { name: 'instagram-pull', direction: 'pull', connector_type: 'instagram', config: '{}', frequency_sec: 60 },
      { name: 'facebook-pull', direction: 'pull', connector_type: 'facebook', config: '{}', frequency_sec: 60 },
      { name: 'n8n-push', direction: 'push', connector_type: 'n8n', config: '{}', frequency_sec: 0 },
      { name: 'make-push', direction: 'push', connector_type: 'make', config: '{}', frequency_sec: 0 },
      { name: 'custom-webhook-push', direction: 'push', connector_type: 'webhook', config: '{}', frequency_sec: 0 },
      { name: 'chatgpt-ai', direction: 'ai', connector_type: 'chatgpt', config: '{}', frequency_sec: 0 },
      { name: 'claude-ai', direction: 'ai', connector_type: 'claude', config: '{}', frequency_sec: 0 },
      { name: 'gemini-ai', direction: 'ai', connector_type: 'gemini', config: '{}', frequency_sec: 0 },
      { name: 'ollama-ai', direction: 'ai', connector_type: 'ollama', config: '{}', frequency_sec: 0 },
    ];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO connector_config (name, direction, connector_type, config, frequency_sec)
       VALUES (@name, @direction, @connector_type, @config, @frequency_sec)`
    );
    for (const row of seedConnectors) insert.run(row);
  }
}
