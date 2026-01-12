import * as fs from "fs";
import * as path from "path";
import { PROJECT_ROOT } from "./setup";

/**
 * Ensures that the specified settings are present in the user settings file.
 * Reads the existing settings, merges the provided settings, and writes them back.
 * @param settings - A dictionary of setting keys to values (both strings)
 */
function ensureSettings(settings: Record<string, string | boolean>): void {
  const targetPath = path.join(
    PROJECT_ROOT,
    "out/test-resources/settings/User/settings.json",
  );

  // Ensure directory exists
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });

  // Read existing settings or use empty object
  let currentSettings: Record<string, unknown> = {};
  if (fs.existsSync(targetPath)) {
    try {
      const content = fs.readFileSync(targetPath, "utf-8");
      currentSettings = JSON.parse(content);
    } catch (err) {
      console.warn(
        `Failed to parse existing settings file at ${targetPath}: ${err}`,
      );
    }
  }

  // Track changed keys and merge provided settings into current settings
  const changedKeys: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const currentValue = currentSettings[key];
    if (currentValue !== value) {
      changedKeys.push(key);
      currentSettings[key] = value;
    }
  }

  // Only write if there are changes
  if (changedKeys.length > 0) {
    // Log changed keys
    console.log(
      `Settings changed (${changedKeys.length} key(s)): ${changedKeys.join(", ")}`,
    );
    // Write updated settings back
    fs.writeFileSync(targetPath, JSON.stringify(currentSettings, null, 2));
  }
}

export function enableLightspeed(enabled: boolean = true): void {
  const settings: Record<string, string | boolean> = {
    "ansible.lightspeed.enabled": enabled,
    "ansible.lightspeed.suggestions.enabled": enabled,
  };
  // Replace URL if TEST_LIGHTSPEED_URL is set
  if (process.env.TEST_LIGHTSPEED_URL) {
    settings["ansible.lightspeed.apiEndpoint"] =
      process.env.TEST_LIGHTSPEED_URL.replace(/\/$/, "");
  }
  ensureSettings(settings);
}
