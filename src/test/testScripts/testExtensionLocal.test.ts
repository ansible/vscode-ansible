import { testDiagnosticsAnsibleLocal } from './diagnostics/testDiagnosticsAnsibleLocal.test';
import { testDiagnosticsYAMLLocal } from './diagnostics/testDiagnosticsYAMLLocal.test';
import { testHoverLocal } from './hover/testHoverLocal.test';

describe('TEST EXTENSION IN LOCAL ENVIRONMENT', () => {
  testHoverLocal();
  testDiagnosticsAnsibleLocal();
  testDiagnosticsYAMLLocal();
});
