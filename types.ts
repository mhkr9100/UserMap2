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
  visibility?: 'public' | 'private';
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

// ---------------------------------------------------------------------------
// Phase 5 Final: Logs
// ---------------------------------------------------------------------------

export type LogActor = 'system' | 'user' | 'prism';
export type LogSeverity = 'info' | 'warn' | 'error';

export type LogEventType =
  | 'connector.pull.success'
  | 'connector.pull.error'
  | 'connector.sync.triggered'
  | 'connector.disconnected'
  | 'prism.classify'
  | 'prism.structure'
  | 'prism.feedback.learned'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'push.webhook.sent'
  | 'push.webhook.failed'
  | string;

export interface LogEvent {
  id: number;
  event_type: LogEventType;
  source_tool?: string;
  actor: LogActor;
  object_ref?: string;
  summary?: string;
  before_state?: string;
  after_state?: string;
  severity: LogSeverity;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 5 Final: Connectors
// ---------------------------------------------------------------------------

export type ConnectorDirection = 'pull' | 'push' | 'ai';

export interface ConnectorConfig {
  id: number;
  name: string;
  direction: ConnectorDirection;
  connector_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  frequency_sec: number;
  last_run?: string;
  last_status?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Custom APIs & Webhooks (Fix Pack A)
// ---------------------------------------------------------------------------

export interface CustomApi {
  id?: number;
  name: string;
  direction: 'pull' | 'push';
  url: string;
  method: string;
  headers?: Record<string, string>;
  body_template?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Import Jobs (Fix Pack A)
// ---------------------------------------------------------------------------

export interface ImportJob {
  id: number;
  filename: string;
  mimetype: string;
  size_bytes: number;
  notes: string;
  status: 'received' | 'parsing' | 'classifying' | 'indexed' | 'error';
  document_ids: number[];
  error_msg?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 5 Final: MindMap node position metadata
// ---------------------------------------------------------------------------

export interface MindMapNodeMeta {
  x?: number;
  y?: number;
  collapsed?: boolean;
}
