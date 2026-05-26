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
export type { CommandOptions, ExecResult } from './services/CommandService';

export { CreatorService } from './services/CreatorService';
export type { ParameterSchema, SchemaNode } from './services/CreatorService';

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
export type { ExecutionEnvironment, EEDetails } from './services/ExecutionEnvService';

export { GalaxyCollectionCache } from './services/GalaxyCollectionCache';
export type { GalaxyCollection } from './services/GalaxyCollectionCache';

export { GitHubCollectionCache } from './services/GitHubCollectionCache';
export type { GitHubCollection } from './services/GitHubCollectionCache';

export { setLogFunction, log, getLogFunction } from './utils/logging';
export { SimpleEventEmitter } from './utils/SimpleEventEmitter';
export type { Disposable } from './utils/SimpleEventEmitter';

export type * from './types/pythonEnvApi';
