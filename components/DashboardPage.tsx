import React, { useEffect, useState } from 'react';
import { Network, Plug, ScrollText, Bot, TrendingUp } from 'lucide-react';
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

const RECENT_EVENTS = [
  { type: 'prism.structure', summary: 'Prism structured 3 new nodes', time: '2 min ago', icon: '🤖' },
  { type: 'connector.pull.success', summary: 'Slack sync completed', time: '5 min ago', icon: '✅' },
  { type: 'user.update', summary: 'Node "Career" updated', time: '12 min ago', icon: '✏️' },
  { type: 'connector.pull.success', summary: 'Instagram sync completed', time: '1 hr ago', icon: '✅' },
  { type: 'prism.classify', summary: 'Prism classified 12 messages', time: '2 hr ago', icon: '🔍' },
];

export const DashboardPage: React.FC<DashboardPageProps> = ({ tree, onNavigate }) => {
  const totalNodes = countNodes(tree) - 1; // exclude root
  const totalCategories = countCategories(tree);
  const [logCount, setLogCount] = useState<number>(0);
  const [connectorCount, setConnectorCount] = useState<number>(0);

  useEffect(() => {
    fetch('/api/logs?limit=1')
      .then((r) => r.json())
      .then((d) => setLogCount(d.total ?? 0))
      .catch(() => {});
    fetch('/api/connectors?direction=pull')
      .then((r) => r.json())
      .then((d) => setConnectorCount((d.connectors ?? []).filter((c: { enabled: boolean }) => c.enabled).length))
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-[13px] text-gray-400 dark:text-white/30 mt-1">
          Your personal context overview — AI knows the world; UserMap helps AI know <em>you</em>.
        </p>
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

      {/* How it works */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-violet-500" />
          <h2 className="text-[13px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">How UserMap works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: '1',
              title: 'Connect your tools',
              desc: 'Pull data continuously from Slack, Instagram, Facebook and more via the Connectors page.',
              color: 'bg-violet-500',
            },
            {
              step: '2',
              title: 'Prism structures it',
              desc: 'Prism Agent reads your data, classifies it into categories, and updates your knowledge graph.',
              color: 'bg-emerald-500',
            },
            {
              step: '3',
              title: 'AI knows you',
              desc: 'Query your context, push to n8n/Make, and let any AI tool answer personal-context questions.',
              color: 'bg-amber-500',
            },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="flex gap-3">
              <div className={`w-7 h-7 rounded-xl ${color} text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5`}>
                {step}
              </div>
              <div>
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">{title}</div>
                <div className="text-[11px] text-gray-400 dark:text-white/30 mt-1 leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent events */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-[13px] font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {RECENT_EVENTS.map((ev, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-base mt-0.5">{ev.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-gray-700 dark:text-white/70">{ev.summary}</div>
                <div className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">{ev.type} · {ev.time}</div>
              </div>
            </div>
          ))}
        </div>
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
