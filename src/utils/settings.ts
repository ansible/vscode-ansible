import { MetadataManager } from "../features/ansibleMetaData";
import { LightSpeedManager } from "../features/lightspeed/base";
import { SettingsManager } from "../settings";

export function updateConfigurationChanges(
  metaData: MetadataManager,
  extSettings: SettingsManager,
  lightSpeedManager: LightSpeedManager
): void {
  extSettings.reinitialize();
  metaData.updateAnsibleInfoInStatusbar();
  lightSpeedManager.reInitialize();
}
