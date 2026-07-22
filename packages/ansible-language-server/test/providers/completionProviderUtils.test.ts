import { expect } from "vitest";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getVarsCompletion } from "@src/providers/completionProviderUtils.js";
import { getPathAt, parseAllDocuments } from "@src/utils/yaml.js";
import { resolveDocUri } from "@test/helper.js";

describe("getVarsCompletion()", () => {
  it("reads vars from an absolute vars_files path", () => {
    const varsFileAbs = resolveDocUri("completion/default_vars.yml");
    const playbookDir = path.dirname(
      resolveDocUri("completion/playbook_with_vars.yml"),
    );
    const playbookPath = path.join(playbookDir, "absolute_vars_files.yml");

    const content = `---
- name: Absolute vars_files play
  hosts: localhost
  vars_files:
    - ${varsFileAbs}
  tasks:
    - name: Use var
      ansible.builtin.debug:
        msg: "{{  }}"
`;

    const document = TextDocument.create(playbookPath, "ansible", 1, content);
    const yamlDocs = parseAllDocuments(document.getText());
    // Cursor inside the jinja brackets on the msg line
    const lines = content.split("\n");
    const msgLineIndex = lines.findIndex((l) => l.includes('msg: "{{'));
    const msgLine = lines[msgLineIndex];
    expect(msgLineIndex).toBeGreaterThanOrEqual(0);
    expect(msgLine).toBeDefined();
    if (!msgLine) {
      return;
    }
    const position = {
      line: msgLineIndex,
      character: msgLine.indexOf("{{") + 3,
    };
    const pathNodes = getPathAt(document, position, yamlDocs);
    expect(pathNodes).toBeTruthy();
    if (!pathNodes) {
      return;
    }

    const completions = getVarsCompletion(document.uri, pathNodes);
    const labels = completions.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "default_var_1",
        "default_var_2",
        "default_var_3",
      ]),
    );
  });
});
