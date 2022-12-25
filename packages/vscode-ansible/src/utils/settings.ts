import { MetadataManager } from "../features/ansibleMetaData";
import { SettingsManager } from "../settings";

export function updateConfigurationChanges(
  metaData: MetadataManager,
  extSettings: SettingsManager
): void {
  metaData.updateAnsibleInfoInStatusbar();
  extSettings.reinitialize();
}
