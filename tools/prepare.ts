import * as shell from 'shelljs';

shell.set('+e'); // ignore errors
shell.exec('git config --unset core.hooksPath');
shell.exec('rimraf .husky');
