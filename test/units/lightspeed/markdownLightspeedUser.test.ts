import assert from "assert";
import { newGetUserInfoFromMarkdown } from "../../../src/features/lightspeed/markdownLightspeedUser";

describe("Test markdownLightspeedUser", () => {
  it(() => {
    const out = newGetUserInfoFromMarkdown();
    assert.equal(out, "hi");
  });
});
