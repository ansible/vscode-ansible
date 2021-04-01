import * as child_process from 'child_process';
import * as ini from 'ini';
import * as _ from 'lodash';
import { SpawnSyncReturns } from 'node:child_process';
import * as path from 'path';
import { _Connection } from 'vscode-languageserver';

// const exec = promisify(child_process.exec);

export class AnsibleConfig {
  private connection: _Connection;
  private _collection_paths: string[] = [];
  private _module_locations: string[] = [];

  constructor(connection: _Connection) {
    this.connection = connection;
  }

  public async initialize(): Promise<void> {
    try {
      const ansibleConfigResult = child_process.execSync(
        'ansible-config dump',
        {
          encoding: 'utf-8',
        }
      );
      let config = ini.parse(ansibleConfigResult);
      config = _.mapKeys(
        config,
        (_, key) => key.substring(0, key.indexOf('(')) // remove config source in parenthesis
      );
      this._collection_paths = parsePythonStringArray(config.COLLECTIONS_PATHS);

      const ansibleVersionResult = child_process.execSync('ansible --version', {
        encoding: 'utf-8',
      });
      const versionInfo = ini.parse(ansibleVersionResult);
      this._module_locations = parsePythonStringArray(
        versionInfo['configured module search path']
      );
      this._module_locations.push(
        path.resolve(versionInfo['ansible python module location'], 'modules')
      );
    } catch (error) {
      this.connection.console.error((error as SpawnSyncReturns<string>).stderr);
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
