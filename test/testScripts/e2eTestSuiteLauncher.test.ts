import { updateSettings } from '../helper';
import { testDiagnosticsAnsibleLocal } from './diagnostics/testDiagnosticsAnsibleLocal.test';
import { testDiagnosticsYAMLLocal } from './diagnostics/testDiagnosticsYAMLLocal.test';
import { testHoverEE } from './hover/testHoverEE.test';
import { testHoverLocal } from './hover/testHoverLocal.test';

describe('END-TO-END TEST SUITE FOR REDHAT.ANSIBLE EXTENSION', () => {
  describe('TEST EXTENSION IN LOCAL ENVIRONMENT', () => {
    testHoverLocal();
    testDiagnosticsAnsibleLocal();
    testDiagnosticsYAMLLocal();
  });

  describe('TEST EXTENSION IN EXECUTION ENVIRONMENT', () => {
    before(async () => {
      await updateSettings('executionEnvironment.enabled', true);
      await updateSettings('executionEnvironment.containerEngine', 'docker');
    });

    after(async () => {
      await updateSettings('executionEnvironment.enabled', false); // Revert back the default setting
      await updateSettings('executionEnvironment.containerEngine', 'auto');
    });

    testHoverEE();
  });
});
