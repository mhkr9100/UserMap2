import React, { useState, useRef } from 'react';
import { Search, Loader } from 'lucide-react';
import { api } from '../services/api.js';
import type { ContextResult } from '../services/api.js';

const TOOL_LABELS: Record<string, string> = {
  slack: 'Slack',
  github: 'GitHub',
  gmail: 'Gmail',
  gdrive: 'Drive',
};

export const ContextQuery: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContextResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await api.context(q, undefined, 10);
      setResults(data.results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'Ask about your work… e.g. "project deadline"'}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
          Search
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {results !== null && results.length === 0 && (
        <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No results found. Connect tools and let them sync first.
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 capitalize">
                  {TOOL_LABELS[r.source] ?? r.source}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{r.content}</p>
              {Object.keys(r.metadata).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(r.metadata).map(([k, v]) => (
                    <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
