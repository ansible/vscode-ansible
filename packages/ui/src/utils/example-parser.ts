import { capitalizeTitle } from './sample-task';

export interface ExampleSection {
    title: string;
    beforeState?: string;
    task: string;
    taskOutput?: string;
    afterState?: string;
}

/**
 * Parse ansible-doc example text into structured sections.
 * @param examples - Raw examples string from plugin documentation
 * @returns Parsed example sections with task YAML and optional state/output blocks
 */
export function parseExamples(examples: string): ExampleSection[] {
    const sections: ExampleSection[] = [];

    const lines = examples.split('\n');
    let currentSection: ExampleSection | null = null;

    let currentPart: 'start' | 'before' | 'task' | 'output' | 'after' = 'start';
    let buffer: string[] = [];
    let sectionHeader: string | null = null;
    const pending: { before?: string } = {};

    const flushBuffer = () => {
        const content = buffer.join('\n').trim();
        if (!content) {
            buffer = [];
            return;
        }

        if (!currentSection) {
            if (currentPart === 'before') {
                pending.before = content;
            }
            buffer = [];
            return;
        }

        switch (currentPart) {
            case 'before':
                currentSection.beforeState = content;
                break;
            case 'task':
                currentSection.task =
                    (currentSection.task ? currentSection.task + '\n\n' : '') + content;
                break;
            case 'output':
                currentSection.taskOutput = content;
                break;
            case 'after':
                currentSection.afterState = content;
                break;
        }
        buffer = [];
    };

    const saveCurrentSection = () => {
        if (currentSection) {
            flushBuffer();
            if (currentSection.task) {
                sections.push(currentSection);
            }
        }
        currentSection = null;
        currentPart = 'start';
    };

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (/^#\s*Using\s+\w+/.test(trimmedLine)) {
            saveCurrentSection();
            sectionHeader = trimmedLine.replace(/^#\s*/, '');
            continue;
        }

        if (/^#\s*Before\s+state:?\s*$/i.test(trimmedLine)) {
            flushBuffer();
            currentPart = 'before';
            continue;
        }

        if (/^#\s*Task\s+[Oo]utput:?\s*$/i.test(trimmedLine)) {
            flushBuffer();
            currentPart = 'output';
            continue;
        }

        if (/^#\s*After\s+state:?\s*$/i.test(trimmedLine)) {
            flushBuffer();
            currentPart = 'after';
            continue;
        }

        if (trimmedLine.startsWith('- name:')) {
            saveCurrentSection();

            const rawTaskName = trimmedLine
                .replace(/^-\s*name:\s*/, '')
                .replace(/^["']|["']$/g, '');
            const taskName = capitalizeTitle(rawTaskName);

            currentSection = {
                title: sectionHeader ? `${sectionHeader}: ${taskName}` : taskName,
                beforeState: pending.before,
                task: '',
            };
            sectionHeader = null;
            pending.before = undefined;
            currentPart = 'task';
            buffer = [line];
            continue;
        }

        if (currentPart === 'task' && trimmedLine.startsWith('#') && buffer.length > 0) {
            const hasYaml = buffer.some((l) => !l.trim().startsWith('#') && l.trim().length > 0);
            if (hasYaml) {
                if (/^#\s*-+\s*$/.test(trimmedLine)) {
                    continue;
                }
                flushBuffer();
                currentPart = 'output';
                buffer = [line];
                continue;
            }
        }

        if (currentSection || currentPart === 'before') {
            buffer.push(line);
        }
    }

    saveCurrentSection();

    return sections;
}
