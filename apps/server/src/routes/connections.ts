import { Router } from 'express';
import { getDb } from '../db/index.js';
import type { ConnectionRecord } from '../adapters/base.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, tool, account_id, scopes, token_type, connected_at, updated_at
       FROM connections ORDER BY connected_at DESC`
    )
    .all() as Omit<ConnectionRecord, 'access_token'>[];

  res.json({ connections: rows });
});

export default router;
