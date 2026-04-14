/**
 * prism-memories.ts — REST API for Prism Memory Units
 *
 * Endpoints:
 *   GET    /api/prism/memories          List memory units (filterable)
 *   POST   /api/prism/extract           Extract + persist memories from raw text
 *   GET    /api/prism/memories/:id      Get a single memory unit
 *   PATCH  /api/prism/memories/:id      Update node_label, topic, or resolve conflict
 *   DELETE /api/prism/memories/:id      Delete a memory unit
 *
 * These routes implement the MemPalace-inspired "Drawer" layer of UserMap:
 *   - Extracted memory units with category, confidence, and full provenance.
 *   - Deduplication: exact (SHA-256 hash) + near-duplicate (Jaccard similarity).
 *   - Conflict detection: flagged but never silently discarded.
 *   - FTS search aligned with L3 deep-search in MemPalace.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { appendLog } from './logs.js';
import {
  extractMemories,
  contentHash,
  jaccardSimilarity,
  detectConflict,
  type MemoryCategory,
  type ProvenanceInfo,
} from '../services/prismMemoryExtractor.js';

const router = Router();

/** Threshold above which a memory is considered a near-duplicate (Jaccard). */
const NEAR_DUP_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MemoryUnitRow {
  id: number;
  content: string;
  category: MemoryCategory;
  confidence: number;
  source_tool: string;
  source_doc_id?: number;
  source_ref?: string;
  node_label?: string;
  topic?: string;
  provenance: string;
  dedup_hash: string;
  conflict_flag: number;
  conflict_with: string;
  created_at: string;
  updated_at: string;
}

function parseRow(row: MemoryUnitRow) {
  return {
    ...row,
    provenance: safeJson(row.provenance, {}),
    conflict_with: safeJson(row.conflict_with, []) as number[],
    conflict_flag: Boolean(row.conflict_flag),
  };
}

function safeJson(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); } catch { return fallback; }
}

export interface PersistResult {
  /** The new row id, or null if the memory was an exact or near-duplicate. */
  id: number | null;
  /** True if the persisted memory was flagged as conflicting with existing memories. */
  has_conflict: boolean;
}

/**
 * Persist a single extracted memory, running dedup and conflict checks
 * against existing memories from the same source_tool.
 *
 * Returns a PersistResult with the inserted id (or null for duplicates)
 * and a conflict flag so callers do not need a second DB read.
 */
