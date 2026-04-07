import type { PageNode } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function apiRequest<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText, message: '' }));
        const error = errorData.error || `Request failed: ${response.status}`;
        const detail = errorData.message ? ` — ${errorData.message}` : '';
        throw new Error(`${error}${detail}`);
    }

    return response.json() as Promise<T>;
}

export interface ConsolidateUserMapRequest {
    memories: string[];
    existingTree?: PageNode;
}

export interface ExtractMemoryRequest {
    messages: Array<{ role: string; content: string }>;
}

export async function consolidateUserMap(params: ConsolidateUserMapRequest): Promise<PageNode> {
    if (!API_BASE) {
        throw new Error('No API configured. Set VITE_API_BASE_URL to enable consolidation.');
    }
    try {
        return await apiRequest<PageNode>('POST', '/api/v2/usermap/consolidate', {
            memories: params.memories,
            existingTree: params.existingTree || null
        });
    } catch (error: any) {
        console.error('API: consolidateUserMap failed:', error.message);
        throw error;
    }
}

export async function extractMemory(params: ExtractMemoryRequest): Promise<{ facts: string[] }> {
    if (!API_BASE) {
        return { facts: [] };
    }
    try {
        return await apiRequest<{ facts: string[] }>('POST', '/api/v2/memory/extract', {
            messages: params.messages
        });
    } catch (error: any) {
        console.error('API: extractMemory failed:', error.message);
        throw error;
    }
}
