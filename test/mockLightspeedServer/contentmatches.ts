// spell-checker:ignore fuchscs narsingdev buluma
const RESPONSE_DATA = {
  contentmatches: [
    {
      contentmatch: [
        {
          repo_name: "fuchscs.ansible_bible",
          repo_url:
            "https://galaxy.ansible.com/ui/standalone/roles/fuchscs/ansible_bible",
          path: "roles/copy/tasks/main.yml",
          license: "GPL",
          data_source_description: "Ansible Galaxy roles",
          score: 0.92848563,
        },
        {
          repo_name: "narsingdev.apache_role",
          repo_url:
            "https://galaxy.ansible.com/ui/standalone/roles/narsingdev/apache_role",
          path: "tasks/main.yml",
          license: "GPL",
          data_source_description: "Ansible Galaxy roles",
          score: 0.9281237,
        },
        {
          repo_name: "buluma.maintenance",
          repo_url:
            "https://galaxy.ansible.com/ui/standalone/roles/buluma/maintenance",
          path: "molecule/default/prepare.yml",
          license: "apache-2.0",
          data_source_description: "Ansible Galaxy roles",
          score: 0.92681503,
        },
      ],
    },
  ],
};

const NO_MATCHES = {
  contentmatches: [
    {
      contentmatch: [],
    },
  ],
};

export function contentmatches(_req: {
  body: { model: string; suggestions: [string]; suggestionId?: string };
}) {
  // const model = _req.body.model;
  const suggestions = _req.body.suggestions;
  // const suggestionId = _req.body.suggestionId;
  return suggestions[0].indexOf("ansible.builtin.file") !== -1
    ? RESPONSE_DATA
    : NO_MATCHES;
}
