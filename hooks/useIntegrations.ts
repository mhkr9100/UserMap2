/**
 * useIntegrations — React hook for managing tool integration state.
 *
 * Provides:
 *  - `integrations`: list of integration metadata enriched with live status
 *    and connected account name.
 *  - `connect(id)`: open the OAuth popup and handle the authorization flow.
 *  - `connectWithPAT(id, pat)`: alternative PAT-based flow (GitHub only for now).
 *  - `disconnect(id)`: clear the stored connection token.
 *  - `getStatus(id)`: current IntegrationStatus for a given tool.
 *
 * All state is derived from localStorage — no server calls are made by this
 * hook itself.  Token exchange is handled inside the adapters.
 */

import { useState, useCallback, useEffect } from 'react';
import type { IntegrationId, IntegrationStatus, IntegrationMeta, IntegrationConnection } from '../types';
import { ADAPTERS, INTEGRATION_META } from '../services/integrations';

/**
 * Adapters that support Personal Access Token (PAT) authentication as an
 * alternative to the OAuth popup flow must implement this interface and set
 * `supportsPAT = true` on the BaseAdapter.
 */
interface PATSupportingAdapter {
    connectWithPAT(pat: string): Promise<IntegrationConnection>;
}

/** Metadata + live runtime status. */
export interface EnrichedIntegration extends IntegrationMeta {
    status: IntegrationStatus;
    /** Display name of the connected account, if available. */
    accountName?: string;
    /** Whether this integration supports PAT-based connection. */
    supportsPAT: boolean;
}

function readAllStatuses(): Record<IntegrationId, IntegrationStatus> {
    const result = {} as Record<IntegrationId, IntegrationStatus>;
    for (const id of Object.keys(ADAPTERS) as IntegrationId[]) {
        const conn = ADAPTERS[id].loadConnection();
        result[id] = conn ? 'connected' : 'disconnected';
    }
    return result;
}

function readAccountName(id: IntegrationId): string | undefined {
    return ADAPTERS[id].loadConnection()?.accountName;
}

/** The local redirect URI that the OAuth provider will redirect back to. */
function buildRedirectUri(integrationId: IntegrationId): string {
    // In a Tauri app the redirect URI is a custom scheme (e.g. usermap://oauth/github).
    // In a browser-based dev build we use the current origin + a dedicated callback path.
    return `${window.location.origin}/oauth/callback/${integrationId}`;
}

export function useIntegrations() {
    const [statuses, setStatuses] = useState<Record<IntegrationId, IntegrationStatus>>(readAllStatuses);
    const [accountNames, setAccountNames] = useState<Partial<Record<IntegrationId, string>>>(() => {
        const names: Partial<Record<IntegrationId, string>> = {};
        for (const id of Object.keys(ADAPTERS) as IntegrationId[]) {
            const name = readAccountName(id);
            if (name) names[id] = name;
        }
        return names;
    });

    // Re-read from localStorage whenever the hook mounts (handles page refresh).
    useEffect(() => {
        setStatuses(readAllStatuses());
        const names: Partial<Record<IntegrationId, string>> = {};
        for (const id of Object.keys(ADAPTERS) as IntegrationId[]) {
            const name = readAccountName(id);
            if (name) names[id] = name;
        }
        setAccountNames(names);
    }, []);

    const setStatus = useCallback((id: IntegrationId, status: IntegrationStatus) => {
        setStatuses((prev) => ({ ...prev, [id]: status }));
    }, []);

    /**
     * Initiate the OAuth popup flow for a given integration.
     * Returns the connected account name on success.
     */
    const connect = useCallback(async (id: IntegrationId): Promise<string | undefined> => {
        const adapter = ADAPTERS[id];
        if (!adapter) throw new Error(`Unknown integration: ${id}`);

        setStatus(id, 'connecting');

        try {
            const redirectUri = buildRedirectUri(id);
            const code = await adapter.openOAuthPopup(redirectUri);
            const connection = await adapter.exchangeCode(code, redirectUri);

            setStatus(id, 'connected');
            setAccountNames((prev) => ({
                ...prev,
                [id]: connection.accountName
            }));
            return connection.accountName;
        } catch (err) {
            setStatus(id, 'error');
            throw err;
        }
    }, [setStatus]);

    /**
     * PAT-based connection shortcut (supported by adapters where `supportsPAT === true`).
     * Returns the connected account name on success.
     */
    const connectWithPAT = useCallback(async (id: IntegrationId, pat: string): Promise<string | undefined> => {
        const adapter = ADAPTERS[id];
        if (!adapter) throw new Error(`Unknown integration: ${id}`);
        if (!adapter.supportsPAT) throw new Error(`PAT connection is not supported for ${id}.`);

        setStatus(id, 'connecting');
        try {
            // BaseAdapter subclasses that set supportsPAT = true implement connectWithPAT.
            const patAdapter = adapter as unknown as PATSupportingAdapter;
            const connection = await patAdapter.connectWithPAT(pat);
            setStatus(id, 'connected');
            setAccountNames((prev) => ({ ...prev, [id]: connection.accountName }));
            return connection.accountName;
        } catch (err) {
            setStatus(id, 'error');
            throw err;
        }
    }, [setStatus]);

    /** Disconnect and clear the stored token for an integration. */
    const disconnect = useCallback((id: IntegrationId) => {
        ADAPTERS[id]?.clearConnection();
        setStatus(id, 'disconnected');
        setAccountNames((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, [setStatus]);

    const getStatus = useCallback((id: IntegrationId): IntegrationStatus => {
        return statuses[id] || 'disconnected';
    }, [statuses]);

    const integrations: EnrichedIntegration[] = INTEGRATION_META.map((meta) => ({
        ...meta,
        status: statuses[meta.id] || 'disconnected',
        accountName: accountNames[meta.id],
        supportsPAT: ADAPTERS[meta.id]?.supportsPAT ?? false
    }));

    return { integrations, connect, connectWithPAT, disconnect, getStatus };
}
