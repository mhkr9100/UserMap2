const BASE = '/api';

export interface StatusResponse {
  status: string;
  version: string;
  connections: number;
  timestamp: string;
}

export interface Connection {
  id: number;
  tool: string;
  account_id: string;
  scopes: string;
  token_type: string;
  connected_at: string;
  updated_at: string;
}

export interface ContextResult {
  source: string;
  doc_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ContextResponse {
  query: string;
  results: ContextResult[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      msg = (JSON.parse(body) as { error: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status(): Promise<StatusResponse> {
    return request('/status');
  },

  connections(): Promise<{ connections: Connection[] }> {
    return request('/connections');
  },

  connectSlack(): Promise<{ url: string }> {
    return request('/connect/slack', { method: 'POST' });
  },

  context(query: string, sources?: string[], limit?: number): Promise<ContextResponse> {
    return request('/context', {
      method: 'POST',
      body: JSON.stringify({ query, sources, limit }),
    });
  },
};
