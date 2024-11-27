import assert from "assert";
import { codeToHtml } from "../../../../src/features/lightspeed/utils/codeToHtml";

const myRoleExample = `
- hosts: localhost
  tasks:
    - name: Install emacs
      package:
        name: emacs
        state: present
      become: true
`;

describe("Validate codeToHtml() in light mode", () => {
  it("It should return a HTML string", async () => {
    const html = await codeToHtml(myRoleExample, false);
    assert.ok(html.includes("</span>"));
  });
  it("It should have the light-plus CSS class", async () => {
    const html = await codeToHtml(myRoleExample, false);
    assert.ok(html.includes("light-plus"));
  });
});
describe("Validate codeToHtml() in dark mode", () => {
  it("It should have the dark-plus CSS class", async () => {
    const html = await codeToHtml(myRoleExample, true);
    assert.ok(html.includes("dark-plus"));
  });
});
