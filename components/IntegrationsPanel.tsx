/**
 * IntegrationsPanel — UI for connecting / disconnecting tools.
 *
 * Shows all registered integrations with their live connection status.
 * Clicking "Connect" opens the OAuth popup (or a PAT input for GitHub).
 * Matching the design language of the rest of the UserMap UI.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Link2, Unlink, KeyRound, X, Puzzle } from 'lucide-react';
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
    const { integrations, connect, connectWithPAT, disconnect } = useIntegrations();

    const [patInputId, setPatInputId] = useState<IntegrationId | null>(null);
    const [patValue, setPatValue] = useState('');
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

    const handlePATSubmit = async (id: IntegrationId) => {
        if (!patValue.trim()) return;
        clearError(id);
        setConnecting((prev) => ({ ...prev, [id]: true }));
        try {
            await connectWithPAT(id, patValue.trim());
            setPatInputId(null);
            setPatValue('');
        } catch (err: any) {
            setErrorMessages((prev) => ({
                ...prev,
                [id]: err?.message || 'PAT connection failed. Check your token and try again.'
            }));
        } finally {
            setConnecting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleDisconnect = (id: IntegrationId) => {
        clearError(id);
        disconnect(id);
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
                                    One-click OAuth — all data stays local
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
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                            {integrations.map((integration) => {
                                const isConnected = integration.status === 'connected';
                                const isBusy = connecting[integration.id] || integration.status === 'connecting';
                                const isPatMode = patInputId === integration.id;
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
                                                    value={patValue}
                                                    onChange={(e) => setPatValue(e.target.value)}
                                                    placeholder="Paste your Personal Access Token"
                                                    className="flex-1 h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-[11px] text-gray-800 dark:text-white outline-none focus:border-black/20 dark:focus:border-white/20"
                                                    onKeyDown={(e) => e.key === 'Enter' && handlePATSubmit(integration.id)}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handlePATSubmit(integration.id)}
                                                    disabled={isBusy || !patValue.trim()}
                                                    className="h-9 px-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-black uppercase tracking-[0.1em] disabled:opacity-40"
                                                >
                                                    {isBusy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                                                </button>
                                                <button
                                                    onClick={() => { setPatInputId(null); setPatValue(''); }}
                                                    className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 dark:text-white/40"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        {!isPatMode && (
                                            <div className="flex gap-2">
                                                {!isConnected ? (
                                                    <>
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

                                                        {/* PAT shortcut (only for adapters that support it) */}
                                                        {integration.supportsPAT && (
                                                            <button
                                                                onClick={() => { setPatInputId(integration.id); setPatValue(''); clearError(integration.id); }}
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
                            })}
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 px-5 py-4 border-t border-black/5 dark:border-white/10">
                            <p className="text-[10px] text-gray-400 dark:text-white/25 leading-relaxed">
                                All tokens are stored only on your device in your browser's local storage.
                                No data is sent to UserMap servers.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
