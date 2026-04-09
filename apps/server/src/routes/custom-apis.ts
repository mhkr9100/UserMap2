import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { appendLog } from './logs.js';

const router = Router();

interface CustomApi {
  id?: number;
  name: string;
  direction: 'pull' | 'push';
  url: string;
  method?: string;
  /** Stored as JSON string in SQLite; deserialized on read */
  headers?: Record<string, string> | string;
  body_template?: string;
  enabled?: boolean | number;
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /api/custom-apis
 */
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM custom_apis ORDER BY name').all() as CustomApi[];
  res.json({
    apis: rows.map((r) => ({
      ...r,
      headers: safeJsonParse(r.headers as string, {}),
      enabled: Boolean(r.enabled),
    })),
  });
});

/**
 * POST /api/custom-apis
 */
router.post('/', (req: Request, res: Response) => {
  const { name, direction, url, method = 'GET', headers = {}, body_template = '', enabled = true } = req.body as CustomApi;

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!['pull', 'push'].includes(direction)) return res.status(400).json({ error: 'direction must be pull or push' });
  if (!url?.trim()) return res.status(400).json({ error: 'url is required' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO custom_apis (name, direction, url, method, headers, body_template, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), direction, url.trim(), method, JSON.stringify(headers), body_template, enabled ? 1 : 0);

  const created = db.prepare('SELECT * FROM custom_apis WHERE id = ?').get(result.lastInsertRowid) as CustomApi;

  appendLog({
    event_type: 'custom_api.created',
    source_tool: 'custom_api',
    actor: 'user',
    object_ref: `api:${created.id}`,
    summary: `Custom API created: ${name} (${direction})`,
  });

  res.status(201).json({ ...created, headers: safeJsonParse(created.headers as unknown as string, {}), enabled: Boolean(created.enabled) });
});

/**
 * PATCH /api/custom-apis/:id
 */
router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM custom_apis WHERE id = ?').get(req.params.id) as CustomApi | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, url, method, headers, body_template, enabled } = req.body as Partial<CustomApi>;

  db.prepare(`
    UPDATE custom_apis SET
      name = COALESCE(?, name),
      url = COALESCE(?, url),
      method = COALESCE(?, method),
      headers = COALESCE(?, headers),
      body_template = COALESCE(?, body_template),
      enabled = COALESCE(?, enabled),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? null,
    url ?? null,
    method ?? null,
    headers !== undefined ? JSON.stringify(headers) : null,
    body_template ?? null,
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM custom_apis WHERE id = ?').get(req.params.id) as CustomApi;
  res.json({ ...updated, headers: safeJsonParse(updated.headers as string, {}), enabled: Boolean(updated.enabled) });
});

/**
 * DELETE /api/custom-apis/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM custom_apis WHERE id = ?').get(req.params.id) as CustomApi | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM custom_apis WHERE id = ?').run(req.params.id);

  appendLog({
    event_type: 'custom_api.deleted',
    source_tool: 'custom_api',
    actor: 'user',
    object_ref: `api:${req.params.id}`,
    summary: `Custom API deleted: ${existing.name}`,
  });

  res.json({ ok: true });
});

function safeJsonParse(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); } catch { return fallback; }
}

export default router;
