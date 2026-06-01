import path from "path";
import fs from "fs";

export async function setup() {
  const sharedHome = path.resolve(import.meta.dirname, "../../out/home");
  const ansibleHome = path.resolve(import.meta.dirname, "../../out/.ansible");

  fs.mkdirSync(sharedHome, { recursive: true });
  fs.mkdirSync(ansibleHome, { recursive: true });

  process.env.HOME = sharedHome;
  process.env.USERPROFILE = sharedHome;
  process.env.ANSIBLE_HOME = ansibleHome;
}

export function teardown() {
  // no-op
}
