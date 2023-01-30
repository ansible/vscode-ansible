import { MetadataManager } from "../features/ansibleMetaData";
import { WisdomManager } from "../features/wisdom/base";
import { SettingsManager } from "../settings";

export function updateConfigurationChanges(
  metaData: MetadataManager,
  extSettings: SettingsManager,
  wisdomManager: WisdomManager
): void {
  extSettings.reinitialize();
  metaData.updateAnsibleInfoInStatusbar();
  wisdomManager.reInitialize();
}
