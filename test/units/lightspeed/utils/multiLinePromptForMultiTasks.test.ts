import assert from "assert";
import {
  shouldRequestForPromptPosition,
  getContentWithMultiLinePromptForMultiTasksSuggestions,
} from "../../../../src/features/lightspeed/utils/multiLinePromptForMultiTasks";

describe("Test getContentWithMultiLinePromptForMultiTasksSuggestions", () => {
  const testsData = [
    {
      name: "should parse and generate new prompt for playbook",
      promptContent: `---
- name: Testing playbook
hosts: all
tasks:
  # Create a key-pair called lightspeed-key-pair &
  # create a vpc & create vpc_id var &
  # create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr &
  # create an internet gateway & create a route table`,
      expectedContent: `---
- name: Testing playbook
hosts: all
tasks:
  # -
  # -
  # -
  # Create a key-pair called lightspeed-key-pair & create a vpc & create vpc_id var & create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr & create an internet gateway & create a route table`,
      promptChanges: true,
    },
    {
      name: "should parse and generate new prompt for tasks",
      promptContent: `---
# Install postgresql server &
# Do the initial postgresql server config &
# Start the postgresql service &
# Allow the firewall traffic`,
      expectedContent: `---
# -
# -
# -
# Install postgresql server & Do the initial postgresql server config & Start the postgresql service & Allow the firewall traffic`,
      promptChanges: true,
    },
    {
      name: "should not include lines in new prompt when previous comment does not end with '&'",
      promptContent: `---\n# A &\n# B\n# C &\n# D`,
      expectedContent: `---\n# A &\n# B\n# -\n# C & D`,
      promptChanges: true,
    },
    {
      name: "should not include empty comments lines in the new prompt",
      promptContent: `---\n# A &\n#     &\n# B`,
      expectedContent: `---\n# -\n# -\n# A & B`,
      promptChanges: true,
    },
    {
      name: "should not make changes to prompt when the latest previous comment does not end with '&'",
      promptContent: `---\n# A &\n# B\n# C`,
      promptChanges: false,
    },
    {
      name: "should not make changes to prompt when the latest previous comment does not start with '# '",
      promptContent: `---\n#C &\n## A &\n# B`,
      promptChanges: false,
    },
    {
      name: "should not include lines in new prompt when previous line comment does not start with '# '",
      promptContent: `---\n#C &\n## A &\n# B &\n# D`,
      expectedContent: `---\n#C &\n## A &\n# -\n# B & D`,
      promptChanges: true,
    },
    {
      name: "should not include lines in new prompt when previous line comment does not have the same indentation",
      promptContent: `---\n#A &\n  # B &\n# C &\n# D`,
      expectedContent: `---\n#A &\n  # B &\n# -\n# C & D`,
      promptChanges: true,
    },
    {
      name: "should not generate new prompt when prompt line does not start with '# '",
      promptContent: `---# A &\nB`,
      expectedContent: `---# A &\nB`,
      promptChanges: false,
    },
    {
      name: "should not generate new prompt when prompt line ends with '&'",
      promptContent: `---# A &\n# B &\n# C &`,
      promptChanges: false,
    },
  ];

  testsData.forEach(
    ({ name, promptContent, promptChanges, expectedContent }) => {
      it(name, () => {
        const newContent =
          getContentWithMultiLinePromptForMultiTasksSuggestions(promptContent);
        if (promptChanges) {
          assert.equal(newContent, expectedContent);
        } else {
          assert.equal(newContent, promptContent);
        }
      });
    },
  );
});

describe("Test shouldRequestForPromptPosition", () => {
  it("should not make request when prompt line start with '# ' and end with ' &' for tasks", () => {
    const promptContent = `---
# Create a key-pair called lightspeed-key-pair &
# create a vpc & create vpc_id var &
# create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr &
# create an internet gateway & create a route table &`;
    const shouldRequest = shouldRequestForPromptPosition(promptContent, 5);
    assert.equal(shouldRequest, false);
  });

  it("should not make request when prompt line start with '# ' and end with ' &' for playbook", () => {
    const promptContent = `---
- name: Testing playbook
  hosts: all
  tasks:
    # Create a key-pair called lightspeed-key-pair &
    # create a vpc & create vpc_id var &
    # create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr &
    # create an internet gateway & create a route table &`;
    const shouldRequest = shouldRequestForPromptPosition(promptContent, 8);
    assert.equal(shouldRequest, false);
  });

  it("should allow request when prompt line start with '# ' and does not end with ' &' for tasks", () => {
    const promptContent = `---
# Create a key-pair called lightspeed-key-pair &
# create a vpc & create vpc_id var &
# create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr &
# create an internet gateway & create a route table`;
    const shouldRequest = shouldRequestForPromptPosition(promptContent, 5);
    assert.equal(shouldRequest, true);
  });

  it("should allow request when prompt line start with '# ' and does not end with ' &' for playbook", () => {
    const promptContent = `---
- name: Testing playbook
  hosts: all
  tasks:
    # Create a key-pair called lightspeed-key-pair &
    # create a vpc & create vpc_id var &
    # create a security group that allows SSH & create subnet with 10.0.1.0/24 cidr &
    # create an internet gateway & create a route table`;
    const shouldRequest = shouldRequestForPromptPosition(promptContent, 8);
    assert.equal(shouldRequest, true);
  });
});
