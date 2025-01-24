import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
  vsCodeDropdown,
  vsCodeOption,
  vsCodeTag,
  vsCodeTextArea,
  vsCodeTextField,
  TextArea,
  Dropdown,
} from "@vscode/webview-ui-toolkit";
import { EditableList } from "../../common/editableList";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { getSingletonHighlighterCore, HighlighterCore } from "@shikijs/core";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";
import { default as yamlLang } from "shiki/langs/yaml.mjs";
import getWasm from "shiki/wasm";
import { RoleGenerationListEntry } from "../../../../interfaces/lightspeed";
import { AnsibleCollection } from "../../../../features/lightspeed/utils/scanner";

let highlighter: HighlighterCore;

export async function codeToHtml(code: string) {
  function isDarkMode(): boolean {
    const element = document.getElementById("main-header");

    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const color = style.getPropertyValue("color");
    const re = /rgb.?\((\d+), (\d+), (\d+)/;
    const found = color.match(re);
    if (found) {
      const r = parseInt(found[1]);
      const g = parseInt(found[2]);
      const b = parseInt(found[3]);
      return r > 128 && g > 128 && b > 128;
    }
    return false;
  }

  // Detect whether a dark or a light color theme is used.
  const theme = isDarkMode() ? "dark-plus" : "light-plus";

  if (!highlighter) {
    highlighter = await getSingletonHighlighterCore({
      themes: [darkPlus, lightPlus],
      langs: [yamlLang],
      loadWasm: getWasm,
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }

  const html = highlighter.codeToHtml(code, {
    theme,
    lang: "yaml",
  });

  return html;
}

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeDropdown(),
  vsCodeOption(),
  vsCodeTag(),
  vsCodeTextArea(),
  vsCodeTextField(),
);

const TEXTAREA_MAX_HEIGHT = 500;
const TOTAL_PAGES = 3;

let savedText: string;

let currentPage = 1;

let outline: EditableList;

const vscode = acquireVsCodeApi();

window.addEventListener("load", () => {
  setListener("submit-button", submitInput);
  setListener("generateButton", generateCode);
  setListener("reset-button", reset);
  setListener("backAnchorPrompt", backToPage1);
  setListener("backAnchorCollectionName", backToPage1);
  setListener("backButton", backToPage1);
  setListener("backToPage2Button", backToPage2);
  setListener("saveRoleButton", saveRole);

  setListenerOnTextArea();
  savedText = "";
  const roleName = document.getElementById("roleName");
  roleName?.addEventListener("input", checkRoleName);

  outline = new EditableList("outline-list");
  outline.element.addEventListener("input", () => {
    setButtonEnabled("reset-button", outline.isChanged());
    setButtonEnabled("generateButton", !outline.isEmpty());
  });
});

window.addEventListener("message", async (event) => {
  const message = event.data;

  switch (message.command) {
    case "init": {
      setupPage(1);
      break;
    }
    case "outline": {
      setupPage(2);

      outline.update(message.outline.outline);

      const roleName = document.getElementById("roleName") as HTMLInputElement;
      roleName.value = message.outline.role;
      checkRoleName();

      const prompt = document.getElementById("prompt") as HTMLSpanElement;
      prompt.textContent = savedText;

      outline.focus();
      break;
    }
    case "displayFiles": {
      setupPage(3);
      const payload = message.payload;
      const files = payload.files as RoleGenerationListEntry[];

      let output = "";
      for (const file of files) {
        const fragment = `<p>${file.path}:</p>
        <div class="formattedPlaybook" style="block">
          <span id="formattedTasksCode">${await codeToHtml(file.content)}</span>
        </div>`;
        output = output.concat(fragment);
      }

      const filesOutputDiv = document.getElementById("filesOutput") as Element;
      filesOutputDiv.innerHTML = output;
      break;
    }
    case "startSpinner": {
      showBlockElement("spinnerContainer");
      break;
    }
    case "stopSpinner": {
      hideBlockElement("spinnerContainer");
      if (currentPage === 1) {
        setButtonEnabled("submit-button", true);
      } else if (currentPage === 2) {
        setButtonEnabled("generateButton", true);
        setButtonEnabled("backButton", true);
        setButtonEnabled("reset-button", true);
      }
      break;
    }
    case "resetOutline": {
      setButtonEnabled("reset-button", false);
      outline.reset();
      outline.focus();
      break;
    }
    case "displayCollectionList": {
      const collectionList: AnsibleCollection[] = message.collectionList;
      if (collectionList.length === 0) {
        const div = document.getElementById(
          "collectionSelectorContainer",
        ) as Element;
        div.innerHTML =
          "<strong>No collection found. Please create a collection in your workspace first.</strong>";
        showBlockElement("collectionSelectorContainer");
        changeDisplay("spinnerContainer", "none");
        break;
      } else {
        const collectionsListHTML: string = collectionList
          .map(
            (i: AnsibleCollection) =>
              `<vscode-option value="${i.fqcn}">${i.fqcn}</vscode-option>`,
          )
          .join("\n");

        const div = document.getElementById(
          "selectedCollectionName",
        ) as Element;
        div.innerHTML = collectionsListHTML;
      }

      showBlockElement("collectionSelectorContainer");
      changeDisplay("spinnerContainer", "none");
      break;
    }
    case "invalidRoleName": {
      showBlockElement("errorContainer");
      const errorMessage = document.getElementById(
        "errorMessage",
      ) as HTMLParagraphElement;
      errorMessage.innerText = "The role directory already exists.";
      setButtonEnabled("generateButton", false);
      break;
    }
    case "validRoleName": {
      hideBlockElement("errorContainer");
      setButtonEnabled("generateButton", true);
      break;
    }
    case "addGenerateRoleLogEntry": {
      const content: string = message.content;
      const logArea = document.getElementById(
        "roleFileResultLogAreaList",
      ) as HTMLUListElement;
      const li = document.createElement("li");
      li.innerHTML = content; // added line
      logArea.appendChild(li);
      break;
    }
    case "addGenerateRoleFile": {
      const content: string = message.content;
      const logArea = document.getElementById(
        "roleFileResultFileList",
      ) as HTMLUListElement;
      const li = document.createElement("li");
      li.innerHTML = content; // added line
      logArea.appendChild(li);
      showBlockElement("roleFileResultFiles");
      showBlockElement("roleFileResultContainer");

      break;
    }
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setListener(id: string, func: any) {
  const button = document.getElementById(id) as Button;
  if (button) {
    button.addEventListener("click", async () => {
      await func();
    });
  }
}

function setListenerOnTextArea() {
  const textArea = document.getElementById("playbook-text-area") as TextArea;
  textArea.addEventListener("input", async () => {
    const input = textArea.value;
    setButtonEnabled("submit-button", input.length > 0);
    adjustTextAreaHeight();
  });
}

function changeDisplay(className: string, displayState: string) {
  const elements = document.getElementsByClassName(className);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement;
    element.style.display = displayState;
  }
}

function showBlockElement(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error("id not found");
  }
  element.style.display = "block";
}

function hideBlockElement(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`id not found: ${id}`);
  }
  element.style.display = "none";
}

async function submitInput() {
  const selectedCollectionName = document.getElementById(
    "selectedCollectionName",
  ) as Dropdown;
  const collectionName = document.getElementById("collectionName");
  if (collectionName && selectedCollectionName) {
    collectionName.textContent = selectedCollectionName.value;
  }
  // If the saved text is not the current one, clear saved values and assign a new generationId
  const textArea = document.getElementById("playbook-text-area") as TextArea;
  if (savedText !== textArea.value) {
    savedText = textArea.value;
    outline.update("");
    vscode.postMessage({
      command: "reset",
    });
  }

  setButtonEnabled("submit-button", false);

  const roleName = (document.getElementById("roleName") as HTMLInputElement)
    ?.value;
  vscode.postMessage({
    command: "outline",
    text: savedText,
    outline: outline.getSavedValueAsString(),
    role: roleName,
  });
}

function reset() {
  vscode.postMessage({
    command: "resetOutline",
  });
}

function backToPage1() {
  setupPage(1);
}

function backToPage2() {
  setupPage(2);
  outline.focus();
}

async function generateCode() {
  const text = savedText;

  // If user made any changes to the generated outline, generate a playbook with a new generationId.
  // Otherwise, just use the generated playbook.
  if (outline.isChanged()) {
    vscode.postMessage({
      command: "reset",
    });
  }

  setButtonEnabled("generateButton", false);
  setButtonEnabled("backButton", false);
  setButtonEnabled("reset-button", false);

  vscode.postMessage({
    command: "generateCode",
    text,
    outline: EditableList.listToString(outline.getFromUI()),
  });
}

async function checkRoleName() {
  const roleName = (document.getElementById("roleName") as HTMLInputElement)
    ?.value;
  const fqcn = document.getElementById("collectionName")?.textContent;
  vscode.postMessage({
    command: "checkRoleName",
    roleName,
    fqcn,
  });
}

async function saveRole() {
  const roleName = (document.getElementById("roleName") as HTMLInputElement)
    ?.value;
  const fqcn = document.getElementById("collectionName")?.textContent;
  vscode.postMessage({
    command: "saveRole",
    roleName,
    fqcn,
  });
  setButtonEnabled("saveRoleButton", false);
}

function getTextAreaInShadowDOM() {
  const shadowRoot = document.querySelector("vscode-text-area")?.shadowRoot;
  return shadowRoot?.querySelector("textarea");
}

function adjustTextAreaHeight() {
  const textarea = getTextAreaInShadowDOM();
  if (textarea?.scrollHeight) {
    const scrollHeight = textarea.scrollHeight;
    if (scrollHeight < TEXTAREA_MAX_HEIGHT) {
      if (textarea.style.height) {
        const height = parseInt(textarea.style.height);
        if (height >= scrollHeight) {
          return;
        }
      }
      // +2 was needed to eliminate scrollbar...
      textarea.style.height = `${scrollHeight + 2}px`;
    }
  }
}

function setPageNumber(pageNumber: number) {
  const span = document.getElementById("page-number") as Element;
  span.textContent = `${pageNumber} of ${TOTAL_PAGES}`;
  currentPage = pageNumber;

  vscode.postMessage({
    command: "transition",
    toPage: pageNumber,
  });
}

function setButtonEnabled(id: string, enabled: boolean) {
  const element = document.getElementById(id) as Button;
  element.disabled = !enabled;
}

function resetRoleFileResultContainer() {
  const logArea = document.getElementById(
    "roleFileResultLogAreaList",
  ) as HTMLUListElement;
  while (logArea.firstChild) {
    logArea.firstChild.remove();
  }
  const saveRoleFileList = document.getElementById(
    "roleFileResultFileList",
  ) as HTMLUListElement;
  saveRoleFileList.innerHTML = "";
  hideBlockElement("roleFileResultFiles");
}

function setupPage(pageNumber: number) {
  const textArea = document.getElementById("playbook-text-area") as TextArea;
  hideBlockElement("bigIconButtonContainer");
  hideBlockElement("collectionSelectorContainer");
  hideBlockElement("continueButtonContainer");
  hideBlockElement("errorContainer");
  hideBlockElement("examplesContainer");
  hideBlockElement("filesOutput");
  hideBlockElement("firstMessage");
  hideBlockElement("generateRoleContainer");
  hideBlockElement("outlineContainer");
  hideBlockElement("playbook-text-area");
  hideBlockElement("promptContainer");
  hideBlockElement("resetFeedbackContainer");
  hideBlockElement("roleFileResultContainer");
  hideBlockElement("roleInfo");
  hideBlockElement("roleNameContainer");
  hideBlockElement("saveRoleContainer");
  hideBlockElement("secondMessage");
  hideBlockElement("spinnerContainer");
  hideBlockElement("thirdMessage");
  setButtonEnabled("backButton", false);
  setButtonEnabled("generateButton", false);
  setButtonEnabled("reset-button", false);

  resetRoleFileResultContainer();

  switch (pageNumber) {
    case 1:
      setPageNumber(1);
      setButtonEnabled("submit-button", true);
      showBlockElement("bigIconButtonContainer");
      showBlockElement("collectionSelectorContainer");
      showBlockElement("examplesContainer");
      showBlockElement("firstMessage");
      showBlockElement("playbook-text-area");
      showBlockElement("roleInfo");
      textArea.focus();
      break;
    case 2:
      setPageNumber(2);
      setButtonEnabled("backButton", true);
      setButtonEnabled("generateButton", true);
      showBlockElement("generateRoleContainer");
      showBlockElement("outlineContainer");
      showBlockElement("promptContainer");
      showBlockElement("resetContainer");
      showBlockElement("resetFeedbackContainer");
      showBlockElement("roleNameContainer");
      showBlockElement("secondMessage");
      break;
    case 3:
      setPageNumber(3);
      setButtonEnabled("saveRoleButton", true);
      showBlockElement("filesOutput");
      showBlockElement("roleNameContainer");
      showBlockElement("saveRoleContainer");
      showBlockElement("thirdMessage");
      break;
  }
}
