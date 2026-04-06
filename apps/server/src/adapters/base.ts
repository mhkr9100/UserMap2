export interface ConnectionRecord {
  id: number;
  tool: string;
  account_id: string;
  scopes: string;
  access_token: string;
  token_type: string;
  connected_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: number;
  tool: string;
  doc_id: string;
  content: string;
  metadata: string;
  created_at: string;
}

export interface ContextResult {
  source: string;
  doc_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export abstract class BaseAdapter {
  abstract readonly toolName: string;

  abstract getOAuthUrl(state: string): string;

  abstract exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    scope: string;
    authed_user?: { id: string };
    team?: { id: string; name: string };
    bot_user_id?: string;
  }>;

  abstract getAccountId(tokenData: {
    access_token: string;
    authed_user?: { id: string };
    team?: { id: string };
  }): string;
}
