/**
 * GmailAdapter — connects UserMap to Gmail via Google OAuth 2.0.
 *
 * Required env vars:
 *   VITE_GOOGLE_CLIENT_ID      — from your Google Cloud OAuth 2.0 credentials
 *   VITE_GOOGLE_CLIENT_SECRET  — from your Google Cloud OAuth 2.0 credentials
 *
 * OAuth scopes requested:
 *   https://www.googleapis.com/auth/gmail.readonly
 *   https://www.googleapis.com/auth/userinfo.email
 *
 * The Gmail REST API is called directly from the browser using the user's
 * access token.  No data is sent to any UserMap backend.
 *
 * Token exchange notes:
 *   Google does not support PKCE for standard OAuth 2.0 web flow without a
 *   redirect URI on a server.  This adapter delegates the code → token exchange
 *   to a local proxy at POST /api/integrations/gmail/token.  When running as a
 *   Tauri desktop app the proxy can be a Tauri command.
 *
 * The access token expires in 1 hour; the refresh token is persisted so future
 *   sessions can silently refresh.  Refresh logic is wired into fetchContext.
 */

import { BaseAdapter } from './base';
import type { IntegrationId, IntegrationConnection, ToolContextItem } from '../../types';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined;

/** Maximum characters to include from an email body. */
const MAX_EMAIL_BODY_LENGTH = 500;

/** Gmail read-only + basic profile scopes. */
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

interface GoogleTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

interface GmailProfile {
    emailAddress?: string;
}

interface GmailMessageListResponse {
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
}

interface GmailMessagePart {
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
}

interface GmailMessage {
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: {
        headers?: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: GmailMessagePart[];
    };
}

function base64UrlDecode(encoded: string): string {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
    } catch {
        return atob(base64);
    }
}

function extractPlainText(part: GmailMessagePart): string {
    if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64UrlDecode(part.body.data);
    }
    if (part.parts) {
        for (const child of part.parts) {
            const text = extractPlainText(child);
            if (text) return text;
        }
    }
    return '';
}

export class GmailAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'gmail';

    buildOAuthUrl(redirectUri: string): string {
        if (!CLIENT_ID) {
            throw new Error('VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file.');
        }
        const state = crypto.randomUUID();
        sessionStorage.setItem('usermap_gmail_oauth_state', state);

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: SCOPES,
            access_type: 'offline',  // request refresh token
            prompt: 'consent',       // always show consent so refresh token is issued
            state
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async exchangeCode(code: string, redirectUri: string): Promise<IntegrationConnection> {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error('VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET must both be set.');
        }

        // Delegate to local proxy — see class-level doc comment.
        const response = await fetch('/api/integrations/gmail/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: redirectUri })
        });

        if (!response.ok) {
            const data: GoogleTokenResponse = await response.json().catch(() => ({}));
            throw new Error(
                data.error_description || data.error || `Gmail token exchange failed (${response.status}).`
            );
        }

        const data: GoogleTokenResponse = await response.json();
        if (!data.access_token) {
            throw new Error(data.error_description || data.error || 'Google did not return an access token.');
        }

        // Resolve the authenticated user's email.
        const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });
        const profile: GmailProfile = profileRes.ok ? await profileRes.json() : {};

        const connection: IntegrationConnection = {
            id: 'gmail',
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            connectedAt: new Date().toISOString(),
            accountName: profile.emailAddress
        };
        this.saveConnection(connection);
        return connection;
    }

    /** Attempt to refresh the access token using the stored refresh token. */
    private async refreshAccessToken(connection: IntegrationConnection): Promise<string> {
        if (!connection.refreshToken) {
            throw new Error('No refresh token available. Please reconnect Gmail.');
        }

        const response = await fetch('/api/integrations/gmail/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: connection.refreshToken })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh Gmail access token. Please reconnect.');
        }

        const data: GoogleTokenResponse = await response.json();
        if (!data.access_token) {
            throw new Error('Gmail token refresh did not return a new access token.');
        }

        const updated: IntegrationConnection = { ...connection, accessToken: data.access_token };
        this.saveConnection(updated);
        return data.access_token;
    }

    async fetchContext(
        connection: IntegrationConnection,
        query: string,
        limit: number
    ): Promise<ToolContextItem[]> {
        const items: ToolContextItem[] = [];
        let token = connection.accessToken;

        const authFetch = async (url: string): Promise<Response> => {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.status === 401 && connection.refreshToken) {
                token = await this.refreshAccessToken(connection);
                return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            }
            return res;
        };

        // Build a Gmail search query.
        const searchQuery = query
            ? encodeURIComponent(query)
            : encodeURIComponent('in:inbox newer_than:7d');

        const listRes = await authFetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${searchQuery}`
        );
        if (!listRes.ok) return items;

        const listData: GmailMessageListResponse = await listRes.json();
        if (!listData.messages) return items;

        for (const { id } of listData.messages) {
            const msgRes = await authFetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
            );
            if (!msgRes.ok) continue;

            const msg: GmailMessage = await msgRes.json();
            const headers = msg.payload?.headers || [];

            const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
            const from = headers.find((h) => h.name === 'From')?.value || '';
            const date = msg.internalDate
                ? new Date(Number(msg.internalDate)).toISOString()
                : undefined;

            // Prefer plain-text body, fall back to snippet.
            let body = '';
            if (msg.payload) {
                body = extractPlainText(msg.payload as GmailMessagePart);
            }
            if (!body && msg.snippet) body = msg.snippet;
            body = body.slice(0, MAX_EMAIL_BODY_LENGTH);

            items.push({
                source: 'gmail',
                title: subject,
                text: body || subject,
                date,
                meta: { from, subject }
            });

            if (items.length >= limit) break;
        }

        return items;
    }
}

export const gmailAdapter = new GmailAdapter();
