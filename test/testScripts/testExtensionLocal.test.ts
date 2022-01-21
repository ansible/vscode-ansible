import { testDiagnosticsAnsibleLocal } from './diagnostics/testDiagnosticsAnsibleLocal.test';
import { testHoverLocal } from './hover/testHoverLocal.test';

describe('TEST EXTENSION IN LOCAL ENVIRONMENT', () => {
  testHoverLocal();
  testDiagnosticsAnsibleLocal();
});
