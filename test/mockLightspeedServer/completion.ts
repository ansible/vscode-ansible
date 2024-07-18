import { v4 as uuidv4 } from "uuid";
import { options, permissionDeniedCanApplyForTrial } from "./server";

// Default model ID
const DEFAULT_MODEL_ID = "ABCD-1234-5678";

//
// Pre-defined predictions to be returned.
// 1. Each element is an array with two strings.
// 2. The first element is the default prediction results.
// 3. In the following elements:
//    - The first element of the array specifies a keyword (in lowercase)
//    - The second element of the array specifies the prediction results.
//    - If the keyword is found in the (lowercased) prompt, the prediction results
//      will be used in the response from the completions API.
//
const PREDICTIONS = [
  // prettier-ignore
  ["", // Default prediction result
`      ansible.builtin.package:
        name: openssh-server
        state: present
`],
  // prettier-ignore
  ["print",
`      ansible.builtin.debug:
        msg: Hello World
`],
  // prettier-ignore
  ["file",
`      ansible.builtin.file:
        path: ~/foo.txt
        state: touch
`],
  // prettier-ignore
  ["podman",
`      containers.podman.podman_container:
        name: "{{ foo_app.name }}"
        image: "{{ foo_app.image }}"
        state: "{{ foo_app.state }}"
        env: "{{ foo_app.env }}"
        pod: "{{ _pod_ }}"
        network:
          - hostname: foo
            ports:
              - 8065:8065
        generate_systemd: "{{ foo_app.generate_systemd }}"
        ports: "{{ foo_app.ports }}"
        `],
  // prettier-ignore
  ["&",
`    - name: Install vim
        ansible.builtin.package:
          name: vim
          state: present

      - name: Install python3
        ansible.builtin.package:
          name: python3
          state: present

      - name: Debug OS version
        ansible.builtin.debug:
          msg: "{{ ansible_distribution }} {{ ansible_distribution_major_version }}"
    `],
];

export function completions(
  req: { body: { model: string; prompt: string; suggestionId?: string } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  // If the prompt contains "status=nnn" (like "status=204"), return the specified
  // status code.
  const index = req.body.prompt.search(/status=\d\d\d/);
  if (index !== -1) {
    const status = parseInt(req.body.prompt.substring(index + 7, index + 10));
    return res.status(status).send();
  }

  if (options.oneClick) {
    return res.status(403).json(permissionDeniedCanApplyForTrial());
  }

  const model = req.body.model ? req.body.model : DEFAULT_MODEL_ID;
  const prompt = req.body.prompt.toLowerCase();
  const suggestionId = req.body.suggestionId ? req.body.suggestionId : uuidv4();

  let predictions = [PREDICTIONS[0][1]];
  PREDICTIONS.slice(1).forEach((element) => {
    if (prompt.includes(element[0])) {
      predictions = [element[1]];
    }
  });

  return res.send({
    predictions,
    model,
    suggestionId,
  });
}
