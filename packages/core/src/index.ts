/**
 * @ansible/core — shared services and types for Ansible tooling.
 */

export {
    CollectionsService,
    CollectionInfo,
    CollectionData,
    PluginInfo,
    PluginOption,
    PluginDoc,
    PluginReturn,
    PluginData,
} from './services/CollectionsService';

export { CommandService, getCommandService } from './services/CommandService';
export type { CommandOptions, ExecResult, BinDirResolver } from './services/CommandService';

export { CreatorService } from './services/CreatorService';
export type { ParameterSchema, SchemaNode, CreatorStatus } from './services/CreatorService';

export { DevToolsService } from './services/DevToolsService';
export type { DevToolPackage } from './services/DevToolsService';

export {
    cacheSelectedEnvironment,
    getCachedEnvironment,
    getCachedBinDir,
    getCachedToolPath,
    clearCachedEnvironment,
    findExecutableWithCache,
} from './services/EnvironmentCache';
export type { CachedEnvironment } from './services/EnvironmentCache';

export { ExecutionEnvService } from './services/ExecutionEnvService';
export type {
    ExecutionEnvironment,
    EEDetails,
    PythonPackageDetail,
    SystemPackageDetail,
} from './services/ExecutionEnvService';

export { EECache } from './services/EECache';
export type { CacheIndex, CacheIndexEntry } from './services/EECache';

export {
    detectEngine,
    listImages,
    inspectImage,
    classifyEE,
    runInContainer,
    deployScripts,
    getScriptCacheDir,
} from './services/ContainerRuntime';
export type { ContainerEngine, ContainerImage, InspectedImage } from './services/ContainerRuntime';

export { GalaxyCollectionCache } from './services/GalaxyCollectionCache';
export type { GalaxyCollection } from './services/GalaxyCollectionCache';

export { GitHubCollectionCache } from './services/GitHubCollectionCache';
export type { GitHubCollection } from './services/GitHubCollectionCache';

export { SkillRegistry, _resetGitHubToken } from './services/SkillRegistry';
export type {
    SkillEntry,
    SkillSource,
    SkillCategory,
    TrustLevel,
    RepoFormat,
} from './services/SkillRegistry';

export {
    buildCommandArgs,
    buildPreviewString,
    getPositionalKeys,
    quoteIfNeeded,
    valueToString,
    formatLabel,
    CREATOR_FILTERED_KEYS,
} from './utils/creatorArgs';

export { setLogFunction, log, getLogFunction } from './utils/logging';
export { SimpleEventEmitter } from './utils/SimpleEventEmitter';
export type { Disposable } from './utils/SimpleEventEmitter';

export type * from './types/pythonEnvApi';

export {
    buildPlaybookCommand,
    parsePlaybook,
    mergePlaybookConfig,
    DEFAULT_PLAYBOOK_CONFIG,
} from './services/PlaybookConfigService';

export type {
    PlaybookConfig,
    PlaybookPlay,
    ProgressEvent,
    ProgressEventType,
    AiAnalyzeData,
    PlaybookRunOptions,
} from './types/playbook';

// --- AI Prompt Builders ---
export {
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
    buildEESummaryPrompt,
    buildEEDetailPrompt,
    buildCreatorOverviewPrompt,
    buildCreatorCommandWalkthroughPrompt,
    buildTaskBuilderPrompt,
    buildSkillLoadPrompt,
    buildSkillClipboardPrompt,
    buildMcpToolExamplePrompt,
    buildTaskAnalysisPrompt,
    buildPlaybookSummaryPrompt,
} from './prompts';
export type { CollectionSourcesInput, TaskAnalysisInput } from './prompts';
