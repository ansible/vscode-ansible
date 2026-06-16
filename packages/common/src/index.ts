/**
 * @ansible/common — browser-safe foundation: types, prompts, utils, parsers.
 * Zero Node.js builtins. Safe to import in any JavaScript environment.
 */

// --- Types ---
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
} from './types';

// --- Utils ---
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

// --- Parsers ---
export {
    buildPlaybookCommand,
    parsePlaybook,
    mergePlaybookConfig,
    DEFAULT_PLAYBOOK_CONFIG,
} from './parsers/playbookParser';

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
