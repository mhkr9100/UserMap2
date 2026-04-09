import { BaseAdapter } from './integrations/base';
import type { ChatMessage, PageNode } from '../types';

export type PrismTool = 'search_map' | 'read_private' | 'create_fact' | 'check_system_status' | 'read_logs';

export interface PrismAgentCallbacks {
    onSearchMap: (query: string) => Promise<string>;
    onReadPrivate: (nodeId: string, context: string) => Promise<{ allowed: boolean, data?: string }>;
    onCreateFact: (label: string, value: string) => Promise<boolean>;
    onCheckSystemStatus: () => Promise<string>;
    onReadLogs: (limit?: number) => Promise<string>;
    onAgentThought: (thought: string) => void;
}

/**
 * Prism 2.0 — Systems Guardian and Context Architect
 *
 * Hard constraints (zero-mock, provenance, privacy, canonical DB):
 *  1. Never fabricate events, entities, metrics, or connector states.
 *  2. If data is missing or a query returns nothing, state that explicitly.
 *  3. Canonical DB records are authoritative; vector retrieval is for semantic relevance only.
 *  4. Every assertion must trace to source event IDs or DB records where available.
 *  5. User corrections (CRUD) are authoritative and must update future classification behavior.
 *  6. On restart, resume from the last persisted checkpoint — no reprocessing, no data loss.
 *  7. Return real backend/model errors; never mask failures with placeholder text.
 *  8. Protect private memory nodes — never access or reveal without explicit user confirmation.
 */
const SYSTEM_PROMPT = `You are Prism, the AI Context Engineer and Systems Guardian for the UserMap Data Management Platform. Your mission is to maintain a synchronized, actionable model of the user's digital life while ensuring the health of the platform itself.

## Core Directives

### Context Engineering
Actively process incoming data streams from connected sources (Social, Workspaces, Devices). Analyze and structure data into meaningful nodes (Facts, Contacts, Projects, Interests). If data is redundant, merge it. If conflicting, flag it for the user. Never fabricate data — if a source is empty, say so.

### Predictive Querying
Answer questions using the Knowledge Graph. Analyze trends, not just text matches. Example: "Based on your GitHub activity, your focus has shifted from React to Rust in the last 3 months." Always cite the source and time range when making assertions.

### Systems Guardianship
You are aware of the platform's state. Monitor connectors and local API health. If a connector fails or an API returns an error, proactively help the user troubleshoot. Example: "I noticed the Slack connector lost authorization — should I open the settings?"

### Privacy Gatekeeping
Protect private memory nodes. Never access or reveal sensitive context without explicit reasoning and user confirmation via the read_private tool.

## Tool Usage (ReAct)
You MUST use JSON blocks for tool calls. Output exactly one JSON block per tool call, then wait for [TOOL_RESPONSE] before continuing.

\`\`\`json
{"tool": "search_map", "query": "my career"}
\`\`\`
\`\`\`json
{"tool": "create_fact", "label": "Label", "value": "value"}
\`\`\`
\`\`\`json
{"tool": "read_private", "nodeId": "node-id", "reasoning": "User asked about this private node."}
\`\`\`
\`\`\`json
{"tool": "check_system_status"}
\`\`\`
\`\`\`json
{"tool": "read_logs", "limit": 10}
\`\`\`

## Behavior Constraints
- Be concise and precise. Avoid filler text.
- If confidence is low due to sparse data, say so and suggest syncing a connector.
- If an API call fails, report the real error — never substitute a placeholder response.
- For "last 12h summary", synthesize directly from real log and event data in that window.
- Do not put business logic or orchestration decisions in the response — surface data and let the user decide.`;

/**
 * Runs a single ReAct-style loop iteration for Prism.
 * If the model outputs a tool call, it executes it and appends the result to messages,
 * continuing until the model gives a final text response.
 */

/**
 * Runs a single ReAct-style loop iteration for Prism.
 * If the model outputs a tool call, it executes it and appends the result to messages,
 * continuing until the model gives a final text response.
 */
export async function runPrismTurn(
    adapter: BaseAdapter,
    messages: ChatMessage[],
    callbacks: PrismAgentCallbacks
): Promise<ChatMessage[]> {
    const maxLoops = 6;
    const currentMessages = [...messages];

    // Ensure system prompt is set correctly
    if (currentMessages[0]?.role !== 'system') {
        currentMessages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    } else {
        // Always refresh system prompt to latest version
        currentMessages[0] = { role: 'system', content: SYSTEM_PROMPT };
    }

    for (let i = 0; i < maxLoops; i++) {
        callbacks.onAgentThought('Analyzing context…');
        const response = await adapter.sendMessage(currentMessages, []);

        const text = response.text || '';
        // Match the first JSON tool-call block - greedy inner match to handle nested objects
        const match = text.match(/```json\s*(\{[\s\S]*\})\s*```/);

        currentMessages.push({ role: 'assistant', content: text });

        if (!match) {
            // No tool call — final response
            return currentMessages;
        }

        let toolResponse = '';
        try {
            const parsed = JSON.parse(match[1]);
            callbacks.onAgentThought(`Tool: ${parsed.tool}`);

            if (parsed.tool === 'search_map') {
                toolResponse = await callbacks.onSearchMap(parsed.query || '');
            } else if (parsed.tool === 'read_private') {
                const result = await callbacks.onReadPrivate(parsed.nodeId || '', parsed.reasoning || '');
                toolResponse = result.allowed
                    ? `ACCESS GRANTED: ${result.data}`
                    : `ACCESS DENIED by user. Inform the user you cannot answer.`;
            } else if (parsed.tool === 'create_fact') {
                const ok = await callbacks.onCreateFact(parsed.label || '', parsed.value || '');
                toolResponse = ok ? 'Fact created successfully.' : 'Failed to create fact.';
            } else if (parsed.tool === 'check_system_status') {
                toolResponse = await callbacks.onCheckSystemStatus();
            } else if (parsed.tool === 'read_logs') {
                toolResponse = await callbacks.onReadLogs(parsed.limit ?? 10);
            } else {
                toolResponse = `ERROR: Unknown tool "${parsed.tool}"`;
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toolResponse = `TOOL_ERROR: Failed to parse or execute tool call: ${msg}`;
        }

        currentMessages.push({ role: 'system', content: `[TOOL_RESPONSE]: ${toolResponse}` });
    }

    return currentMessages;
}
