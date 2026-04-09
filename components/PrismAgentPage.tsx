import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Zap, CheckCircle, RefreshCw, Send, Loader2, ShieldAlert, ChevronDown } from 'lucide-react';
import type { ChatMessage, IntegrationId, PageNode } from '../types';
import { useIntegrations, type EnrichedIntegration } from '../hooks/useIntegrations';
import { ADAPTERS } from '../services/integrations';
import { runPrismTurn } from '../services/prismAgent';

interface PrismAgentPageProps {
  tree: PageNode;
  onAddNode: (parentId: string, newNode: PageNode) => void;
  connectedAICount: number;
  onOpenSetup: () => void;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  error?: boolean;
  isSystemInternal?: boolean;
}

interface PrivacyRequest {
  id: string;
  nodeId: string;
  reason: string;
  resolve: (granted: boolean) => void;
}

function findNodeById(node: PageNode, id: string): PageNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function naiveSearchMap(node: PageNode, query: string): PageNode[] {
  const results: PageNode[] = [];
  const lowerQuery = query.toLowerCase();
  function search(n: PageNode) {
    if (n.visibility !== 'private') {
      if (n.label.toLowerCase().includes(lowerQuery) || (n.value && n.value.toLowerCase().includes(lowerQuery))) {
        results.push(n);
      }
    }
    for (const child of n.children) search(child);
  }
  search(node);
  return results;
}

