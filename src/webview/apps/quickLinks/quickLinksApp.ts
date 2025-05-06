const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

let systemReadinessDiv: HTMLElement | null;
let systemReadinessIcon: HTMLElement;
let systemReadinessDescription: HTMLElement;

function main() {
  systemReadinessDiv = document.getElementById("system-readiness");
  systemReadinessIcon = document.createElement("section");
  systemReadinessDescription = document.createElement("section");

  updateAnsibleCreatorAvailabilityStatus();
}

function updateAnsibleCreatorAvailabilityStatus() {
  vscode.postMessage({
    message: "set-system-status-view",
  });

  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent
    if (message.command === "systemDetails") {
      const systemDetails = message.arguments;
      const ansibleVersion = systemDetails["ansible version"];
      const pythonVersion = systemDetails["python version"];
      const ansibleCreatorVersion = systemDetails["ansible-creator version"];

      const systemStatus = !!(
        ansibleVersion &&
        pythonVersion &&
        ansibleCreatorVersion
      );

      if (!systemStatus) {
        systemReadinessIcon.innerHTML = `<span class="codicon codicon-warning"></span>`;
        systemReadinessDescription.innerHTML = `
              <p class="system-description">
                <b>Looks like you don't have an Ansible environment set up yet</b>.
                <br>
                <br>
                  <a href="command:"ansible.content-creator.create-devcontainer"">
                    Create a devcontainer
                  </a> to build your environment using the
                  <a href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers">
                   Dev Containers
                   </a> extension, or follow the
                  <a href="command:ansible.open-walkthrough-create-env">
                    Create an Ansible environment
                  </a> walkthrough to get started.
              </p>`;
      }

      systemReadinessDiv?.appendChild(systemReadinessIcon);
      systemReadinessDiv?.appendChild(systemReadinessDescription);
    }
  });
}
