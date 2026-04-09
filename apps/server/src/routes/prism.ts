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

export default router;

