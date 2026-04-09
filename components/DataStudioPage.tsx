import React, { useCallback, useState } from 'react';
import { Network, Upload, X } from 'lucide-react';
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

const ImportPanel: React.FC<{
  onIngest: (text: string) => Promise<number>;
  onConsolidate: () => Promise<void>;
  isConsolidating: boolean;
  onClose: () => void;
}> = ({ onIngest, onConsolidate, isConsolidating, onClose }) => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(async () => {
    if (!text.trim()) return;
    setImporting(true);
    setStatus(null);
    try {
      const count = await onIngest(text.trim());
      if (count > 0) await onConsolidate();
      setStatus(`Imported ${count} items.`);
      setText('');
    } catch (err: unknown) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [text, onIngest, onConsolidate]);

  return (
    <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Upload size={16} className="text-violet-500" />
          <h2 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Import Context</h2>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-white"><X size={16} /></button>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-white/40 leading-relaxed">
          Paste raw text, notes, or exported data. Prism will parse and structure it into your knowledge graph.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste context here…"
          rows={8}
          className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400 resize-none"
        />
        {status && (
          <p className={`text-[11px] ${status.startsWith('Import failed') ? 'text-red-500' : 'text-emerald-500'}`}>{status}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleImport}
            disabled={importing || isConsolidating || !text.trim()}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-[12px] font-bold hover:bg-violet-600 disabled:opacity-40 transition-colors"
          >
            {importing || isConsolidating ? 'Processing…' : 'Import & Structure'}
          </button>
          <button onClick={onClose} className="py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 text-[12px] text-gray-600 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5">
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
          onIngest={onIngestMemory}
          onConsolidate={onConsolidate}
          isConsolidating={isConsolidating}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
};
