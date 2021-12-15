import { resetDefaultSettings } from '../helper';
import { testHoverLocal } from './hover/testHoverLocal.test';

describe('TEST EXTENSION IN LOCAL ENVIRONMENT', () => {
  after(async () => {
    await resetDefaultSettings();
  });

  testHoverLocal();
});
