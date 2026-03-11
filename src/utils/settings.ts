import { MetadataManager } from "@src/features/ansibleMetaData";
import { LightSpeedManager } from "@src/features/lightspeed/base";
import { PythonInterpreterManager } from "@src/features/pythonMetadata";
import { SettingsManager } from "@src/settings";

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
  lightSpeedManager.lightspeedExplorerProvider?.refreshWebView();
}
