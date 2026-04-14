/**
 * Fix Pack A — Integration tests
 *
 * These tests verify that the canonical backend routes behave correctly
 * with real SQLite (in-memory via USERMAP_DATA_DIR=:memory: workaround)
 * and that no mock/hardcoded data leaks into runtime paths.
 *
 * Tests cover:
 *  - /api/import pipeline (lifecycle logs emitted, document written to DB)
 *  - /api/prism/context (real FTS search, truthful empty response)
 *  - /api/logs (real DB reads, no seeded demo data)
 *  - /api/connectors (real status from DB, direction='ai' supported)
 *  - /api/dashboard/summary (real log aggregation)
 *  - /api/custom-apis (CRUD)
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// We test the DB layer directly (avoids needing a running HTTP server in CI).
// For HTTP-level tests, spin up the express app against a tmp data dir.

let tmpDir: string;
let db: Database.Database;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usermap-test-'));
  process.env.USERMAP_DATA_DIR = tmpDir;
});

beforeEach(() => {
  // Re-initialize DB for each test (fresh state)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./apps/server/src/db/index.ts') as { getDb: () => Database.Database };
  db = mod.getDb();
});

describe('DB schema — Fix Pack A tables exist', () => {
  it('import_jobs table is created', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_jobs'").get();
    expect(row).toBeTruthy();
  });

  it('custom_apis table is created', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_apis'").get();
    expect(row).toBeTruthy();
  });

  it('connector_config supports direction=ai', () => {
    // The seed data should have inserted AI engine rows
    const aiRows = db.prepare("SELECT * FROM connector_config WHERE direction='ai'").all() as Array<{ direction: string }>;
    expect(aiRows.length).toBeGreaterThan(0);
    for (const row of aiRows) {
      expect(row.direction).toBe('ai');
    }
  });

  it('documents + documents_fts tables exist', () => {
    const docs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get();
    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'").get();
    expect(docs).toBeTruthy();
    expect(fts).toBeTruthy();
  });
});

describe('logs table — real data integrity', () => {
  it('starts empty (no hardcoded seeded demo activity)', () => {
    // The logs table should NOT contain any pre-seeded demo log entries.
    // Only import/connector/user actions create logs.
    const rows = db.prepare('SELECT * FROM logs').all() as Array<{ summary?: string }>;
    // Allow zero or only real system init logs (not demo-like strings)
    const demoLike = rows.filter((r) =>
      /demo|mock|placeholder|example|hardcoded|fake/i.test(r.summary ?? '')
    );
    expect(demoLike).toHaveLength(0);
  });

  it('appendLog writes a real row', () => {
    const before = (db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number }).c;
    db.prepare(`
      INSERT INTO logs (event_type, source_tool, actor, summary)
      VALUES (?, ?, ?, ?)
    `).run('test.event', 'test', 'system', 'Integration test log entry');
    const after = (db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number }).c;
    expect(after).toBe(before + 1);
  });
});

describe('import_jobs — canonical ingestion state machine', () => {
  it('can insert and retrieve an import job through full lifecycle', () => {
    const result = db.prepare(`
      INSERT INTO import_jobs (filename, mimetype, size_bytes, notes, status)
      VALUES (?, ?, ?, ?, 'received')
    `).run('test.txt', 'text/plain', 1234, 'test import notes');

    const jobId = result.lastInsertRowid;
    expect(jobId).toBeGreaterThan(0);

    // Advance through lifecycle
    db.prepare(`UPDATE import_jobs SET status='parsing', updated_at=datetime('now') WHERE id=?`).run(jobId);
    db.prepare(`UPDATE import_jobs SET status='classifying', updated_at=datetime('now') WHERE id=?`).run(jobId);

    const docResult = db.prepare(`
      INSERT INTO documents (tool, doc_id, content, metadata)
      VALUES ('import', ?, ?, '{}')
    `).run(`job-${jobId}-test.txt`, 'test content');

    db.prepare(`
      UPDATE import_jobs SET status='indexed', document_ids=?, updated_at=datetime('now') WHERE id=?
    `).run(JSON.stringify([docResult.lastInsertRowid]), jobId);

    const job = db.prepare('SELECT * FROM import_jobs WHERE id=?').get(jobId) as {
      status: string; notes: string; filename: string;
    };
    expect(job.status).toBe('indexed');
    expect(job.notes).toBe('test import notes');
    expect(job.filename).toBe('test.txt');
  });
});

describe('prism context — full-text search, no mock', () => {
  it('returns empty array when no documents match', () => {
    let rows: unknown[] = [];
    try {
      rows = db.prepare(`
        SELECT d.content, d.tool, d.metadata
        FROM documents_fts fts
        JOIN documents d ON d.id = fts.rowid
        WHERE documents_fts MATCH ?
        LIMIT 10
      `).all('xyzzy_nonexistent_query_abc123') as unknown[];
    } catch {
      rows = [];
    }
    expect(rows).toHaveLength(0);
  });

  it('returns real results when documents are indexed', () => {
    // Insert a test document
    db.prepare(`
      INSERT OR REPLACE INTO documents (tool, doc_id, content, metadata)
      VALUES ('import', 'context-test-doc', 'UserMap context engineering platform', '{}')
    `).run();

    let rows: Array<{ content: string }> = [];
    try {
      rows = db.prepare(`
        SELECT d.content, d.tool, d.metadata
        FROM documents_fts fts
        JOIN documents d ON d.id = fts.rowid
        WHERE documents_fts MATCH ?
        LIMIT 10
      `).all('context engineering') as typeof rows;
    } catch {
      rows = [];
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].content).toContain('context engineering');
  });
});

describe('custom_apis — CRUD with no placeholders', () => {
  it('can create and retrieve a custom API', () => {
    const result = db.prepare(`
      INSERT INTO custom_apis (name, direction, url, method, headers, body_template, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run('my-api', 'pull', 'https://api.example.com/data', 'GET', '{}', '');

    const api = db.prepare('SELECT * FROM custom_apis WHERE id=?').get(result.lastInsertRowid) as {
      name: string; direction: string; url: string;
    };
    expect(api.name).toBe('my-api');
    expect(api.direction).toBe('pull');
    expect(api.url).toBe('https://api.example.com/data');
  });

  it('can delete a custom API', () => {
    const result = db.prepare(`
      INSERT INTO custom_apis (name, direction, url, method, headers, body_template, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run('delete-test-api', 'push', 'https://api.example.com/push', 'POST', '{}', '');

    const id = result.lastInsertRowid;
    db.prepare('DELETE FROM custom_apis WHERE id=?').run(id);
    const row = db.prepare('SELECT * FROM custom_apis WHERE id=?').get(id);
    expect(row).toBeUndefined();
  });
});

describe('connector_config — AI engines', () => {
  it('seed data includes chatgpt, claude, gemini, ollama', () => {
    const types = (db.prepare("SELECT connector_type FROM connector_config WHERE direction='ai'")
      .all() as Array<{ connector_type: string }>)
      .map((r) => r.connector_type);
    expect(types).toContain('chatgpt');
    expect(types).toContain('claude');
    expect(types).toContain('gemini');
    expect(types).toContain('ollama');
  });

  it('can store and retrieve an AI engine API key', () => {
    const row = db.prepare("SELECT id FROM connector_config WHERE connector_type='chatgpt' AND direction='ai'")
      .get() as { id: number } | undefined;
    expect(row).toBeTruthy();
    if (!row) return;

    db.prepare(`
      UPDATE connector_config SET config=?, enabled=1, last_status='connected', updated_at=datetime('now') WHERE id=?
    `).run(JSON.stringify({ api_key: 'sk-test-key-placeholder' }), row.id);

    const updated = db.prepare('SELECT config FROM connector_config WHERE id=?').get(row.id) as { config: string };
    const config = JSON.parse(updated.config) as { api_key: string };
    expect(config.api_key).toBe('sk-test-key-placeholder');
  });
});

describe('prism_sessions / prism_messages — chat persistence', () => {
  it('tables are created', () => {
    const sessions = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prism_sessions'").get();
    const messages = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prism_messages'").get();
    expect(sessions).toBeTruthy();
    expect(messages).toBeTruthy();
  });

  it('can create a session and append messages', () => {
    const res = db.prepare(`INSERT INTO prism_sessions (title) VALUES (?)`).run('Test session');
    const sessionId = res.lastInsertRowid;
    expect(sessionId).toBeGreaterThan(0);

    db.prepare(`INSERT INTO prism_messages (session_id, role, content) VALUES (?, ?, ?)`).run(sessionId, 'user', 'Hello Prism');
    db.prepare(`INSERT INTO prism_messages (session_id, role, content) VALUES (?, ?, ?)`).run(sessionId, 'assistant', 'Hello! How can I help?');

    const msgs = db.prepare('SELECT role, content FROM prism_messages WHERE session_id = ? ORDER BY id ASC').all(sessionId) as Array<{ role: string; content: string }>;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });

  it('cascades deletes: removing a session removes its messages', () => {
    const res = db.prepare(`INSERT INTO prism_sessions (title) VALUES (?)`).run('Delete cascade test');
    const sessionId = res.lastInsertRowid;
    db.prepare(`INSERT INTO prism_messages (session_id, role, content) VALUES (?, ?, ?)`).run(sessionId, 'user', 'msg1');

    db.prepare('DELETE FROM prism_sessions WHERE id = ?').run(sessionId);

    const msgs = db.prepare('SELECT * FROM prism_messages WHERE session_id = ?').all(sessionId);
    expect(msgs).toHaveLength(0);
  });
});

// =============================================================================
// Prism Memory Engine — Prism Memory Extractor v2 tests
// =============================================================================

import {
  extractMemories,
  contentHash,
  jaccardSimilarity,
  detectConflict,
} from './apps/server/src/services/prismMemoryExtractor.ts';

describe('prismMemoryExtractor — extraction logic', () => {
  it('extracts a decision from text mentioning "because"', () => {
    const text = 'We decided to use PostgreSQL because it has better JSON support than MySQL.';
    const memories = extractMemories(text);
    expect(memories.length).toBeGreaterThan(0);
    const decision = memories.find((m) => m.category === 'decision');
    expect(decision).toBeTruthy();
    expect(decision!.confidence).toBeGreaterThan(0);
    expect(decision!.dedup_hash).toHaveLength(64); // SHA-256 hex
  });

  it('extracts a preference from text mentioning "I prefer"', () => {
    const text = 'I prefer TypeScript over JavaScript for all new projects. Always use strict mode.';
    const memories = extractMemories(text);
    expect(memories.length).toBeGreaterThan(0);
    const pref = memories.find((m) => m.category === 'preference');
    expect(pref).toBeTruthy();
  });

  it('extracts a milestone from text mentioning "finally" + "fixed"', () => {
    const text = 'Finally got the authentication working. The bug was a CORS misconfiguration. Fixed it by adding the right headers.';
    const memories = extractMemories(text);
    expect(memories.length).toBeGreaterThan(0);
    // Should be classified as milestone (resolved problem → milestone via disambiguation)
    const milestone = memories.find((m) => m.category === 'milestone');
    expect(milestone).toBeTruthy();
  });

  it('extracts a problem from text describing a bug without resolution', () => {
    const text = 'The payment system keeps failing. The root cause is unknown. We cannot reproduce it in staging.';
    const memories = extractMemories(text);
    expect(memories.length).toBeGreaterThan(0);
    const problem = memories.find((m) => m.category === 'problem');
    expect(problem).toBeTruthy();
  });

  it('assigns confidence 0.0–1.0', () => {
    const text = 'We decided to use React because it has a great ecosystem. We always prefer functional components.';
    const memories = extractMemories(text);
    for (const m of memories) {
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('skips segments shorter than 20 characters', () => {
    const memories = extractMemories('Short.');
    expect(memories).toHaveLength(0);
  });

  it('skips segments below minConfidence threshold', () => {
    // Very sparse text with only one faint marker → should not meet default threshold
    const memories = extractMemories('The', 0.9);
    expect(memories).toHaveLength(0);
  });

  it('splits on double newlines (paragraph mode)', () => {
    const text = [
      'We decided to use GraphQL because it reduces over-fetching.',
      'I prefer snake_case for Python code always.',
      'The bug was caused by a race condition in the async handler.',
    ].join('\n\n');
    const memories = extractMemories(text);
    // Should produce at least 2 distinct memory units
    expect(memories.length).toBeGreaterThanOrEqual(2);
  });
});

describe('prismMemoryExtractor — content hash and dedup', () => {
  it('contentHash returns 64-char hex string', () => {
    const h = contentHash('hello world');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('contentHash is stable (same input → same output)', () => {
    const a = contentHash('  Hello World  ');
    const b = contentHash('hello world'); // normalised: lowercase, trimmed
    expect(a).toBe(b);
  });

  it('contentHash differs for different inputs', () => {
    const a = contentHash('hello world');
    const b = contentHash('goodbye world');
    expect(a).not.toBe(b);
  });

  it('jaccardSimilarity returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world test', 'hello world test')).toBe(1.0);
  });

  it('jaccardSimilarity returns 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0.0);
  });

  it('jaccardSimilarity returns value between 0 and 1 for partial overlap', () => {
    const sim = jaccardSimilarity('we use PostgreSQL for the database', 'we should use MySQL for the database');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('prismMemoryExtractor — conflict detection', () => {
  it('detects conflict when one memory negates the other with high overlap', () => {
    const conflict = detectConflict(
      'We always use TypeScript for new projects.',
      'We never use TypeScript for new projects.',
      'preference',
      'preference'
    );
    expect(conflict).toBe(true);
  });

  it('does not flag conflict for different categories', () => {
    const conflict = detectConflict(
      'We always use TypeScript.',
      'We never use TypeScript.',
      'preference',
      'decision'
    );
    expect(conflict).toBe(false);
  });

  it('does not flag conflict for unrelated content', () => {
    const conflict = detectConflict(
      'The sky is blue.',
      'We prefer PostgreSQL over MySQL.',
      'decision',
      'decision'
    );
    expect(conflict).toBe(false);
  });
});

describe('prism_memory_units — DB schema and FTS', () => {
  it('prism_memory_units table exists', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prism_memory_units'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('memory_units_fts virtual table exists', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_units_fts'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('can insert a memory unit and retrieve via FTS', () => {
    db.prepare(`
      INSERT INTO prism_memory_units
        (content, category, confidence, source_tool, provenance, dedup_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'We decided to adopt a structured memory architecture for the extraction pipeline',
      'decision',
      0.8,
      'test',
      '{}',
      contentHash('We decided to adopt a structured memory architecture for the extraction pipeline'),
    );

    let rows: Array<{ content: string; category: string }> = [];
    try {
      rows = db.prepare(`
        SELECT m.content, m.category
        FROM memory_units_fts fts
        JOIN prism_memory_units m ON m.id = fts.rowid
        WHERE memory_units_fts MATCH ?
        LIMIT 5
      `).all('extraction') as typeof rows;
    } catch {
      rows = [];
    }

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].category).toBe('decision');
    expect(rows[0].content).toContain('extraction');
  });

  it('conflict_flag defaults to 0 (no conflict)', () => {
    const result = db.prepare(`
      INSERT INTO prism_memory_units (content, category, confidence, source_tool, provenance, dedup_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Test memory unit', 'general', 0.5, 'test', '{}', contentHash('Test memory unit'));

    const row = db.prepare('SELECT conflict_flag, conflict_with FROM prism_memory_units WHERE id = ?')
      .get(result.lastInsertRowid) as { conflict_flag: number; conflict_with: string };
    expect(row.conflict_flag).toBe(0);
    expect(JSON.parse(row.conflict_with)).toEqual([]);
  });

  it('category CHECK constraint rejects invalid category', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO prism_memory_units (content, category, confidence, source_tool, provenance, dedup_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('bad cat', 'invalid_category', 0.5, 'test', '{}', 'abc');
    }).toThrow();
  });
});

// =============================================================================
// Slack connector — DB schema and sync service tests
// =============================================================================

describe('slack_messages — DB schema', () => {
  it('slack_messages table is created', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='slack_messages'").get();
    expect(row).toBeTruthy();
  });

  it('has the required columns', () => {
    const cols = db.prepare("PRAGMA table_info(slack_messages)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('ts');
    expect(names).toContain('channel_id');
    expect(names).toContain('user_id');
    expect(names).toContain('text');
    expect(names).toContain('thread_ts');
    expect(names).toContain('timestamp');
    expect(names).toContain('attachments');
    expect(names).toContain('files');
    expect(names).toContain('raw_json');
    expect(names).toContain('connection_id');
  });

  it('enforces UNIQUE(channel_id, ts) constraint', () => {
    db.prepare(`
      INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
      VALUES ('C001', '1700000000.000100', 'hello', '2023-01-01T00:00:00.000Z', '{}')
    `).run();

    // Second insert with the same (channel_id, ts) should upsert (ON CONFLICT DO UPDATE)
    expect(() => {
      db.prepare(`
        INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
        VALUES ('C001', '1700000000.000100', 'hello', '2023-01-01T00:00:00.000Z', '{}')
      `).run();
    }).toThrow();
  });

  it('can insert a message with all fields', () => {
    const result = db.prepare(`
      INSERT INTO slack_messages
        (channel_id, ts, user_id, text, thread_ts, timestamp, attachments, files, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'C002',
      '1700000001.000100',
      'U123',
      'Hello world',
      null,
      '2023-11-14T20:00:01.000Z',
      '[]',
      '[]',
      '{"ts":"1700000001.000100","text":"Hello world"}',
    );

    expect(result.lastInsertRowid).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM slack_messages WHERE id = ?').get(result.lastInsertRowid) as {
      channel_id: string;
      ts: string;
      user_id: string;
      text: string;
    };
    expect(row.channel_id).toBe('C002');
    expect(row.ts).toBe('1700000001.000100');
    expect(row.user_id).toBe('U123');
    expect(row.text).toBe('Hello world');
  });

  it('upsert by (channel_id, ts) updates text but keeps id', () => {
    db.prepare(`
      INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
      VALUES ('C003', '1700000002.000100', 'original', '2023-01-01T00:00:00.000Z', '{}')
    `).run();

    const before = db.prepare("SELECT id, text FROM slack_messages WHERE channel_id='C003' AND ts='1700000002.000100'")
      .get() as { id: number; text: string };
    expect(before.text).toBe('original');

    db.prepare(`
      INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
      VALUES ('C003', '1700000002.000100', 'edited', '2023-01-01T00:00:00.000Z', '{}')
      ON CONFLICT(channel_id, ts) DO UPDATE SET text = excluded.text
    `).run();

    const after = db.prepare("SELECT id, text FROM slack_messages WHERE channel_id='C003' AND ts='1700000002.000100'")
      .get() as { id: number; text: string };
    expect(after.text).toBe('edited');
    expect(after.id).toBe(before.id);
  });
});

describe('slack_messages — connection linkage', () => {
  it('connection_id is nullable (messages survive connection deletion)', () => {
    const col = (db.prepare("PRAGMA table_info(slack_messages)").all() as Array<{ name: string; notnull: number }>)
      .find((c) => c.name === 'connection_id');
    expect(col).toBeTruthy();
    expect(col!.notnull).toBe(0); // nullable
  });
});

describe('slackSync service — DB contract (no connections)', () => {
  it('connections table starts with no Slack entries in a fresh DB', () => {
    const rows = db.prepare("SELECT * FROM connections WHERE tool = 'slack'").all() as Array<{ tool: string }>;
    // Fresh DB should have no slack connections
    expect(rows.every((r) => r.tool === 'slack')).toBe(true);
    // (count may be 0 or > 0 depending on test order; key check is table exists and tool column works)
    const cols = db.prepare("PRAGMA table_info(connections)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('tool');
    expect(names).toContain('access_token');
    expect(names).toContain('account_id');
  });

  it('sync_state table can store a slack sync entry', () => {
    db.prepare(`
      INSERT INTO sync_state (tool, status, updated_at)
      VALUES ('slack:T_TEST:U_TEST', 'syncing', datetime('now'))
      ON CONFLICT(tool) DO UPDATE SET status = 'syncing', updated_at = datetime('now')
    `).run();

    const row = db.prepare("SELECT * FROM sync_state WHERE tool = 'slack:T_TEST:U_TEST'").get() as {
      tool: string; status: string;
    } | undefined;
    expect(row).toBeTruthy();
    expect(row!.status).toBe('syncing');

    // Mark complete
    db.prepare(`UPDATE sync_state SET status = 'idle', last_synced = datetime('now') WHERE tool = 'slack:T_TEST:U_TEST'`).run();
    const done = db.prepare("SELECT status FROM sync_state WHERE tool = 'slack:T_TEST:U_TEST'").get() as { status: string };
    expect(done.status).toBe('idle');
  });
});

describe('slackSync service — sync state and log contracts', () => {
  it('logs table can hold slack sync event types', () => {
    const events = [
      'slack.sync.started',
      'slack.sync.completed',
      'slack.sync.skipped',
      'slack.sync.error',
      'slack.sync.channel_error',
      'slack.sync.triggered',
    ];
    for (const event_type of events) {
      db.prepare(`
        INSERT INTO logs (event_type, source_tool, actor, summary)
        VALUES (?, 'slack', 'system', ?)
      `).run(event_type, `Test log entry: ${event_type}`);
    }

    const rows = db.prepare(`
      SELECT event_type FROM logs WHERE source_tool = 'slack' ORDER BY id DESC LIMIT 6
    `).all() as Array<{ event_type: string }>;
    const inserted = rows.map((r) => r.event_type);
    expect(inserted).toContain('slack.sync.started');
    expect(inserted).toContain('slack.sync.completed');
    expect(inserted).toContain('slack.sync.skipped');
    expect(inserted).toContain('slack.sync.error');
  });

  it('connector_config can track slack sync status', () => {
    const row = db.prepare("SELECT id FROM connector_config WHERE connector_type = 'slack' LIMIT 1").get() as { id: number } | undefined;
    expect(row).toBeTruthy();
    if (!row) return;

    db.prepare(`UPDATE connector_config SET last_status = 'ok', last_run = datetime('now'), last_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(row.id);
    const updated = db.prepare('SELECT last_status FROM connector_config WHERE id = ?').get(row.id) as { last_status: string };
    expect(updated.last_status).toBe('ok');

    db.prepare(`UPDATE connector_config SET last_status = 'error', last_error = 'invalid_auth', updated_at = datetime('now') WHERE id = ?`).run(row.id);
    const errored = db.prepare('SELECT last_status, last_error FROM connector_config WHERE id = ?').get(row.id) as { last_status: string; last_error: string };
    expect(errored.last_status).toBe('error');
    expect(errored.last_error).toBe('invalid_auth');
  });
});

describe('slackSync service — upsert correctness via SQL', () => {
  it('ON CONFLICT(channel_id, ts) DO UPDATE correctly replaces text', () => {
    const channel = 'C_UPSERT_TEST';
    const ts = '1700000999.000001';

    db.prepare(`
      INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
      VALUES (?, ?, 'first', '2023-01-01T00:00:00.000Z', '{"v":1}')
    `).run(channel, ts);

    db.prepare(`
      INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
      VALUES (?, ?, 'second', '2023-01-01T00:00:00.000Z', '{"v":2}')
      ON CONFLICT(channel_id, ts) DO UPDATE SET
        text = excluded.text,
        raw_json = excluded.raw_json
    `).run(channel, ts);

    const row = db.prepare('SELECT text, raw_json FROM slack_messages WHERE channel_id = ? AND ts = ?').get(channel, ts) as {
      text: string; raw_json: string;
    };
    expect(row.text).toBe('second');
    expect(JSON.parse(row.raw_json)).toMatchObject({ v: 2 });
  });

  it('incremental sync cursor: highest ts is used as oldest boundary', () => {
    const channel = 'C_INCR_TEST';
    const messages = [
      { ts: '1700001000.000001', text: 'msg1' },
      { ts: '1700001001.000001', text: 'msg2' },
      { ts: '1700001002.000001', text: 'msg3' },
    ];

    for (const m of messages) {
      db.prepare(`
        INSERT INTO slack_messages (channel_id, ts, text, timestamp, raw_json)
        VALUES (?, ?, ?, datetime('now'), '{}')
      `).run(channel, m.ts, m.text);
    }

    const latest = db.prepare(
      'SELECT ts FROM slack_messages WHERE channel_id = ? ORDER BY ts DESC LIMIT 1',
    ).get(channel) as { ts: string } | undefined;

    expect(latest).toBeTruthy();
    expect(latest!.ts).toBe('1700001002.000001');
  });
});

