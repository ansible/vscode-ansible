import {
  Button,
  allComponents,
  provideVSCodeDesignSystem,
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let systemReadinessDiv: HTMLElement | null;
let systemCheckDiv: HTMLElement | null;
let installStatusDiv: HTMLElement | null;

let systemReadinessIcon: HTMLElement;
let systemReadinessDescription: HTMLElement;
let ansibleVersionStatusText: HTMLElement;
let ansibleLocationStatusText: HTMLElement;
let pythonVersionStatusText: HTMLElement;
let pythonLocationStatusText: HTMLElement;
let ansibleCreatorVersionStatusText: HTMLElement;
let ansibleDevEnvironmentStatusText: HTMLElement;
let refreshButton: Button;

function main() {
  systemReadinessDiv = document.getElementById("system-readiness");

  systemCheckDiv = document.getElementById("system-check");
  if (systemCheckDiv) systemCheckDiv.style.visibility = "hidden";

  installStatusDiv = document.getElementById("install-status");

  systemReadinessIcon = document.createElement("section");
  systemReadinessDescription = document.createElement("section");

  ansibleVersionStatusText = document.createElement("section");
  ansibleLocationStatusText = document.createElement("section");
  pythonVersionStatusText = document.createElement("section");
  pythonLocationStatusText = document.createElement("section");
  ansibleDevEnvironmentStatusText = document.createElement("section");
  ansibleCreatorVersionStatusText = document.createElement("section");

  refreshButton = document.getElementById("refresh") as Button;
  refreshButton?.addEventListener("click", handleRefreshClick);

  updateAnsibleCreatorAvailabilityStatus();
}

function handleRefreshClick() {
  vscode.postMessage({
    message: "refresh-page",
  });
}

function updateAnsibleCreatorAvailabilityStatus() {
  vscode.postMessage({
    message: "set-system-status-view",
  });

  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
      case "systemDetails": {
        const systemDetails = message.arguments;
        const ansibleVersion = systemDetails["ansible version"];
        const ansibleLocation = systemDetails["ansible location"];
        const pythonVersion = systemDetails["python version"];
        const pythonLocation = systemDetails["python location"];
        const ansibleCreatorVersion = systemDetails["ansible-creator version"];
        const ansibleDevEnvironmentVersion =
          systemDetails["ansible-dev-environment version"];

        const systemStatus = !!(
          ansibleVersion &&
          pythonVersion &&
          ansibleCreatorVersion
        );

        if (systemStatus) {
          // Commented out temporarily for visibility issue with a light color theme
          // if (systemReadinessDiv)
          //   systemReadinessDiv.style.backgroundColor = "#023020";
          systemReadinessIcon.innerHTML = `<span class="codicon codicon-pass"></span>`;
          systemReadinessDescription.innerHTML = `<p class="system-description"><b>All the tools are installed</b>.<br>Your environment is ready and you can start creating ansible content.</p>`;
        } else {
          // if (systemReadinessDiv)
          //   systemReadinessDiv.style.backgroundColor = "#610000";
          systemReadinessIcon.innerHTML = `<span class="codicon codicon-error"></span>`;
          systemReadinessDescription.innerHTML = `<p class="system-description"><b>Looks like your environment is missing some tools</b>.<br>Follow the description in the 'System requirements' section to set up your environment.</p>`;
        }
        systemReadinessDiv?.appendChild(systemReadinessIcon);
        systemReadinessDiv?.appendChild(systemReadinessDescription);

        if (ansibleVersion) {
          ansibleVersionStatusText.innerHTML = `<p class='found'><b>Ansible version:</b> ${ansibleVersion}</p>`;
        } else {
          ansibleVersionStatusText.innerHTML = `<p class='not-found'><b>Ansible version:</b> Not found</p>`;
        }
        installStatusDiv?.appendChild(ansibleVersionStatusText);

        // ansible location text
        if (ansibleLocation) {
          ansibleLocationStatusText.innerHTML = `<p class='found'><b>Ansible location:</b> ${ansibleLocation}</p>`;
        } else {
          ansibleLocationStatusText.innerHTML = `<p class='not-found'><b>Ansible location:</b> Not found</p>`;
        }
        installStatusDiv?.appendChild(ansibleLocationStatusText);

        // python version text
        if (pythonVersion) {
          pythonVersionStatusText.innerHTML = `<p class='found'><b>Python version:</b> ${pythonVersion}</p>`;
        } else {
          pythonVersionStatusText.innerHTML = `<p class='not-found'><b>Python version:</b> Not found</p>`;
        }
        installStatusDiv?.appendChild(pythonVersionStatusText);

        // python location text
        if (pythonLocation) {
          pythonLocationStatusText.innerHTML = `<p class='found'><b>Python location:</b> ${pythonLocation}</p>`;
        } else {
          pythonLocationStatusText.innerHTML = `<p class='not-found'><b>Python location:</b> Not found</p>`;
        }
        installStatusDiv?.appendChild(pythonLocationStatusText);

        // ade version text
        if (ansibleDevEnvironmentVersion) {
          ansibleDevEnvironmentStatusText.innerHTML = `<p class='found'>[optional] <b>Ansible-dev-environment version:</b> ${ansibleDevEnvironmentVersion}</p>`;
        } else {
          ansibleDevEnvironmentStatusText.innerHTML = `<p class='not-found-optional'>[optional] <b>Ansible-dev-environment version:</b> Not found</p>`;
        }
        installStatusDiv?.appendChild(ansibleDevEnvironmentStatusText);

        // ansible-creator version text
        if (ansibleCreatorVersion) {
          ansibleCreatorVersionStatusText.innerHTML = `<p class='found'><b>Ansible-creator version:</b> ${ansibleCreatorVersion}</p>`;
        } else {
          ansibleCreatorVersionStatusText.innerHTML = `
          <p class='not-found'><b>Ansible-creator version:</b> Not found</p>
          <br>
          <p>Before getting started, please <vscode-link href="command:ansible.content-creator.install">install ansible-creator</vscode-link> (via pip) or <br>
          <vscode-link href="command:ansible.python-settings.open">switch to a different python interpreter</vscode-link>  with ansible-creator already installed in it.</p>
          `;
        }
        installStatusDiv?.appendChild(ansibleCreatorVersionStatusText);
      }
      // <p>&#x2717; python version: ${pythonVersion}</p>
      // <p>&#x2717; python location: ${pythonLocation}</p>
      // <p>&#x2717; ansible-creator version: ${ansibleCreatorVersion}</p>

      // `;
    }
    if (systemCheckDiv) systemCheckDiv.style.visibility = "visible";
  });
}
