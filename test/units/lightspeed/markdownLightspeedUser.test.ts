import assert from "assert";
import { newGetUserInfoFromMarkdown } from "../../../src/features/lightspeed/markdownLightspeedUser";

describe("Test markdownLightspeedUser", () => {
  it("test newGetUserInfoFromMarkdown", () => {
    const out = newGetUserInfoFromMarkdown();
    assert.equal(out, "hi");
  });
});
