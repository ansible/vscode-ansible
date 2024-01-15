require("assert");

import { getModelDetailsString } from "../../../../src/features/lightspeed/utils/uiUtils";
import assert from "assert";

describe("testing Lightspeed Status Bar", () => {
  it("default model, no API call yet", () => {
    const modelName = getModelDetailsString("", undefined);
    assert.equal(modelName, "(Red Hat org default)");
  });

  it("default model, API calls made", () => {
    const modelName = getModelDetailsString("", "defaultModel");
    assert.equal(modelName, "defaultModel (Red Hat org default)");
  });

  it("model override", () => {
    const modelName = getModelDetailsString("modelIdOverride", undefined);
    assert.equal(modelName, "modelIdOverride");
  });
});
