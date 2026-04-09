import React, { useCallback, useEffect, useState } from 'react';
import { ScrollText, RefreshCw, Search, Filter, AlertCircle, CheckCircle, Info, Cpu, User, Plug } from 'lucide-react';
import type { LogEvent } from '../types';

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  'connector.pull.success': <CheckCircle size={12} className="text-emerald-500" />,
  'connector.pull.error': <AlertCircle size={12} className="text-red-400" />,
  'connector.sync.triggered': <RefreshCw size={12} className="text-blue-400" />,
  'connector.disconnected': <Plug size={12} className="text-gray-400" />,
  'prism.classify': <Cpu size={12} className="text-violet-400" />,
  'prism.structure': <Cpu size={12} className="text-violet-500" />,
  'prism.feedback.learned': <Cpu size={12} className="text-pink-400" />,
  'user.create': <User size={12} className="text-emerald-400" />,
  'user.update': <User size={12} className="text-blue-400" />,
  'user.delete': <User size={12} className="text-red-400" />,
  'push.webhook.sent': <CheckCircle size={12} className="text-emerald-400" />,
  'push.webhook.failed': <AlertCircle size={12} className="text-orange-400" />,
};

const ACTOR_ICONS: Record<string, React.ReactNode> = {
  system: <Cpu size={10} className="text-gray-400" />,
  prism: <Cpu size={10} className="text-violet-400" />,
  user: <User size={10} className="text-blue-400" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-gray-400 dark:text-white/25',
  warn: 'text-amber-500',
  error: 'text-red-500',
};

const EVENT_TYPES = [
  'connector.pull.success',
  'connector.pull.error',
  'connector.sync.triggered',
  'connector.disconnected',
  'prism.classify',
  'prism.structure',
  'prism.feedback.learned',
  'user.create',
  'user.update',
  'user.delete',
  'push.webhook.sent',
  'push.webhook.failed',
];

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function timeAgo(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return '';
  }
}

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (search) params.set('search', search);
    if (eventTypeFilter) params.set('event_type', eventTypeFilter);
    if (actorFilter) params.set('actor', actorFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    try {
      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, eventTypeFilter, actorFilter, severityFilter, fromDate, toDate, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchLogs, 30_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const clearFilters = () => {
    setSearch('');
    setEventTypeFilter('');
    setActorFilter('');
    setSeverityFilter('');
    setFromDate('');
    setToDate('');
    setOffset(0);
  };

  const hasFilters = search || eventTypeFilter || actorFilter || severityFilter || fromDate || toDate;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <ScrollText size={18} className="text-amber-500" />
          <div>
            <h1 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Logs</h1>
            <p className="text-[11px] text-gray-400 dark:text-white/30">
              End-to-end lifecycle timeline — {total} event{total !== 1 ? 's' : ''} total
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] text-gray-600 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              placeholder="Search logs…"
              className="pl-7 pr-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-800 dark:text-white/80 outline-none focus:border-violet-400 w-44"
            />
          </div>

          {/* Event type */}
          <select
            value={eventTypeFilter}
            onChange={(e) => { setEventTypeFilter(e.target.value); setOffset(0); }}
            className="py-1.5 px-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-700 dark:text-white/60 outline-none focus:border-violet-400"
          >
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Actor */}
          <select
            value={actorFilter}
            onChange={(e) => { setActorFilter(e.target.value); setOffset(0); }}
            className="py-1.5 px-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-700 dark:text-white/60 outline-none focus:border-violet-400"
          >
            <option value="">All actors</option>
            <option value="system">System</option>
            <option value="prism">Prism</option>
            <option value="user">User</option>
          </select>

          {/* Severity */}
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setOffset(0); }}
            className="py-1.5 px-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-700 dark:text-white/60 outline-none focus:border-violet-400"
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>

          {/* Date range */}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
            className="py-1.5 px-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-700 dark:text-white/60 outline-none focus:border-violet-400"
            title="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
            className="py-1.5 px-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[11px] text-gray-700 dark:text-white/60 outline-none focus:border-violet-400"
            title="To date"
          />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-white/60 transition-colors"
            >
              <Filter size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto">
        {loading && logs.length === 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 p-6">
            <RefreshCw size={14} className="animate-spin" />
            Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText size={32} className="text-gray-200 dark:text-white/10 mb-3" />
            <div className="text-[13px] text-gray-400 dark:text-white/30">No log events found.</div>
            <div className="text-[11px] text-gray-300 dark:text-white/20 mt-1">
              Events will appear here as connectors sync, Prism processes data, or you make changes.
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-3 text-[11px] text-violet-500 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;
              const icon = EVENT_TYPE_ICONS[log.event_type] ?? <Info size={12} className="text-gray-400" />;
              const severityClass = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info;

              return (
                <div
                  key={log.id}
                  className="px-6 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Event type icon */}
                    <div className="mt-0.5 shrink-0">{icon}</div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold text-gray-900 dark:text-white font-mono">
                          {log.event_type}
                        </span>
                        {log.source_tool && (
                          <span className="text-[10px] text-gray-400 dark:text-white/30 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded-full">
                            {log.source_tool}
                          </span>
                        )}
                        <span className={`text-[10px] font-mono uppercase ${severityClass}`}>
                          {log.severity}
                        </span>
                      </div>
                      {log.summary && (
                        <p className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5 line-clamp-1">{log.summary}</p>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/25 justify-end">
                        {ACTOR_ICONS[log.actor] ?? ACTOR_ICONS.system}
                        <span>{log.actor}</span>
                      </div>
                      <div className="text-[10px] text-gray-300 dark:text-white/20 mt-0.5" title={formatTimestamp(log.created_at)}>
                        {timeAgo(log.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 ml-6 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] text-[11px] space-y-1.5">
                      <div><span className="font-semibold text-gray-600 dark:text-white/50">Timestamp:</span> <span className="text-gray-500 dark:text-white/40">{formatTimestamp(log.created_at)}</span></div>
                      {log.object_ref && <div><span className="font-semibold text-gray-600 dark:text-white/50">Object:</span> <span className="text-gray-500 dark:text-white/40 font-mono">{log.object_ref}</span></div>}
                      {log.summary && <div><span className="font-semibold text-gray-600 dark:text-white/50">Summary:</span> <span className="text-gray-500 dark:text-white/40">{log.summary}</span></div>}
                      {log.before_state && (
                        <div>
                          <span className="font-semibold text-gray-600 dark:text-white/50">Before:</span>
                          <pre className="mt-1 text-[10px] bg-white dark:bg-black/30 rounded-lg p-2 overflow-x-auto text-gray-500 dark:text-white/30 whitespace-pre-wrap">{log.before_state}</pre>
                        </div>
                      )}
                      {log.after_state && (
                        <div>
                          <span className="font-semibold text-gray-600 dark:text-white/50">After:</span>
                          <pre className="mt-1 text-[10px] bg-white dark:bg-black/30 rounded-lg p-2 overflow-x-auto text-gray-500 dark:text-white/30 whitespace-pre-wrap">{log.after_state}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 dark:border-white/5">
            <span className="text-[11px] text-gray-400 dark:text-white/30">
              Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                ← Previous
              </button>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
