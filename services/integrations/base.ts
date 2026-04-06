/**
 * BaseAdapter — abstract contract every integration adapter must satisfy.
 *
 * To add a new tool integration:
 *  1. Create a new file `services/integrations/<tool>.ts`.
 *  2. Export a class that extends `BaseAdapter`.
 *  3. Implement `buildOAuthUrl`, `exchangeCode`, and `fetchContext`.
 *  4. Register the instance in `services/integrations/index.ts`.
 *
 * All token exchange / API calls happen inside the browser against the tool's
 * public API — no UserMap backend involved. Tokens are persisted in
 * localStorage under the key `usermap_integration_<id>`.
 */

import type { IntegrationId, IntegrationConnection, ToolContextItem } from '../../types';

/** How often (ms) to poll localStorage for the OAuth callback result. */
const POPUP_POLL_INTERVAL_MS = 400;
/** Maximum time (ms) to wait for the OAuth popup before timing out (5 minutes). */
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export abstract class BaseAdapter {
    /** Unique identifier matching IntegrationId. */
    abstract readonly id: IntegrationId;

    /**
     * Whether this adapter supports connecting via a Personal Access Token
     * as an alternative to the OAuth popup flow.  Defaults to false.
     * Override and return true in adapters that implement `connectWithPAT`.
     */
    readonly supportsPAT: boolean = false;

    /**
     * Build the OAuth authorization URL to open in a popup.
     * @param redirectUri  The local redirect URI registered with the OAuth app.
     */
    abstract buildOAuthUrl(redirectUri: string): string;

    /**
     * Exchange the authorization code (received via redirect) for an access
     * token. Return the connection record to persist.
     *
     * @param code         OAuth authorization code from the callback URL.
     * @param redirectUri  Must match the URI used in buildOAuthUrl.
     */
    abstract exchangeCode(code: string, redirectUri: string): Promise<IntegrationConnection>;

    /**
     * Fetch recent context items from the tool using the stored connection.
     * Results are used by the unified context-query layer.
     *
     * @param connection  The stored connection (contains access token).
     * @param query       Optional free-text search query to filter results.
     * @param limit       Maximum number of items to return.
     */
    abstract fetchContext(
        connection: IntegrationConnection,
        query: string,
        limit: number
    ): Promise<ToolContextItem[]>;

    // -------------------------------------------------------------------------
    // Shared helpers (available to all adapters)
    // -------------------------------------------------------------------------

    /** Storage key for persisting the connection in localStorage. */
    protected get storageKey(): string {
        return `usermap_integration_${this.id}`;
    }

    /** Read persisted connection from localStorage. Returns null if not found. */
    loadConnection(): IntegrationConnection | null {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? (JSON.parse(raw) as IntegrationConnection) : null;
        } catch {
            return null;
        }
    }

    /** Persist a connection to localStorage. */
    saveConnection(connection: IntegrationConnection): void {
        localStorage.setItem(this.storageKey, JSON.stringify(connection));
    }

    /** Remove a persisted connection from localStorage. */
    clearConnection(): void {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Open the OAuth popup and resolve with the authorization code once the
     * provider redirects back to the local redirect URI.
     *
     * The popup broadcasts the code via localStorage so the opener can pick it
     * up without a server-side callback handler.
     *
     * @param redirectUri  Must be the page that calls `handleOAuthCallback`.
     */
    openOAuthPopup(redirectUri: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = this.buildOAuthUrl(redirectUri);
            const width = 600;
            const height = 700;
            const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
            const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

            const popup = window.open(
                url,
                `usermap_oauth_${this.id}`,
                `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,status=0`
            );

            if (!popup) {
                reject(new Error('Popup blocked. Please allow popups for this site.'));
                return;
            }

            const pendingKey = `usermap_oauth_pending_${this.id}`;
            localStorage.removeItem(pendingKey);

            let settled = false;

            const settle = (fn: () => void) => {
                if (settled) return;
                settled = true;
                window.clearInterval(interval);
                window.clearTimeout(timeout);
                fn();
            };

            // Poll localStorage for the callback result (set by the redirect page).
            const interval = window.setInterval(() => {
                try {
                    if (popup.closed) {
                        settle(() => {
                            const stored = localStorage.getItem(pendingKey);
                            if (stored) {
                                const { code, error } = JSON.parse(stored) as { code?: string; error?: string };
                                localStorage.removeItem(pendingKey);
                                if (code) {
                                    resolve(code);
                                } else {
                                    reject(new Error(error || 'OAuth cancelled.'));
                                }
                            } else {
                                reject(new Error('OAuth popup closed without completing.'));
                            }
                        });
                    }
                } catch {
                    // Cross-origin access errors — ignore until popup closes.
                }
            }, POPUP_POLL_INTERVAL_MS);

            // Safety timeout.
            const timeout = window.setTimeout(() => {
                settle(() => {
                    if (!popup.closed) popup.close();
                    reject(new Error('OAuth timed out. Please try again.'));
                });
            }, OAUTH_TIMEOUT_MS);
        });
    }
}

/**
 * Call this inside the OAuth redirect page (or index.html) to broadcast the
 * authorization code/error back to the opener via localStorage.
 *
 * Usage: import and call once on the redirect page, e.g.:
 *   handleOAuthCallback('github');
 */
export function handleOAuthCallback(integrationId: IntegrationId): void {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const pendingKey = `usermap_oauth_pending_${integrationId}`;

    localStorage.setItem(
        pendingKey,
        JSON.stringify(code ? { code } : { error: error || 'unknown_error' })
    );

    // Close the popup after a brief delay so the opener can read localStorage.
    window.setTimeout(() => window.close(), 300);
}
