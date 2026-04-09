import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

export interface LogRecord {
  id?: number;
  event_type: string;
  source_tool?: string;
  actor: 'system' | 'user' | 'prism';
  object_ref?: string;
  summary?: string;
  before_state?: string;
  after_state?: string;
  severity?: 'info' | 'warn' | 'error';
  created_at?: string;
}

/**
 * GET /api/logs
 * List log events with optional filters: event_type, source_tool, actor,
 * severity, from (ISO date), to (ISO date), search (text), limit, offset.
 */
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    event_type,
    source_tool,
    actor,
    severity,
    from,
    to,
    search,
    limit = '100',
    offset = '0',
  } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (event_type) { conditions.push('event_type = ?'); params.push(event_type); }
  if (source_tool) { conditions.push('source_tool = ?'); params.push(source_tool); }
  if (actor) { conditions.push('actor = ?'); params.push(actor); }
  if (severity) { conditions.push('severity = ?'); params.push(severity); }
  if (from) { conditions.push('created_at >= ?'); params.push(from); }
  if (to) { conditions.push('created_at <= ?'); params.push(to); }
  if (search) {
    conditions.push('(summary LIKE ? OR object_ref LIKE ? OR event_type LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, parseInt(limit, 10), parseInt(offset, 10));

  const total = (db
    .prepare(`SELECT COUNT(*) as c FROM logs ${where}`)
    .get(...params) as { c: number }).c;

  res.json({ logs: rows, total });
});

/**
 * POST /api/logs
 * Append a log event.
 */
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    event_type,
    source_tool,
    actor = 'system',
    object_ref,
    summary,
    before_state,
    after_state,
    severity = 'info',
  } = req.body as LogRecord;

  if (!event_type) {
    return res.status(400).json({ error: 'event_type is required' });
  }

  const stmt = db.prepare(`
    INSERT INTO logs (event_type, source_tool, actor, object_ref, summary, before_state, after_state, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(event_type, source_tool ?? null, actor, object_ref ?? null,
    summary ?? null, before_state ?? null, after_state ?? null, severity);

  const created = db.prepare('SELECT * FROM logs WHERE id = ?').get(info.lastInsertRowid) as LogRecord;
  res.status(201).json(created);
});

/**
 * DELETE /api/logs/:id
 * Remove a single log entry.
 */
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  db.prepare('DELETE FROM logs WHERE id = ?').run(id);
  res.json({ ok: true });
});

/**
 * GET /api/logs/distinct-tools
 * Return distinct source_tool values for filter dropdowns.
 */
router.get('/distinct-tools', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`SELECT DISTINCT source_tool FROM logs WHERE source_tool IS NOT NULL ORDER BY source_tool`).all() as { source_tool: string }[];
  res.json({ tools: rows.map((r) => r.source_tool) });
});

export function appendLog(record: Omit<LogRecord, 'id' | 'created_at'>): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO logs (event_type, source_tool, actor, object_ref, summary, before_state, after_state, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.event_type,
      record.source_tool ?? null,
      record.actor ?? 'system',
      record.object_ref ?? null,
      record.summary ?? null,
      record.before_state ?? null,
      record.after_state ?? null,
      record.severity ?? 'info',
    );
  } catch (err) {
    console.error('[UserMap] appendLog failed:', err instanceof Error ? err.message : err);
  }
}

export default router;
