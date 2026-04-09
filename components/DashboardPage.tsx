import React, { useEffect, useState } from 'react';
import { Network, Plug, ScrollText, Bot, TrendingUp, Loader2 } from 'lucide-react';
import type { SidebarPage } from './Sidebar';
import type { PageNode } from '../types';

interface DashboardPageProps {
  tree: PageNode;
  onNavigate: (page: SidebarPage) => void;
}

function countNodes(node: PageNode): number {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

function countCategories(node: PageNode): number {
  if (!node) return 0;
  return (node.children || []).filter((c) => c.nodeType === 'category').length;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  accent?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, onClick, accent = 'violet' }) => {
  const accentMap: Record<string, string> = {
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  };
  const iconColor = accentMap[accent] || accentMap.violet;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-start gap-4 p-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] text-left transition-all ${onClick ? 'hover:shadow-sm hover:border-black/10 dark:hover:border-white/10 cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-gray-500 dark:text-white/40 uppercase tracking-widest font-semibold">{label}</div>
        <div className="text-2xl font-black text-gray-900 dark:text-white mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-gray-400 dark:text-white/25 mt-1">{sub}</div>}
      </div>
    </button>
  );
};

interface LogEvent {
  id: number;
  event_type: string;
  source_tool?: string;
  actor: string;
  summary?: string;
  created_at: string;
}

const EVENT_ICON: Record<string, string> = {
  'connector.pull.success': '✅',
  'connector.pull.error': '❌',
  'connector.sync.triggered': '🔄',
  'connector.disconnected': '🔌',
  'prism.classify': '🔍',
  'prism.structure': '🤖',
  'prism.feedback.learned': '🧠',
  'user.create': '➕',
  'user.update': '✏️',
  'user.delete': '🗑️',
  'push.webhook.sent': '📤',
  'push.webhook.failed': '⚠️',
};

function eventIcon(type: string): string {
  return EVENT_ICON[type] ?? '📋';
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

export const DashboardPage: React.FC<DashboardPageProps> = ({ tree, onNavigate }) => {
  const totalNodes = countNodes(tree) - 1; // exclude root
  const totalCategories = countCategories(tree);
  const [logCount, setLogCount] = useState<number>(0);
  const [connectorCount, setConnectorCount] = useState<number>(0);
  const [recentLogs, setRecentLogs] = useState<LogEvent[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/logs?limit=1')
      .then((r) => r.json())
      .then((d) => setLogCount(d.total ?? 0))
      .catch(() => {});

    fetch('/api/connectors?direction=pull')
      .then((r) => r.json())
      .then((d) => setConnectorCount((d.connectors ?? []).filter((c: { enabled: boolean }) => c.enabled).length))
      .catch(() => {});

    // Load recent activity from real logs
    fetch('/api/logs?limit=5')
      .then((r) => r.json())
      .then((d) => setRecentLogs(d.logs ?? []))
      .catch(() => setRecentLogs([]))
      .finally(() => setLogsLoading(false));

    // Load 12h summary
    fetch('/api/dashboard/summary')
      .then((r) => r.json())
      .then((d) => setSummary(d.summary ?? null))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* 12h summary */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-violet-500" />
          <h2 className="text-[12px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">Last 12 hours</h2>
        </div>
        {summaryLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        ) : summary ? (
          <p className="text-[12px] text-gray-600 dark:text-white/60 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-[12px] text-gray-400 dark:text-white/30 italic">No activity in the last 12 hours.</p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Network size={18} />}
          label="Nodes"
          value={totalNodes}
          sub={`${totalCategories} categories`}
          onClick={() => onNavigate('data-studio')}
          accent="violet"
        />
        <StatCard
          icon={<Plug size={18} />}
          label="Active Connectors"
          value={connectorCount}
          sub="pulling data"
          onClick={() => onNavigate('connectors')}
          accent="emerald"
        />
        <StatCard
          icon={<ScrollText size={18} />}
          label="Log Events"
          value={logCount}
          sub="lifecycle events"
          onClick={() => onNavigate('logs')}
          accent="amber"
        />
        <StatCard
          icon={<Bot size={18} />}
          label="Prism Agent"
          value="Active"
          sub="always-on"
          onClick={() => onNavigate('prism-agent')}
          accent="blue"
        />
      </div>

      {/* Recent activity — real data only */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-[13px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Recent Activity</h2>
        {logsLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : recentLogs.length === 0 ? (
          <p className="text-[12px] text-gray-400 dark:text-white/30 italic py-4">No activity recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3">
                <span className="text-base mt-0.5">{eventIcon(ev.event_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-gray-700 dark:text-white/70">{ev.summary || ev.event_type}</div>
                  <div className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">
                    {ev.event_type} · {relativeTime(ev.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => onNavigate('logs')}
          className="mt-4 text-[11px] text-violet-600 dark:text-violet-300 hover:underline font-medium"
        >
          View all logs →
        </button>
      </div>
    </div>
  );
};
