/**
 * AIChatPanel — Chat interface for AI assistants connected to UserMap.
 *
 * Features:
 *  - Lists all connected AI assistants (ChatGPT, Claude, Gemini, Ollama).
 *  - Automatically injects the user's UserMap context into every query — no
 *    copy/paste needed.
 *  - Streams text output; gracefully handles errors.
 *  - Works entirely client-side; no UserMap server involved.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, Loader2, ChevronDown, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import type { ChatMessage, IntegrationId, ToolContextItem } from '../types';
import { useIntegrations, type EnrichedIntegration } from '../hooks/useIntegrations';
import { ADAPTERS } from '../services/integrations';

interface AIChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    /** UserMap context items to inject into every AI query automatically. */
    contextItems: ToolContextItem[];
}

interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    model?: string;
    error?: boolean;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ isOpen, onClose, contextItems }) => {
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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-select the first connected AI when the panel opens or integrations change.
    useEffect(() => {
        if (aiIntegrations.length > 0 && !selectedId) {
            setSelectedId(aiIntegrations[0].id);
        }
        if (selectedId && !aiIntegrations.find((i) => i.id === selectedId)) {
            setSelectedId(aiIntegrations[0]?.id ?? null);
        }
    }, [aiIntegrations, selectedId]);

    // Scroll to bottom whenever messages update.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const selectedIntegration: EnrichedIntegration | undefined = aiIntegrations.find(
        (i) => i.id === selectedId
    );

    const handleSelectAI = (id: IntegrationId) => {
        if (id !== selectedId) {
            setSelectedId(id);
            setMessages([]);
            setHistory([]);
            setInput('');
        }
        setShowPicker(false);
    };

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending || !selectedId) return;

        const adapter = ADAPTERS[selectedId];
        if (!adapter) return;

        const userDisplayMsg: DisplayMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed
        };
        setMessages((prev) => [...prev, userDisplayMsg]);
        setInput('');
        setIsSending(true);

        const updatedHistory: ChatMessage[] = [
            ...history,
            { role: 'user', content: trimmed }
        ];

        try {
            const response = await adapter.sendMessage(updatedHistory, contextItems);

            const assistantDisplayMsg: DisplayMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: response.text,
                model: response.model
            };
            setMessages((prev) => [...prev, assistantDisplayMsg]);
            setHistory([
                ...updatedHistory,
                { role: 'assistant', content: response.text }
            ]);
        } catch (err: any) {
            const errMsg: DisplayMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: err?.message || 'An error occurred. Please try again.',
                error: true
            };
            setMessages((prev) => [...prev, errMsg]);
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    }, [input, isSending, selectedId, history, contextItems]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleClearChat = () => {
        setMessages([]);
        setHistory([]);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="ai-chat-backdrop"
                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Panel — slides in from the left */}
                    <motion.div
                        key="ai-chat-panel"
                        className="fixed left-0 top-0 z-[101] h-full w-full max-w-md bg-white dark:bg-[#1A1A1A] border-r border-black/10 dark:border-white/10 shadow-2xl flex flex-col"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                    >
                        {/* Header */}
                        <div className="h-16 shrink-0 border-b border-black/5 dark:border-white/10 px-5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Bot size={16} className="text-violet-500 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-900 dark:text-white">
                                        AI Chat
                                    </div>
                                    <div className="text-[10px] text-gray-500 dark:text-white/40">
                                        {contextItems.length > 0
                                            ? `${contextItems.length} context items auto-injected`
                                            : 'UserMap context ready'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {messages.length > 0 && (
                                    <button
                                        onClick={handleClearChat}
                                        className="h-7 px-2 rounded-lg border border-black/10 dark:border-white/10 text-[9px] font-black uppercase tracking-[0.1em] text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white flex items-center gap-1 transition-colors"
                                        title="Clear chat"
                                    >
                                        <RefreshCw size={10} />
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="h-8 w-8 rounded-lg border border-black/10 dark:border-white/10 flex items-center justify-center text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                                    title="Close"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* No connected AI assistants state */}
                        {aiIntegrations.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                                    <Bot size={24} className="text-violet-400" />
                                </div>
                                <div>
                                    <div className="text-[13px] font-black text-gray-900 dark:text-white mb-1">
                                        No AI assistants connected
                                    </div>
                                    <div className="text-[11px] text-gray-500 dark:text-white/40 leading-relaxed max-w-[240px]">
                                        Connect ChatGPT, Claude, Gemini, or Ollama in the Tools panel to start chatting with your UserMap context.
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* AI selector */}
                                <div className="px-4 py-3 border-b border-black/5 dark:border-white/10">
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPicker(!showPicker)}
                                            className="w-full h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-black/20 flex items-center gap-2 text-left"
                                        >
                                            {selectedIntegration && (
                                                <img
                                                    src={selectedIntegration.logoUrl}
                                                    alt=""
                                                    className="h-5 w-5 rounded object-contain bg-white"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                            )}
                                            <span className="flex-1 text-[11px] font-bold text-gray-800 dark:text-white truncate">
                                                {selectedIntegration?.label ?? 'Select AI…'}
                                            </span>
                                            <ChevronDown size={12} className="text-gray-400 dark:text-white/30 shrink-0" />
                                        </button>

                                        {showPicker && (
                                            <div className="absolute top-full mt-1 left-0 right-0 z-10 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#222] shadow-xl overflow-hidden">
                                                {aiIntegrations.map((ai) => (
                                                    <button
                                                        key={ai.id}
                                                        onClick={() => handleSelectAI(ai.id)}
                                                        className={`w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                                                            ai.id === selectedId ? 'bg-violet-50 dark:bg-violet-500/10' : ''
                                                        }`}
                                                    >
                                                        <img
                                                            src={ai.logoUrl}
                                                            alt=""
                                                            className="h-5 w-5 rounded object-contain bg-white"
                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                        />
                                                        <span className="text-[11px] font-bold text-gray-800 dark:text-white">
                                                            {ai.label}
                                                        </span>
                                                        {ai.accountName && (
                                                            <span className="text-[9px] text-gray-400 dark:text-white/30 ml-auto">
                                                                {ai.accountName}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                                    {messages.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                                            <div className="h-12 w-12 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                                                <Sparkles size={20} className="text-violet-400" />
                                            </div>
                                            <div>
                                                <div className="text-[12px] font-black text-gray-700 dark:text-white/80 mb-1">
                                                    Ask anything
                                                </div>
                                                <div className="text-[10px] text-gray-400 dark:text-white/30 max-w-[200px] leading-relaxed">
                                                    {selectedIntegration?.label} will automatically use your UserMap context — no copy/paste needed.
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {messages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap ${
                                                    msg.role === 'user'
                                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black rounded-br-sm'
                                                        : msg.error
                                                        ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-bl-sm'
                                                        : 'bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/90 rounded-bl-sm'
                                                }`}
                                            >
                                                {msg.error && (
                                                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-red-500">
                                                        <AlertCircle size={10} />
                                                        Error
                                                    </div>
                                                )}
                                                {msg.content}
                                                {msg.model && !msg.error && (
                                                    <div className="mt-1 text-[9px] opacity-40">
                                                        {msg.model}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {isSending && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-100 dark:bg-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                                                <Loader2 size={12} className="animate-spin text-violet-500" />
                                                <span className="text-[11px] text-gray-500 dark:text-white/40">
                                                    Thinking…
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input */}
                                <div className="shrink-0 border-t border-black/5 dark:border-white/10 p-4">
                                    <div className="flex gap-2 items-end">
                                        <textarea
                                            ref={inputRef}
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={`Ask ${selectedIntegration?.label ?? 'AI'} anything…`}
                                            rows={1}
                                            disabled={isSending}
                                            className="flex-1 resize-none rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-black/20 px-3 py-2.5 text-[12px] text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors disabled:opacity-50 max-h-32 leading-relaxed"
                                            style={{ height: 'auto' }}
                                            onInput={(e) => {
                                                const el = e.currentTarget;
                                                el.style.height = 'auto';
                                                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                                            }}
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={isSending || !input.trim()}
                                            className="h-10 w-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                            title="Send (Enter)"
                                        >
                                            {isSending ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Send size={14} />
                                            )}
                                        </button>
                                    </div>
                                    <div className="mt-2 text-[9px] text-gray-400 dark:text-white/20 text-center">
                                        Enter to send · Shift+Enter for new line · Context auto-injected
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
