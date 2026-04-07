/**
 * IntegrationsPanel — UI for connecting / disconnecting tools.
 *
 * Shows all registered integrations split into two sections:
 *   • Data Sources  (Slack, GitHub, Gmail)
 *   • AI Assistants (ChatGPT, Claude, Gemini, Ollama)
 *
 * Clicking "Connect" opens the OAuth popup, an API-key input, or a one-click
 * local bridge depending on the adapter's capabilities.
 * Matching the design language of the rest of the UserMap UI.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Link2, Unlink, KeyRound, X, Puzzle, Bot, Wifi } from 'lucide-react';
import type { IntegrationId, IntegrationStatus } from '../types';
import { useIntegrations } from '../hooks/useIntegrations';

interface IntegrationsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const STATUS_ICON: Record<IntegrationStatus, React.ReactNode> = {
    connected: <CheckCircle size={14} className="text-emerald-500" />,
    connecting: <Loader2 size={14} className="animate-spin text-amber-400" />,
    disconnected: <XCircle size={14} className="text-gray-400 dark:text-white/20" />,
    error: <XCircle size={14} className="text-red-400" />
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Not connected',
    error: 'Connection failed'
};

export const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ isOpen, onClose }) => {
    const { integrations, connect, connectWithPAT, connectWithApiKey, connectDirect, disconnect } = useIntegrations();

    const [patInputId, setPatInputId] = useState<IntegrationId | null>(null);
    const [apiKeyInputId, setApiKeyInputId] = useState<IntegrationId | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [errorMessages, setErrorMessages] = useState<Partial<Record<IntegrationId, string>>>({});
    const [connecting, setConnecting] = useState<Partial<Record<IntegrationId, boolean>>>({});

    const clearError = (id: IntegrationId) =>
        setErrorMessages((prev) => { const n = { ...prev }; delete n[id]; return n; });

    const handleConnect = async (id: IntegrationId) => {
        clearError(id);
        setConnecting((prev) => ({ ...prev, [id]: true }));
        try {
            await connect(id);
        } catch (err: any) {
            setErrorMessages((prev) => ({
                ...prev,
                [id]: err?.message || 'Connection failed. Please try again.'
            }));
        } finally {
            setConnecting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleConnectDirect = async (id: IntegrationId) => {
        clearError(id);
        setConnecting((prev) => ({ ...prev, [id]: true }));
        try {
            await connectDirect(id);
        } catch (err: any) {
            setErrorMessages((prev) => ({
                ...prev,
                [id]: err?.message || 'Could not connect. Is the local service running?'
            }));
        } finally {
            setConnecting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handlePATSubmit = async (id: IntegrationId) => {
        if (!inputValue.trim()) return;
        clearError(id);
        setConnecting((prev) => ({ ...prev, [id]: true }));
        try {
            await connectWithPAT(id, inputValue.trim());
            setPatInputId(null);
            setInputValue('');
        } catch (err: any) {
            setErrorMessages((prev) => ({
                ...prev,
                [id]: err?.message || 'PAT connection failed. Check your token and try again.'
            }));
        } finally {
            setConnecting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleApiKeySubmit = async (id: IntegrationId) => {
        if (!inputValue.trim()) return;
        clearError(id);
        setConnecting((prev) => ({ ...prev, [id]: true }));
        try {
            await connectWithApiKey(id, inputValue.trim());
            setApiKeyInputId(null);
            setInputValue('');
        } catch (err: any) {
            setErrorMessages((prev) => ({
                ...prev,
                [id]: err?.message || 'API key validation failed. Check your key and try again.'
            }));
        } finally {
            setConnecting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleDisconnect = (id: IntegrationId) => {
        clearError(id);
        disconnect(id);
    };

    const dataSources = integrations.filter((i) => i.category === 'data-source');
    const aiAssistants = integrations.filter((i) => i.category === 'ai-assistant');

    const renderIntegration = (integration: (typeof integrations)[0]) => {
        const isConnected = integration.status === 'connected';
        const isBusy = connecting[integration.id] || integration.status === 'connecting';
        const isPatMode = patInputId === integration.id;
        const isApiKeyMode = apiKeyInputId === integration.id;
        const errMsg = errorMessages[integration.id];

        return (
            <div
                key={integration.id}
                className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-white/[0.03] p-4 flex flex-col gap-3"
            >
                {/* Tool row */}
                <div className="flex items-center gap-3">
                    <div className="relative h-8 w-8 shrink-0">
                        <img
                            src={integration.logoUrl}
                            alt={integration.label}
                            className="h-8 w-8 rounded-lg object-contain bg-white border border-black/5 dark:border-white/10 p-1"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = 'flex';
                            }}
                        />
                        <div
                            className="absolute inset-0 h-8 w-8 rounded-lg bg-gray-100 dark:bg-white/10 border border-black/5 dark:border-white/10 items-center justify-center text-gray-400 dark:text-white/30"
                            style={{ display: 'none' }}
                            aria-hidden="true"
                        >
                            <Puzzle size={16} />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-black text-gray-900 dark:text-white leading-tight">
                            {integration.label}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-white/40 truncate">
                            {integration.description}
                        </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-1 shrink-0">
                        {STATUS_ICON[integration.status]}
                        <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">
                            {STATUS_LABEL[integration.status]}
                        </span>
                    </div>
                </div>

                {/* Account name when connected */}
                {isConnected && integration.accountName && (
                    <div className="text-[10px] text-gray-500 dark:text-white/40 -mt-1">
                        Account: <span className="font-semibold text-gray-700 dark:text-white/70">{integration.accountName}</span>
                    </div>
                )}

                {/* Error message */}
                {errMsg && (
                    <div className="text-[10px] text-red-500 dark:text-red-400 -mt-1 leading-snug">
                        {errMsg}
                    </div>
                )}

                {/* PAT input (GitHub) */}
                {isPatMode && (
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Paste your Personal Access Token"
                            className="flex-1 h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-[11px] text-gray-800 dark:text-white outline-none focus:border-black/20 dark:focus:border-white/20"
                            onKeyDown={(e) => e.key === 'Enter' && handlePATSubmit(integration.id)}
                            autoFocus
                        />
                        <button
                            onClick={() => handlePATSubmit(integration.id)}
                            disabled={isBusy || !inputValue.trim()}
                            className="h-9 px-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black uppercase tracking-[0.1em] disabled:opacity-40"
                        >
                            {isBusy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                        </button>
                        <button
                            onClick={() => { setPatInputId(null); setInputValue(''); }}
                            className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 dark:text-white/40"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* API key input (AI assistants) */}
                {isApiKeyMode && (
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Paste your API key"
                            className="flex-1 h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-[11px] text-gray-800 dark:text-white outline-none focus:border-black/20 dark:focus:border-white/20"
                            onKeyDown={(e) => e.key === 'Enter' && handleApiKeySubmit(integration.id)}
                            autoFocus
                        />
                        <button
                            onClick={() => handleApiKeySubmit(integration.id)}
                            disabled={isBusy || !inputValue.trim()}
                            className="h-9 px-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black uppercase tracking-[0.1em] disabled:opacity-40"
                        >
                            {isBusy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                        </button>
                        <button
                            onClick={() => { setApiKeyInputId(null); setInputValue(''); }}
                            className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 dark:text-white/40"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Action buttons */}
                {!isPatMode && !isApiKeyMode && (
                    <div className="flex gap-2">
                        {!isConnected ? (
                            <>
                                {/* Local bridge: one-click connect (Ollama) */}
                                {integration.supportsLocalBridge && (
                                    <button
                                        onClick={() => handleConnectDirect(integration.id)}
                                        disabled={isBusy}
                                        className="flex-1 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-[0.12em] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                                    >
                                        {isBusy ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Wifi size={12} />
                                        )}
                                        {isBusy ? 'Detecting…' : 'Connect Local'}
                                    </button>
                                )}

                                {/* API key button (AI assistants) */}
                                {integration.supportsApiKey && (
                                    <button
                                        onClick={() => { setApiKeyInputId(integration.id); setInputValue(''); clearError(integration.id); }}
                                        disabled={isBusy}
                                        className="flex-1 h-9 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black uppercase tracking-[0.12em] flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        <KeyRound size={12} />
                                        Add API Key
                                    </button>
                                )}

                                {/* OAuth connect button (standard integrations) */}
                                {!integration.supportsApiKey && !integration.supportsLocalBridge && (
                                    <button
                                        onClick={() => handleConnect(integration.id)}
                                        disabled={isBusy}
                                        className="flex-1 h-9 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black uppercase tracking-[0.12em] flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isBusy ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Link2 size={12} />
                                        )}
                                        {isBusy ? 'Connecting…' : 'Connect'}
                                    </button>
                                )}

                                {/* PAT shortcut (only for adapters that support it) */}
                                {integration.supportsPAT && (
                                    <button
                                        onClick={() => { setPatInputId(integration.id); setInputValue(''); clearError(integration.id); }}
                                        disabled={isBusy}
                                        className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] disabled:opacity-50"
                                        title="Use a Personal Access Token instead"
                                    >
                                        <KeyRound size={12} />
                                        PAT
                                    </button>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => handleDisconnect(integration.id)}
                                className="flex-1 h-9 rounded-xl border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.12em] text-gray-600 dark:text-white/60 flex items-center justify-center gap-1.5 hover:border-red-300 hover:text-red-500 dark:hover:border-red-500/40 dark:hover:text-red-400 transition-colors"
                            >
                                <Unlink size={12} />
                                Disconnect
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        key="panel"
                        className="fixed right-0 top-0 z-[101] h-full w-full max-w-sm bg-white dark:bg-[#1A1A1A] border-l border-black/10 dark:border-white/10 shadow-2xl flex flex-col"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                    >
                        {/* Header */}
                        <div className="h-16 shrink-0 border-b border-black/5 dark:border-white/10 px-5 flex items-center justify-between">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-900 dark:text-white">
                                    Connected Tools
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-white/40 mt-0.5">
                                    One-click setup — all data stays local
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="h-8 w-8 rounded-lg border border-black/10 dark:border-white/10 flex items-center justify-center text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                                title="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                            {/* Data Sources */}
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-white/30 mb-2 px-1">
                                    Data Sources
                                </div>
                                <div className="space-y-3">
                                    {dataSources.map(renderIntegration)}
                                </div>
                            </div>

                            {/* AI Assistants */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-2 px-1">
                                    <Bot size={10} className="text-violet-500" />
                                    <div className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-white/30">
                                        AI Assistants
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {aiAssistants.map(renderIntegration)}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 px-5 py-4 border-t border-black/5 dark:border-white/10">
                            <p className="text-[10px] text-gray-400 dark:text-white/25 leading-relaxed">
                                All tokens and API keys are stored only on your device in your browser's local storage.
                                No data is sent to UserMap servers.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
