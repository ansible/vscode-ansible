/* eslint-disable @typescript-eslint/no-namespace */

export const ANSIBLE_EXTENSION_REPOSITORY_URL =
  "https://github.com/ansible/vscode-ansible";

export namespace AnsibleCommands {
  export const ANSIBLE_VAULT = "extension.ansible.vault";
  export const ANSIBLE_INVENTORY_RESYNC = "extension.resync-ansible-inventory";
  export const ANSIBLE_PLAYBOOK_RUN = "extension.ansible-playbook.run";
  export const ANSIBLE_NAVIGATOR_RUN = "extension.ansible-navigator.run";
  export const ANSIBLE_PYTHON_SET_INTERPRETER =
    "ansible.python.set.interpreter";
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LightSpeedCommands {
  export const LIGHTSPEED_AUTH_REQUEST = "ansible.lightspeed.oauth";
  export const LIGHTSPEED_SUGGESTION_COMMIT =
    "ansible.lightspeed.inlineSuggest.accept";
  export const LIGHTSPEED_SUGGESTION_HIDE =
    "ansible.lightspeed.inlineSuggest.hide";
  export const LIGHTSPEED_SUGGESTION_TRIGGER =
    "ansible.lightspeed.inlineSuggest.trigger";
  export const LIGHTSPEED_STATUS_BAR_CLICK =
    "ansible.lightspeed.statusBar.click";
  export const LIGHTSPEED_FETCH_TRAINING_MATCHES =
    "ansible.lightspeed.fetchTrainingMatches";
  export const LIGHTSPEED_CLEAR_TRAINING_MATCHES =
    "ansible.lightspeed.clearTrainingMatches";
  export const LIGHTSPEED_FEEDBACK = "ansible.lightspeed.feedback";
}

export const LIGHTSPEED_API_VERSION = "v0";
export const LIGHTSPEED_SUGGESTION_COMPLETION_URL = `${LIGHTSPEED_API_VERSION}/ai/completions/`;
export const LIGHTSPEED_SUGGESTION_FEEDBACK_URL = `${LIGHTSPEED_API_VERSION}/ai/feedback/`;
export const LIGHTSPEED_SUGGESTION_ATTRIBUTIONS_URL = `${LIGHTSPEED_API_VERSION}/ai/attributions/`;
export const LIGHTSPEED_ME_AUTH_URL = `/api/${LIGHTSPEED_API_VERSION}/me/`;

export const LIGHTSPEED_FEEDBACK_FORM_URL =
  "https://red.ht/ansible-ai-feedback";
export const LIGHTSPEED_REPORT_EMAIL_ADDRESS = "ansible-content-ai@redhat.com";
export const LIGHTSPEED_STATUS_BAR_CLICK_HANDLER =
  "ansible.lightspeed.statusBar.clickHandler";

export const LIGHTSPEED_CLIENT_ID = "Vu2gClkeR5qUJTUGHoFAePmBznd6RZjDdy5FW2wy";
export const LIGHTSPEED_SERVICE_LOGIN_TIMEOUT = 120000;
