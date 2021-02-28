import { DocsParser, IDocumentation } from './docsParser';
import * as path from 'path';
export class DocsLibrary {
  builtInModules = new Map<string, IDocumentation>();

  public async initialize(): Promise<void> {
    const ansibleLibPath = '/usr/local/lib/python3.6/dist-packages/ansible';
    const modulesPath = path.join(ansibleLibPath, 'modules');
    const docs = await DocsParser.parseDirectory(modulesPath);
    docs.forEach((doc) => {
      this.builtInModules.set(doc.module, doc);
    });
  }
}

const test = new DocsLibrary();
test.initialize().then(() => {
  console.log(test.builtInModules);
});
