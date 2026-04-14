import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { syncSlack } from '../services/slackSync.js';
import { appendLog } from './logs.js';

const router = Router();

/**
 * GET /api/slack/messages
 * Returns paginated Slack messages with optional filters.
 * Query params: channel_id, user_id, search, limit, offset
 */
router.get('/messages', (req: Request, res: Response) => {
  const db = getDb();
  const {
    channel_id,
    user_id,
    search,
    limit = '100',
    offset = '0',
  } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (channel_id) { conditions.push('channel_id = ?'); params.push(channel_id); }
  if (user_id) { conditions.push('user_id = ?'); params.push(user_id); }
  if (search) {
    conditions.push('(text LIKE ? OR user_id LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM slack_messages ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, parseInt(limit, 10), parseInt(offset, 10));

  const total = (db
    .prepare(`SELECT COUNT(*) as c FROM slack_messages ${where}`)
    .get(...params) as { c: number }).c;

  res.json({ messages: rows, total });
});

/**
 * GET /api/slack/status
 * Returns sync status, last sync time, total imported count, and any errors.
 */
router.get('/status', (_req: Request, res: Response) => {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM slack_messages').get() as { c: number }).c;

  const channelCounts = db.prepare(`
    SELECT channel_id, COUNT(*) as message_count
    FROM slack_messages
    GROUP BY channel_id
    ORDER BY message_count DESC
  `).all() as Array<{ channel_id: string; message_count: number }>;

  const syncStates = db.prepare(`
    SELECT * FROM sync_state WHERE tool LIKE 'slack:%' ORDER BY updated_at DESC
  `).all() as Array<{
    tool: string;
    status: string;
    last_synced: string | null;
    error_msg: string | null;
    updated_at: string;
  }>;

  const connectorRow = db.prepare(`
    SELECT last_run, last_status, last_error FROM connector_config WHERE connector_type = 'slack' LIMIT 1
  `).get() as { last_run: string | null; last_status: string | null; last_error: string | null } | undefined;

  const recentErrors = db.prepare(`
    SELECT summary, created_at FROM logs
    WHERE source_tool = 'slack' AND severity = 'error'
    ORDER BY created_at DESC LIMIT 5
  `).all() as Array<{ summary: string; created_at: string }>;

  res.json({
    total_messages: total,
    channels: channelCounts,
    sync_states: syncStates,
    last_run: connectorRow?.last_run ?? null,
    last_status: connectorRow?.last_status ?? null,
    last_error: connectorRow?.last_error ?? null,
    recent_errors: recentErrors,
  });
});

/**
 * POST /api/slack/sync
 * Trigger an immediate Slack message sync for a specific connection (or all).
 * Body (optional): { connection_id: number }
 */
router.post('/sync', async (req: Request, res: Response) => {
  const { connection_id } = req.body as { connection_id?: number };

  appendLog({
    event_type: 'slack.sync.triggered',
    source_tool: 'slack',
    actor: 'user',
    summary: connection_id
      ? `Manual Slack sync triggered for connection ${connection_id}`
      : 'Manual Slack sync triggered (all connections)',
  });

  try {
    const results = await syncSlack(connection_id);
    res.json({ ok: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog({
      event_type: 'slack.sync.error',
      source_tool: 'slack',
      actor: 'system',
      summary: `Slack sync failed: ${message}`,
      severity: 'error',
    });
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
