import { MetadataManager } from "../features/ansibleMetaData";
import { LightSpeedManager } from "../features/lightspeed/base";
import { PythonInterpreterManager } from "../features/pythonMetadata";
import { SettingsManager } from "../settings";

export async function updateConfigurationChanges(
  metaData: MetadataManager,
  pythonInterpreter: PythonInterpreterManager,
  extSettings: SettingsManager,
  lightSpeedManager: LightSpeedManager,
): Promise<void> {
  await extSettings.reinitialize();
  await metaData.updateAnsibleInfoInStatusbar();
  await lightSpeedManager.reInitialize();
  await pythonInterpreter.updatePythonInfoInStatusbar();
  // Refresh LLM provider when settings change (API key, model, etc.)
  await lightSpeedManager.providerManager.refreshProviders();
}
