import React, { useEffect, useState, useCallback } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import { api } from './services/api.js';
import type { Connection, StatusResponse } from './services/api.js';
import { StatusIndicator } from './components/StatusIndicator.js';
import { ConnectionCard } from './components/ConnectionCard.js';
import { ContextQuery } from './components/ContextQuery.js';

type ServerStatus = 'loading' | 'ok' | 'error';

const POLL_INTERVAL_MS = 5000;

const App: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>('loading');
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'connections' | 'context'>('connections');

  const refresh = useCallback(async () => {
    try {
      const [status, conns] = await Promise.all([api.status(), api.connections()]);
      setStatusData(status);
      setConnections(conns.connections);
      setServerStatus('ok');
    } catch {
      setServerStatus('error');
      setStatusData(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleConnectSlack = async () => {
    setConnectingSlack(true);
    setSlackError(null);
    try {
      const { url } = await api.connectSlack();
      const popup = window.open(url, 'slack-oauth', 'width=600,height=700,noopener,noreferrer');
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for this app and try again.');
      }
      // Poll until popup closes, then refresh connections
      const check = setInterval(() => {
        if (popup.closed) {
          clearInterval(check);
          setConnectingSlack(false);
          void refresh();
        }
      }, 500);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to start Slack connection');
      setConnectingSlack(false);
    }
  };

  const slackConnected = connections.some((c) => c.tool === 'slack');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-widest text-gray-900">UserMap</h1>
            <p className="text-xs text-gray-500">Your local context hub</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator status={serverStatus} connections={statusData?.connections} />
            <button
              onClick={() => { void refresh(); }}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Connect Tools */}
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">Connect Tools</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {/* Slack row */}
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#611f69] text-xs font-bold text-white">
                SL
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">Slack</div>
                <div className="text-xs text-gray-400">Connect your workspace to sync messages</div>
              </div>
              {slackConnected ? (
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => { void handleConnectSlack(); }}
                  disabled={connectingSlack || serverStatus !== 'ok'}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plug size={14} />
                  {connectingSlack ? 'Connecting…' : 'Connect'}
                </button>
              )}
            </div>

            {/* Future tools — coming soon */}
            {(['GitHub', 'Gmail', 'Google Drive'] as const).map((tool) => (
              <div key={tool} className="flex items-center gap-4 px-5 py-4 opacity-50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-xs font-bold text-gray-500">
                  {tool.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{tool}</div>
                  <div className="text-xs text-gray-400">Coming soon</div>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-400">
                  Soon
                </span>
              </div>
            ))}
          </div>

          {slackError && (
            <p className="mt-2 text-xs text-red-600">{slackError}</p>
          )}

          {serverStatus === 'error' && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>Server not running.</strong> Start it with <code className="font-mono bg-amber-100 px-1 rounded">npm run dev:server</code> from the repo root.
            </div>
          )}
        </section>

        {/* Tabs: Active Connections / Context */}
        <section>
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {(['connections', 'context'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold capitalize -mb-px border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'connections' ? 'Active Connections' : 'Context Search'}
              </button>
            ))}
          </div>

          {activeTab === 'connections' && (
            <div className="space-y-3">
              {connections.length === 0 ? (
                <div className="rounded-xl bg-white border border-gray-100 px-4 py-8 text-center text-sm text-gray-400 shadow-sm">
                  No tools connected yet. Click <strong>Connect</strong> above to get started.
                </div>
              ) : (
                connections.map((c) => <ConnectionCard key={c.id} connection={c} />)
              )}
            </div>
          )}

          {activeTab === 'context' && <ContextQuery />}
        </section>
      </main>
    </div>
  );
};

export default App;
