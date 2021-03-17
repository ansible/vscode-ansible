import { promises as fs } from 'fs';
import * as ini from 'ini';
import * as path from 'path';

export class AnsibleConfig {
  private _config_file_locations = ['ansible.cfg'];

  private _collections_paths = [
    '~/.ansible/collections',
    '/usr/share/ansible/collections',
  ];

  public async initialize(workspacePath: string): Promise<void> {
    for (const location of this._config_file_locations) {
      const cfgPath = path.resolve(workspacePath, location);
      if (fileExists(cfgPath)) {
        await this.parseConfig(cfgPath);
        break;
      }
    }
  }

  private async parseConfig(cfgPath: string) {
    const config = ini.parse(await fs.readFile(cfgPath, { encoding: 'utf-8' }));
    const collections_paths = config?.default.collections_paths;
    if (collections_paths && typeof collections_paths === 'string') {
      this._collections_paths = collections_paths.split(':');
    }
  }

  get collections_paths(): string[] {
    return this._collections_paths;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}
