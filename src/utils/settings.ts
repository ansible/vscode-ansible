import { MetadataManager } from "../features/ansibleMetaData";
import { LightSpeedManager } from "../features/lightspeed/base";
import { SettingsManager } from "../settings";

export async function updateConfigurationChanges(
  metaData: MetadataManager,
  extSettings: SettingsManager,
  lightSpeedManager: LightSpeedManager
): Promise<void> {
  await metaData.updateAnsibleInfoInStatusbar();
  lightSpeedManager.reInitialize();
}
