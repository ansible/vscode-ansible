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
    TelemetryEventName,
    TelemetryResult,
    TelemetryOutcomeOptions,
} from './types';
export { TelemetryEvents, buildOutcomeProperties } from './types';

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
export { stripFrontmatter } from './utils/skillHelpers';
export { BUILTIN_SKILLS } from './skills';

// --- Parsers ---
export {
    buildPlaybookCommand,
    parsePlaybook,
    mergePlaybookConfig,
    DEFAULT_PLAYBOOK_CONFIG,
} from './parsers/playbookParser';
export { extractMetadataJson, parseMetadataDump } from './parsers/metadataDumpParser';
export type {
    MetadataDump,
    ParsedCollection,
    MetadataDumpResult,
} from './parsers/metadataDumpParser';

// --- AI Prompt Builders ---
export {
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
} from './prompts';
export type { CollectionSourcesInput, TaskAnalysisInput } from './prompts';
