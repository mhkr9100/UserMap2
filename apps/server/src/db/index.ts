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
  `);
}
