import React, { useCallback, useRef, useState } from 'react';
import { Network, Upload, X, FileText, CheckCircle, AlertCircle, Type } from 'lucide-react';
import { MindMapView } from './MindMapView';
import type { PageNode } from '../types';

interface DataStudioPageProps {
  tree: PageNode;
  onUpdateNode: (nodeId: string, updates: Partial<PageNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNode: (parentId: string, newNode: PageNode) => void;
  onIngestMemory: (rawText: string) => Promise<number>;
  onConsolidate: () => Promise<void>;
  isConsolidating: boolean;
}

const ACCEPTED_TYPES = '.txt,.md,.json,.csv,.pdf,.docx,.xlsx,.xls';

interface ImportResult {
  ok: boolean;
  message: string;
}

/** Safely parse a fetch Response as JSON, guarding against HTML error pages. */
async function safeResJson(res: Response): Promise<{ data: Record<string, unknown> | null; parseError: string | null }> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    return { data: null, parseError: `Server returned non-JSON response (${res.status})${text ? ': ' + text.slice(0, 120) : ''}` };
  }
  try {
    const data = await res.json() as Record<string, unknown>;
    return { data, parseError: null };
  } catch (e) {
    return { data: null, parseError: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

type ImportTab = 'file' | 'text';

const ImportPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [tab, setTab] = useState<ImportTab>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [textFilename, setTextFilename] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setStatus(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) { setFile(dropped); setStatus(null); }
  }, []);

  const handleImportFile = useCallback(async () => {
    if (!file) return;
    setImporting(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (notes.trim()) form.append('notes', notes.trim());

      const res = await fetch('/api/import', { method: 'POST', body: form });
      const { data, parseError } = await safeResJson(res);

      if (parseError) {
        setStatus({ ok: false, message: parseError });
      } else if (!res.ok) {
        setStatus({ ok: false, message: (data?.error as string) ?? `Server error ${res.status}` });
      } else {
        setStatus({ ok: true, message: `${data?.filename ?? file.name} imported — ${((data?.chars_extracted as number) ?? 0).toLocaleString()} chars indexed.` });
        setFile(null);
        setNotes('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: unknown) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(false);
    }
  }, [file, notes]);

  const handleImportText = useCallback(async () => {
    if (!textContent.trim()) return;
    setImporting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/import/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textContent.trim(),
          filename: textFilename.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const { data, parseError } = await safeResJson(res);

      if (parseError) {
        setStatus({ ok: false, message: parseError });
      } else if (!res.ok) {
        setStatus({ ok: false, message: (data?.error as string) ?? `Server error ${res.status}` });
      } else {
        setStatus({ ok: true, message: `"${data?.filename ?? 'text'}" imported — ${((data?.chars_extracted as number) ?? 0).toLocaleString()} chars indexed.` });
        setTextContent('');
        setTextFilename('');
        setNotes('');
      }
    } catch (err: unknown) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(false);
    }
  }, [textContent, textFilename, notes]);

  const canImport = tab === 'file' ? !!file : !!textContent.trim();

  return (
    <div
      className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <Upload size={16} className="text-violet-500" />
          <h2 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Import</h2>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-white/5">
          <button
            onClick={() => { setTab('file'); setStatus(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
              tab === 'file'
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'
            }`}
          >
            <FileText size={12} /> File Upload
          </button>
          <button
            onClick={() => { setTab('text'); setStatus(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
              tab === 'text'
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'
            }`}
          >
            <Type size={12} /> Text Input
          </button>
        </div>

        {tab === 'file' ? (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl cursor-pointer hover:border-violet-400 transition-colors"
            >
              {file ? (
                <>
                  <FileText size={20} className="text-violet-500" />
                  <span className="text-[12px] font-semibold text-gray-800 dark:text-white">{file.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/30">{(file.size / 1024).toFixed(1)} KB</span>
                </>
              ) : (
                <>
                  <Upload size={20} className="text-gray-300 dark:text-white/20" />
                  <span className="text-[12px] text-gray-500 dark:text-white/40">Drop a file or click to browse</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/25">
                    PDF · DOCX · XLSX · CSV · TXT · MD · JSON
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        ) : (
          <>
            {/* Text filename */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest mb-1">
                Entry Name <span className="font-normal text-gray-400 dark:text-white/25 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={textFilename}
                onChange={(e) => setTextFilename(e.target.value)}
                placeholder="e.g. meeting-notes-2024"
                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400"
              />
            </div>

            {/* Text content */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest mb-1">
                Content <span className="text-red-400">*</span>
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste or type the content to import…"
                rows={6}
                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400 resize-none"
              />
            </div>
          </>
        )}

        {/* Notes / Context hints */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest mb-1">
            Notes <span className="font-normal text-gray-400 dark:text-white/25 normal-case">(optional context hints for Prism)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the content or add hints for how Prism should interpret it…"
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400 resize-none"
          />
        </div>

        {/* Status */}
        {status && (
          <div className={`flex items-start gap-2 text-[11px] ${status.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {status.ok ? <CheckCircle size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            {status.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={tab === 'file' ? handleImportFile : handleImportText}
            disabled={importing || !canImport}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-[12px] font-bold hover:bg-violet-600 disabled:opacity-40 transition-colors"
          >
            {importing ? 'Importing…' : 'Import & Index'}
          </button>
          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 text-[12px] text-gray-600 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export const DataStudioPage: React.FC<DataStudioPageProps> = ({
  tree,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
  onIngestMemory,
  onConsolidate,
  isConsolidating,
}) => {
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
        <Network size={18} className="text-violet-500" />
        <div>
          <h1 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Data Studio</h1>
          <p className="text-[11px] text-gray-400 dark:text-white/30">
            Knowledge graph. Hover a node for edit, delete, and add actions.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isConsolidating && (
            <span className="text-[10px] text-violet-500 font-semibold animate-pulse">Prism consolidating…</span>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] font-semibold text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Upload size={12} />
            Import
          </button>
        </div>
      </div>

      {/* MindMap canvas */}
      <MindMapView
        tree={tree}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onAddNode={onAddNode}
      />

      {showImport && (
        <ImportPanel
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
};
