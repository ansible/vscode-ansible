import assert from "assert";
import { JSDOM } from "jsdom";

import { EditableList } from "../../../src/webview/apps/common/editableList";

describe("Test EditableList", () => {
  let dom: JSDOM;
  let domWithEmptyList: JSDOM;
  const SAMPLE_TEXT = `1. Do this
2. Do that
3. Verify them
`;
  const SAMPLE_LIST = ["Do this", "Do that", "Verify them"];

  beforeEach(() => {
    dom = new JSDOM(
      "<!DOCTYPE html>\n" +
        "<body>" +
        '<ol id="editable-list" contentEditable="true">' +
        "<li>Do this</li>" +
        "<li>Do that</li>" +
        "<li>Verify them</li>" +
        "</ol>" +
        "</body>",
    );

    domWithEmptyList = new JSDOM(
      "<!DOCTYPE html>\n" +
        "<body>" +
        '<ol id="editable-list" contentEditable="true">' +
        "<li></li>" +
        "<li></li>" +
        "</ol>" +
        "</body>",
    );
  });

  it("Test stringToList", () => {
    const out = EditableList.stringToList(SAMPLE_TEXT);
    assert.equal(out.length, SAMPLE_LIST.length);
    assert.equal(out[0], SAMPLE_LIST[0]);
    assert.equal(out[1], SAMPLE_LIST[1]);
    assert.equal(out[2], SAMPLE_LIST[2]);
  });

  it("Test stringToList edge cases", () => {
    const out1 = EditableList.stringToList("1.");
    assert.equal(out1.length, 1);
    assert.equal(out1[0], "");

    const out2 = EditableList.stringToList("");
    assert.equal(out2.length, 1);
    assert.equal(out2[0], "");
  });

  it("Test listToString", () => {
    const out = EditableList.listToString(SAMPLE_LIST);
    assert.equal(out, SAMPLE_TEXT);
  });

  it("Test isEmpty", () => {
    const nonEmptyEditableList = new EditableList("editable-list", dom.window);
    assert.equal(nonEmptyEditableList.isEmpty(), false);
    const emptyEditableList = new EditableList(
      "editable-list",
      domWithEmptyList.window,
    );
    assert.equal(emptyEditableList.isEmpty(), true);
  });

  it("Test constructor", async () => {
    const element = dom.window.document.getElementById("editable-list");
    assert.ok(element);
    const editableList = new EditableList("editable-list", dom.window);
    assert.ok(editableList);

    let out = editableList.getFromUI();
    assert.equal(out.length, SAMPLE_LIST.length);
    assert.equal(out[0], SAMPLE_LIST[0]);
    assert.equal(out[1], SAMPLE_LIST[1]);
    assert.equal(out[2], SAMPLE_LIST[2]);
    assert.equal(editableList.isChanged(), false);

    editableList.setToUI([
      "No number",
      "    ",
      " Preceding & trailing spaces  ",
    ]);
    out = editableList.getFromUI();
    assert.equal(out.length, 2);
    assert.equal(out[0], "No number");
    assert.equal(out[1], "Preceding & trailing spaces");
    assert.equal(editableList.isChanged(), true);

    editableList.reset();
    assert.equal(editableList.isChanged(), false);
    out = editableList.getFromUI();
    assert.equal(out.length, SAMPLE_LIST.length);
    assert.equal(out[0], SAMPLE_LIST[0]);
    assert.equal(out[1], SAMPLE_LIST[1]);
    assert.equal(out[2], SAMPLE_LIST[2]);

    editableList.setToUI(["No number", " Preceding & trailing spaces  "]);
    out = editableList.getFromUI();
    assert.equal(out.length, 2);
    assert.equal(out[0], "No number");
    assert.equal(out[1], "Preceding & trailing spaces");

    let str = editableList.getSavedValueAsString();
    assert.equal(str, SAMPLE_TEXT);
    editableList.save();
    str = editableList.getSavedValueAsString();
    assert.equal(str, "1. No number\n2. Preceding & trailing spaces\n");

    editableList.setToUI(["1. Line 1", "2. Line 2"]);
    editableList.focus();

    // Verify the cursor is located at the end of the last list item.
    const sel = dom.window.getSelection();
    assert.ok(sel);
    assert.equal(sel?.anchorNode?.textContent, "2. Line 2");
    assert.equal(sel?.anchorOffset, "2. Line 2".length);
  });
});
