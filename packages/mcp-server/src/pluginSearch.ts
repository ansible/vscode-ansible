/**
 * Plugin Search Index
 *
 * Provides fast keyword-based search across all installed Ansible plugins.
 * Automatically rebuilds when CollectionsService data changes.
 */

import { CollectionsService } from '@ansible/services';

export interface PluginSearchResult {
    fullName: string;
    collection: string;
    pluginType: string;
    name: string;
    shortDescription: string;
}

/** In-memory keyword search index over installed Ansible plugin documentation. */
export class PluginSearchIndex {
    private static _instance: PluginSearchIndex | undefined;
    private _entries: PluginSearchResult[] = [];
    private _built = false;
    private _subscribed = false;

    /** Creates the singleton index and subscribes to collection change events. */
    private constructor() {
        // Subscribe to CollectionsService changes
        this._subscribeToChanges();
    }

    /** Marks the index stale when CollectionsService reports installed collections changed. */
    private _subscribeToChanges(): void {
        if (this._subscribed) {
            return;
        }

        try {
            const service = CollectionsService.getInstance();
            const onDidChange = service.onDidChange as
                ((listener: () => void) => { dispose: () => void }) | undefined;

            if (onDidChange && typeof onDidChange === 'function') {
                onDidChange(() => {
                    // Mark as needing rebuild when collections change
                    console.error('PluginSearchIndex: Collections changed, marking for rebuild');
                    this._built = false;
                });
                this._subscribed = true;
                console.error('PluginSearchIndex: Subscribed to CollectionsService changes');
            } else if (
                service.onDidChange &&
                typeof (service.onDidChange as unknown as { event?: unknown }).event === 'function'
            ) {
                // VS Code EventEmitter style
                const event = (
                    service.onDidChange as unknown as {
                        event: (listener: () => void) => { dispose: () => void };
                    }
                ).event;
                event(() => {
                    console.error('PluginSearchIndex: Collections changed, marking for rebuild');
                    this._built = false;
                });
                this._subscribed = true;
                console.error(
                    'PluginSearchIndex: Subscribed to CollectionsService changes (VS Code style)',
                );
            }
        } catch (error) {
            console.error('PluginSearchIndex: Failed to subscribe to changes:', error);
        }
    }

    /**
     * Returns the shared PluginSearchIndex singleton.
     *
     * @returns Lazily constructed PluginSearchIndex instance
     */
    public static getInstance(): PluginSearchIndex {
        PluginSearchIndex._instance ??= new PluginSearchIndex();
        return PluginSearchIndex._instance;
    }

    /**
     * Whether the index has been populated from the current collection cache.
     *
     * @returns True when `rebuild()` has completed without a subsequent invalidation
     */
    public isBuilt(): boolean {
        return this._built;
    }

    /** Builds the index on first use without rebuilding when already current. */
    public async ensureBuilt(): Promise<void> {
        if (this._built) {
            return;
        }
        await this.rebuild();
    }

    /** Rebuilds the search index from all plugins in CollectionsService. */
    public async rebuild(): Promise<void> {
        const service = CollectionsService.getInstance();

        if (!service.isLoaded()) {
            try {
                await service.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`PluginSearchIndex: Failed to load collections: ${message}`);
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
                        shortDescription: plugin.shortDescription,
                    });
                }
            }
        }

        console.error(
            `PluginSearchIndex: Loaded ${String(this._entries.length)} plugins from ${String(service.getCollections().size)} collections`,
        );
        this._built = true;
    }

    /**
     * Searches indexed plugins by keyword relevance with optional filters.
     *
     * @param query - Free-text search terms matched against name, FQCN, and description
     * @param options - Optional search filters
     * @param options.pluginType - Restrict results to one Ansible plugin type
     * @param options.collection - Substring filter on collection FQCN
     * @param options.limit - Maximum number of results (capped at 50)
     * @returns Ranked plugin matches, highest relevance first
     */
    public search(
        query: string,
        options?: {
            pluginType?: string;
            collection?: string;
            limit?: number;
        },
    ): PluginSearchResult[] {
        const limit = Math.min(options?.limit ?? 15, 50);
        const queryTerms = this._tokenize(query.toLowerCase());

        if (queryTerms.length === 0) {
            return [];
        }

        const results = this._entries
            .filter((entry) => {
                // Apply filters
                if (options?.pluginType && entry.pluginType !== options.pluginType) {
                    return false;
                }
                if (
                    options?.collection &&
                    !entry.collection.toLowerCase().includes(options.collection.toLowerCase())
                ) {
                    return false;
                }
                return true;
            })
            .map((entry) => ({
                entry,
                score: this._scoreMatch(queryTerms, entry),
            }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((r) => r.entry);

        return results;
    }

    /**
     * Splits search text into lowercase terms for matching.
     *
     * @param text - Raw query string from the caller
     * @returns Non-trivial tokens after splitting on whitespace and punctuation
     */
    private _tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .split(/[\s_\-.]+/)
            .filter((t) => t.length > 1);
    }

    /**
     * Scores how well a plugin entry matches the tokenized query.
     *
     * @param queryTerms - Lowercase search tokens
     * @param entry - Plugin index entry to score
     * @returns Relevance score; zero means no meaningful match
     */
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
        const matchedTerms = queryTerms.filter(
            (term) =>
                nameLower.includes(term) ||
                fullNameLower.includes(term) ||
                descLower.includes(term),
        ).length;

        if (matchedTerms > 1) {
            score += matchedTerms * 15;
        }

        return score;
    }

    /**
     * Number of plugin entries currently held in the index.
     *
     * @returns Count of indexed plugins (zero before the first rebuild)
     */
    public getCount(): number {
        return this._entries.length;
    }
}
