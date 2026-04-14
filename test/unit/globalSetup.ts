import path from "path";
import fs from "fs";

export async function setup() {
  // Use shared HOME for all tests to prevent writing to user's home directory
  const sharedHome = path.resolve(__dirname, "../../out/home");
  const ansibleHome = path.resolve(__dirname, "../../out/.ansible");

  fs.mkdirSync(sharedHome, { recursive: true });
  fs.mkdirSync(ansibleHome, { recursive: true });

  process.env.HOME = sharedHome;
  process.env.USERPROFILE = sharedHome; // Windows uses USERPROFILE instead of HOME
  process.env.ANSIBLE_HOME = ansibleHome;
}

export async function teardown() {
  // Cleanup if needed in the future
}
