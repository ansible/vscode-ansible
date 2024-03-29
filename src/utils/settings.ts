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
  await metaData.updateAnsibleInfoInStatusbar();
  await lightSpeedManager.reInitialize();
  await pythonInterpreter.updatePythonInfoInStatusbar();

  await extSettings.reinitialize();
}
