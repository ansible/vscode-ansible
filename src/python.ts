import { Uri, WorkspaceFolder, extensions, Event } from "vscode";

type Environment = EnvironmentPath & {
  /**
   * Carries details about python executable.
   */
  readonly executable: {
    /**
     * Uri of the python interpreter/executable. Carries `undefined` in case an executable does not belong to
     * the environment.
     */
    readonly uri: Uri | undefined;
    /**
     * Bitness if known at this moment.
     */
    readonly bitness: Bitness | undefined;
    /**
     * Value of `sys.prefix` in sys module if known at this moment.
     */
    readonly sysPrefix: string | undefined;
  };
  /**
   * Carries details if it is an environment, otherwise `undefined` in case of global interpreters and others.
   */
  readonly environment:
    | {
        /**
         * Type of the environment.
         */
        readonly type: EnvironmentType;
        /**
         * Name to the environment if any.
         */
        readonly name: string | undefined;
        /**
         * Uri of the environment folder.
         */
        readonly folderUri: Uri;
        /**
         * Any specific workspace folder this environment is created for.
         */
        readonly workspaceFolder: Uri | undefined;
      }
    | undefined;
  /**
   * Carries Python version information known at this moment.
   */
  readonly version: VersionInfo & {
    /**
     * Value of `sys.version` in sys module if known at this moment.
     */
    readonly sysVersion: string | undefined;
  };
  /**
   * Tools/plugins which created the environment or where it came from. First value in array corresponds
   * to the primary tool which manages the environment, which never changes over time.
   *
   * Array is empty if no tool is responsible for creating/managing the environment. Usually the case for
   * global interpreters.
   */
  readonly tools: readonly EnvironmentTools[];
};

/**
 * Derived form of {@link Environment} where certain properties can no longer be `undefined`. Meant to represent an
 * {@link Environment} with complete information.
 */
type ResolvedEnvironment = Environment & {
  /**
   * Carries complete details about python executable.
   */
  readonly executable: {
    /**
     * Uri of the python interpreter/executable. Carries `undefined` in case an executable does not belong to
     * the environment.
     */
    readonly uri: Uri | undefined;
    /**
     * Bitness of the environment.
     */
    readonly bitness: Bitness;
    /**
     * Value of `sys.prefix` in sys module.
     */
    readonly sysPrefix: string;
  };
  /**
   * Carries complete Python version information.
   */
  readonly version: ResolvedVersionInfo & {
    /**
     * Value of `sys.version` in sys module if known at this moment.
     */
    readonly sysVersion: string;
  };
};

type EnvironmentsChangeEvent = {
  readonly env: Environment;
  /**
   * * "add": New environment is added.
   * * "remove": Existing environment in the list is removed.
   * * "update": New information found about existing environment.
   */
  readonly type: "add" | "remove" | "update";
};

type ActiveEnvironmentPathChangeEvent = EnvironmentPath & {
  /**
   * Workspace folder the environment changed for.
   */
  readonly resource: WorkspaceFolder | undefined;
};

/**
 * Uri of a file inside a workspace or workspace folder itself.
 */
type Resource = Uri | WorkspaceFolder;

type EnvironmentPath = {
  /**
   * The ID of the environment.
   */
  readonly id: string;
  /**
   * Path to environment folder or path to python executable that uniquely identifies an environment. Environments
   * lacking a python executable are identified by environment folder paths, whereas other envs can be identified
   * using python executable path.
   */
  readonly path: string;
};

/**
 * Tool/plugin where the environment came from. It can be {@link KnownEnvironmentTools} or custom string which
 * was contributed.
 */
type EnvironmentTools = KnownEnvironmentTools | string;
/**
 * Tools or plugins the Python extension currently has built-in support for. Note this list is expected to shrink
 * once tools have their own separate extensions.
 */
type KnownEnvironmentTools =
  | "Conda"
  | "Pipenv"
  | "Poetry"
  | "VirtualEnv"
  | "Venv"
  | "VirtualEnvWrapper"
  | "Pyenv"
  | "Unknown";

/**
 * Type of the environment. It can be {@link KnownEnvironmentTypes} or custom string which was contributed.
 */
type EnvironmentType = KnownEnvironmentTypes | string;
/**
 * Environment types the Python extension is aware of. Note this list is expected to shrink once tools have their
 * own separate extensions, in which case they're expected to provide the type themselves.
 */
type KnownEnvironmentTypes = "VirtualEnvironment" | "Conda" | "Unknown";

/**
 * Carries bitness for an environment.
 */
type Bitness = "64-bit" | "32-bit" | "Unknown";

/**
 * The possible Python release levels.
 */
type PythonReleaseLevel = "alpha" | "beta" | "candidate" | "final";

/**
 * Release information for a Python version.
 */
type PythonVersionRelease = {
  readonly level: PythonReleaseLevel;
  readonly serial: number;
};

type VersionInfo = {
  readonly major: number | undefined;
  readonly minor: number | undefined;
  readonly micro: number | undefined;
  readonly release: PythonVersionRelease | undefined;
};

type ResolvedVersionInfo = {
  readonly major: number;
  readonly minor: number;
  readonly micro: number;
  readonly release: PythonVersionRelease;
};

export interface IExtensionApi {
  ready: Promise<void>;
  debug: {
    getRemoteLauncherCommand(
      host: string,
      port: number,
      waitUntilDebuggerAttaches: boolean
    ): Promise<string[]>;
    getDebuggerPackagePath(): Promise<string | undefined>;
  };
  environments: {
    getActiveEnvironmentPath(resource?: Resource): EnvironmentPath;
    resolveEnvironment(
      environment: Environment | EnvironmentPath | string
    ): Promise<ResolvedEnvironment | undefined>;
    readonly onDidChangeActiveEnvironmentPath: Event<ActiveEnvironmentPathChangeEvent>;
  };
}

export interface IInterpreterDetails {
  path?: string;
  resource?: Uri;
  environment?: string;
  version?: string;
}

export async function activatePythonExtension() {
  const extension = extensions.getExtension("ms-python.python");
  if (extension) {
    if (!extension.isActive) {
      await extension.activate();
    }
  }
  return extension;
}

async function getPythonExtensionAPI(): Promise<IExtensionApi | undefined> {
  const extension = await activatePythonExtension();
  return extension?.exports as IExtensionApi;
}

export async function getInterpreterDetails(
  resource?: Uri
): Promise<IInterpreterDetails> {
  const api = await getPythonExtensionAPI();
  const environment = await api?.environments.resolveEnvironment(
    api?.environments.getActiveEnvironmentPath(resource)
  );
  if (environment?.executable.uri && checkVersion(environment)) {
    return {
      path: environment?.executable.uri.fsPath,
      resource,
      environment: environment.environment?.name,
      version: `${environment.version.major}.${environment.version.minor}.${environment.version.micro}`,
    };
  }
  return {
    path: undefined,
    resource,
    environment: undefined,
    version: undefined,
  };
}

export function checkVersion(
  resolved: ResolvedEnvironment | undefined
): boolean {
  const version = resolved?.version;
  if (version?.major === 3 && version?.minor >= 7) {
    return true;
  }
  console.log(
    `Python version ${version?.major}.${version?.minor} is not supported.`
  );
  console.log(`Selected python path: ${resolved?.executable.uri?.fsPath}`);
  console.log("Supported versions are 3.7 and above.");
  return false;
}
