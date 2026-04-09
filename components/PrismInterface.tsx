import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, Loader2, ChevronDown, Sparkles, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ChatMessage, IntegrationId, PageNode } from '../types';
import { useIntegrations, type EnrichedIntegration } from '../hooks/useIntegrations';
import { ADAPTERS } from '../services/integrations';
import { runPrismTurn } from '../services/prismAgent';

interface PrismInterfaceProps {
    isOpen: boolean;
    onClose: () => void;
    tree: PageNode;
    onAddNode: (parentId: string, newNode: PageNode) => void;
}

interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
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

/** Flatten non-private tree into search text */
function naiveSearchMap(node: PageNode, query: string): PageNode[] {
    const results: PageNode[] = [];
    const lowerQuery = query.toLowerCase();
    
    function search(n: PageNode) {
        if (n.visibility !== 'private') {
            const matchesLabel = n.label.toLowerCase().includes(lowerQuery);
            const matchesValue = n.value && n.value.toLowerCase().includes(lowerQuery);
            if (matchesLabel || matchesValue) {
                results.push(n);
            }
        }
        for (const child of n.children) search(child);
    }
    search(node);
    return results;
}

export const PrismInterface: React.FC<PrismInterfaceProps> = ({ isOpen, onClose, tree, onAddNode }) => {
    const { integrations } = useIntegrations();

    const aiIntegrations = integrations.filter(
        (i) => i.isAIAssistant && i.status === 'connected'
    );

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
        if (!privacyRequest) { // Don't scroll away from popup
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, agentThought, privacyRequest]);

    const selectedIntegration: EnrichedIntegration | undefined = aiIntegrations.find(
        (i) => i.id === selectedId
    );

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
                    const hits = naiveSearchMap(tree, query);
                    if (hits.length === 0) return "No results found in public map.";
                    return hits.slice(0, 5).map(h => `[${h.id}] ${h.label}: ${h.value || ''}`).join('\n');
                },
                onReadPrivate: (nodeId, context) => {
                    return new Promise((resolve) => {
                        setPrivacyRequest({
                            id: crypto.randomUUID(),
                            nodeId,
                            reason: context,
                            resolve: (granted) => {
                                setPrivacyRequest(null);
                                if (granted) {
                                    const node = findNodeById(tree, nodeId);
                                    resolve({ allowed: true, data: node ? (node.value || node.label) : "Node not found." });
                                } else {
                                    resolve({ allowed: false });
                                }
                            }
                        });
                    });
                },
                onCreateFact: async (label, value) => {
                    const rootCat = tree.children[0]?.id || 'root';
                    onAddNode(rootCat, {
                        id: crypto.randomUUID(),
                        label,
                        value,
                        nodeType: 'fact',
                        children: []
                    });
                    return true;
                },
                onCheckSystemStatus: async () => {
                    try {
                        const res = await fetch('/api/status');
                        if (!res.ok) return `Status check failed: HTTP ${res.status}`;
                        const data = await res.json();
                        return `Server: ${data.status || 'ok'}`;
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

            // Parse final display messages
            const newHistory = [...finalMessages];
            setHistory(newHistory);
            
            // Only show user and final assistant responses, or critical tool outputs
            const displayMsgs = newHistory.map(m => ({
                id: crypto.randomUUID(),
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content,
                isSystemInternal: m.role === 'system'
            })).filter(m => !m.isSystemInternal || m.content.includes("ACCESS DENIED"));
            
            setMessages(displayMsgs);

        } catch (err: any) {
            setMessages((prev) => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: err?.message || 'An error occurred.',
                error: true
            }]);
        } finally {
            setIsSending(false);
            setAgentThought(null);
            inputRef.current?.focus();
        }
    }, [input, isSending, selectedId, history, tree, onAddNode]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div key="prism-backdrop" className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />

                    <motion.div key="prism-panel" className="fixed left-0 top-0 z-[101] h-full w-full max-w-md bg-white dark:bg-[#1A1A1A] border-r border-black/10 dark:border-white/10 shadow-2xl flex flex-col"
                        initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}>
                        <div className="h-16 shrink-0 border-b border-black/5 dark:border-white/10 px-5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Bot size={16} className="text-violet-500 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-900 dark:text-white">Prism AI Agent</div>
                                    <div className="text-[10px] text-gray-500 dark:text-white/40">Autonomous Context Engineer</div>
                                </div>
                            </div>
                            <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors">
                                <X size={14} />
                            </button>
                        </div>

                        {aiIntegrations.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                                <div className="text-[13px] font-black text-gray-900 dark:text-white mb-1">Prism requires an AI Engine</div>
                                <div className="text-[11px] text-gray-500 max-w-[240px]">Connect Ollama, Gemini, or Claude in the Tools panel to boot up Prism.</div>
                            </div>
                        ) : (
                            <>
                                <div className="px-4 py-3 border-b border-black/5 dark:border-white/10">
                                    <div className="relative">
                                        <button onClick={() => setShowPicker(!showPicker)} className="w-full h-9 px-3 rounded-xl border border-black/10 bg-gray-50 flex items-center gap-2 text-left dark:bg-black/20 dark:border-white/10 text-gray-800 dark:text-white">
                                            <span className="flex-1 text-[11px] font-bold truncate">Engine: {selectedIntegration?.label}</span>
                                            <ChevronDown size={12} className="text-gray-400 shrink-0" />
                                        </button>
                                        {showPicker && (
                                            <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white shadow-xl dark:bg-[#222]">
                                                {aiIntegrations.map((ai) => (
                                                    <button key={ai.id} onClick={() => { setSelectedId(ai.id); setShowPicker(false); }}
                                                        className="w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 dark:hover:bg-white/10 dark:text-white">
                                                        {ai.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                                    {messages.length === 0 && (
                                        <div className="text-center py-12">
                                            <div className="text-[12px] font-black text-gray-700 dark:text-white/80">How can I assist?</div>
                                            <div className="text-[10px] text-gray-400 mt-2">Prism automatically reads and organizes your UserMap.</div>
                                        </div>
                                    )}

                                    {messages.map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[12px] whitespace-pre-wrap ${
                                                msg.role === 'user' ? 'bg-gray-900 text-white dark:bg-white dark:text-black rounded-br-sm' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/90 rounded-bl-sm'}`}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}

                                    { privacyRequest && (
                                         <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30 p-4 rounded-xl space-y-3">
                                            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-[11px] uppercase">
                                                <ShieldAlert size={14} /> Private Memory Access
                                            </div>
                                            <div className="text-[11px] text-gray-700 dark:text-white/80">
                                                Prism is requesting to read private node <b>{privacyRequest.nodeId}</b>.
                                                <br/><br/>
                                                <span className="italic">Reasoning: {privacyRequest.reason}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => privacyRequest.resolve(true)} className="flex-1 bg-purple-600 text-white text-[10px] font-black uppercase py-2 rounded-lg">Allow</button>
                                                <button onClick={() => privacyRequest.resolve(false)} className="flex-1 bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white text-[10px] font-black uppercase py-2 rounded-lg">Deny</button>
                                            </div>
                                         </div>
                                    )}

                                    {agentThought && !privacyRequest && (
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 italic">
                                            <Loader2 size={10} className="animate-spin text-violet-500" />
                                            {agentThought}
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="shrink-0 border-t border-black/5 p-4 flex gap-2">
                                    <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        placeholder="Ask Prism to query or update data..." disabled={isSending || !!privacyRequest}
                                        className="flex-1 rounded-xl bg-gray-50 dark:bg-black/20 text-[12px] p-3 text-gray-800 dark:text-white resize-none outline-none dark:border-white/10 border" rows={1} />
                                    <button onClick={handleSend} disabled={isSending || !input.trim() || !!privacyRequest} className="w-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40">
                                            <Send size={14} />
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
