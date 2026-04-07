/**
 * GeminiAdapter — connects UserMap to Google Gemini via an API key.
 *
 * Setup (one-click):
 *  1. Obtain a Gemini API key at https://aistudio.google.com/app/apikey
 *  2. Paste the key in the AI Assistants section of the Integrations panel.
 *
 * Privacy: The API key and all messages are sent directly from the browser to
 * Google AI Studio.  No data passes through UserMap servers.
 *
 * CORS note: The Gemini REST API allows browser requests with an API key
 * query parameter, so no proxy is needed.
 */

import { BaseAdapter } from './base';
import type {
    IntegrationId,
    IntegrationConnection,
    ToolContextItem,
    ChatMessage,
    AIChatResponse
} from '../../types';

/** Gemini model to use. */
const DEFAULT_MODEL = 'gemini-2.0-flash';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiContent {
    role?: string;
    parts: Array<{ text: string }>;
}

interface GeminiResponse {
    candidates?: Array<{
        content?: GeminiContent;
    }>;
    modelVersion?: string;
    error?: { message?: string; code?: number };
}

export class GeminiAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'gemini';
    override readonly supportsApiKey: boolean = true;
    override readonly isAIAssistant: boolean = true;

    buildOAuthUrl(_redirectUri: string): string {
        throw new Error('Gemini does not use OAuth. Use connectWithApiKey instead.');
    }

    async exchangeCode(_code: string, _redirectUri: string): Promise<IntegrationConnection> {
        throw new Error('Gemini does not use OAuth authorization codes.');
    }

    override async connectWithApiKey(apiKey: string): Promise<IntegrationConnection> {
        // Validate the key by sending a minimal test message.
        const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'hi' }] }]
            })
        });
        if (!res.ok) {
            let msg = `Gemini API error (${res.status}).`;
            try {
                const data: GeminiResponse = await res.json();
                if (data?.error?.message) msg = data.error.message;
            } catch { /* ignore */ }
            throw new Error(msg);
        }
        const connection: IntegrationConnection = {
            id: 'gemini',
            accessToken: apiKey,
            connectedAt: new Date().toISOString(),
            accountName: 'Gemini (Google)'
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
        if (!connection) throw new Error('Gemini is not connected. Please add your API key.');

        const systemPrompt = buildSystemPrompt(contextItems);

        // Gemini uses a "contents" array; system prompt injected as first user turn.
        const contents: GeminiContent[] = [];

        // Inject system context as the first user/model exchange.
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood. I have your UserMap context loaded and am ready to assist.' }] });

        for (const msg of messages) {
            if (msg.role === 'system') continue;
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }

        const url = `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(connection.accessToken)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data: GeminiResponse = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error?.message || `Gemini API error (${res.status}).`);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return { text, model: data.modelVersion ?? DEFAULT_MODEL };
    }
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

export const geminiAdapter = new GeminiAdapter();
