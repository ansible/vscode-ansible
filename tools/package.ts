import * as shell from 'shelljs';

shell.set('-e');
shell.exec('rimraf *.vsix');
shell.exec('npm run compile');
shell.exec('vsce package');
shell.exec('vsce ls');
