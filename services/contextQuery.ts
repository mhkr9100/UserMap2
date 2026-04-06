/**
 * contextQuery — unified context retrieval across all connected tools.
 *
 * This service is the local equivalent of the `/api/context` endpoint described
 * in the Phase 2 architecture.  It runs entirely in the browser / local app:
 *
 *  1. For each connected tool, load the stored IntegrationConnection.
 *  2. Call the adapter's `fetchContext` to retrieve relevant items.
 *  3. Merge and sort results by date (newest first).
 *  4. Return a ContextQueryResponse.
 *
 * External AI tools (ChatGPT plugin, Claude, etc.) can request context by
 * calling the companion local API server (e.g. a Tauri sidecar or lightweight
 * Express process) which in turn invokes this module.  The API contract is:
 *
 *   POST /api/context
 *   { "query": "...", "sources": ["slack","github","gmail"], "limit": 5 }
 *   → ContextQueryResponse
 *
 * See docs/local-api.md for full OpenAPI spec.
 */

import type { IntegrationId, ContextQueryResponse, ToolContextItem } from '../types';
import { ADAPTERS } from './integrations';

export interface ContextQueryOptions {
    /** Free-text search passed to each adapter. */
    query: string;
    /** Which tools to query. Defaults to all connected tools. */
    sources?: IntegrationId[];
    /** Maximum items to return in total (soft cap per source = limit). */
    limit?: number;
}

/** Hard cap on total results returned regardless of source count or limit. */
const MAX_RESULTS = 50;

/**
 * Query context from all connected (or specified) tool adapters.
 *
 * Results from different sources are interleaved chronologically so the caller
 * gets the most recent, most relevant context regardless of origin.
 */
export async function queryContext(options: ContextQueryOptions): Promise<ContextQueryResponse> {
    const { query, sources, limit = 10 } = options;

    // Determine which adapters to query.
    const adapterIds: IntegrationId[] = sources || (Object.keys(ADAPTERS) as IntegrationId[]);

    // Fire all adapter fetches concurrently.
    const fetchPromises = adapterIds.map(async (id): Promise<ToolContextItem[]> => {
        const adapter = ADAPTERS[id];
        if (!adapter) return [];

        const connection = adapter.loadConnection();
        if (!connection) return []; // Tool not connected — skip silently.

        try {
            return await adapter.fetchContext(connection, query, limit);
        } catch (err) {
            // A single adapter failure should not block results from others.
            console.warn(`[contextQuery] ${id} adapter failed:`, err);
            return [];
        }
    });

    const resultArrays = await Promise.all(fetchPromises);

    // Flatten and sort by date descending (newest first).
    // Apply a fixed maximum cap to prevent unexpectedly large payloads when
    // many tools are connected.
    const allItems: ToolContextItem[] = resultArrays
        .flat()
        .sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        })
        .slice(0, MAX_RESULTS);

    return { query, results: allItems };
}
