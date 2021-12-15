import { resetDefaultSettings } from '../helper';

describe('TEST EXTENSION IN LOCAL ENVIRONMENT', () => {
  after(async () => {
    await resetDefaultSettings();
  });

});
