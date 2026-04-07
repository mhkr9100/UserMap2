/**
 * ClaudeAdapter — connects UserMap to Anthropic's Claude via an API key.
 *
 * Setup (one-click):
 *  1. Obtain an Anthropic API key at https://console.anthropic.com/
 *  2. Paste the key in the AI Assistants section of the Integrations panel.
 *
 * Privacy: The API key and all messages are sent directly from the browser to
 * the Anthropic API.  No data passes through UserMap servers.
 *
 * CORS note: Anthropic's API requires the `anthropic-dangerous-direct-browser-access`
 * header to allow browser requests.  In a production Tauri desktop app this header
 * is included and CORS is not an issue.  In a browser dev build you may need to
 * configure a CORS proxy (`VITE_CLAUDE_PROXY_URL` env var).
 */

import { BaseAdapter } from './base';
import type {
    IntegrationId,
    IntegrationConnection,
    ToolContextItem,
    ChatMessage,
    AIChatResponse
} from '../../types';

/** Anthropic model to use for chat messages. */
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';
/** Max tokens for the completion response. */
const MAX_TOKENS = 1024;

/** Optional CORS proxy URL for dev environments where Anthropic blocks direct browser access. */
const PROXY_URL = (import.meta.env.VITE_CLAUDE_PROXY_URL as string | undefined) ?? '';

const ANTHROPIC_API_BASE = PROXY_URL || 'https://api.anthropic.com';

interface AnthropicContent {
    type: string;
    text?: string;
}

interface AnthropicResponse {
    id?: string;
    content?: AnthropicContent[];
    model?: string;
    error?: { message?: string };
}

export class ClaudeAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'claude';
    override readonly supportsApiKey: boolean = true;
    override readonly isAIAssistant: boolean = true;

    buildOAuthUrl(_redirectUri: string): string {
        throw new Error('Claude does not use OAuth. Use connectWithApiKey instead.');
    }

    async exchangeCode(_code: string, _redirectUri: string): Promise<IntegrationConnection> {
        throw new Error('Claude does not use OAuth authorization codes.');
    }

    override async connectWithApiKey(apiKey: string): Promise<IntegrationConnection> {
        // Validate the key by sending a minimal test message.
        const res = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
            method: 'POST',
            headers: buildHeaders(apiKey),
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                max_tokens: 16,
                messages: [{ role: 'user', content: 'hi' }]
            })
        });
        if (!res.ok) {
            let msg = `Anthropic API error (${res.status}).`;
            try {
                const data: AnthropicResponse = await res.json();
                if (data?.error?.message) msg = data.error.message;
            } catch { /* ignore */ }
            throw new Error(msg);
        }
        const connection: IntegrationConnection = {
            id: 'claude',
            accessToken: apiKey,
            connectedAt: new Date().toISOString(),
            accountName: 'Claude (Anthropic)'
        };
        this.saveConnection(connection);
        return connection;
    }

    async fetchContext(
        _connection: IntegrationConnection,
        _query: string,
        _limit: number
    ): Promise<ToolContextItem[]> {
        return [];
    }

    override async sendMessage(
        messages: ChatMessage[],
        contextItems: ToolContextItem[]
    ): Promise<AIChatResponse> {
        const connection = this.loadConnection();
        if (!connection) throw new Error('Claude is not connected. Please add your API key.');

        const systemPrompt = buildSystemPrompt(contextItems);

        const payload = {
            model: DEFAULT_MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: messages
                .filter((m) => m.role !== 'system')
                .map((m) => ({ role: m.role, content: m.content }))
        };

        const res = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
            method: 'POST',
            headers: buildHeaders(connection.accessToken),
            body: JSON.stringify(payload)
        });

        const data: AnthropicResponse = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error?.message || `Anthropic API error (${res.status}).`);
        }

        const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
        return { text, model: data.model ?? DEFAULT_MODEL };
    }
}

function buildHeaders(apiKey: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required for direct browser access (Tauri / dev builds).
        'anthropic-dangerous-direct-browser-access': 'true'
    };
}

function buildSystemPrompt(contextItems: ToolContextItem[]): string {
    const base =
        'You are a helpful AI assistant connected to UserMap — a personal knowledge graph that ' +
        'captures what the user knows, works on, and cares about. ' +
        'Use the context below to give accurate, personalized answers. ' +
        'If the context does not contain relevant information, answer from general knowledge.';

    if (contextItems.length === 0) return base;

    const contextBlock = contextItems
        .slice(0, 20)
        .map((item, i) => {
            const date = item.date ? ` (${new Date(item.date).toLocaleDateString()})` : '';
            return `[${i + 1}] ${item.source.toUpperCase()} — ${item.title}${date}\n${item.text}`;
        })
        .join('\n\n');

    return `${base}\n\n--- UserMap Context ---\n${contextBlock}\n--- End Context ---`;
}

export const claudeAdapter = new ClaudeAdapter();
