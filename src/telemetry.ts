import * as vscode from 'vscode';

export const ExtensionEvents = {
    WALKTHROUGH_OPEN: 'walkthrough.open',
} as const;

export type ExtensionEventName = (typeof ExtensionEvents)[keyof typeof ExtensionEvents];

export interface ExtensionTelemetryReporter {
    sendEvent(name: string, properties?: Record<string, string>): void;
}

export const noopExtensionReporter: ExtensionTelemetryReporter = {
    sendEvent() {},
};

export function registerWalkthroughTelemetry(
    context: vscode.ExtensionContext,
    telemetry: ExtensionTelemetryReporter,
): void {
    const walkthroughCommandId = 'workbench.action.openWalkthrough';

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ansible.telemetry.trackWalkthroughOpen',
            (walkthroughId?: string) => {
                telemetry.sendEvent(ExtensionEvents.WALKTHROUGH_OPEN, {
                    ...(walkthroughId ? { walkthroughId } : {}),
                });
                void vscode.commands.executeCommand(walkthroughCommandId, walkthroughId);
            },
        ),
    );
}
