import { v4 as uuidv4 } from "uuid";
import {
  provideVSCodeDesignSystem,
  Button,
  vsCodeButton,
  vsCodeTag,
  vsCodeTextArea,
  vsCodeTextField,
  TextArea,
} from "@vscode/webview-ui-toolkit";
import { EditableList } from "../../common/editableList";

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTag(),
  vsCodeTextArea(),
  vsCodeTextField(),
);

const TEXTAREA_MAX_HEIGHT = 500;
const TOTAL_PAGES = 3;

let savedText: string;
let savedPlaybook: string | undefined;
let generationId: string | undefined;
let darkMode = true;
let textArea: TextArea;
let currentPage = 1;

let outline: EditableList;

const vscode = acquireVsCodeApi();

window.addEventListener("load", () => {
  setListener("submit-button", submitInput);
  setListener("generate-button", generateCode);
  setListener("reset-button", reset);
  setListener("back-button", backToPage1);
  setListener("back-anchor", backToPage1);
  setListener("back-to-page2-button", backToPage2);
  setListener("open-editor-button", openEditor);

  textArea = document.getElementById("playbook-text-area") as TextArea;
  setListenerOnTextArea();
  savedText = "";

  outline = new EditableList("outline-list");
  outline.element.addEventListener("input", () => {
    setButtonEnabled("reset-button", outline.isChanged());
    setButtonEnabled("generate-button", !outline.isEmpty());
  });

  // Detect whether a dark or a light color theme is used.
  const element = document.getElementById("main-header");
  if (element) {
    const style = window.getComputedStyle(element);
    const color = style.getPropertyValue("color");
    const re = /rgb.?\((\d+), (\d+), (\d+)/;
    const found = color.match(re);
    if (found) {
      const r = parseInt(found[1]);
      const g = parseInt(found[2]);
      const b = parseInt(found[3]);
      darkMode = r > 128 && g > 128 && b > 128;
    }
  }
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
      savedPlaybook = message.outline.playbook;
      generationId = message.outline.generationId;

      const prompt = document.getElementById("prompt") as HTMLSpanElement;
      prompt.textContent = savedText;

      outline.focus();
      break;
    }
    case "playbook": {
      setupPage(3);
      savedPlaybook = message.playbook.playbook;
      generationId = message.playbook.generationId;
      outline.save();

      const element = document.getElementById("formatted-code") as Element;
      element.innerHTML = message.playbook.html;
      const pre = document.getElementsByTagName("pre")[0];
      pre.style.backgroundColor = "";
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
        setButtonEnabled("generate-button", true);
        setButtonEnabled("back-button", true);
        setButtonEnabled("reset-button", true);
      }
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
  // If the saved text is not the current one, clear saved values and assign a new generationId
  if (savedText !== textArea.value) {
    savedText = textArea.value;
    outline.update("");
    savedPlaybook = undefined;
    generationId = uuidv4();
  }

  setButtonEnabled("submit-button", false);

  vscode.postMessage({
    command: "outline",
    text: savedText,
    playbook: savedPlaybook,
    outline: outline.getSavedValueAsString(),
    generationId,
  });
  textArea.focus();
}

function reset() {
  outline.reset();
  outline.focus();
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
  let playbook: string | undefined;

  // If user made any changes to the generated outline, generate a playbook with a new generationId.
  // Otherwise, just use the generated playbook.
  if (outline.isChanged()) {
    generationId = uuidv4();
  } else {
    playbook = savedPlaybook;
  }

  setButtonEnabled("generate-button", false);
  setButtonEnabled("back-button", false);
  setButtonEnabled("reset-button", false);

  vscode.postMessage({
    command: "generateCode",
    text,
    outline: EditableList.listToString(outline.getFromUI()),
    playbook,
    generationId,
    darkMode,
  });
}

async function openEditor() {
  vscode.postMessage({
    command: "openEditor",
    playbook: savedPlaybook,
  });
}

function getTextAreaInShadowDOM() {
  const shadowRoot = document.querySelector("vscode-text-area")?.shadowRoot;
  return shadowRoot?.querySelector("textarea");
}

function adjustTextAreaHeight() {
  const textarea = getTextAreaInShadowDOM();
  if (textarea?.scrollHeight) {
    const scrollHeight = textarea?.scrollHeight;
    if (scrollHeight < TEXTAREA_MAX_HEIGHT) {
      if (textarea?.style.height) {
        const height = parseInt(textarea?.style.height);
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
      showBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "none");
      changeDisplay("formattedPlaybook", "none");
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
      break;
    case 2:
      setPageNumber(2);
      hideBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "block");
      changeDisplay("formattedPlaybook", "none");
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
      setButtonEnabled("back-button", true);
      setButtonEnabled("generate-button", true);
      break;
    case 3:
      setPageNumber(3);
      hideBlockElement("playbook-text-area");
      changeDisplay("outlineContainer", "none");
      changeDisplay("formattedPlaybook", "block");
      changeDisplay("bigIconButtonContainer", "none");
      changeDisplay("examplesContainer", "none");
      changeDisplay("resetFeedbackContainer", "none");
      changeDisplay("firstMessage", "none");
      changeDisplay("secondMessage", "none");
      changeDisplay("thirdMessage", "block");
      changeDisplay("generatePlaybookContainer", "none");
      changeDisplay("openEditorContainer", "block");

      break;
  }
}
