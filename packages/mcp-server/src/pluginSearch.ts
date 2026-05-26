/**
 * Plugin Search Index
 * 
 * Provides fast keyword-based search across all installed Ansible plugins.
 * Automatically rebuilds when CollectionsService data changes.
 */

import { CollectionsService } from '@ansible/core';

export interface PluginSearchResult {
    fullName: string;
    collection: string;
    pluginType: string;
    name: string;
    shortDescription: string;
}

export class PluginSearchIndex {
    private static _instance: PluginSearchIndex | undefined;
    private _entries: PluginSearchResult[] = [];
    private _built = false;
    private _subscribed = false;

    private constructor() {
        // Subscribe to CollectionsService changes
        this._subscribeToChanges();
    }

    private _subscribeToChanges(): void {
        if (this._subscribed) {
            return;
        }
        
        try {
            const service = CollectionsService.getInstance();
            const onDidChange = service.onDidChange as { (listener: () => void): { dispose: () => void } } | undefined;
            
            if (onDidChange && typeof onDidChange === 'function') {
                onDidChange(() => {
                    // Mark as needing rebuild when collections change
                    console.error('PluginSearchIndex: Collections changed, marking for rebuild');
                    this._built = false;
                });
                this._subscribed = true;
                console.error('PluginSearchIndex: Subscribed to CollectionsService changes');
            } else if (service.onDidChange && typeof (service.onDidChange as unknown as { event?: unknown }).event === 'function') {
                // VS Code EventEmitter style
                const event = (service.onDidChange as unknown as { event: (listener: () => void) => { dispose: () => void } }).event;
                event(() => {
                    console.error('PluginSearchIndex: Collections changed, marking for rebuild');
                    this._built = false;
                });
                this._subscribed = true;
                console.error('PluginSearchIndex: Subscribed to CollectionsService changes (VS Code style)');
            }
        } catch (error) {
            console.error('PluginSearchIndex: Failed to subscribe to changes:', error);
        }
    }

    public static getInstance(): PluginSearchIndex {
        if (!PluginSearchIndex._instance) {
            PluginSearchIndex._instance = new PluginSearchIndex();
        }
        return PluginSearchIndex._instance;
    }

    public isBuilt(): boolean {
        return this._built;
    }

    public async ensureBuilt(): Promise<void> {
        if (this._built) {
            return;
        }
        await this.rebuild();
    }

    public async rebuild(): Promise<void> {
        const service = CollectionsService.getInstance();
        
        if (!service.isLoaded()) {
            try {
                await service.refresh();
            } catch (error) {
                console.error(`PluginSearchIndex: Failed to load collections: ${error}`);
                // Continue with empty index - tools will still work, just no search results
            }
        }

        this._entries = [];

        for (const [collName, collection] of service.getCollections()) {
            for (const [pluginType, plugins] of collection.pluginTypes) {
                for (const plugin of plugins) {
                    this._entries.push({
                        fullName: plugin.fullName,
                        collection: collName,
                        pluginType,
                        name: plugin.name,
                        shortDescription: plugin.shortDescription
                    });
                }
            }
        }

        console.error(`PluginSearchIndex: Loaded ${this._entries.length} plugins from ${service.getCollections().size} collections`);
        this._built = true;
    }

    public search(query: string, options?: {
        pluginType?: string;
        collection?: string;
        limit?: number;
    }): PluginSearchResult[] {
        const limit = Math.min(options?.limit || 15, 50);
        const queryTerms = this._tokenize(query.toLowerCase());

        if (queryTerms.length === 0) {
            return [];
        }

        const results = this._entries
            .filter(entry => {
                // Apply filters
                if (options?.pluginType && entry.pluginType !== options.pluginType) {
                    return false;
                }
                if (options?.collection && !entry.collection.toLowerCase().includes(options.collection.toLowerCase())) {
                    return false;
                }
                return true;
            })
            .map(entry => ({
                entry,
                score: this._scoreMatch(queryTerms, entry)
            }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.entry);

        return results;
    }

    private _tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .split(/[\s_\-.]+/)
            .filter(t => t.length > 1);
    }

    private _scoreMatch(queryTerms: string[], entry: PluginSearchResult): number {
        let score = 0;
        const nameLower = entry.name.toLowerCase();
        const fullNameLower = entry.fullName.toLowerCase();
        const descLower = entry.shortDescription.toLowerCase();
        const collLower = entry.collection.toLowerCase();

        for (const term of queryTerms) {
            // Exact name match - highest score
            if (nameLower === term) {
                score += 100;
            }
            // Name starts with term
            else if (nameLower.startsWith(term)) {
                score += 70;
            }
            // Name contains term
            else if (nameLower.includes(term)) {
                score += 50;
            }
            // Collection contains term
            else if (collLower.includes(term)) {
                score += 30;
            }
            // Full name contains term
            else if (fullNameLower.includes(term)) {
                score += 25;
            }
            // Description contains term
            else if (descLower.includes(term)) {
                score += 10;
            }
        }

        // Bonus for matching multiple terms
        const matchedTerms = queryTerms.filter(term => 
            nameLower.includes(term) || 
            fullNameLower.includes(term) || 
            descLower.includes(term)
        ).length;

        if (matchedTerms > 1) {
            score += matchedTerms * 15;
        }

        return score;
    }

    public getCount(): number {
        return this._entries.length;
    }
}
