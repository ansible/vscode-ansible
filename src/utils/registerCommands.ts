import { commands, ExtensionContext, window } from "vscode";
import { TelemetryManager } from "./telemetryUtils";

/**
 * Register a command with the given name and async function
 *
 * Displays errors raised by the function as error messages,
 * and sends telemetry when the command succeeds or fails.
 *
 * @param context - the extension context
 * @param commandName - the name of the command to register
 * @param commandAction - the async function to run when the command is called
 * @param skipSuccess - whether the success of the command should be reported
 */
export async function registerCommandWithTelemetry(
  context: ExtensionContext,
  telemetry: TelemetryManager,
  commandName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commandAction: (thisArg?: any) => Promise<any>,
  skipSuccess?: boolean,
): Promise<void> {
  context.subscriptions.push(
    commands.registerCommand(commandName, async () => {
      try {
        await commandAction();
        if (!skipSuccess) {
          await telemetry.sendCommandSucceededTelemetry(commandName);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : (e as string);
        await window.showErrorMessage(msg);
        await telemetry.sendCommandFailedTelemetry(commandName, msg);
      }
    }),
  );
}
