import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import type { ContextResult, DocumentRecord } from '../adapters/base.js';

const router = Router();

interface ContextRequestBody {
  query?: unknown;
  sources?: unknown;
  limit?: unknown;
}

// POST /api/context — retrieve relevant context using keyword/FTS search
router.post('/', (req: Request<object, object, ContextRequestBody>, res: Response) => {
  const { query, sources, limit } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required and must be a non-empty string' });
  }

  const queryStr = query.trim();
  const maxResults = typeof limit === 'number' && limit > 0 && limit <= 50 ? Math.floor(limit) : 10;

  const allowedSources: string[] | null =
    Array.isArray(sources) && sources.length > 0
      ? sources.filter((s): s is string => typeof s === 'string')
      : null;

  const db = getDb();

  let rows: DocumentRecord[];

  try {
    if (allowedSources && allowedSources.length > 0) {
      const placeholders = allowedSources.map(() => '?').join(', ');
      rows = db
        .prepare(
          `SELECT d.id, d.tool, d.doc_id, d.content, d.metadata, d.created_at
           FROM documents_fts fts
           JOIN documents d ON d.id = fts.rowid
           WHERE documents_fts MATCH ?
             AND d.tool IN (${placeholders})
           ORDER BY rank
           LIMIT ?`
        )
        .all(queryStr, ...allowedSources, maxResults) as DocumentRecord[];
    } else {
      rows = db
        .prepare(
          `SELECT d.id, d.tool, d.doc_id, d.content, d.metadata, d.created_at
           FROM documents_fts fts
           JOIN documents d ON d.id = fts.rowid
           WHERE documents_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(queryStr, maxResults) as DocumentRecord[];
    }
  } catch {
    // FTS MATCH might throw on malformed query — fall back to LIKE search
    const likeQuery = `%${queryStr.replace(/[%_]/g, '\\$&')}%`;

    if (allowedSources && allowedSources.length > 0) {
      const placeholders = allowedSources.map(() => '?').join(', ');
      rows = db
        .prepare(
          `SELECT id, tool, doc_id, content, metadata, created_at
           FROM documents
           WHERE content LIKE ? ESCAPE '\\'
             AND tool IN (${placeholders})
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(likeQuery, ...allowedSources, maxResults) as DocumentRecord[];
    } else {
      rows = db
        .prepare(
          `SELECT id, tool, doc_id, content, metadata, created_at
           FROM documents
           WHERE content LIKE ? ESCAPE '\\'
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(likeQuery, maxResults) as DocumentRecord[];
    }
  }

  const results: ContextResult[] = rows.map((row) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // leave empty
    }
    return {
      source: row.tool,
      doc_id: row.doc_id,
      content: row.content,
      metadata: meta,
      created_at: row.created_at,
    };
  });

  return res.json({ query: queryStr, results });
});

export default router;
