import type { HostBridgeCore } from './core';

export interface PluginOption {
    description?: string | string[];
    type?: string;
    default?: unknown;
    choices?: string[];
    required?: boolean;
    elements?: string;
    aliases?: string[];
    suboptions?: Record<string, PluginOption>;
    version_added?: string;
}

export interface PluginDoc {
    author?: string | string[];
    short_description?: string;
    description?: string | string[];
    version_added?: string;
    notes?: string | string[];
    options?: Record<string, PluginOption>;
    requirements?: string | string[];
    seealso?: { module?: string; description?: string; link?: string; name?: string }[];
}

export type PluginReturn = Record<
    string,
    {
        description?: string | string[];
        returned?: string;
        type?: string;
        sample?: unknown;
        contains?: Record<string, unknown>;
    }
>;

export interface PluginData {
    doc?: PluginDoc;
    examples?: string;
    return?: PluginReturn;
}

/**
 * Bridge contract for plugin documentation views.
 * Host implementations fetch documentation from CollectionsService
 * and provide clipboard/chat integration.
 */
export interface PluginDocBridge extends HostBridgeCore {
    /**
     * Fetch plugin documentation for the given FQCN and plugin type.
     * @param fqcn - Fully qualified collection name of the plugin
     * @param pluginType - Ansible plugin type (e.g. module, lookup, callback)
     * @returns Plugin documentation payload, or null when unavailable
     */
    getPluginDoc(fqcn: string, pluginType: string): Promise<PluginData | null>;

    /**
     * Copy text to the host clipboard.
     * @param text - Text to copy
     */
    copyToClipboard(text: string): Promise<void>;

    /**
     * Open the host chat interface with an optional pre-filled prompt.
     * @param prompt - Optional initial prompt text
     */
    openChat(prompt?: string): Promise<void>;

    /** Whether AI-assisted features are enabled in the host environment. */
    enableAiFeatures: boolean;
}
