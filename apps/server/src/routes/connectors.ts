import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { appendLog } from './logs.js';

const router = Router();

export interface ConnectorConfig {
  id?: number;
  name: string;
  direction: 'pull' | 'push' | 'ai';
  connector_type: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  frequency_sec?: number;
  last_run?: string;
  last_status?: string;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /api/connectors
 * List all connector configurations, optionally filtered by direction.
 */
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { direction } = req.query as { direction?: string };
  const rows = direction
    ? db.prepare('SELECT * FROM connector_config WHERE direction = ? ORDER BY name').all(direction)
    : db.prepare('SELECT * FROM connector_config ORDER BY direction, name').all();

  res.json({
    connectors: (rows as ConnectorConfig[]).map((r) => ({
      ...r,
      config: safeJsonParse(r.config as unknown as string, {}),
      enabled: Boolean(r.enabled),
    })),
  });
});

/**
 * GET /api/connectors/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM connector_config WHERE id = ?').get(req.params.id) as ConnectorConfig | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, config: safeJsonParse(row.config as unknown as string, {}), enabled: Boolean(row.enabled) });
});

/**
 * PATCH /api/connectors/:id
 * Update connector fields.
 */
router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM connector_config WHERE id = ?').get(req.params.id) as ConnectorConfig | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { enabled, config, frequency_sec, last_status, last_error } = req.body as Partial<ConnectorConfig>;

  db.prepare(`
    UPDATE connector_config SET
      enabled = COALESCE(?, enabled),
      config = COALESCE(?, config),
      frequency_sec = COALESCE(?, frequency_sec),
      last_status = COALESCE(?, last_status),
      last_error = COALESCE(?, last_error),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    config !== undefined ? JSON.stringify(config) : null,
    frequency_sec ?? null,
    last_status ?? null,
    last_error ?? null,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM connector_config WHERE id = ?').get(req.params.id) as ConnectorConfig;
  res.json({ ...updated, config: safeJsonParse(updated.config as unknown as string, {}), enabled: Boolean(updated.enabled) });
});

/**
 * POST /api/connectors/:id/sync
 * Trigger an immediate sync attempt (mark last_run / last_status).
 */
router.post('/:id/sync', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM connector_config WHERE id = ?').get(req.params.id) as ConnectorConfig | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE connector_config SET last_run = datetime('now'), last_status = 'syncing', updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);

  appendLog({
    event_type: 'connector.sync.triggered',
    source_tool: row.connector_type,
    actor: 'user',
    object_ref: row.name,
    summary: `Manual sync triggered for ${row.name}`,
  });

  res.json({ ok: true, message: `Sync triggered for ${row.name}` });
});

/**
 * POST /api/connectors/:id/disconnect
 */
router.post('/:id/disconnect', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM connector_config WHERE id = ?').get(req.params.id) as ConnectorConfig | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE connector_config SET enabled = 0, last_status = 'disconnected', config = '{}', updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);

  appendLog({
    event_type: 'connector.disconnected',
    source_tool: row.connector_type,
    actor: 'user',
    object_ref: row.name,
    summary: `${row.name} disconnected`,
  });

  res.json({ ok: true });
});

/**
 * GET /api/connectors/sync-state
 */
router.get('/sync-state/all', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sync_state ORDER BY tool').all();
  res.json({ sync_state: rows });
});

function safeJsonParse(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); } catch { return fallback; }
}

export default router;
