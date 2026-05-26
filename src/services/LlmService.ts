/**
 * Centralized Language Model Service
 * 
 * Provides unified access to VS Code's Language Model API with:
 * - Provider and model selection with quick pick UI
 * - Configurable model selection via settings
 * - Retry logic with exponential backoff
 * - Context management (guidance, plugin docs)
 */

import * as vscode from 'vscode';

/**
 * Response from an LLM request
 */
export interface LlmResponse {
    success: boolean;
    content: string;
    error?: string;
    modelUsed?: string;
    tokenCount?: number;
}

/**
 * Options for LLM requests
 */
export interface LlmRequestOptions {
    /** Maximum number of retry attempts */
    maxRetries?: number;
    /** Context to prepend to the prompt */
    systemContext?: string;
    /** Whether to extract JSON from the response */
    expectJson?: boolean;
}

/**
 * Model information for display
 */
export interface LlmModelInfo {
    id: string;
    name: string;
    vendor: string;
    family: string;
    maxInputTokens: number;
    displayName: string;
}

/**
 * Centralized LLM Service for the Content Designer
 */
export class LlmService {
    private static _instance: LlmService | undefined;
    private _cachedModel: vscode.LanguageModelChat | undefined;
    private _cachedModels: vscode.LanguageModelChat[] = [];
    private _lastModelCheck: number = 0;
    private readonly MODEL_CACHE_TTL = 60000; // 1 minute

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): LlmService {
        if (!LlmService._instance) {
            LlmService._instance = new LlmService();
        }
        return LlmService._instance;
    }

    // ========================================================================
    // Model Discovery
    // ========================================================================

    /**
     * Get all available models grouped by vendor
     */
    public async getAvailableModels(): Promise<Map<string, LlmModelInfo[]>> {
        if (!vscode.lm || !vscode.lm.selectChatModels) {
            return new Map();
        }

        const models = await vscode.lm.selectChatModels({});
        const grouped = new Map<string, LlmModelInfo[]>();

        for (const model of models) {
            const vendor = model.vendor || 'unknown';
            if (!grouped.has(vendor)) {
                grouped.set(vendor, []);
            }
            grouped.get(vendor)!.push({
                id: model.id,
                name: model.name,
                vendor: model.vendor,
                family: model.family,
                maxInputTokens: model.maxInputTokens,
                displayName: `${model.name} (${model.family})`
            });
        }

        return grouped;
    }

    /**
     * Get list of available providers (vendors)
     */
    public async getAvailableProviders(): Promise<string[]> {
        const grouped = await this.getAvailableModels();
        return Array.from(grouped.keys()).sort();
    }

    // ========================================================================
    // Model Selection UI
    // ========================================================================

    /**
     * Show quick pick to select LLM provider and model
     * Saves selection to settings
     */
    public async showModelPicker(): Promise<boolean> {
        if (!vscode.lm || !vscode.lm.selectChatModels) {
            vscode.window.showErrorMessage('Language Model API not available. Install GitHub Copilot, Open LLM Provider, or another LLM extension.');
            return false;
        }

        const models = await vscode.lm.selectChatModels({});
        if (models.length === 0) {
            vscode.window.showWarningMessage('No language models found. Install and configure an LLM provider extension.');
            return false;
        }

        // Group by vendor
        const grouped = new Map<string, vscode.LanguageModelChat[]>();
        for (const model of models) {
            const vendor = model.vendor || 'unknown';
            if (!grouped.has(vendor)) {
                grouped.set(vendor, []);
            }
            grouped.get(vendor)!.push(model);
        }

        // Step 1: Select provider
        const providerItems: vscode.QuickPickItem[] = Array.from(grouped.entries()).map(([vendor, vendorModels]) => ({
            label: vendor,
            description: `${vendorModels.length} model${vendorModels.length !== 1 ? 's' : ''}`,
            detail: vendorModels.map(m => m.name).slice(0, 3).join(', ') + (vendorModels.length > 3 ? '...' : '')
        }));

        // Add auto-select option
        providerItems.unshift({
            label: '$(sparkle) Auto-select',
            description: 'Let extension choose the best model',
            detail: 'Prefers Claude models when available'
        });

        const selectedProvider = await vscode.window.showQuickPick(providerItems, {
            placeHolder: 'Select LLM Provider',
            title: 'Ansible Content Designer - LLM Configuration'
        });

        if (!selectedProvider) {
            return false; // Cancelled
        }

        const config = vscode.workspace.getConfiguration('ansibleEnvironments');

        if (selectedProvider.label === '$(sparkle) Auto-select') {
            // Ask where to save
            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
            let configTarget = vscode.ConfigurationTarget.Global;

            if (hasWorkspace) {
                const saveLocation = await vscode.window.showQuickPick([
                    { label: 'Workspace', description: 'Save to this workspace only', target: vscode.ConfigurationTarget.Workspace },
                    { label: 'User', description: 'Save globally for all workspaces', target: vscode.ConfigurationTarget.Global }
                ], {
                    placeHolder: 'Where should this setting be saved?',
                    title: 'Save LLM Configuration'
                });

                if (!saveLocation) {
                    return false;
                }
                configTarget = saveLocation.target;
            }

            // Clear settings for auto-selection
            await config.update('llm.provider', '', configTarget);
            await config.update('llm.model', '', configTarget);
            this.clearCache();
            const location = configTarget === vscode.ConfigurationTarget.Workspace ? '(Workspace)' : '(User)';
            vscode.window.showInformationMessage(`LLM: Using auto-selection (prefers Claude) ${location}`);
            return true;
        }

        const vendorName = selectedProvider.label;
        const vendorModels = grouped.get(vendorName) || [];

        // Step 2: Select model within provider
        const modelItems: vscode.QuickPickItem[] = vendorModels.map(m => ({
            label: m.name,
            description: m.family,
            detail: `${m.maxInputTokens?.toLocaleString() || '?'} tokens • ID: ${m.id}`
        }));

        // Add auto-select for this provider
        modelItems.unshift({
            label: '$(sparkle) Auto-select from ' + vendorName,
            description: 'Use best model from this provider',
            detail: 'Automatically selects based on capability'
        });

        const selectedModel = await vscode.window.showQuickPick(modelItems, {
            placeHolder: `Select Model from ${vendorName}`,
            title: 'Ansible Content Designer - LLM Configuration'
        });

        if (!selectedModel) {
            return false; // Cancelled
        }

        // Step 3: Ask where to save (User or Workspace)
        const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        let configTarget = vscode.ConfigurationTarget.Global;

        if (hasWorkspace) {
            const saveLocation = await vscode.window.showQuickPick([
                { label: 'Workspace', description: 'Save to this workspace only', target: vscode.ConfigurationTarget.Workspace },
                { label: 'User', description: 'Save globally for all workspaces', target: vscode.ConfigurationTarget.Global }
            ], {
                placeHolder: 'Where should this setting be saved?',
                title: 'Save LLM Configuration'
            });

            if (!saveLocation) {
                return false; // Cancelled
            }
            configTarget = saveLocation.target;
        }

        // Save settings
        await config.update('llm.provider', vendorName, configTarget);

        if (selectedModel.label.startsWith('$(sparkle)')) {
            await config.update('llm.model', '', configTarget);
            const location = configTarget === vscode.ConfigurationTarget.Workspace ? '(Workspace)' : '(User)';
            vscode.window.showInformationMessage(`LLM: Using ${vendorName} with auto-selected model ${location}`);
        } else {
            const model = vendorModels.find(m => m.name === selectedModel.label);
            await config.update('llm.model', model?.id || '', configTarget);
            const location = configTarget === vscode.ConfigurationTarget.Workspace ? '(Workspace)' : '(User)';
            vscode.window.showInformationMessage(`LLM: Using ${vendorName} / ${model?.name || selectedModel.label} ${location}`);
        }

        this.clearCache();
        return true;
    }

    /**
     * Show current LLM configuration status
     */
    public async showStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const provider = config.get<string>('llm.provider', '');
        const modelId = config.get<string>('llm.model', '');

        const currentModel = await this.selectModel();
        
        const lines: string[] = [
            '## LLM Configuration Status',
            '',
            '**Settings:**',
            `- Provider: ${provider || '(auto)'}`,
            `- Model: ${modelId || '(auto)'}`,
            '',
            '**Active Model:**',
            currentModel 
                ? `- ${currentModel.name} (${currentModel.vendor}/${currentModel.family})`
                : '- None available',
            ''
        ];

        if (currentModel) {
            lines.push(`**Capabilities:**`);
            lines.push(`- Max tokens: ${currentModel.maxInputTokens?.toLocaleString() || 'Unknown'}`);
        }

        // Show available providers
        const providers = await this.getAvailableProviders();
        if (providers.length > 0) {
            lines.push('');
            lines.push('**Available Providers:**');
            lines.push(providers.map(p => `- ${p}`).join('\n'));
        }

        const panel = vscode.window.createWebviewPanel(
            'llmStatus',
            'LLM Status',
            vscode.ViewColumn.One,
            {}
        );

        // Simple markdown-like display
        panel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
        h2 { color: var(--vscode-textLink-foreground); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
        strong { color: var(--vscode-textPreformat-foreground); }
        ul { list-style: none; padding-left: 10px; }
        li { padding: 2px 0; }
        li:before { content: "• "; color: var(--vscode-textLink-foreground); }
    </style>
</head>
<body>
    <h2>LLM Configuration Status</h2>
    
    <p><strong>Settings:</strong></p>
    <ul>
        <li>Provider: ${provider || '<em>(auto)</em>'}</li>
        <li>Model: ${modelId || '<em>(auto)</em>'}</li>
    </ul>
    
    <p><strong>Active Model:</strong></p>
    <ul>
        ${currentModel 
            ? `<li>${currentModel.name} (${currentModel.vendor}/${currentModel.family})</li>
               <li>Max tokens: ${currentModel.maxInputTokens?.toLocaleString() || 'Unknown'}</li>`
            : '<li><em>None available</em></li>'
        }
    </ul>
    
    <p><strong>Available Providers:</strong></p>
    <ul>
        ${providers.map(p => `<li>${p}</li>`).join('\n        ')}
    </ul>
    
    <p style="margin-top: 20px;">
        <em>Use command "Ansible Environments: Select LLM Provider & Model" to change.</em>
    </p>
</body>
</html>`;
    }

    // ========================================================================
    // Model Selection Logic
    // ========================================================================

    /**
     * Select the best available language model based on settings
     * 
     * Priority:
     * 1. Configured provider + model from settings
     * 2. Configured provider with auto model selection
     * 3. Claude Opus 4.5 from any provider
     * 4. Any Claude model
     * 5. First available model
     */
    public async selectModel(): Promise<vscode.LanguageModelChat | undefined> {
        // Return cached model if still valid
        if (this._cachedModel && (Date.now() - this._lastModelCheck) < this.MODEL_CACHE_TTL) {
            return this._cachedModel;
        }

        if (!vscode.lm || !vscode.lm.selectChatModels) {
            console.log('LlmService: Language Model API not available');
            return undefined;
        }

        const allModels = await vscode.lm.selectChatModels({});
        this._cachedModels = allModels;
        
        if (allModels.length === 0) {
            console.log('LlmService: No language models available');
            return undefined;
        }

        // Log available models for debugging
        console.log('LlmService: Available models:', allModels.map(m => `${m.vendor}/${m.id}`).join(', '));

        // Check for configured settings
        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const configuredProvider = config.get<string>('llm.provider', '');
        const configuredModel = config.get<string>('llm.model', '');
        
        // Also check legacy setting
        const legacyModel = config.get<string>('preferredLlmModel', '');
        
        let selectedModel: vscode.LanguageModelChat | undefined;

        // Try configured provider + model first
        if (configuredProvider && configuredModel) {
            selectedModel = allModels.find(m => 
                m.vendor === configuredProvider && m.id === configuredModel
            );
            if (selectedModel) {
                console.log(`LlmService: Using configured provider+model: ${selectedModel.vendor}/${selectedModel.id}`);
            }
        }

        // Try configured provider with auto model selection
        if (!selectedModel && configuredProvider) {
            const providerModels = allModels.filter(m => m.vendor === configuredProvider);
            if (providerModels.length > 0) {
                // Prefer Claude/Opus models within provider
                selectedModel = providerModels.find(m => 
                    m.id.toLowerCase().includes('opus') || m.id.toLowerCase().includes('claude')
                ) || providerModels[0];
                console.log(`LlmService: Using provider ${configuredProvider} with auto-selected model: ${selectedModel.id}`);
            }
        }

        // Try legacy setting
        if (!selectedModel && legacyModel) {
            selectedModel = this._findModelByLegacyId(allModels, legacyModel);
            if (selectedModel) {
                console.log(`LlmService: Using legacy preferredLlmModel: ${selectedModel.id}`);
            }
        }

        // Fallback: Prefer Claude Opus 4.5, then any Claude, then any model
        if (!selectedModel) {
            selectedModel = allModels.find(m => 
                m.id.toLowerCase().includes('claude') && 
                (m.id.toLowerCase().includes('opus') || m.id.toLowerCase().includes('4.5') || m.id.toLowerCase().includes('4-5'))
            );
            
            if (!selectedModel) {
                selectedModel = allModels.find(m => m.id.toLowerCase().includes('claude'));
            }
            
            if (!selectedModel) {
                selectedModel = allModels[0];
            }
            
            console.log(`LlmService: Using auto-selected model: ${selectedModel?.vendor}/${selectedModel?.id}`);
        }

        // Cache the selected model
        this._cachedModel = selectedModel;
        this._lastModelCheck = Date.now();
        
        return selectedModel;
    }

    /**
     * Find model by legacy preferredLlmModel setting
     */
    private _findModelByLegacyId(models: vscode.LanguageModelChat[], legacyId: string): vscode.LanguageModelChat | undefined {
        // Normalize for comparison
        const normalize = (id: string) => id.toLowerCase()
            .replace(/[.\-_]/g, '')
            .replace(/\d{8,}$/, '');  // Remove date suffixes
        
        const normalizedLegacy = normalize(legacyId);
        
        // Exact match
        let match = models.find(m => m.id === legacyId);
        if (match) { return match; }
        
        // Normalized match
        match = models.find(m => {
            const normalized = normalize(m.id);
            return normalized.includes(normalizedLegacy) || normalizedLegacy.includes(normalized);
        });
        if (match) { return match; }
        
        // Partial match on key terms
        if (legacyId.toLowerCase().includes('opus')) {
            match = models.find(m => 
                m.id.toLowerCase().includes('opus') && 
                (m.id.includes('4.5') || m.id.includes('4-5'))
            );
        }
        
        return match;
    }

    // ========================================================================
    // Request Methods
    // ========================================================================

    /**
     * Send a request to the LLM
     * 
     * @param prompt - The user prompt
     * @param options - Request options
     * @returns LLM response
     */
    public async request(prompt: string, options: LlmRequestOptions = {}): Promise<LlmResponse> {
        const { maxRetries = 3, systemContext, expectJson = false } = options;

        const model = await this.selectModel();
        if (!model) {
            return {
                success: false,
                content: '',
                error: 'No language model available. Use "Ansible Environments: Select LLM Provider & Model" to configure.'
            };
        }

        let lastError: string = '';
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Build messages
                const fullPrompt = systemContext 
                    ? `${systemContext}\n\n---\n\n${prompt}`
                    : prompt;

                const messages = [
                    vscode.LanguageModelChatMessage.User(fullPrompt)
                ];

                // Send request
                const response = await model.sendRequest(messages, {});

                // Collect response
                let content = '';
                for await (const chunk of response.text) {
                    content += chunk;
                }

                // Extract JSON if expected
                if (expectJson) {
                    const jsonContent = this._extractJson(content);
                    if (!jsonContent) {
                        lastError = 'Response did not contain valid JSON';
                        console.log(`LlmService: Attempt ${attempt}/${maxRetries} - ${lastError}`);
                        continue;
                    }
                    content = jsonContent;
                }

                return {
                    success: true,
                    content,
                    modelUsed: `${model.vendor}/${model.id}`
                };

            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                console.error(`LlmService: Attempt ${attempt}/${maxRetries} failed:`, lastError);
                
                // Exponential backoff
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await this._sleep(delay);
                }
            }
        }

        return {
            success: false,
            content: '',
            error: `Failed after ${maxRetries} attempts: ${lastError}`
        };
    }

    /**
     * Generate content with iteration and validation
     */
    public async generateWithValidation(
        prompt: string,
        validator: (content: string) => Promise<{ valid: boolean; errors: string[] }>,
        maxIterations: number = 5,
        options: LlmRequestOptions = {}
    ): Promise<LlmResponse> {
        let currentPrompt = prompt;
        let lastContent = '';
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;
            console.log(`LlmService: Generation iteration ${iteration}/${maxIterations}`);

            const response = await this.request(currentPrompt, options);
            
            if (!response.success) {
                return response;
            }

            lastContent = response.content;

            // Validate the content
            const validation = await validator(lastContent);
            
            if (validation.valid) {
                console.log(`LlmService: Content validated successfully on iteration ${iteration}`);
                return {
                    success: true,
                    content: lastContent,
                    modelUsed: response.modelUsed
                };
            }

            // Build correction prompt
            const errorSummary = validation.errors.join('\n');
            currentPrompt = `The previous generation had the following errors:

${errorSummary}

Please fix these issues and regenerate. Here was the previous content:

\`\`\`
${lastContent}
\`\`\`

Generate the corrected version:`;

            console.log(`LlmService: Iteration ${iteration} validation failed with ${validation.errors.length} errors`);
        }

        return {
            success: false,
            content: lastContent,
            error: `Content validation failed after ${maxIterations} iterations`
        };
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    /**
     * Extract JSON from a response that may contain markdown or other text
     */
    private _extractJson(content: string): string | null {
        // Try to find JSON in code blocks
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            try {
                JSON.parse(codeBlockMatch[1]);
                return codeBlockMatch[1];
            } catch {
                // Not valid JSON in code block
            }
        }

        // Try to find bare JSON object or array
        const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try {
                JSON.parse(jsonMatch[1]);
                return jsonMatch[1];
            } catch {
                // Not valid JSON
            }
        }

        return null;
    }

    /**
     * Sleep helper for backoff
     */
    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear the cached model (useful when settings change)
     */
    public clearCache(): void {
        this._cachedModel = undefined;
        this._cachedModels = [];
        this._lastModelCheck = 0;
    }

    /**
     * Check if LLM is available
     */
    public async isAvailable(): Promise<boolean> {
        const model = await this.selectModel();
        return model !== undefined;
    }

    /**
     * Get current model info for display
     */
    public async getCurrentModelInfo(): Promise<string> {
        const model = await this.selectModel();
        if (!model) {
            return 'No LLM configured';
        }
        return `${model.vendor}/${model.name}`;
    }
}

/**
 * Get the singleton LlmService instance
 */
export function getLlmService(): LlmService {
    return LlmService.getInstance();
}