export function persistMemoryUnit(
  content: string,
  category: MemoryCategory,
  confidence: number,
  provenance: ProvenanceInfo,
  nodeLabel?: string,
  topic?: string
): PersistResult {
  const db = getDb();
  const hash = contentHash(content);

  // Exact-duplicate check (same hash already in DB)
  const existing = db.prepare(
    `SELECT id FROM prism_memory_units WHERE dedup_hash = ? LIMIT 1`
  ).get(hash) as { id: number } | undefined;
  if (existing) return { id: null, has_conflict: false };

  // Near-duplicate check using Jaccard similarity against recent memories
  // of the same category (check last 200 to keep cost bounded).
  const candidates = db.prepare(
    `SELECT id, content FROM prism_memory_units WHERE category = ? ORDER BY id DESC LIMIT 200`
  ).all(category) as Array<{ id: number; content: string }>;

  for (const cand of candidates) {
    const sim = jaccardSimilarity(content, cand.content);
    if (sim >= NEAR_DUP_THRESHOLD) {
      // Very high similarity — treat as near-duplicate, skip insertion
      return { id: null, has_conflict: false };
    }
  }

  // Conflict detection: find memories that might contradict this one
  const conflictIds: number[] = [];
  for (const cand of candidates) {
    if (detectConflict(content, cand.content, category, category)) {
      conflictIds.push(cand.id);
    }
  }

  const provenanceJson = JSON.stringify({
    source_tool: provenance.source_tool,
    source_doc_id: provenance.source_doc_id,
    source_ref: provenance.source_ref,
    filename: provenance.filename,
    job_id: provenance.job_id,
    connector: provenance.connector,
  });

  const result = db.prepare(`
    INSERT INTO prism_memory_units
      (content, category, confidence, source_tool, source_doc_id, source_ref,
       node_label, topic, provenance, dedup_hash, conflict_flag, conflict_with)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    content,
    category,
    confidence,
    provenance.source_tool,
    provenance.source_doc_id ?? null,
    provenance.source_ref ?? null,
    nodeLabel ?? null,
    topic ?? null,
    provenanceJson,
    hash,
    conflictIds.length > 0 ? 1 : 0,
    JSON.stringify(conflictIds),
  );

  const newId = result.lastInsertRowid as number;
  const hasConflict = conflictIds.length > 0;

  // Back-flag any conflicting memories so the user sees both sides
  if (hasConflict) {
    for (const cid of conflictIds) {
      const prev = db.prepare(
        `SELECT conflict_with FROM prism_memory_units WHERE id = ?`
      ).get(cid) as { conflict_with: string } | undefined;
      if (!prev) continue;
      const prevList = safeJson(prev.conflict_with, []) as number[];
      if (!prevList.includes(newId)) {
        prevList.push(newId);
        db.prepare(
          `UPDATE prism_memory_units SET conflict_flag=1, conflict_with=?, updated_at=datetime('now') WHERE id=?`
        ).run(JSON.stringify(prevList), cid);
      }
    }
  }

  return { id: newId, has_conflict: hasConflict };
}

// ---------------------------------------------------------------------------
// GET /api/prism/memories
// ---------------------------------------------------------------------------

router.get('/memories', (req: Request, res: Response) => {
  const db = getDb();
  const {
    category,
    source_tool,
    conflict_only,
    q,
    limit: limitStr = '50',
    offset: offsetStr = '0',
  } = req.query as Record<string, string | undefined>;

  const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
  const offset = parseInt(offsetStr ?? '0', 10) || 0;

  // FTS path (MemPalace L3 deep search style)
  if (q && q.trim()) {
    let rows: MemoryUnitRow[] = [];
    try {
      rows = db.prepare(`
        SELECT m.*
        FROM memory_units_fts fts
        JOIN prism_memory_units m ON m.id = fts.rowid
        WHERE memory_units_fts MATCH ?
        ${category ? 'AND m.category = ?' : ''}
        LIMIT ? OFFSET ?
      `).all(
        ...[q.trim(), ...(category ? [category] : []), limit, offset]
      ) as MemoryUnitRow[];
    } catch {
      rows = [];
    }
    return res.json({ memories: rows.map(parseRow), total: rows.length, query: q.trim() });
  }

  // Filtered list path
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (source_tool) { conditions.push('source_tool = ?'); params.push(source_tool); }
  if (conflict_only === 'true') { conditions.push('conflict_flag = 1'); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.prepare(
    `SELECT COUNT(*) AS c FROM prism_memory_units ${where}`
  ).get(...params) as { c: number };

  const rows = db.prepare(
    `SELECT * FROM prism_memory_units ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as MemoryUnitRow[];

  return res.json({ memories: rows.map(parseRow), total: countRow.c, limit, offset });
});

// ---------------------------------------------------------------------------
// POST /api/prism/extract
//
// Extract memories from a raw text string and persist them to DB.
// Accepts: { content, source_tool?, source_doc_id?, source_ref?, filename?, notes? }
// Returns: { extracted, persisted, duplicates, conflicts }
// ---------------------------------------------------------------------------

