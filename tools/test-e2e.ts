import * as shell from 'shelljs';

shell.set('-e');
shell.exec('npm run test-compile');
shell.exec('node ./out/client/test/testRunner');
