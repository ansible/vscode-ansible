import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { promises as fs } from 'fs';


export async function getDoc(filename: string): Promise<TextDocument> {
  const file = await fs.readFile(
    path.resolve('test', 'data', filename),
    {
      encoding: 'utf8',
    }
  );
  return TextDocument.create('uri', 'ansible', 1, file);
}

export function isWindows(): boolean {
  // win32 applies to x64 arch too, is the platform name
  return process.platform === 'win32';
}
