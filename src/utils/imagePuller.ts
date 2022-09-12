import * as child_process from "child_process";
import { Connection } from "vscode-languageserver";
import { WorkspaceFolderContext } from "../services/workspaceManager";

export class ImagePuller {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private _containerEngine: string;
  private _containerImage: string;
  private _pullPolicy: string;
  private _pullArguments: string;

  constructor(
    connection: Connection,
    context: WorkspaceFolderContext,
    containerEngine: string,
    containerImage: string,
    pullPolicy: string,
    pullArguments: string,
  ) {
    this.connection = connection;
    this.context = context;
    this._containerEngine = containerEngine;
    this._containerImage = containerImage;
    this._pullPolicy = pullPolicy;
    this._pullArguments = pullArguments;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async setupImage(): Promise<boolean> {
    let setupComplete = false;
    const imageTag = this._containerImage.split(":", 2)[1] || "latest";
    const imagePresent = this.checkForImage();
    const pullRequired = this.determinePull(imagePresent, imageTag);

    let progressTracker;
    if (this.useProgressTracker) {
      progressTracker = await this.connection.window.createWorkDoneProgress();
    }
    if (pullRequired) {
      this.connection.console.log(
        `Pulling image '${this._containerImage}' with pull-policy '${this._pullPolicy}' and image-tag '${imageTag}'`,
      );

      try {
        let pullCommand;
        if (this._pullArguments && this._pullArguments !== "") {
          pullCommand = `${this._containerEngine} pull ${this._containerImage} ${this._pullArguments}`;
        } else {
          pullCommand = `${this._containerEngine} pull ${this._containerImage}`;
        }

        this.connection.console.log(`Running pull command: '${pullCommand}'`);
        if (progressTracker) {
          progressTracker.begin(
            "execution-environment",
            undefined,
            "Pulling Ansible execution environment image...",
          );
        }
        child_process.execSync(pullCommand, {
          encoding: "utf-8",
        });
        this.connection.console.info(
          `Container image '${this._containerImage}' pull successful`,
        );
        setupComplete = true;
      } catch (error) {
        let errorMsg = `Failed to pull container image ${this._containerEngine} with error '${error}'`;
        errorMsg +=
          "Check the execution environment image name, connectivity to and permissions for the registry, and try again";
        this.connection.console.error(errorMsg);
        setupComplete = false;
      }
    } else {
      setupComplete = true;
    }

    if (progressTracker) {
      progressTracker.done();
    }
    return setupComplete;
  }

  private determinePull(imagePresent: boolean, imageTag: string): boolean {
    let pull: boolean;
    if (this._pullPolicy === "missing" && !imagePresent) {
      pull = true;
    } else if (this._pullPolicy === "always") {
      pull = true;
    } else if (this._pullPolicy === "tag" && imageTag === "latest") {
      pull = true;
    } else if (this._pullPolicy === "tag" && !imagePresent) {
      pull = true;
    } else {
      pull = false;
    }
    return pull;
  }

  private checkForImage(): boolean {
    try {
      const command = `${this._containerEngine} image inspect ${this._containerImage}`;
      this.connection.console.log(
        `check for container image with command: '${command}'`,
      );
      child_process.execSync(command, {
        encoding: "utf-8",
      });
      return true;
    } catch (error) {
      this.connection.console.log(
        `'${this._containerImage}' image inspection failed, image assumed to be corrupted or missing`,
      );
      return false;
    }
  }
}
