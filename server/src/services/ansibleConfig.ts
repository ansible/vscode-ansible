import * as child_process from 'child_process';
import * as ini from 'ini';
import * as _ from 'lodash';
import * as path from 'path';
import { URL } from 'url';
import { Connection } from 'vscode-languageserver';
import { withInterpreter } from '../utils/misc';
import { WorkspaceFolderContext } from './workspaceManager';

export class AnsibleConfig {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _collection_paths: string[] = [];
  private _module_locations: string[] = [];

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize(): Promise<void> {
    try {
      const settings = await this.context.documentSettings.get(
        this.context.workspaceFolder.uri
      );

      const [ansibleConfigCommand, ansibleConfigEnv] = withInterpreter(
        `${settings.ansible.path}-config`,
        'dump',
        settings.python.interpreterPath,
        settings.python.activationScript
      );

      const ansibleConfigResult = child_process.execSync(ansibleConfigCommand, {
        encoding: 'utf-8',
        cwd: new URL(this.context.workspaceFolder.uri).pathname,
        env: ansibleConfigEnv,
      });

      let config = ini.parse(ansibleConfigResult);
      config = _.mapKeys(
        config,
        (_, key) => key.substring(0, key.indexOf('(')) // remove config source in parenthesis
      );
      this._collection_paths = parsePythonStringArray(config.COLLECTIONS_PATHS);

      const [ansibleCommand, ansibleEnv] = withInterpreter(
        `${settings.ansible.path}`,
        '--version',
        settings.python.interpreterPath,
        settings.python.activationScript
      );

      const ansibleVersionResult = child_process.execSync(ansibleCommand, {
        encoding: 'utf-8',
        env: ansibleEnv,
      });

      const versionInfo = ini.parse(ansibleVersionResult);
      this._module_locations = parsePythonStringArray(
        versionInfo['configured module search path']
      );
      this._module_locations.push(
        path.resolve(versionInfo['ansible python module location'], 'modules')
      );
    } catch (error) {
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      } else {
        this.connection.console.error(
          `Exception in AnsibleConfig service: ${JSON.stringify(error)}`
        );
      }
    }
  }

  get collections_paths(): string[] {
    return this._collection_paths;
  }

  get module_locations(): string[] {
    return this._module_locations;
  }
}

function parsePythonStringArray(array: string) {
  array = array.slice(1, array.length - 1); // remove []
  const quoted_elements = array.split(',').map((e) => e.trim());
  return quoted_elements.map((e) => e.slice(1, e.length - 1));
}
