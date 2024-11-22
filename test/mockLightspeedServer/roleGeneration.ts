import { v4 as uuidv4 } from "uuid";
import { logger } from "./server";

export function roleGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  const text = req.body.text;
  const createOutline = req.body.createOutline;
  const generationId = req.body.generationId ? req.body.generationId : uuidv4();
  const wizardId = req.body.wizardId;
  logger.info(`text: ${text}`);
  logger.info(`outline: ${req.body.outline}`);
  logger.info(`wizardId: ${wizardId}`);

  // cSpell: disable
  const outline: string = `1. Install the Nginx packages
2. Start the service`;

  const tasksFile = `- name: Install the Nginx packages
  ansible.builtin.package:
    name: "{{ install_nginx_packages }}"
    state: present
  become: true
- name: Start the service
  ansible.builtin.service:
    name: nginx
    enabled: true
    state: started
    become: true
`;

  const defaultsFile = `install_nginx_packages:
  - nginx
`;
  const files = [
    {
      path: "tasks/main.yml",
      file_type: "task",
      content: tasksFile,
    },

    {
      path: "defaults/main.yml",
      file_type: "default",
      content: defaultsFile,
    },
  ];

  return res.send({
    files,
    outline: createOutline ? outline : "",
    generationId,
  });
}
