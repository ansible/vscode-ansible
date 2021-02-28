import { DocsParser, IDocumentation } from './docsExplorer';
import * as path from 'path';
export class DocsLibrary {
  builtInModules = new Map<string, IDocumentation>();

  public initialize(): void {
    const ansibleLibPath = '/usr/local/lib/python3.6/dist-packages/ansible';
    const modulesPath = path.join(ansibleLibPath, 'modules');
    DocsParser.parseDirectory(modulesPath).then((docs) => {
      docs.forEach((doc) => {
        this.builtInModules.set(doc.module, doc);
      });
    });
  }
}
