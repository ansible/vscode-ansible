import { promises as fs } from 'fs';
import * as ini from 'ini';
import * as path from 'path';
import * as _ from 'lodash';
import * as child_process from 'child_process';
import { promisify } from 'node:util';
import { _Connection } from 'vscode-languageserver';
import { SpawnSyncReturns } from 'node:child_process';

// const exec = promisify(child_process.exec);

export class AnsibleConfig {
  private _connection: _Connection;
  private _collection_paths: string[] = [];
  private _module_locations: string[] = [];

  constructor(connection: _Connection) {
    this._connection = connection;
  }

  public async initialize(workspacePath?: string): Promise<void> {
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
      this._connection.console.error(
        (error as SpawnSyncReturns<string>).stderr
      );
    }
    // for (const location of this._config_file_locations) {
    //   const cfgPath = path.resolve(workspacePath, location);
    //   if (fileExists(cfgPath)) {
    //     await this.parseConfig(cfgPath);
    //     break;
    //   }
    // }
  }

  // private async parseConfig(cfgPath: string) {
  //   const config = ini.parse(await fs.readFile(cfgPath, { encoding: 'utf-8' }));
  //   const collections_paths = config?.default.collections_paths;
  //   if (collections_paths && typeof collections_paths === 'string') {
  //     this._collections_paths = collections_paths.split(':');
  //   }
  // }

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

async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}
