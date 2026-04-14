import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getDb } from '../db/index.js';
import { appendLog } from './logs.js';
import { extractMemories } from '../services/prismMemoryExtractor.js';
import { persistMemoryUnit } from './prism-memories.js';

const router = Router();

/** Temporary upload directory — files are processed and then cleaned up. */
const UPLOAD_TMP = path.join(os.tmpdir(), 'usermap-uploads');
if (!fs.existsSync(UPLOAD_TMP)) fs.mkdirSync(UPLOAD_TMP, { recursive: true });

const upload = multer({
  dest: UPLOAD_TMP,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    const ALLOWED = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      // Some browsers send these for .md files
      'application/octet-stream',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const ALLOWED_EXTS = ['.txt', '.md', '.csv', '.json', '.pdf', '.docx', '.xlsx', '.xls'];
    if (ALLOWED.includes(file.mimetype) || ALLOWED_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext})`));
    }
  },
});

/**
 * Attempt to extract plain text from an uploaded file.
 * For text-based formats (txt, md, json, csv) we just read the file.
 * For binary formats (pdf, docx, xlsx) we return a best-effort extraction
 * or a clear "parser not available" message so callers know extraction is partial.
 */
async function extractText(filePath: string, originalName: string, mimetype: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const textExts = ['.txt', '.md', '.json', '.csv'];
  if (textExts.includes(ext) || mimetype.startsWith('text/') || mimetype === 'application/json') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    try {
      // Dynamic require — optional dependency; not bundled in base install
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (await import('pdf-parse' as any)).default as (buf: Buffer) => Promise<{ text: string }>;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      return result.text;
    } catch {
      return `[PDF content — install 'pdf-parse' on the server to enable full text extraction from ${originalName}]`;
    }
  }

  if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mammoth = (await import('mammoth' as any)) as { extractRawText: (opts: { path: string }) => Promise<{ value: string }> };
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch {
      return `[DOCX content — install 'mammoth' on the server to enable full text extraction from ${originalName}]`;
    }
  }

  if (ext === '.xlsx' || ext === '.xls' ||
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimetype === 'application/vnd.ms-excel') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (await import('xlsx' as any)) as {
        readFile: (path: string) => { SheetNames: string[]; Sheets: Record<string, unknown> };
        utils: { sheet_to_csv: (sheet: unknown) => string };
      };
      const workbook = XLSX.readFile(filePath);
      const sheets = workbook.SheetNames.map((n) =>
        `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[n])}`
      );
      return sheets.join('\n\n');
    } catch {
      return `[Spreadsheet content — install 'xlsx' on the server to enable full text extraction from ${originalName}]`;
    }
  }

  // Fallback: attempt raw UTF-8 read
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return `[Binary file — content extraction not supported for ${originalName}]`;
  }
}

/**
 * POST /api/import
 *
 * Canonical ingestion pipeline:
 *   upload → parse → prism classify/structure → canonical DB write → lifecycle log emit
 *
 * Accepts multipart/form-data:
 *   - file (required): the document to import
 *   - notes (optional): user guidance / context hints for Prism
 *
 * Returns: { job_id, filename, status, document_id, notes }
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded. Attach a file with field name "file".' });
  }

  // Validate that the multer-assigned temp path is within the expected upload directory.
  // Although file.path is set by multer (not user-supplied), this guard ensures
  // the resolved path cannot escape the upload temp dir via any manipulation.
  const resolvedFilePath = path.resolve(file.path);
  const resolvedUploadDir = path.resolve(UPLOAD_TMP);
  if (!resolvedFilePath.startsWith(resolvedUploadDir + path.sep)) {
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
    return res.status(400).json({ error: 'Invalid file path.' });
  }

  // Sanitize originalname: take only the basename, then strip any characters that
  // are not alphanumeric, hyphen, underscore, period, or space.
  // We only use safeOriginalName for display, extension detection, and DB storage —
  // never for file I/O.
  const safeOriginalName = path.basename(file.originalname)
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .slice(0, 255);

  const notes: string = (req.body as { notes?: string }).notes?.trim() ?? '';
  const db = getDb();

  // 1. Create import job record (status: received)
  const jobResult = db.prepare(`
    INSERT INTO import_jobs (filename, mimetype, size_bytes, notes, status)
    VALUES (?, ?, ?, ?, 'received')
  `).run(safeOriginalName, file.mimetype, file.size, notes);

  const jobId = jobResult.lastInsertRowid as number;

  appendLog({
    event_type: 'import.received',
    source_tool: 'import',
    actor: 'user',
    object_ref: `job:${jobId}`,
    summary: `Import received: ${safeOriginalName} (${Math.round(file.size / 1024)}KB)`,
  });

  let extractedText = '';
  try {
    // 2. Parse file content
    db.prepare(`UPDATE import_jobs SET status='parsing', updated_at=datetime('now') WHERE id=?`).run(jobId);
    extractedText = await extractText(file.path, safeOriginalName, file.mimetype);

    appendLog({
      event_type: 'import.parsed',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Parsed ${safeOriginalName}: ${extractedText.length} chars extracted`,
    });

    // 3. Prism classify: prepend notes as context hint if provided.
    // The structured '[Import Context Hints]' prefix signals to Prism that this
    // section contains user-supplied guidance for classification and retrieval.
    db.prepare(`UPDATE import_jobs SET status='classifying', updated_at=datetime('now') WHERE id=?`).run(jobId);

    const contentToStore = notes
      ? `[Import Context Hints]\n${notes}\n\n[Document Content]\n${extractedText}`
      : extractedText;

    appendLog({
      event_type: 'prism.classify',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Classifying import: ${safeOriginalName}`,
    });

    appendLog({
      event_type: 'prism.structure',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Structuring import content (${extractedText.length} chars)`,
    });

    // 4. Write to canonical documents table
    const docResult = db.prepare(`
      INSERT OR REPLACE INTO documents (tool, doc_id, content, metadata)
      VALUES ('import', ?, ?, ?)
    `).run(
      `job-${jobId}-${safeOriginalName}`,
      contentToStore,
      JSON.stringify({ filename: safeOriginalName, mimetype: file.mimetype, size: file.size, notes, job_id: jobId }),
    );

    const documentId = docResult.lastInsertRowid as number;

    appendLog({
      event_type: 'db.write',
      source_tool: 'import',
      actor: 'system',
      object_ref: `doc:${documentId}`,
      summary: `Persisted import document to canonical DB (doc id: ${documentId})`,
    });

    // 5. Prism Memory Extraction v2 (MemPalace-inspired)
    // Extract structured memory units from the imported content and persist them.
    // Each unit is categorised (decision, preference, milestone, problem, emotional),
    // deduplicated (exact hash + Jaccard near-dup), and conflict-flagged.
    const memories = extractMemories(contentToStore);
    let memoriesPersisted = 0;
    let memoriesDuplicates = 0;
    let memoriesConflicts = 0;
    for (const mem of memories) {
      const { id, has_conflict } = persistMemoryUnit(
        mem.content,
        mem.category,
        mem.confidence,
        { source_tool: 'import', source_doc_id: documentId, source_ref: `job:${jobId}`, filename: safeOriginalName, job_id: jobId }
      );
      if (id === null) {
        memoriesDuplicates++;
      } else {
        memoriesPersisted++;
        if (has_conflict) memoriesConflicts++;
      }
    }

    appendLog({
      event_type: 'prism.extract',
      source_tool: 'import',
      actor: 'system',
      object_ref: `doc:${documentId}`,
      summary: `Prism extracted ${memories.length} memories from ${safeOriginalName}: ${memoriesPersisted} new, ${memoriesDuplicates} duplicate, ${memoriesConflicts} conflict`,
    });

    // 6. Mark job indexed and update document_ids
    db.prepare(`
      UPDATE import_jobs SET status='indexed', document_ids=?, updated_at=datetime('now') WHERE id=?
    `).run(JSON.stringify([documentId]), jobId);

    appendLog({
      event_type: 'vector.indexed',
      source_tool: 'import',
      actor: 'system',
      object_ref: `doc:${documentId}`,
      summary: `Import indexed for retrieval: ${safeOriginalName}`,
    });

    return res.status(201).json({
      job_id: jobId,
      filename: safeOriginalName,
      status: 'indexed',
      document_id: documentId,
      notes,
      chars_extracted: extractedText.length,
      memories_extracted: memories.length,
      memories_persisted: memoriesPersisted,
      memories_duplicates: memoriesDuplicates,
      memories_conflicts: memoriesConflicts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    db.prepare(`UPDATE import_jobs SET status='error', error_msg=?, updated_at=datetime('now') WHERE id=?`)
      .run(msg, jobId);

    appendLog({
      event_type: 'error.import',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Import failed for ${safeOriginalName}: ${msg}`,
      severity: 'error',
    });

    return res.status(500).json({ error: `Import processing failed: ${msg}`, job_id: jobId });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
  }
});

/**
 * POST /api/import/text
 *
 * Canonical ingestion pipeline for plain-text content (no file upload required).
 *
 * Accepts JSON body:
 *   - content (required): the text to import
 *   - filename (optional): display name for the entry (default: "text-import")
 *   - notes (optional): user guidance / context hints for Prism
 *
 * Returns: { job_id, filename, status, document_id, notes, chars_extracted }
 */
router.post('/text', async (req: Request, res: Response) => {
  const { content, filename: rawFilename, notes: rawNotes } = req.body as {
    content?: string;
    filename?: string;
    notes?: string;
  };

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required and must not be empty.' });
  }

  const safeFilename = (rawFilename?.trim() || 'text-import')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .slice(0, 255);
  const notes: string = rawNotes?.trim() ?? '';
  const db = getDb();

  const jobResult = db.prepare(`
    INSERT INTO import_jobs (filename, mimetype, size_bytes, notes, status)
    VALUES (?, 'text/plain', ?, ?, 'received')
  `).run(safeFilename, Buffer.byteLength(content, 'utf-8'), notes);

  const jobId = jobResult.lastInsertRowid as number;

  appendLog({
    event_type: 'import.received',
    source_tool: 'import',
    actor: 'user',
    object_ref: `job:${jobId}`,
    summary: `Text import received: ${safeFilename} (${content.length} chars)`,
  });

  try {
    db.prepare(`UPDATE import_jobs SET status='parsing', updated_at=datetime('now') WHERE id=?`).run(jobId);

    appendLog({
      event_type: 'import.parsed',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Text import ${safeFilename}: ${content.length} chars`,
    });

    db.prepare(`UPDATE import_jobs SET status='classifying', updated_at=datetime('now') WHERE id=?`).run(jobId);

    const contentToStore = notes
      ? `[Import Context Hints]\n${notes}\n\n[Document Content]\n${content}`
      : content;

    appendLog({
      event_type: 'prism.classify',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Classifying text import: ${safeFilename}`,
    });

    const docResult = db.prepare(`
      INSERT OR REPLACE INTO documents (tool, doc_id, content, metadata)
      VALUES ('import', ?, ?, ?)
    `).run(
      `job-${jobId}-${safeFilename}`,
      contentToStore,
      JSON.stringify({ filename: safeFilename, mimetype: 'text/plain', size: Buffer.byteLength(content, 'utf-8'), notes, job_id: jobId }),
    );

    const documentId = docResult.lastInsertRowid as number;

    // Prism Memory Extraction v2 (MemPalace-inspired)
    const memories = extractMemories(contentToStore);
    let memoriesPersisted = 0;
    let memoriesDuplicates = 0;
    let memoriesConflicts = 0;
    for (const mem of memories) {
      const { id, has_conflict } = persistMemoryUnit(
        mem.content,
        mem.category,
        mem.confidence,
        { source_tool: 'import', source_doc_id: documentId, source_ref: `job:${jobId}`, filename: safeFilename, job_id: jobId }
      );
      if (id === null) {
        memoriesDuplicates++;
      } else {
        memoriesPersisted++;
        if (has_conflict) memoriesConflicts++;
      }
    }

    appendLog({
      event_type: 'prism.extract',
      source_tool: 'import',
      actor: 'system',
      object_ref: `doc:${documentId}`,
      summary: `Prism extracted ${memories.length} memories from ${safeFilename}: ${memoriesPersisted} new, ${memoriesDuplicates} duplicate, ${memoriesConflicts} conflict`,
    });

    db.prepare(`
      UPDATE import_jobs SET status='indexed', document_ids=?, updated_at=datetime('now') WHERE id=?
    `).run(JSON.stringify([documentId]), jobId);

    appendLog({
      event_type: 'vector.indexed',
      source_tool: 'import',
      actor: 'system',
      object_ref: `doc:${documentId}`,
      summary: `Text import indexed: ${safeFilename}`,
    });

    return res.status(201).json({
      job_id: jobId,
      filename: safeFilename,
      status: 'indexed',
      document_id: documentId,
      notes,
      chars_extracted: content.length,
      memories_extracted: memories.length,
      memories_persisted: memoriesPersisted,
      memories_duplicates: memoriesDuplicates,
      memories_conflicts: memoriesConflicts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    db.prepare(`UPDATE import_jobs SET status='error', error_msg=?, updated_at=datetime('now') WHERE id=?`)
      .run(msg, jobId);

    appendLog({
      event_type: 'error.import',
      source_tool: 'import',
      actor: 'system',
      object_ref: `job:${jobId}`,
      summary: `Text import failed for ${safeFilename}: ${msg}`,
      severity: 'error',
    });

    return res.status(500).json({ error: `Import processing failed: ${msg}`, job_id: jobId });
  }
});

/**
 * GET /api/import/jobs
 * List all import jobs (most recent first).
 */
router.get('/jobs', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, filename, mimetype, size_bytes, notes, status, document_ids, error_msg, created_at, updated_at
    FROM import_jobs
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as Array<{
    id: number; filename: string; mimetype: string; size_bytes: number;
    notes: string; status: string; document_ids: string; error_msg?: string;
    created_at: string; updated_at: string;
  }>;

  res.json({
    jobs: rows.map((r) => ({
      ...r,
      document_ids: safeJsonParse(r.document_ids, []),
    })),
  });
});

/**
 * GET /api/import/jobs/:id
 */
router.get('/jobs/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Job not found' });
  res.json({ ...row, document_ids: safeJsonParse(row.document_ids as string, []) });
});

function safeJsonParse(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); } catch { return fallback; }
}

export default router;
