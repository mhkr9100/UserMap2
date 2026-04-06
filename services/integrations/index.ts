/**
 * Integrations registry — central export point for all tool adapters.
 *
 * Adding a new integration:
 *  1. Create `services/integrations/<tool>.ts` extending BaseAdapter.
 *  2. Import the singleton instance below and add it to `ADAPTERS`.
 *  3. Add the IntegrationMeta entry to `INTEGRATION_META`.
 *  4. Add the required env vars to `.env.example`.
 *  5. Done — the UI picks it up automatically.
 */

import type { IntegrationId, IntegrationMeta } from '../../types';
import { BaseAdapter } from './base';
import { slackAdapter } from './slack';
import { githubAdapter } from './github';
import { gmailAdapter } from './gmail';

export { BaseAdapter } from './base';
export { handleOAuthCallback } from './base';
export { slackAdapter } from './slack';
export { githubAdapter } from './github';
export { gmailAdapter } from './gmail';

/** All registered adapters, keyed by integration ID. */
export const ADAPTERS: Record<IntegrationId, BaseAdapter> = {
    slack: slackAdapter,
    github: githubAdapter,
    gmail: gmailAdapter
};

/** Display metadata for every supported integration. */
export const INTEGRATION_META: IntegrationMeta[] = [
    {
        id: 'slack',
        label: 'Slack',
        description: 'Pull messages and threads from your Slack workspace.',
        logoUrl: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png'
    },
    {
        id: 'github',
        label: 'GitHub',
        description: 'Sync commits, pull requests, and issues from GitHub.',
        logoUrl: 'https://github.githubassets.com/favicons/favicon.svg'
    },
    {
        id: 'gmail',
        label: 'Gmail',
        description: 'Import emails from your Gmail inbox for context retrieval.',
        logoUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico'
    }
];

/** Look up an adapter by ID. Throws if the ID is not registered. */
export function getAdapter(id: IntegrationId): BaseAdapter {
    const adapter = ADAPTERS[id];
    if (!adapter) throw new Error(`No adapter registered for integration "${id}".`);
    return adapter;
}
