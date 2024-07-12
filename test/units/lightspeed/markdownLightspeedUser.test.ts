import assert from "assert";
import { newGetUserInfoFromMarkdown } from "../../../src/features/lightspeed/markdownLightspeedUser";

describe("Test markdownLightspeedUser", () => {
  it("test newGetUserInfoFromMarkdown", async () => {
    const out = await newGetUserInfoFromMarkdown();
    assert.equal(out, "hi");
  });
});
