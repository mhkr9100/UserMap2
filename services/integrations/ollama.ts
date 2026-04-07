/**
 * OllamaAdapter — connects UserMap to a locally running Ollama instance.
 *
 * Setup (one-click, no API key required):
 *  1. Install Ollama from https://ollama.com
 *  2. Run `ollama pull llama3.2` (or any other model you prefer).
 *  3. Ensure Ollama is running (`ollama serve` or the Ollama desktop app).
 *  4. Click "Connect" in the AI Assistants section of the Integrations panel.
 *
 * Privacy: All requests go to localhost:11434.  Nothing ever leaves your machine.
 *
 * CORS: Ollama allows CORS from any origin by default.  If you have changed
 * Ollama's configuration, set the `OLLAMA_ORIGINS` env var to include your
 * dev origin (e.g. `http://localhost:3000`).
 */

import { BaseAdapter } from './base';
import type {
    IntegrationId,
    IntegrationConnection,
    ToolContextItem,
    ChatMessage,
    AIChatResponse
} from '../../types';

/** Default Ollama base URL — works when Ollama runs on the same machine. */
const OLLAMA_BASE = (import.meta.env.VITE_OLLAMA_URL as string | undefined) ?? 'http://localhost:11434';

/** Preferred model order; the first available model in this list is used. */
const PREFERRED_MODELS = ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'phi3', 'gemma2', 'qwen2.5'];

interface OllamaTagsResponse {
    models?: Array<{ name: string }>;
}

interface OllamaChatResponse {
    message?: { content?: string };
    model?: string;
    error?: string;
}

export class OllamaAdapter extends BaseAdapter {
    readonly id: IntegrationId = 'ollama';
    override readonly supportsLocalBridge: boolean = true;
    override readonly isAIAssistant: boolean = true;

    buildOAuthUrl(_redirectUri: string): string {
        throw new Error('Ollama does not use OAuth. Click Connect to auto-detect your local Ollama.');
    }

    async exchangeCode(_code: string, _redirectUri: string): Promise<IntegrationConnection> {
        throw new Error('Ollama does not use OAuth authorization codes.');
    }

    /**
     * Ping the local Ollama instance, pick the best available model,
     * and store the connection.  No credentials required.
     */
    override async connectDirect(): Promise<IntegrationConnection> {
        const model = await this.detectBestModel();
        const connection: IntegrationConnection = {
            id: 'ollama',
            // Store the base URL + chosen model in accessToken as JSON.
            accessToken: JSON.stringify({ baseUrl: OLLAMA_BASE, model }),
            connectedAt: new Date().toISOString(),
            accountName: `Ollama · ${model}`
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
        if (!connection) throw new Error('Ollama is not connected. Click Connect to auto-detect.');

        const { baseUrl, model } = JSON.parse(connection.accessToken) as { baseUrl: string; model: string };

        const systemContent = buildSystemPrompt(contextItems);

        const ollamaMessages = [
            { role: 'system', content: systemContent },
            ...messages
                .filter((m) => m.role !== 'system')
                .map((m) => ({ role: m.role, content: m.content }))
        ];

        const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: ollamaMessages, stream: false })
        });

        const data: OllamaChatResponse = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Ollama error (${res.status}). Is Ollama running?`);
        }

        const text = data.message?.content ?? '';
        return { text, model: data.model ?? model };
    }

    // ---------------------------------------------------------------------------
    // Public helper: check if Ollama is reachable and return available models.
    // ---------------------------------------------------------------------------

    /** Returns the list of locally available Ollama models. */
    async listModels(): Promise<string[]> {
        try {
            const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) return [];
            const data: OllamaTagsResponse = await res.json();
            return (data.models ?? []).map((m) => m.name);
        } catch {
            return [];
        }
    }

    /** Returns true if Ollama is running locally and has at least one model. */
    async isAvailable(): Promise<boolean> {
        const models = await this.listModels();
        return models.length > 0;
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private async detectBestModel(): Promise<string> {
        const models = await this.listModels();
        if (models.length === 0) {
            throw new Error(
                'Ollama is not reachable at ' + OLLAMA_BASE +
                '. Make sure Ollama is running and you have at least one model pulled ' +
                '(e.g. `ollama pull llama3.2`).'
            );
        }
        for (const preferred of PREFERRED_MODELS) {
            const match = models.find((m) => m.startsWith(preferred));
            if (match) return match;
        }
        // Fall back to the first available model.
        return models[0];
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

export const ollamaAdapter = new OllamaAdapter();
