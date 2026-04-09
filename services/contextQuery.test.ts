import { describe, it, expect, vi } from 'vitest';
import { queryContext } from './contextQuery';
import type { IntegrationId } from '../types';

describe('queryContext', () => {
    it('should handle adapter failure gracefully and return results from other adapters', async () => {
        const mockSuccessAdapter = {
            isAIAssistant: false,
            loadConnection: vi.fn().mockReturnValue({ id: 'slack' }),
            fetchContext: vi.fn().mockResolvedValue([{ source: 'slack', text: 'Slack Data', date: new Date().toISOString() }]),
        };

        const mockFailureAdapter = {
            isAIAssistant: false,
            loadConnection: vi.fn().mockReturnValue({ id: 'github' }),
            fetchContext: vi.fn().mockRejectedValue(new Error('GitHub adapter failed')),
        };

        const mockAdapters: any = {
            slack: mockSuccessAdapter,
            github: mockFailureAdapter,
        };

        const options = {
            query: 'test',
            sources: ['slack' as IntegrationId, 'github' as IntegrationId],
        };

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const response = await queryContext(options, mockAdapters);

        expect(response.results).toHaveLength(1);
        expect(response.results[0].source).toBe('slack');
        expect(response.results[0].text).toBe('Slack Data');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('github adapter failed:'), expect.any(Error));

        consoleSpy.mockRestore();
    });
});
