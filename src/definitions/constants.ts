/* eslint-disable @typescript-eslint/no-namespace */
export namespace AnsibleCommands {
  export const ANSIBLE_VAULT = "extension.ansible.vault";
  export const ANSIBLE_INVENTORY_RESYNC = "extension.resync-ansible-inventory";
  export const ANSIBLE_PLAYBOOK_RUN = "extension.ansible-playbook.run";
  export const ANSIBLE_NAVIGATOR_RUN = "extension.ansible-navigator.run";
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace WisdomCommands {
  export const WISDOM_AUTH_REQUEST = "ansible.wisdom.oauth";
  export const WISDOM_SUGGESTION_COMMIT = "ansible.wisdom.inlineSuggest.accept";
  export const WISDOM_SUGGESTION_HIDE = "ansible.wisdom.inlineSuggest.hide";
  export const WISDOM_SUGGESTION_TRIGGER =
    "ansible.wisdom.inlineSuggest.trigger";
  export const WISDOM_STATUS_BAR_CLICK = "ansible.wisdom.statusBar.click";
}

export const WISDOM_SUGGESTION_COMPLETION_URL = "/ai/completions/";
export const WISDOM_SUGGESTION_FEEDBACK_URL = "/ai/feedback/";

export const WISDOM_FEEDBACK_FORM_URL =
  "https://redhatdg.co1.qualtrics.com/jfe/form/SV_e99JvA2DHp5UlWC";

export const WISDOM_REPORT_EMAIL_ADDRESS = "ansible-content-ai@redhat.com";
export const WISDOM_STATUS_BAR_CLICK_HANDLER =
  "ansible.wisdom.statusBar.clickHandler";

export const WISDOM_FEEDBACK_URL =
  "https://redhatdg.co1.qualtrics.com/jfe/form/SV_e99JvA2DHp5UlWC";

export const WISDOM_CLIENT_ID = "Vu2gClkeR5qUJTUGHoFAePmBznd6RZjDdy5FW2wy";
export const WISDOM_SERVICE_LOGIN_TIMEOUT = 120000;
