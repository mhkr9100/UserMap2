/**
 * ChatGPTAdapter — connects UserMap to OpenAI's ChatGPT via an API key.
 *
 * Setup (one-click):
 *  1. Obtain an OpenAI API key at https://platform.openai.com/api-keys
 *  2. Paste the key in the AI Assistants section of the Integrations panel.
 *
 * Privacy: The API key and all messages are sent directly from the browser to
 * the OpenAI API.  No data passes through UserMap servers.
 *
 * CORS note: The OpenAI API allows cross-origin requests with an API key.
 * In production (Tauri desktop app) this works without any proxy.
 */

import { BaseAdapter } from './base';
import type {
    IntegrationId,
    IntegrationConnection,
    ToolContextItem,
    ChatMessage,
    AIChatResponse
} from '../../types';

/** OpenAI model to use for chat completions. */
const DEFAULT_MODEL = 'gpt-4o-mini';
/** Max tokens for the completion response. */
const MAX_TOKENS = 1024;

interface OpenAIChatResponse {
    id?: string;
    choices?: Array<{
        message?: { content?: string };
    }>;
    model?: string;
    error?: { message?: string };
}

export class ChatGPTAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'chatgpt';
    override readonly supportsApiKey: boolean = true;
    override readonly isAIAssistant: boolean = true;

    buildOAuthUrl(_redirectUri: string): string {
        throw new Error('ChatGPT does not use OAuth. Use connectWithApiKey instead.');
    }

    async exchangeCode(_code: string, _redirectUri: string): Promise<IntegrationConnection> {
        throw new Error('ChatGPT does not use OAuth authorization codes.');
    }

    override async connectWithApiKey(apiKey: string): Promise<IntegrationConnection> {
        // Validate the key by making a minimal models list request.
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!res.ok) {
            let msg = `OpenAI API error (${res.status}).`;
            try {
                const data = await res.json();
                if (data?.error?.message) msg = data.error.message;
            } catch { /* ignore */ }
            throw new Error(msg);
        }
        const connection: IntegrationConnection = {
            id: 'chatgpt',
            accessToken: apiKey,
            connectedAt: new Date().toISOString(),
            accountName: 'ChatGPT (OpenAI)'
        };
        this.saveConnection(connection);
        return connection;
    }

    async fetchContext(
        _connection: IntegrationConnection,
        _query: string,
        _limit: number
    ): Promise<ToolContextItem[]> {
        // AI assistants don't pull data into UserMap; they receive context from it.
        return [];
    }

    override async sendMessage(
        messages: ChatMessage[],
        contextItems: ToolContextItem[]
    ): Promise<AIChatResponse> {
        const connection = this.loadConnection();
        if (!connection) throw new Error('ChatGPT is not connected. Please add your API key.');

        const systemMessage = buildSystemPrompt(contextItems);

        const payload = {
            model: DEFAULT_MODEL,
            max_tokens: MAX_TOKENS,
            messages: [
                { role: 'system', content: systemMessage },
                ...messages.map((m) => ({ role: m.role, content: m.content }))
            ]
        };

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${connection.accessToken}`
            },
            body: JSON.stringify(payload)
        });

        const data: OpenAIChatResponse = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error?.message || `OpenAI API error (${res.status}).`);
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        return { text, model: data.model ?? DEFAULT_MODEL };
    }
}

/**
 * Build a system prompt that injects UserMap context items so the AI
 * always has the user's current knowledge graph without any copy/paste.
 */
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

export const chatgptAdapter = new ChatGPTAdapter();
