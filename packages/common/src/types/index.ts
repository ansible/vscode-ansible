/**
 * Type barrel — re-exports all shared type definitions.
 */

export type { ParameterSchema, SchemaNode, CreatorStatus } from './creator';
export type {
    CollectionInfo,
    PluginInfo,
    CollectionData,
    PluginOption,
    PluginDoc,
    PluginReturn,
    PluginData,
} from './collections';
export type { BinDirResolver, CommandOptions, ExecResult } from './command';
export type { DevToolPackage } from './devtools';
export type { CachedEnvironment } from './environment';
export type {
    ExecutionEnvironment,
    EEDetails,
    PythonPackageDetail,
    SystemPackageDetail,
} from './execution-env';
export { shortExecutionEnvironmentName } from './execution-env';
export type { ContainerEngine, ContainerImage, InspectedImage } from './container';
export type { CacheIndex, CacheIndexEntry } from './ee-cache';
export type { GalaxyCollection } from './galaxy';
export type { GitHubCollection } from './github';
export type { SkillEntry, SkillSource, SkillCategory, TrustLevel, RepoFormat } from './skills';
export type {
    PlaybookExecutor,
    PlaybookConfig,
    PlaybookPlay,
    ProgressEvent,
    ProgressEventType,
    AiAnalyzeData,
    PlaybookRunOptions,
} from './playbook';
export { TelemetryEvents, buildOutcomeProperties } from './telemetry';
export type { TelemetryEventName, TelemetryResult, TelemetryOutcomeOptions } from './telemetry';
