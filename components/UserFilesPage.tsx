import React, { useCallback, useEffect, useState } from 'react';
import { FolderOpen, File, RefreshCw, Upload, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import type { ImportJob } from '../types';

const CATEGORY_FOLDERS = ['All', 'Documents', 'Spreadsheets', 'PDFs', 'Text & Markdown', 'Data (JSON/CSV)'];

function getCategory(job: ImportJob): string {
  const ext = job.filename.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'PDFs';
  if (['xlsx', 'xls'].includes(ext)) return 'Spreadsheets';
  if (['txt', 'md'].includes(ext)) return 'Text & Markdown';
  if (['json', 'csv'].includes(ext)) return 'Data (JSON/CSV)';
  return 'Documents';
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  indexed: <CheckCircle size={12} className="text-emerald-500" />,
  received: <Clock size={12} className="text-blue-400" />,
  parsing: <Loader2 size={12} className="text-blue-400 animate-spin" />,
  classifying: <Loader2 size={12} className="text-violet-400 animate-spin" />,
  error: <AlertCircle size={12} className="text-red-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  indexed: 'Indexed',
  received: 'Received',
  parsing: 'Parsing',
  classifying: 'Classifying',
  error: 'Error',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const UserFilesPage: React.FC = () => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('All');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/jobs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { jobs?: ImportJob[] };
      setJobs(data.jobs ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = activeFolder === 'All'
    ? jobs
    : jobs.filter((j) => getCategory(j) === activeFolder);

  const countByFolder = (folder: string) =>
    folder === 'All' ? jobs.length : jobs.filter((j) => getCategory(j) === folder).length;

  return (
    <div className="flex-1 flex min-h-0">
      {/* Folder sidebar */}
      <aside className="w-44 shrink-0 border-r border-black/5 dark:border-white/5 py-4 px-2 space-y-0.5">
        {CATEGORY_FOLDERS.map((folder) => {
          const count = countByFolder(folder);
          return (
            <button
              key={folder}
              onClick={() => setActiveFolder(folder)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-all ${
                activeFolder === folder
                  ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
                  : 'text-gray-600 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white/70'
              }`}
            >
              <FolderOpen size={13} className={activeFolder === folder ? 'text-violet-500' : 'text-gray-300 dark:text-white/20'} />
              <span className="flex-1 text-left truncate">{folder}</span>
              {count > 0 && (
                <span className="text-[9px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          );
        })}
      </aside>

      {/* Files list */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <FolderOpen size={18} className="text-violet-500" />
          <h1 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">
            {activeFolder}
          </h1>
          <button
            onClick={load}
            className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[12px] text-red-600 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Failed to load files</div>
              <div className="text-[11px] mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 py-8">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <Upload size={28} className="mx-auto mb-3 text-gray-200 dark:text-white/10" />
            <div className="text-[13px] font-semibold text-gray-500 dark:text-white/40">
              {activeFolder === 'All' ? 'No files imported yet.' : `No files in ${activeFolder}.`}
            </div>
            <div className="text-[11px] text-gray-400 dark:text-white/25 mt-1">
              Import documents from Data Studio → UserMap.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map((job) => (
              <div
                key={job.id}
                className={`flex items-start gap-4 p-4 rounded-2xl border bg-white dark:bg-white/[0.03] transition-all ${
                  job.status === 'error'
                    ? 'border-red-400/20'
                    : job.status === 'indexed'
                    ? 'border-emerald-400/20'
                    : 'border-black/[0.06] dark:border-white/[0.06]'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                  <File size={16} className="text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{job.filename}</span>
                    <span className={`flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded-full ${
                      job.status === 'indexed'
                        ? 'text-emerald-600 border-emerald-400/30 dark:text-emerald-300 dark:border-emerald-400/20'
                        : job.status === 'error'
                        ? 'text-red-500 border-red-400/20'
                        : 'text-blue-500 border-blue-400/20'
                    }`}>
                      {STATUS_ICON[job.status] ?? <Clock size={10} />}
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400 dark:text-white/25 flex-wrap">
                    <span>{formatBytes(job.size_bytes)}</span>
                    <span>{getCategory(job)}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={9} />
                      {relativeTime(job.created_at)}
                    </span>
                    {job.document_ids.length > 0 && (
                      <span className="text-violet-500 dark:text-violet-400">
                        {job.document_ids.length} doc{job.document_ids.length !== 1 ? 's' : ''} indexed
                      </span>
                    )}
                  </div>
                  {job.notes && (
                    <div className="mt-1.5 text-[10px] text-gray-400 dark:text-white/30 italic truncate">
                      Note: {job.notes}
                    </div>
                  )}
                  {job.error_msg && (
                    <div className="mt-1.5 text-[10px] text-red-500 truncate">{job.error_msg}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
