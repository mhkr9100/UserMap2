import React, { useCallback, useEffect, useState } from 'react';
import { Plug, RefreshCw, Check, X, AlertCircle, Wifi, Clock, ArrowDown, ArrowUp, Bot, Plus, Trash2, Globe } from 'lucide-react';
import type { ConnectorConfig, CustomApi } from '../types';

const CONNECTOR_META: Record<string, { label: string; logo: string; description: string }> = {
  slack: { label: 'Slack', logo: '💬', description: 'Pull messages, channels, and DMs from your Slack workspace.' },
  instagram: { label: 'Instagram', logo: '📸', description: 'Pull posts, likes, and stories from Instagram via Meta Graph API.' },
  facebook: { label: 'Facebook', logo: '👥', description: 'Pull posts, reactions, and page activity from Facebook.' },
  n8n: { label: 'n8n', logo: '⚡', description: 'Push structured context events to your n8n workflows via webhook.' },
  make: { label: 'Make', logo: '🔧', description: 'Push events to Make (Integromat) scenarios via webhook.' },
  webhook: { label: 'Custom Webhook', logo: '🔗', description: 'Push events to any custom endpoint. Supports standard JSON payloads.' },
};

const AI_ENGINE_META: Record<string, { label: string; logo: string; description: string; keyLabel: string; placeholder: string }> = {
  chatgpt: { label: 'ChatGPT', logo: '🤖', description: 'OpenAI GPT-4 — state of the art for reasoning and code.', keyLabel: 'OpenAI API Key', placeholder: 'sk-…' },
  claude: { label: 'Claude', logo: '🟣', description: 'Anthropic Claude — excellent for long-context analysis.', keyLabel: 'Anthropic API Key', placeholder: 'sk-ant-…' },
  gemini: { label: 'Gemini', logo: '✦', description: 'Google Gemini Pro — fast multimodal reasoning.', keyLabel: 'Google API Key', placeholder: 'AIza…' },
  ollama: { label: 'Ollama', logo: '🦙', description: 'Local Ollama instance — fully private, no API key required.', keyLabel: 'Ollama Base URL', placeholder: 'http://localhost:11434' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  connected: <Check size={12} className="text-emerald-500" />,
  syncing: <RefreshCw size={12} className="text-blue-400 animate-spin" />,
  error: <AlertCircle size={12} className="text-red-400" />,
  disconnected: <X size={12} className="text-gray-300 dark:text-white/20" />,
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  syncing: 'Syncing…',
  error: 'Error',
  disconnected: 'Not connected',
};

interface ConnectorCardProps {
  connector: ConnectorConfig;
  onToggle: (id: number, enabled: boolean) => void;
  onSync: (id: number) => void;
  onConfigure: (connector: ConnectorConfig) => void;
}

const ConnectorCard: React.FC<ConnectorCardProps> = ({ connector, onToggle, onSync, onConfigure }) => {
  const meta = CONNECTOR_META[connector.connector_type] || {
    label: connector.connector_type,
    logo: '🔌',
    description: '',
  };
  const status = connector.last_status || 'disconnected';
  const isConnected = connector.enabled && status !== 'disconnected' && status !== 'error';

  const formatTime = (ts?: string) => {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className={`rounded-2xl border p-5 bg-white dark:bg-white/[0.03] transition-all ${isConnected ? 'border-emerald-400/30 dark:border-emerald-400/20' : 'border-black/[0.06] dark:border-white/[0.06]'}`}>
      <div className="flex items-start gap-4">
        <div className="text-2xl shrink-0 mt-0.5">{meta.logo}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-gray-900 dark:text-white">{meta.label}</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-white/40 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded-full">
              {STATUS_ICON[status] ?? STATUS_ICON.disconnected}
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-white/30 mt-1 leading-relaxed">{meta.description}</p>

          <div className="flex gap-4 mt-3 text-[10px] text-gray-400 dark:text-white/30">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              Last sync: {formatTime(connector.last_run)}
            </span>
            {connector.direction === 'pull' && connector.frequency_sec > 0 && (
              <span className="flex items-center gap-1">
                <Wifi size={10} />
                Every {connector.frequency_sec}s
              </span>
            )}
            {connector.last_error && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle size={10} />
                {connector.last_error.slice(0, 60)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {!isConnected ? (
            <button
              onClick={() => onConfigure(connector)}
              className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-[11px] font-semibold hover:bg-violet-600 transition-colors"
            >
              Connect
            </button>
          ) : (
            <>
              <button
                onClick={() => onSync(connector.id)}
                className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] font-medium text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={10} />
                Sync now
              </button>
              <button
                onClick={() => onToggle(connector.id, false)}
                className="px-3 py-1.5 rounded-xl border border-red-400/20 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ConfigureModalProps {
  connector: ConnectorConfig;
  onClose: () => void;
  onSave: (id: number, config: Record<string, unknown>) => void;
}

const ConfigureModal: React.FC<ConfigureModalProps> = ({ connector, onClose, onSave }) => {
  const meta = CONNECTOR_META[connector.connector_type] || { label: connector.connector_type, logo: '🔌', description: '' };
  const isPull = connector.direction === 'pull';
  const [webhookUrl, setWebhookUrl] = useState((connector.config?.webhook_url as string) || '');
  const [token, setToken] = useState((connector.config?.token as string) || '');
  const [freq, setFreq] = useState(String(connector.frequency_sec || 60));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.logo}</span>
          <div>
            <h2 className="text-[14px] font-black text-gray-900 dark:text-white">Configure {meta.label}</h2>
            <p className="text-[11px] text-gray-400 dark:text-white/30">{isPull ? 'Pull connector' : 'Push connector'}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-white"><X size={16} /></button>
        </div>

        {isPull ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest">Access Token / API Key</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your token here"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest">Sync frequency (seconds)</span>
              <input
                type="number"
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
                min={30}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-white/60 uppercase tracking-widest">Webhook URL</span>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-n8n.example.com/webhook/…"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400"
              />
            </label>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 text-[11px] text-gray-500 dark:text-white/30 space-y-1">
              <p className="font-semibold">Sample payload UserMap will POST:</p>
              <pre className="mt-1 text-[10px] overflow-x-auto">
{`{
  "event": "user.update",
  "object": "node:abc123",
  "summary": "Career updated",
  "timestamp": "2025-01-01T12:00:00Z"
}`}
              </pre>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => {
              const config: Record<string, unknown> = isPull
                ? { token, frequency_sec: Math.max(30, parseInt(freq, 10) || 60) }
                : { webhook_url: webhookUrl };
              onSave(connector.id, config);
            }}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-[12px] font-bold hover:bg-violet-600 transition-colors"
          >
            Save & Connect
          </button>
          <button onClick={onClose} className="py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 text-[12px] text-gray-600 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/** AI Engine card — reads/writes config from backend DB (no .env requirement). */
const AIEngineCard: React.FC<{
  connector: ConnectorConfig;
  onSave: (id: number, config: Record<string, unknown>, enabled: boolean) => void;
  onDisconnect: (id: number) => void;
}> = ({ connector, onSave, onDisconnect }) => {
  const meta = AI_ENGINE_META[connector.connector_type] || {
    label: connector.connector_type, logo: '🤖', description: '', keyLabel: 'API Key', placeholder: '',
  };
  const isConnected = connector.enabled && connector.last_status === 'connected';
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState((connector.config?.api_key as string) || (connector.config?.base_url as string) || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const isUrl = connector.connector_type === 'ollama';
    const config: Record<string, unknown> = isUrl ? { base_url: keyValue } : { api_key: keyValue };
    await onSave(connector.id, config, true);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className={`rounded-2xl border p-5 bg-white dark:bg-white/[0.03] transition-all ${isConnected ? 'border-emerald-400/30 dark:border-emerald-400/20' : 'border-black/[0.06] dark:border-white/[0.06]'}`}>
      <div className="flex items-start gap-4">
        <div className="text-2xl shrink-0 mt-0.5">{meta.logo}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900 dark:text-white">{meta.label}</span>
            <span className={`flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded-full ${
              isConnected
                ? 'text-emerald-600 border-emerald-400/30 dark:text-emerald-300 dark:border-emerald-400/20'
                : 'text-gray-500 dark:text-white/40 border-black/10 dark:border-white/10'
            }`}>
              {isConnected ? <Check size={10} /> : <X size={10} />}
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-white/30 mt-1 leading-relaxed">{meta.description}</p>

          {editing && (
            <div className="mt-3 space-y-2">
              <label className="block text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase tracking-widest">
                {meta.keyLabel}
              </label>
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={meta.placeholder}
                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-[12px] text-gray-900 dark:text-white outline-none focus:border-violet-400"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !keyValue.trim()}
                  className="flex-1 py-2 rounded-xl bg-violet-500 text-white text-[11px] font-bold hover:bg-violet-600 disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save & Connect'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="py-2 px-3 rounded-xl border border-black/10 dark:border-white/10 text-[11px] text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex flex-col gap-2 shrink-0">
            {isConnected ? (
              <>
                <button
                  onClick={() => { setKeyValue((connector.config?.api_key as string) || (connector.config?.base_url as string) || ''); setEditing(true); }}
                  className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 text-[11px] font-medium text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Edit key
                </button>
                <button
                  onClick={() => onDisconnect(connector.id)}
                  className="px-3 py-1.5 rounded-xl border border-red-400/20 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => { setKeyValue(''); setEditing(true); }}
                className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-[11px] font-semibold hover:bg-violet-600 transition-colors"
              >
                Connect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** Custom APIs & Webhooks management panel */
const CustomApisSection: React.FC = () => {
  const [apis, setApis] = useState<CustomApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', direction: 'pull' as 'pull' | 'push', url: '', method: 'GET' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-apis');
      const data = await res.json() as { apis?: CustomApi[] };
      setApis(data.apis ?? []);
    } catch {
      setApis([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/custom-apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm({ name: '', direction: 'pull', url: '', method: 'GET' });
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/custom-apis/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900 dark:text-white">Custom APIs & Webhooks</h3>
          <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">Define your own pull/push endpoints without editing .env</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-[11px] font-semibold hover:bg-violet-600 transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-violet-400/20 bg-violet-50 dark:bg-violet-500/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase tracking-widest">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My API" className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[12px] outline-none focus:border-violet-400" />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase tracking-widest">Direction</span>
              <select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as 'pull' | 'push' }))} className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[12px] outline-none focus:border-violet-400">
                <option value="pull">Pull</option>
                <option value="push">Push</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase tracking-widest">Method</span>
              <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[12px] outline-none focus:border-violet-400">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
              </select>
            </label>
            <label className="block col-span-2">
              <span className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase tracking-widest">Endpoint URL</span>
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://api.example.com/data" className="mt-1 w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 text-[12px] outline-none focus:border-violet-400" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.url.trim()} className="flex-1 py-2 rounded-xl bg-violet-500 text-white text-[11px] font-bold hover:bg-violet-600 disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="py-2 px-3 rounded-xl border border-black/10 dark:border-white/10 text-[11px] text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 py-4">
          <RefreshCw size={12} className="animate-spin" /> Loading…
        </div>
      ) : apis.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-gray-400 dark:text-white/30">
          <Globe size={20} className="mx-auto mb-2 opacity-30" />
          No custom APIs defined yet.
        </div>
      ) : (
        <div className="space-y-2">
          {apis.map((api) => (
            <div key={api.id} className="flex items-center gap-3 p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03]">
              <Globe size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-gray-800 dark:text-white">{api.name}</div>
                <div className="text-[10px] text-gray-400 dark:text-white/30">{api.method} {api.url} · {api.direction}</div>
              </div>
              <button onClick={() => api.id != null && handleDelete(api.id)} className="text-red-400 hover:text-red-600 transition-colors" disabled={api.id == null}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ConnectorsPageProps {
  onOpenAISetup?: () => void;
}

export const ConnectorsPage: React.FC<ConnectorsPageProps> = () => {
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuringConnector, setConfiguringConnector] = useState<ConnectorConfig | null>(null);
  const [tab, setTab] = useState<'pull' | 'push' | 'ai'>('pull');

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors');
      const data = await res.json() as { connectors?: ConnectorConfig[] };
      setConnectors(data.connectors || []);
    } catch {
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const handleToggle = useCallback(async (id: number, enabled: boolean) => {
    await fetch(`/api/connectors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, last_status: enabled ? 'connected' : 'disconnected' }),
    });
    fetchConnectors();
  }, [fetchConnectors]);

  const handleSync = useCallback(async (id: number) => {
    await fetch(`/api/connectors/${id}/sync`, { method: 'POST' });
    fetchConnectors();
  }, [fetchConnectors]);

  const handleSaveConfig = useCallback(async (id: number, config: Record<string, unknown>) => {
    await fetch(`/api/connectors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, enabled: true, last_status: 'connected' }),
    });
    setConfiguringConnector(null);
    fetchConnectors();
  }, [fetchConnectors]);

  const handleSaveAI = useCallback(async (id: number, config: Record<string, unknown>, enabled: boolean) => {
    await fetch(`/api/connectors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, enabled, last_status: enabled ? 'connected' : 'disconnected' }),
    });
    fetchConnectors();
  }, [fetchConnectors]);

  const handleDisconnectAI = useCallback(async (id: number) => {
    await fetch(`/api/connectors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, last_status: 'disconnected', config: {} }),
    });
    fetchConnectors();
  }, [fetchConnectors]);

  const pullConnectors = connectors.filter((c) => c.direction === 'pull');
  const pushConnectors = connectors.filter((c) => c.direction === 'push');
  const aiConnectors = connectors.filter((c) => c.direction === 'ai');

  const displayed = tab === 'pull' ? pullConnectors : tab === 'push' ? pushConnectors : [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Connectors</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] w-fit">
        {([
          ['pull', 'Pull', <ArrowDown key="d" size={13} />],
          ['push', 'Push', <ArrowUp key="u" size={13} />],
          ['ai', 'AI Engines', <Bot key="b" size={13} />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all ${tab === id ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === 'ai' ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 text-[12px] text-gray-500 dark:text-white/40 leading-relaxed">
            <strong className="text-gray-700 dark:text-white/60">AI Engines</strong> power Prism Agent. Your API keys are stored in the local backend database — they never leave your device and no .env edits are required.
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading AI engines…
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {aiConnectors.map((c) => (
                <AIEngineCard
                  key={c.id}
                  connector={c}
                  onSave={handleSaveAI}
                  onDisconnect={handleDisconnectAI}
                />
              ))}
              {aiConnectors.length === 0 && (
                <div className="col-span-2 text-center py-10 text-[13px] text-gray-400 dark:text-white/30">
                  <Bot size={24} className="mx-auto mb-3 opacity-30" />
                  No AI engines found.
                </div>
              )}
            </div>
          )}

          <hr className="border-black/5 dark:border-white/5" />
          <CustomApisSection />
        </div>
      ) : (
        <>
          {/* Description */}
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 text-[12px] text-gray-500 dark:text-white/40 leading-relaxed">
            {tab === 'pull' ? (
              <>
                <strong className="text-gray-700 dark:text-white/60">Pull connectors</strong> continuously fetch your data from external platforms and import it into UserMap. Prism Agent then reads and structures this data automatically.
              </>
            ) : (
              <>
                <strong className="text-gray-700 dark:text-white/60">Push connectors</strong> send structured context events from UserMap to your automation tools (n8n, Make, or any custom webhook endpoint) whenever you update your knowledge graph.
              </>
            )}
          </div>

          {/* Connector grid */}
          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-white/30 py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading connectors…
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {displayed.map((c) => (
                <ConnectorCard
                  key={c.id}
                  connector={c}
                  onToggle={handleToggle}
                  onSync={handleSync}
                  onConfigure={setConfiguringConnector}
                />
              ))}
              {displayed.length === 0 && (
                <div className="col-span-2 text-center py-10 text-[13px] text-gray-400 dark:text-white/30">
                  <Plug size={24} className="mx-auto mb-3 opacity-30" />
                  No {tab} connectors available.
                </div>
              )}
            </div>
          )}

          {tab === 'push' && (
            <>
              <hr className="border-black/5 dark:border-white/5" />
              <CustomApisSection />
            </>
          )}
        </>
      )}

      {configuringConnector && (
        <ConfigureModal
          connector={configuringConnector}
          onClose={() => setConfiguringConnector(null)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
};

