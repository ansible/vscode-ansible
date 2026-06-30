/**
 * @ansible/developer-services — Node.js service implementations.
 * Depends on @ansible/common for types. Re-exports all common types for convenience.
 */

// Re-export everything from @ansible/common so Node.js consumers can use one import
export {
    log,
    setLogFunction,
    getLogFunction,
    SimpleEventEmitter,
    buildCommandArgs,
    buildPreviewString,
    getPositionalKeys,
    quoteIfNeeded,
    valueToString,
    formatLabel,
    CREATOR_FILTERED_KEYS,
    buildPlaybookCommand,
    parsePlaybook,
    mergePlaybookConfig,
    DEFAULT_PLAYBOOK_CONFIG,
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildGalaxyPluginExplanationPrompt,
    buildScmPluginExplanationPrompt,
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
    extractMetadataJson,
    parseMetadataDump,
    stripFrontmatter,
    BUILTIN_SKILLS,
} from '@ansible/common';
export type {
    ParameterSchema,
    SchemaNode,
    CreatorStatus,
    CollectionInfo,
    PluginInfo,
    CollectionData,
    PluginOption,
    PluginDoc,
    PluginReturn,
    PluginData,
    BinDirResolver,
    CommandOptions,
    ExecResult,
    DevToolPackage,
    CachedEnvironment,
    ExecutionEnvironment,
    EEDetails,
    PythonPackageDetail,
    SystemPackageDetail,
    ContainerEngine,
    ContainerImage,
    InspectedImage,
    CacheIndex,
    CacheIndexEntry,
    GalaxyCollection,
    GitHubCollection,
    SkillEntry,
    SkillSource,
    SkillCategory,
    TrustLevel,
    RepoFormat,
    PlaybookConfig,
    PlaybookPlay,
    ProgressEvent,
    ProgressEventType,
    AiAnalyzeData,
    PlaybookRunOptions,
    Disposable,
    CollectionSourcesInput,
    TaskAnalysisInput,
    MetadataDump,
    ParsedCollection,
    MetadataDumpResult,
} from '@ansible/common';

// --- Services ---
export { CollectionsService } from './CollectionsService';
export { CommandService, getCommandService } from './CommandService';
export { CreatorService } from './CreatorService';
export { DevToolsService } from './DevToolsService';
export { EECache } from './EECache';
export {
    cacheSelectedEnvironment,
    getCachedEnvironment,
    getCachedBinDir,
    getCachedToolPath,
    clearCachedEnvironment,
    findExecutableWithCache,
} from './EnvironmentCache';
export { ExecutionEnvService } from './ExecutionEnvService';
export {
    detectEngine,
    listImages,
    inspectImage,
    classifyEE,
    runInContainer,
    deployScripts,
    getScriptCacheDir,
} from './ContainerRuntime';
export { GalaxyCollectionCache } from './GalaxyCollectionCache';
export { GalaxyDocsCache } from './GalaxyDocsCache';
export { GitHubCollectionCache } from './GitHubCollectionCache';
export { SCMDocsCache } from './SCMDocsCache';
export { SkillRegistry, _resetGitHubToken } from './SkillRegistry';
export { discoverPlaybooks } from './PlaybookDiscovery';
export type { DiscoveredPlaybook } from './PlaybookDiscovery';

// VS Code-specific type re-export
export type * from './pythonEnvApi';
