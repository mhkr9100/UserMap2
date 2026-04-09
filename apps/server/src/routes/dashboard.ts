import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

interface LogRow {
  event_type: string;
  source_tool?: string;
  actor: string;
  summary?: string;
  created_at: string;
}

interface ConnectorRow {
  connector_type: string;
  last_status?: string;
  enabled: number;
  last_error?: string;
}

/**
 * GET /api/dashboard/summary
 *
 * Returns a plain-text summary of activity in the last 12 hours, derived
 * entirely from real DB records. If there are no records, returns null.
 * No fabricated data, no placeholders.
 */
router.get('/summary', (_req: Request, res: Response) => {
  const db = getDb();
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const logs = db
    .prepare(
      `SELECT event_type, source_tool, actor, summary, created_at
       FROM logs
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(since) as LogRow[];

  if (logs.length === 0) {
    return res.json({ summary: null, event_count: 0 });
  }

  // Count by event type
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  for (const log of logs) {
    counts[log.event_type] = (counts[log.event_type] ?? 0) + 1;
    if (log.event_type.includes('error') || log.event_type.includes('failed')) {
      if (log.summary) errors.push(log.summary);
    }
  }

  // Check active connectors
  const connectors = db
    .prepare(`SELECT connector_type, last_status, enabled, last_error FROM connector_config`)
    .all() as ConnectorRow[];

  const activeConnectors = connectors.filter((c) => c.enabled && c.last_status === 'connected');
  const errorConnectors = connectors.filter((c) => c.last_error);

  // Build natural language summary from real data
  const summaryParts: string[] = [];

  summaryParts.push(`${logs.length} event${logs.length !== 1 ? 's' : ''} recorded in the last 12 hours.`);

  const syncSuccess = counts['connector.pull.success'] ?? 0;
  const syncError = counts['connector.pull.error'] ?? 0;
  if (syncSuccess > 0 || syncError > 0) {
    summaryParts.push(
      `Connector syncs: ${syncSuccess} successful${syncError > 0 ? `, ${syncError} failed` : ''}.`
    );
  }

  const prismEvents = (counts['prism.classify'] ?? 0) + (counts['prism.structure'] ?? 0);
  if (prismEvents > 0) {
    summaryParts.push(`Prism processed ${prismEvents} item${prismEvents !== 1 ? 's' : ''}.`);
  }

  const userEdits =
    (counts['user.create'] ?? 0) + (counts['user.update'] ?? 0) + (counts['user.delete'] ?? 0);
  if (userEdits > 0) {
    summaryParts.push(`${userEdits} user edit${userEdits !== 1 ? 's' : ''} to the knowledge graph.`);
  }

  if (activeConnectors.length > 0) {
    summaryParts.push(
      `Active connectors: ${activeConnectors.map((c) => c.connector_type).join(', ')}.`
    );
  }

  if (errorConnectors.length > 0) {
    summaryParts.push(
      `Connector issues: ${errorConnectors.map((c) => `${c.connector_type} (${c.last_error})`).join('; ')}.`
    );
  }

  if (errors.length > 0 && errors.length <= 3) {
    summaryParts.push(`Errors: ${errors.join('; ')}.`);
  }

  return res.json({ summary: summaryParts.join(' '), event_count: logs.length });
});

export default router;
