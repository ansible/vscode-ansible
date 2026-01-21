import * as fs from "fs";
import * as path from "path";
import { PROJECT_ROOT } from "./setup";

const userSettingsPath = path.join(
  PROJECT_ROOT,
  "out/test-resources/settings/User/settings.json",
);
const originalSettingsPath = path.join(
  PROJECT_ROOT,
  "test/testFixtures/settings.json",
);
/**
 * Ensures that the specified settings are present in the user settings file.
 * Reads the existing settings, merges the provided settings, and writes them back.
 * @param settings - A dictionary of setting keys to values (both strings)
 */
function ensureSettings(settings: Record<string, string | boolean>): void {
  // Ensure directory exists
  const dir = path.dirname(userSettingsPath);
  fs.mkdirSync(dir, { recursive: true });

  // Read existing settings or use empty object
  let currentSettings: Record<string, unknown> = {};
  if (fs.existsSync(userSettingsPath)) {
    try {
      const content = fs.readFileSync(userSettingsPath, "utf-8");
      currentSettings = JSON.parse(content);
    } catch (err) {
      console.warn(
        `Failed to parse existing settings file at ${userSettingsPath}: ${err}`,
      );
    }
  }

  // Track changed keys and merge provided settings into current settings
  const changedSettings: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    const currentValue = currentSettings[key];
    if (currentValue !== value) {
      changedSettings[key] = value;
      currentSettings[key] = value;
      console.log(`Setting ${key} to ${value}`);
    }
  }

  // Only write if there are changes
  if (Object.keys(changedSettings).length === 0) {
    console.log(`No changes to ${userSettingsPath}`);
    return;
  }
  console.log(
    `Updating ${userSettingsPath} with: ${JSON.stringify(changedSettings)}`,
  );
  // Write updated settings back
  fs.writeFileSync(userSettingsPath, JSON.stringify(currentSettings, null, 2));
}

export function resetSettings(): void {
  const settings = JSON.parse(fs.readFileSync(originalSettingsPath, "utf-8"));
  ensureSettings(settings);
}
