import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

/**
 * GET /api/prism/health
 *
 * Returns real runtime health: connector statuses from DB, log count, sync states.
 * Never returns fabricated data.
 */
router.get('/health', (_req: Request, res: Response) => {
  const db = getDb();

  const connectors = db
    .prepare('SELECT connector_type, last_status, enabled, last_run, last_error FROM connector_config')
    .all() as Array<{
      connector_type: string;
      last_status?: string;
      enabled: number;
      last_run?: string;
      last_error?: string;
    }>;

  const logCount = (
    db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number }
  ).c;

  const syncStates = db
    .prepare('SELECT tool, status, last_synced, error_msg FROM sync_state')
    .all() as Array<{ tool: string; status: string; last_synced?: string; error_msg?: string }>;

  return res.json({
    status: 'ok',
    connectors: connectors.map((c) => ({
      type: c.connector_type,
      enabled: Boolean(c.enabled),
      last_status: c.last_status ?? null,
      last_run: c.last_run ?? null,
      last_error: c.last_error ?? null,
    })),
    log_count: logCount,
    sync_states: syncStates,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/prism/context
 *
 * Retrieves real context records matching the given intent using full-text search.
 * Does not apply heuristic filters or fabricate results.
 *
 * Request: { intent: string }
 * Response: { intent, results: Array<{ source, content }>, total }
 */
router.post('/context', async (req: Request, res: Response) => {
  const { intent } = req.body as { intent?: string };

  if (!intent || !intent.trim()) {
    return res.status(400).json({ error: 'intent is required' });
  }

  const db = getDb();

  // Full-text search against real documents
  let rows: Array<{ content: string; tool: string; metadata: string }> = [];
  try {
    rows = db
      .prepare(
        `SELECT d.content, d.tool, d.metadata
         FROM documents_fts fts
         JOIN documents d ON d.id = fts.rowid
         WHERE documents_fts MATCH ?
         LIMIT 10`
      )
      .all(intent.trim()) as typeof rows;
  } catch {
    // FTS match error (e.g. special characters) — return empty truthfully
    rows = [];
  }

  return res.json({
    intent: intent.trim(),
    results: rows.map((r) => ({
      source: r.tool,
      content: r.content,
    })),
    total: rows.length,
  });
});

// ---------------------------------------------------------------------------
// Prism chat session persistence
// ---------------------------------------------------------------------------

/**
 * GET /api/prism/sessions
 * List all sessions (newest first) with the last user message as a preview title.
 */
router.get('/sessions', (_req: Request, res: Response) => {
  const db = getDb();

  const sessions = db
    .prepare(`
      SELECT s.id, s.title, s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM prism_messages m WHERE m.session_id = s.id) AS message_count
      FROM prism_sessions s
      ORDER BY s.updated_at DESC
      LIMIT 100
    `)
    .all() as Array<{
      id: number;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }>;

  return res.json({ sessions });
});

/**
 * POST /api/prism/sessions
 * Create a new empty session and return it.
 * Body: { title?: string }
 */
router.post('/sessions', (req: Request, res: Response) => {
  const db = getDb();
  const title: string = ((req.body as { title?: string }).title ?? 'New conversation').slice(0, 255);

  const result = db
    .prepare(`INSERT INTO prism_sessions (title) VALUES (?)`)
    .run(title);

  const session = db
    .prepare('SELECT * FROM prism_sessions WHERE id = ?')
    .get(result.lastInsertRowid) as {
      id: number; title: string; created_at: string; updated_at: string;
    };

  return res.status(201).json({ session });
});

/**
 * GET /api/prism/sessions/:id
 * Return a session with all its messages in order.
 */
router.get('/sessions/:id', (req: Request, res: Response) => {
  const db = getDb();

  const session = db
    .prepare('SELECT * FROM prism_sessions WHERE id = ?')
    .get(req.params.id) as { id: number; title: string; created_at: string; updated_at: string } | undefined;

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const messages = db
    .prepare('SELECT id, role, content, created_at FROM prism_messages WHERE session_id = ? ORDER BY id ASC')
    .all(session.id) as Array<{ id: number; role: string; content: string; created_at: string }>;

  return res.json({ session, messages });
});

/**
 * POST /api/prism/sessions/:id/messages
 * Persist a batch of messages for a session (replaces the full history for the session).
 * Body: { messages: Array<{ role: 'user'|'assistant'|'system', content: string }>, title?: string }
 */
router.post('/sessions/:id/messages', (req: Request, res: Response) => {
  const db = getDb();

  const session = db
    .prepare('SELECT id FROM prism_sessions WHERE id = ?')
    .get(req.params.id) as { id: number } | undefined;

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { messages, title } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    title?: string;
  };

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  const insertMsg = db.prepare(
    `INSERT INTO prism_messages (session_id, role, content) VALUES (?, ?, ?)`
  );
  const deleteOld = db.prepare('DELETE FROM prism_messages WHERE session_id = ?');

  db.transaction(() => {
    deleteOld.run(session.id);
    for (const m of messages) {
      if (m.role && m.content) {
        insertMsg.run(session.id, m.role, m.content);
      }
    }
    const newTitle = title?.trim().slice(0, 255);
    if (newTitle) {
      db.prepare(`UPDATE prism_sessions SET title=?, updated_at=datetime('now') WHERE id=?`)
        .run(newTitle, session.id);
    } else {
      db.prepare(`UPDATE prism_sessions SET updated_at=datetime('now') WHERE id=?`)
        .run(session.id);
    }
  })();

  return res.json({ ok: true, session_id: session.id, count: messages.length });
});

export default router;

