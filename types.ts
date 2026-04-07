export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export type UserMapNodeType = 'root' | 'category' | 'cluster' | 'fact';
export type UserMapImportance = 'high' | 'medium' | 'low';

export interface PageNode {
  id: string;
  label: string;
  value?: string;
  source?: string;
  sourceDate?: string;
  nodeType?: UserMapNodeType;
  importance?: UserMapImportance;
  confidence?: number;
  children: PageNode[];
}

// ---------------------------------------------------------------------------
// Integrations (Phase 2-4)
// ---------------------------------------------------------------------------

/** Canonical tool identifiers supported by UserMap. */
export type IntegrationId = 'slack' | 'github' | 'gmail' | 'chatgpt' | 'claude' | 'gemini' | 'ollama';

/** Broad category an integration belongs to. */
export type IntegrationCategory = 'data-source' | 'ai-assistant';

/** Runtime status of a single integration. */
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Persisted connection record stored in localStorage. */
export interface IntegrationConnection {
  /** The tool identifier. */
  id: IntegrationId;
  /** OAuth access token (stored only in the browser's localStorage, never sent to a server). */
  accessToken: string;
  /** Optional refresh token. */
  refreshToken?: string;
  /** ISO timestamp of when the token was obtained. */
  connectedAt: string;
  /** Display name or handle of the connected account (e.g. GitHub username). */
  accountName?: string;
}

/** Metadata for displaying a tool in the Integrations panel. */
export interface IntegrationMeta {
  id: IntegrationId;
  label: string;
  description: string;
  /** URL of the tool's logo / icon asset. */
  logoUrl: string;
  /** Broad category: data source or AI assistant. */
  category: IntegrationCategory;
}

/** A single unit of context retrieved from a connected tool. */
export interface ToolContextItem {
  /** Which tool this came from. */
  source: IntegrationId;
  /** Short human-readable title (e.g. channel name, repo, email subject). */
  title: string;
  /** The actual content text. */
  text: string;
  /** ISO date string of when this item was created/updated in the source tool. */
  date?: string;
  /** Additional tool-specific metadata (e.g. URL, author). */
  meta?: Record<string, string>;
}

/** Response shape returned by the unified context query. */
export interface ContextQueryResponse {
  query: string;
  results: ToolContextItem[];
}

// ---------------------------------------------------------------------------
// AI Chat (Phase 4)
// ---------------------------------------------------------------------------

/** A single message in an AI chat conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Response from an AI adapter's sendMessage call. */
export interface AIChatResponse {
  text: string;
  /** Model name returned by the provider (if available). */
  model?: string;
}
