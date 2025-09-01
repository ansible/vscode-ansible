import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import * as vscode from "vscode";
import { ViewColumn, window } from "vscode";

interface WebviewMessage {
  type: string;
  payload: {
    id?: string;
    command?: string;
    url?: string;
  };
}

interface Walkthrough {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

export class WelcomePagePanel {
  public static currentPanel: WelcomePagePanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private readonly context: ExtensionContext;

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    this.context = context;

    // Set up the panel lifecycle
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set up the HTML content using Vite
    this._panel.webview.html = this.getWebviewHtml(context);

    // Set up message listener
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      undefined,
      this._disposables,
    );
  }

  public static render(context: ExtensionContext) {
    if (WelcomePagePanel.currentPanel) {
      WelcomePagePanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      const panel = window.createWebviewPanel(
        "ansible-welcome",
        "Ansible Development Tools",
        ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "out"),
            vscode.Uri.joinPath(context.extensionUri, "media"),
            vscode.Uri.joinPath(context.extensionUri, "images"),
          ],
        },
      );

      WelcomePagePanel.currentPanel = new WelcomePagePanel(panel, context);
    }
  }

  private getWebviewHtml(context: ExtensionContext): string {
    return __getWebviewHtml__({
      // vite dev mode
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/welcome-page.html`,
      // vite prod mode
      webview: this._panel.webview,
      context,
      inputName: "welcome-page",
    });
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.type) {
      case "walkthrough-click":
        if (message.payload.id) {
          await this.handleWalkthroughClick(message.payload.id);
        }
        break;
      case "command-click":
        if (message.payload.command) {
          await this.handleCommandClick(message.payload.command);
        }
        break;
      case "external-link":
        if (message.payload.url) {
          await this.handleExternalLink(message.payload.url);
        }
        break;
      case "check-system-status":
        await this.handleSystemStatusCheck();
        break;
    }
  }

  private async handleWalkthroughClick(walkthroughId: string) {
    // Execute walkthrough command with proper extension prefix
    const fullWalkthroughId = `redhat.ansible#${walkthroughId}`;
    await vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      fullWalkthroughId,
    );
  }

  private async handleCommandClick(command: string) {
    // Execute VS Code command
    await vscode.commands.executeCommand(command);
  }

  private async handleExternalLink(url: string) {
    // Open external link
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async handleSystemStatusCheck() {
    const logoPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "contentCreator",
      "icons",
      "ansible-logo-red.png",
    );
    const logoUri = this._panel.webview.asWebviewUri(logoPath).toString();

    // Get system details and send back to webview
    try {
      // Import the system details utility
      const { getSystemDetails } = await import("../utils/getSystemDetails");
      const systemDetails = await getSystemDetails();

      // Get walkthroughs from extension
      const walkthroughs = this.getWalkthroughs();

      // Check if essential tools are available
      const hasAnsible =
        systemDetails["ansible version"] && systemDetails["ansible location"];
      const hasPython =
        systemDetails["python version"] && systemDetails["python location"];

      // Determine system readiness
      const isSystemReady = hasAnsible && hasPython;
      const statusDescription = isSystemReady
        ? "All the tools are installed.\nYour environment is ready and you can start creating ansible content."
        : "Some required tools are missing. Please install Ansible and Python to get started.";

      // Send system status update to webview
      this._panel.webview.postMessage({
        type: "system-status-update",
        payload: {
          systemReadiness: {
            status: isSystemReady ? "ready" : "not-ready",
            icon: isSystemReady ? "pass" : "error",
            description: statusDescription,
          },
          details: {
            ansibleVersion: systemDetails["ansible version"],
            ansibleLocation: systemDetails["ansible location"],
            pythonVersion: systemDetails["python version"],
            pythonLocation: systemDetails["python location"],
            ansibleCreatorVersion: systemDetails["ansible-creator version"],
            ansibleDevEnvironment:
              systemDetails["ansible-dev-environment version"],
          },
          logoUrl: logoUri,
          walkthroughs: walkthroughs,
        },
      });
    } catch (error) {
      console.error("Error checking system status:", error);

      // Send error state
      this._panel.webview.postMessage({
        type: "system-status-update",
        payload: {
          systemReadiness: {
            status: "error",
            icon: "error",
            description: "Unable to check system status",
          },
          logoUrl: logoUri,
          walkthroughs: this.getWalkthroughs(),
        },
      });
    }
  }

  private getWalkthroughs() {
    try {
      // Get walkthroughs from extension package.json
      const extension = vscode.extensions.getExtension("redhat.ansible");
      const walkthroughs =
        extension?.packageJSON?.contributes?.walkthroughs || [];

      return walkthroughs.map((walkthrough: Walkthrough) => ({
        id: walkthrough.id,
        title: walkthrough.title,
        description: walkthrough.description,
        icon: walkthrough.icon || "compass-active", // Default icon
      }));
    } catch (error) {
      console.error("Error getting walkthroughs:", error);
      return [];
    }
  }

  public dispose() {
    WelcomePagePanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
