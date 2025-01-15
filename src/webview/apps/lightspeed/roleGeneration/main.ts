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

import { getSingletonHighlighterCore, HighlighterCore } from "@shikijs/core";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";
import { default as yamlLang } from "shiki/langs/yaml.mjs";
import getWasm from "shiki/wasm";
import { RoleGenerationListEntry } from "../../../../interfaces/lightspeed";

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

let textArea: TextArea;
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
  setListener("openEditorButton", openEditor);

  textArea = document.getElementById("playbook-text-area") as TextArea;
  setListenerOnTextArea();
  savedText = "";

  outline = new EditableList("outline-list");
  outline.element.addEventListener("input", () => {
    setButtonEnabled("reset-button", outline.isChanged());
    setButtonEnabled("generateButton", !outline.isEmpty());
  });
  hideBlockElement("collectionSelectorContainer");
  changeDisplay("spinnerContainer", "block");
});

window.addEventListener("message", async (event) => {
  const message = event.data;

  switch (message.command) {
    case "init": {
      textArea.focus();
      break;
    }
    case "outline": {
      setupPage(2);

      outline.update(message.outline.outline);

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
      changeDisplay("spinnerContainer", "block");
      break;
    }
    case "stopSpinner": {
      changeDisplay("spinnerContainer", "none");
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
      console.log(`Updating displayCollectionList ${message}`);
      console.log(message);
      const collectionList = message.collectionList;
      if (collectionList.length === 0) {
        const div = document.getElementById(
          "collectionSelectorContainer",
        ) as Element;
        console.log(div);
        div.innerHTML =
          "<strong>No collection found. Please create a collection in your workspace first.</strong>";
        showBlockElement("collectionSelectorContainer");
        changeDisplay("spinnerContainer", "none");
        break;
      } else {
        const collectionsListHTML: string = collectionList
          .map(
            (i: string) => `<vscode-option value="${i}">${i}</vscode-option>`,
          )
          .join("\n");

        const div = document.getElementById(
          "selectedCollectionName",
        ) as Element;
        console.log(div);
        div.innerHTML = collectionsListHTML;
      }

      showBlockElement("collectionSelectorContainer");
      changeDisplay("spinnerContainer", "none");
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
  if (element) {
    element.style.display = "block";
  }
}

function hideBlockElement(id: string) {
  const element = document.getElementById(id);
  if (element) {
    element.style.display = "none";
  }
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
  if (savedText !== textArea.value) {
    savedText = textArea.value;
    outline.update("");
    vscode.postMessage({
      command: "reset",
    });
  }

  setButtonEnabled("submit-button", false);

  vscode.postMessage({
    command: "outline",
    text: savedText,
    outline: outline.getSavedValueAsString(),
  });
  textArea.focus();
}

function reset() {
  vscode.postMessage({
    command: "resetOutline",
  });
}

function backToPage1() {
  setupPage(1);
  textArea.focus();
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

async function openEditor() {
  vscode.postMessage({
    command: "openEditor",
  });
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

function setupPage(pageNumber: number) {
  switch (pageNumber) {
    case 1:
      setPageNumber(1);
      showBlockElement("roleInfo");
      showBlockElement("collectionSelectorContainer");
      showBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "none");
      changeDisplay("bigIconButtonContainer", "block");
      changeDisplay("examplesContainer", "block");
      changeDisplay("resetFeedbackContainer", "none");
      changeDisplay("firstMessage", "block");
      changeDisplay("secondMessage", "none");
      changeDisplay("thirdMessage", "none");
      changeDisplay("generatePlaybookContainer", "none");
      changeDisplay("promptContainer", "none");
      changeDisplay("openEditorContainer", "none");
      setButtonEnabled("submit-button", true);
      hideBlockElement("filesOutput");
      break;
    case 2:
      setPageNumber(2);
      hideBlockElement("roleInfo");
      hideBlockElement("collectionSelectorContainer");
      hideBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "block");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "block");
      changeDisplay("resetContainer", "block");
      changeDisplay("feedbackContainer", "none");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "block");
      changeDisplay("thirdMessage", "none");
      changeDisplay("generatePlaybookContainer", "block");
      changeDisplay("promptContainer", "block");
      changeDisplay("openEditorContainer", "none");
      setButtonEnabled("reset-button", false);
      setButtonEnabled("backButton", true);
      setButtonEnabled("generateButton", true);
      hideBlockElement("filesOutput");
      break;
    case 3:
      setPageNumber(3);
      hideBlockElement("roleInfo");
      hideBlockElement("collectionSelectorContainer");
      hideBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "none");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "none");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "none");
      changeDisplay("thirdMessage", "block");
      changeDisplay("generatePlaybookContainer", "none");
      changeDisplay("openEditorContainer", "block");
      showBlockElement("filesOutput");
      break;
  }
}