export const PrismAgentPage: React.FC<PrismAgentPageProps> = ({
  tree,
  onAddNode,
  connectedAICount,
  onOpenSetup,
}) => {
  const { integrations } = useIntegrations();
  const aiIntegrations = integrations.filter((i) => i.isAIAssistant && i.status === 'connected');

  const [selectedId, setSelectedId] = useState<IntegrationId | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [agentThought, setAgentThought] = useState<string | null>(null);
  const [privacyRequest, setPrivacyRequest] = useState<PrivacyRequest | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (aiIntegrations.length > 0 && !selectedId) {
      setSelectedId(aiIntegrations[0].id);
    }
    if (selectedId && !aiIntegrations.find((i) => i.id === selectedId)) {
      setSelectedId(aiIntegrations[0]?.id ?? null);
    }
  }, [aiIntegrations, selectedId]);

  useEffect(() => {
    if (!privacyRequest) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, agentThought, privacyRequest]);

  const selectedIntegration: EnrichedIntegration | undefined = aiIntegrations.find((i) => i.id === selectedId);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || !selectedId) return;

    const adapter = ADAPTERS[selectedId];
    if (!adapter) return;

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    const updatedHistory: ChatMessage[] = [...history, { role: 'user', content: trimmed }];

    try {
      const finalMessages = await runPrismTurn(adapter, updatedHistory, {
        onAgentThought: (thought) => setAgentThought(thought),
        onSearchMap: async (query) => {
          // 1. Search backend indexed context (uploaded docs + connector data)
          let backendResults = '';
          try {
            const res = await fetch('/api/prism/context', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ intent: query }),
            });
            if (res.ok) {
              const data = await res.json() as { results?: Array<{ source: string; content: string }>; total?: number };
              if ((data.results ?? []).length > 0) {
                backendResults = (data.results ?? [])
                  .slice(0, 5)
                  .map((r) => `[source:${r.source}] ${r.content.slice(0, 500)}`)
                  .join('\n---\n');
              }
            }
          } catch (searchErr: unknown) {
            // Server unreachable or context API error — fall through to local search only
            console.warn('[Prism] Backend context search failed:', searchErr instanceof Error ? searchErr.message : String(searchErr));
          }

          // 2. Also search local in-memory map for nodes not yet on backend
          const localHits = naiveSearchMap(tree, query);
          const localResults = localHits.length > 0
            ? localHits.slice(0, 3).map((h) => `[local:${h.id}] ${h.label}: ${h.value || ''}`)
            : [];

          // Emit chat.retrieve log (fire-and-forget)
          fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'chat.retrieve',
              source_tool: 'prism',
              actor: 'system',
              summary: `Context search: "${query}" — ${backendResults ? 'found indexed context' : 'no indexed context'}; ${localHits.length} local nodes`,
            }),
          }).catch(() => {});

          if (!backendResults && localResults.length === 0) {
            return 'No context found in indexed documents or knowledge graph for this query.';
          }
          return [backendResults, ...localResults].filter(Boolean).join('\n---\n');
        },
        onReadPrivate: (nodeId, context) =>
          new Promise((resolve) => {
            setPrivacyRequest({
              id: crypto.randomUUID(),
              nodeId,
              reason: context,
              resolve: (granted) => {
                setPrivacyRequest(null);
                if (granted) {
                  const node = findNodeById(tree, nodeId);
                  resolve({ allowed: true, data: node ? (node.value || node.label) : 'Node not found.' });
                } else {
                  resolve({ allowed: false });
                }
              },
            });
          }),
        onCreateFact: async (label, value) => {
          const rootCat = tree.children[0]?.id || 'root';
          onAddNode(rootCat, {
            id: crypto.randomUUID(),
            label,
            value,
            nodeType: 'fact',
            children: [],
          });
          return true;
        },
        onCheckSystemStatus: async () => {
          try {
            const res = await fetch('/api/status');
            if (!res.ok) return `System status check failed: HTTP ${res.status}`;
            const data = await res.json();
            const connRes = await fetch('/api/connectors');
            const connData = await connRes.json();
            const connectors = (connData.connectors ?? []) as Array<{ connector_type: string; last_status?: string; enabled: boolean }>;
            const lines = connectors.map(
              (c) => `${c.connector_type}: ${c.enabled ? (c.last_status || 'no status') : 'disabled'}`
            );
            return `Server: ${data.status || 'ok'}. Connectors: ${lines.join(', ') || 'none configured'}`;
          } catch (err: unknown) {
            return `Status check error: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
        onReadLogs: async (limit = 10) => {
          try {
            const res = await fetch(`/api/logs?limit=${limit}`);
            if (!res.ok) return `Logs unavailable: HTTP ${res.status}`;
            const data = await res.json();
            const logs = (data.logs ?? []) as Array<{ event_type: string; summary?: string; created_at: string }>;
            if (logs.length === 0) return 'No log records found.';
            return logs.map((l) => `[${l.created_at}] ${l.event_type}: ${l.summary || ''}`.trim()).join('\n');
          } catch (err: unknown) {
            return `Logs read error: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      });

      const newHistory = [...finalMessages];
      setHistory(newHistory);

      // Emit chat.answer log (fire-and-forget)
      const lastAssistantMsg = [...finalMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg) {
        fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'chat.answer',
            source_tool: 'prism',
            actor: 'system',
            summary: `Prism answered: "${lastAssistantMsg.content.slice(0, 120)}"`,
          }),
        }).catch(() => {});
      }

      const displayMsgs = newHistory
        .map((m) => ({
          id: crypto.randomUUID(),
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          isSystemInternal: m.role === 'system',
        }))
        .filter((m) => !m.isSystemInternal || m.content.includes('ACCESS DENIED'));

      setMessages(displayMsgs);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: err instanceof Error ? err.message : 'An error occurred.',
          error: true,
        },
      ]);
    } finally {
      setIsSending(false);
      setAgentThought(null);
      inputRef.current?.focus();
    }
  }, [input, isSending, selectedId, history, tree, onAddNode]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
          <Bot size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Prism Agent</h1>
        </div>

        {/* Status pill */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold ${
          connectedAICount > 0
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
        }`}>
          {connectedAICount > 0 ? <CheckCircle size={12} /> : <RefreshCw size={12} />}
          {connectedAICount > 0 ? 'Active' : 'No AI connected'}
        </div>

        {connectedAICount === 0 && (
          <button
            onClick={onOpenSetup}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-[11px] font-semibold hover:bg-violet-600 transition-colors"
          >
            <Zap size={12} />
            Connect AI
          </button>
        )}
      </div>

      {aiIntegrations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Bot size={28} className="text-violet-500" />
          </div>
          <div className="text-[14px] font-black text-gray-900 dark:text-white">Connect an AI engine to activate Prism</div>
          <div className="text-[12px] text-gray-400 dark:text-white/40 max-w-xs">
            Prism requires a live AI model. Connect ChatGPT, Claude, Gemini, or Ollama to get started.
          </div>
          <button
            onClick={onOpenSetup}
            className="px-5 py-2.5 rounded-xl bg-violet-500 text-white text-[12px] font-bold hover:bg-violet-600 transition-colors"
          >
            Connect AI Engine
          </button>
        </div>
      ) : (
        <>
          {/* Engine selector */}
          <div className="shrink-0 px-6 py-3 border-b border-black/5 dark:border-white/5">
            <div className="relative w-fit">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/5 flex items-center gap-2 text-left"
              >
                <span className="text-[11px] font-bold text-gray-700 dark:text-white truncate">
                  {selectedIntegration?.label ?? 'Select engine'}
                </span>
                <ChevronDown size={12} className="text-gray-400 shrink-0" />
              </button>
              {showPicker && (
                <div className="absolute top-full mt-1 left-0 z-20 w-48 bg-white dark:bg-[#222] shadow-xl rounded-xl overflow-hidden border border-black/10 dark:border-white/10">
                  {aiIntegrations.map((ai) => (
                    <button
                      key={ai.id}
                      onClick={() => { setSelectedId(ai.id); setShowPicker(false); }}
                      className="w-full px-3 py-2.5 text-left text-[11px] text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                    >
                      {ai.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="text-[13px] font-black text-gray-700 dark:text-white/80 mb-2">How can I help?</div>
                <div className="text-[11px] text-gray-400 dark:text-white/40">
                  Ask about your data, system status, or have Prism analyse your context.
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[12px] whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black rounded-br-sm'
                      : msg.error
                      ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-500/20'
                      : 'bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/90 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {privacyRequest && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-[11px] uppercase">
                  <ShieldAlert size={14} /> Private Memory Access
                </div>
                <div className="text-[11px] text-gray-700 dark:text-white/80">
                  Prism is requesting to read private node <b>{privacyRequest.nodeId}</b>.
                  <br /><br />
                  <span className="italic">Reasoning: {privacyRequest.reason}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => privacyRequest.resolve(true)} className="flex-1 bg-purple-600 text-white text-[10px] font-black uppercase py-2 rounded-lg">Allow</button>
                  <button onClick={() => privacyRequest.resolve(false)} className="flex-1 bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white text-[10px] font-black uppercase py-2 rounded-lg">Deny</button>
                </div>
              </div>
            )}

            {agentThought && !privacyRequest && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-white/30 italic">
                <Loader2 size={10} className="animate-spin text-violet-500" />
                {agentThought}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-black/5 dark:border-white/5 px-6 py-4 flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask Prism to query, analyse, or update your data…"
              disabled={isSending || !!privacyRequest}
              rows={1}
              className="flex-1 rounded-xl bg-gray-50 dark:bg-black/20 border border-black/10 dark:border-white/10 text-[12px] p-3 text-gray-800 dark:text-white resize-none outline-none focus:border-violet-400 dark:focus:border-violet-500"
            />
            <button
              onClick={handleSend}
              disabled={isSending || !input.trim() || !!privacyRequest}
              className="w-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
