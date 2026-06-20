export enum ThumbsUpDownAction {
    UP = 0,
    DOWN = 1,
}

export enum WizardGenerationActionType {
    OPEN = 0,
    CLOSE_CANCEL = 1,
    TRANSITION = 2,
    CLOSE_ACCEPT = 3,
}

export interface GenerationListEntry {
    path: string;
    file_type: string;
    content: string;
}

export interface RoleGenerationResponseParams {
    files: GenerationListEntry[];
    name: string;
    generationId?: string;
    outline?: string;
}

export enum RoleFileType {
    Default = 'default',
    Task = 'task',
    Playbook = 'playbook',
    Handler = 'handler',
}

export interface AnsibleCollection {
    fqcn: string;
    path: string;
}

export function getObjectKeys(content: string): string[] {
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            const last = parsed[parsed.length - 1];
            if (typeof last === 'object' && last !== null) {
                return Object.keys(last);
            }
        }
        if (typeof parsed === 'object' && parsed !== null) {
            return Object.keys(parsed);
        }
    } catch {
        // not valid JSON — try simple YAML key extraction
        const keys: string[] = [];
        for (const line of content.split('\n')) {
            const match = line.match(/^(\w[\w.-]*):/);
            if (match) keys.push(match[1]);
        }
        return keys;
    }
    return [];
}
