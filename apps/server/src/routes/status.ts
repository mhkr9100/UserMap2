import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM connections').get() as { count: number };
  res.json({
    status: 'ok',
    version: '0.1.0',
    connections: row.count,
    timestamp: new Date().toISOString(),
  });
});

export default router;