router.post('/extract', async (req: Request, res: Response) => {
  const {
    content,
    source_tool = 'manual',
    source_doc_id,
    source_ref,
    filename,
    notes,
  } = req.body as {
    content?: string;
    source_tool?: string;
    source_doc_id?: number;
    source_ref?: string;
    filename?: string;
    notes?: string;
  };

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  // Prepend notes as a context hint if provided (mirrors import pipeline behaviour)
  const textToExtract = notes
    ? `[Import Context Hints]\n${notes}\n\n[Document Content]\n${content}`
    : content;

  const extracted = extractMemories(textToExtract);

  const provenance: ProvenanceInfo = {
    source_tool: source_tool ?? 'manual',
    source_doc_id,
    source_ref,
    filename,
  };

  let persisted = 0;
  let duplicates = 0;
  let conflicts = 0;
  const persistedIds: number[] = [];

  for (const mem of extracted) {
    const { id, has_conflict } = persistMemoryUnit(
      mem.content,
      mem.category,
      mem.confidence,
      provenance
    );
    if (id === null) {
      duplicates++;
    } else {
      persisted++;
      persistedIds.push(id);
      if (has_conflict) conflicts++;
    }
  }

  appendLog({
    event_type: 'prism.extract',
    source_tool: source_tool ?? 'manual',
    actor: 'system',
    object_ref: source_ref ?? `doc:${source_doc_id ?? 'unknown'}`,
    summary: `Extracted ${extracted.length} memories: ${persisted} persisted, ${duplicates} duplicates, ${conflicts} conflicts`,
  });

  return res.status(201).json({
    extracted: extracted.length,
    persisted,
    duplicates,
    conflicts,
    memory_ids: persistedIds,
  });
});

// ---------------------------------------------------------------------------
// GET /api/prism/memories/:id
// ---------------------------------------------------------------------------

router.get('/memories/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prism_memory_units WHERE id = ?')
    .get(req.params.id) as MemoryUnitRow | undefined;
  if (!row) return res.status(404).json({ error: 'Memory unit not found' });
  return res.json({ memory: parseRow(row) });
});

// ---------------------------------------------------------------------------
// PATCH /api/prism/memories/:id
//
// Update node_label, topic, conflict resolution, or category override.
// Body: { node_label?, topic?, conflict_flag?, conflict_with?, category? }
// ---------------------------------------------------------------------------

router.patch('/memories/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prism_memory_units WHERE id = ?')
    .get(req.params.id) as MemoryUnitRow | undefined;
  if (!row) return res.status(404).json({ error: 'Memory unit not found' });

  const { node_label, topic, conflict_flag, conflict_with, category } = req.body as {
    node_label?: string | null;
    topic?: string | null;
    conflict_flag?: boolean;
    conflict_with?: number[];
    category?: MemoryCategory;
  };

  const VALID_CATEGORIES: MemoryCategory[] = ['decision','preference','milestone','problem','emotional','general'];
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Invalid category: ${category}` });
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (node_label !== undefined) { updates.push('node_label = ?'); params.push(node_label); }
  if (topic !== undefined) { updates.push('topic = ?'); params.push(topic); }
  if (conflict_flag !== undefined) { updates.push('conflict_flag = ?'); params.push(conflict_flag ? 1 : 0); }
  if (conflict_with !== undefined) { updates.push('conflict_with = ?'); params.push(JSON.stringify(conflict_with)); }
  if (category !== undefined) { updates.push('category = ?'); params.push(category); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  updates.push("updated_at = datetime('now')");
  db.prepare(
    `UPDATE prism_memory_units SET ${updates.join(', ')} WHERE id = ?`
  ).run(...params, row.id);

  const updated = db.prepare('SELECT * FROM prism_memory_units WHERE id = ?')
    .get(row.id) as MemoryUnitRow;

  return res.json({ memory: parseRow(updated) });
});

// ---------------------------------------------------------------------------
// DELETE /api/prism/memories/:id
// ---------------------------------------------------------------------------

router.delete('/memories/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT id FROM prism_memory_units WHERE id = ?')
    .get(req.params.id) as { id: number } | undefined;
  if (!row) return res.status(404).json({ error: 'Memory unit not found' });

  db.prepare('DELETE FROM prism_memory_units WHERE id = ?').run(row.id);

  appendLog({
    event_type: 'prism.memory.delete',
    source_tool: 'user',
    actor: 'user',
    object_ref: `memory:${row.id}`,
    summary: `Deleted memory unit ${row.id}`,
  });

  return res.json({ ok: true, deleted_id: row.id });
});

export default router;
