import path from "path";
import fs from "fs";

export async function setup() {
  // Isolate HOME for extension unit tests to prevent writing to user's home directory
  const testHome = path.resolve(__dirname, "../../out/unit/tmp/home");
  fs.mkdirSync(testHome, { recursive: true });
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome; // Windows uses USERPROFILE instead of HOME
}

export async function teardown() {
  // Cleanup if needed in the future
}
