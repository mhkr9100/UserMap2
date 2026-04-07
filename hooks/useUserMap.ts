import { useState, useCallback, useRef } from 'react';
import { PageNode } from '../types';

const TREE_STORAGE_KEY = 'usermap_tree_v1';
const MEMORIES_STORAGE_KEY = 'usermap_memories_v1';

const EMPTY_TREE: PageNode = {
    id: 'root',
    label: 'UserMap',
    nodeType: 'root',
    children: []
};

function normalizeImportance(value?: string): 'high' | 'medium' | 'low' {
    return value === 'high' || value === 'low' ? value : 'medium';
}

function normalizeTree(node: PageNode, depth = 0): PageNode {
    const children = Array.isArray(node.children)
        ? node.children.map((child) => normalizeTree(child, depth + 1))
        : [];

    const nodeType = node.nodeType
        || (depth === 0
            ? 'root'
            : children.length > 0
                ? (depth === 1 ? 'category' : 'cluster')
                : 'fact');

    return {
        ...node,
        nodeType,
        importance: normalizeImportance(node.importance || (depth <= 1 ? 'high' : 'medium')),
        confidence: typeof node.confidence === 'number' ? node.confidence : (depth === 0 ? 0.99 : undefined),
        children
    };
}

function loadTreeFromStorage(): PageNode {
    try {
        const raw = localStorage.getItem(TREE_STORAGE_KEY);
        if (!raw) return EMPTY_TREE;
        const parsed = JSON.parse(raw) as PageNode;
        if (parsed?.id === 'root') return normalizeTree(parsed);
    } catch {
        // ignore parse errors
    }
    return EMPTY_TREE;
}

function saveTreeToStorage(tree: PageNode): void {
    try {
        localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(tree));
    } catch (err) {
        console.error('[useUserMap] Failed to save tree to localStorage:', err);
    }
}

function loadMemoriesFromStorage(): string[] {
    try {
        const raw = localStorage.getItem(MEMORIES_STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as string[];
    } catch {
        return [];
    }
}

function saveMemoriesToStorage(memories: string[]): void {
    try {
        localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(memories));
    } catch (err) {
        console.error('[useUserMap] Failed to save memories to localStorage:', err);
    }
}

export const useUserMap = () => {
    const [userMapTree, setUserMapTree] = useState<PageNode>(() => loadTreeFromStorage());
    const [isConsolidating, setIsConsolidating] = useState(false);

    const latestTreeRef = useRef<PageNode>(userMapTree);

    const saveTree = useCallback((tree: PageNode) => {
        const normalized = normalizeTree(tree);
        setUserMapTree(normalized);
        latestTreeRef.current = normalized;
        saveTreeToStorage(normalized);
    }, []);

    const updateNode = useCallback((nodeId: string, updates: Partial<PageNode>) => {
        const updateInTree = (node: PageNode): PageNode => {
            if (node.id === nodeId) {
                return { ...node, ...updates };
            }
            return { ...node, children: node.children.map(updateInTree) };
        };

        saveTree(updateInTree(latestTreeRef.current));
    }, [saveTree]);

    const deleteNode = useCallback((nodeId: string) => {
        const removeFromTree = (node: PageNode): PageNode => ({
            ...node,
            children: node.children
                .filter((child) => child.id !== nodeId)
                .map(removeFromTree)
        });

        saveTree(removeFromTree(latestTreeRef.current));
    }, [saveTree]);

    const addNode = useCallback((parentId: string, newNode: PageNode) => {
        const addToTree = (node: PageNode): PageNode => {
            if (node.id === parentId) {
                return { ...node, children: [...node.children, newNode] };
            }
            return { ...node, children: node.children.map(addToTree) };
        };

        saveTree(addToTree(latestTreeRef.current));
    }, [saveTree]);

    const consolidate = useCallback(async () => {
        const memories = loadMemoriesFromStorage();
        if (memories.length === 0) {
            throw new Error('No saved context is available yet. Add or import context first.');
        }

        setIsConsolidating(true);
        try {
            const { consolidateUserMap } = await import('../services/workspaceApi');
            const tree = await consolidateUserMap({
                memories,
                existingTree: latestTreeRef.current.children.length > 0 ? latestTreeRef.current : undefined
            });
            saveTree(tree);
        } finally {
            setIsConsolidating(false);
        }
    }, [saveTree]);

    const ingestExternalMemory = useCallback(async (rawText: string): Promise<number> => {
        const codeBlockMatch = rawText.match(/```[\w-]*\s*([\s\S]*?)```/);
        const body = (codeBlockMatch ? codeBlockMatch[1] : rawText)
            .replace(/\r/g, '\n')
            .trim();

        const lines = body
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !line.startsWith('#'))
            .filter((line) => !/^[-*]\s*$/.test(line));

        const normalized = lines
            .map((line) => line.replace(/^\d+\.\s+/, '').trim())
            .filter((line) => line.length >= 8)
            .slice(0, 200);

        if (normalized.length === 0) return 0;

        const existing = loadMemoriesFromStorage();
        const merged = Array.from(new Set([...existing, ...normalized]));
        saveMemoriesToStorage(merged);
        return normalized.length;
    }, []);

    const ingestSession = useCallback(async (messages: Array<{ role: string; content: string }>, _agentId?: string) => {
        if (messages.length < 2) return;

        try {
            const { extractMemory } = await import('../services/workspaceApi');
            const response = await extractMemory({ messages });
            const facts: string[] = response.facts || [];
            if (facts.length === 0) return;

            const existing = loadMemoriesFromStorage();
            const merged = Array.from(new Set([...existing, ...facts]));
            saveMemoriesToStorage(merged);
        } catch (error) {
            console.error('Memory ingestion failed:', error);
        }
    }, []);

    return {
        userMapTree,
        setUserMapTree: saveTree,
        isLoading: false,
        isConsolidating,
        serverUpdatedAt: null,
        updateNode,
        deleteNode,
        addNode,
        consolidate,
        ingestSession,
        ingestExternalMemory
    };
};
