/**
 * SlackAdapter — connects UserMap to Slack via OAuth.
 *
 * Required env vars:
 *   VITE_SLACK_CLIENT_ID      — from your Slack App settings
 *   VITE_SLACK_CLIENT_SECRET  — from your Slack App settings
 *
 * OAuth scopes requested: channels:history, channels:read, users:read
 *
 * Slack's Web API is called directly from the browser using the user's token.
 * No data is sent to any UserMap backend.
 */

import { BaseAdapter } from './base';
import type { IntegrationId, IntegrationConnection, ToolContextItem } from '../../types';

const CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_SLACK_CLIENT_SECRET as string | undefined;

/** Scopes required to read messages from public channels. */
const SCOPES = 'channels:history,channels:read,users:read';

interface SlackOAuthResponse {
    ok: boolean;
    access_token?: string;
    authed_user?: { id: string };
    team?: { name: string };
    error?: string;
}

interface SlackMessage {
    type: string;
    text?: string;
    ts?: string;
    user?: string;
}

interface SlackHistoryResponse {
    ok: boolean;
    messages?: SlackMessage[];
    error?: string;
}

interface SlackChannelListResponse {
    ok: boolean;
    channels?: Array<{ id: string; name: string }>;
    error?: string;
}

export class SlackAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'slack';
    
    override isConfigured(): boolean {
        return !!CLIENT_ID && !CLIENT_ID.includes('your-');
    }

    buildOAuthUrl(redirectUri: string): string {
        if (!CLIENT_ID) {
            throw new Error('VITE_SLACK_CLIENT_ID is not set. Add it to your .env file.');
        }
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            scope: SCOPES,
            redirect_uri: redirectUri,
            response_type: 'code'
        });
        return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    }

    async exchangeCode(code: string, redirectUri: string): Promise<IntegrationConnection> {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error('VITE_SLACK_CLIENT_ID and VITE_SLACK_CLIENT_SECRET must both be set.');
        }

        // Slack requires the token exchange to be done server-side (or via a
        // proxy) because the client secret must not be exposed to the browser.
        // For a fully local desktop build (e.g. Tauri), you would call a local
        // sidecar here.  For the browser-only build this call is forwarded to a
        // lightweight local proxy at the path below.  A backend proxy (or Tauri
        // sidecar) is required — there is no browser-side fallback for this
        // exchange because the client secret must remain server-side.
        //
        // Expected endpoint: POST /api/integrations/slack/token
        //   Request:  { code: string, redirect_uri: string }
        //   Response: { ok: boolean, access_token?: string, team?: { name: string }, error?: string }
        //
        // See docs/integrations.md for a minimal Express implementation.
        const response = await fetch('/api/integrations/slack/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: redirectUri })
        });

        if (!response.ok) {
            const data: SlackOAuthResponse = await response.json().catch(() => ({ ok: false }));
            throw new Error(data.error || `Slack token exchange failed (${response.status}).`);
        }

        const data: SlackOAuthResponse = await response.json();
        if (!data.ok || !data.access_token) {
            throw new Error(data.error || 'Slack did not return an access token.');
        }

        const connection: IntegrationConnection = {
            id: 'slack',
            accessToken: data.access_token,
            connectedAt: new Date().toISOString(),
            accountName: data.team?.name || data.authed_user?.id
        };
        this.saveConnection(connection);
        return connection;
    }

    async fetchContext(
        connection: IntegrationConnection,
        query: string,
        limit: number
    ): Promise<ToolContextItem[]> {
        const items: ToolContextItem[] = [];

        // 1. List public channels.
        const channelRes = await fetch(
            'https://slack.com/api/conversations.list?limit=10&exclude_archived=true',
            { headers: { Authorization: `Bearer ${connection.accessToken}` } }
        );
        if (!channelRes.ok) return items;

        const channelData: SlackChannelListResponse = await channelRes.json();
        if (!channelData.ok || !channelData.channels) return items;

        const queryLower = query.toLowerCase();

        // 2. Fetch recent messages from each channel.
        const fetchPromises = channelData.channels.slice(0, 5).map(async (channel) => {
            const histRes = await fetch(
                `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel.id)}&limit=20`,
                { headers: { Authorization: `Bearer ${connection.accessToken}` } }
            );
            if (!histRes.ok) return null;

            const histData: SlackHistoryResponse = await histRes.json();
            if (!histData.ok || !histData.messages) return null;

            return { channel, messages: histData.messages };
        });

        const historyResults = await Promise.all(fetchPromises);

        for (const result of historyResults) {
            if (!result) continue;
            for (const msg of result.messages) {
                if (!msg.text || msg.type !== 'message') continue;
                if (query && !msg.text.toLowerCase().includes(queryLower)) continue;

                items.push({
                    source: 'slack',
                    title: `#${result.channel.name}`,
                    text: msg.text,
                    date: msg.ts ? new Date(Number(msg.ts) * 1000).toISOString() : undefined,
                    meta: { channel: result.channel.name, user: msg.user || '' }
                });

                if (items.length >= limit) return items;
            }
        }

        return items;
    }
}

export const slackAdapter = new SlackAdapter();
