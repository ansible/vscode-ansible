import * as vscode from 'vscode';

function getConfiguredTags(): string[] {
    var customTags = vscode.workspace.getConfiguration('yaml', null).get("customTags");
    if (!Array.isArray(customTags)) {
        return [];
    }
    return customTags;
}

export function configure(output: vscode.OutputChannel) {
    // reconfigure settings.json to inject yaml custom tags used by Ansible

    const knownTags: string[] = [
        "!encrypted/pkcs1-oaep scalar",
        "!vault scalar"];

    var customTags: string[] = getConfiguredTags();
    var updated: boolean = false;
    knownTags.forEach(function (tag) {
        if (!customTags.includes(tag)) {
            output.append(`Missing YAML custom tag: ${tag}\n`);
            customTags.push(tag);
            updated = true;
        }
    });
    if (updated) {
        output.append(`Altered yaml.customTags to: ${customTags}\n`);
        vscode.workspace.getConfiguration('yaml', null).update('customTags', customTags, vscode.ConfigurationTarget.Global);
    }
}
