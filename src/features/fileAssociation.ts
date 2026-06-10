import * as vscode from 'vscode';
import {
    searchModelineLanguage,
    looksLikePlaybook,
    isYamlExtension,
} from '@src/features/fileDetection';

const SUPPORTED_LANGUAGES = new Set(['ansible', 'yaml']);

/**
 * Apply a modeline language directive from the document when one is present.
 * @param doc - Document whose modeline should be evaluated
 * @returns True when a modeline was found, even if the language is unsupported
 */
async function applyModeline(doc: vscode.TextDocument): Promise<boolean> {
    const lang = searchModelineLanguage(doc.getText());
    if (!lang) {
        return false;
    }

    if (!SUPPORTED_LANGUAGES.has(lang)) {
        vscode.window.showWarningMessage(
            `Unsupported modeline language "${lang}". Supported: ansible, yaml.`,
        );
        return true;
    }

    if (doc.languageId !== lang) {
        await vscode.languages.setTextDocumentLanguage(doc, lang);
    }
    return true;
}

/**
 * Set the document language to ansible when YAML content looks like a playbook.
 * @param doc - Document to inspect for playbook-shaped YAML
 */
async function applyKeywordInspection(doc: vscode.TextDocument): Promise<void> {
    if (doc.isUntitled) {
        return;
    }

    const ext = doc.fileName.split('.').pop();
    if (!isYamlExtension(ext)) {
        return;
    }

    if (doc.languageId === 'ansible') {
        return;
    }

    if (looksLikePlaybook(doc.getText())) {
        await vscode.languages.setTextDocumentLanguage(doc, 'ansible');
    }
}

/**
 * Determine the appropriate language for a document using modeline and heuristics.
 * @param doc - Document to classify on open or save
 */
async function inspectDocument(doc: vscode.TextDocument): Promise<void> {
    if (doc.isUntitled) {
        return;
    }
    if (await applyModeline(doc)) {
        return;
    }
    await applyKeywordInspection(doc);
}

/**
 * Register file-association heuristics that dynamically set a document's
 * language to "ansible" based on modeline comments or playbook-shaped content.
 * @param context - Extension context used to register workspace listeners
 */
export function registerFileAssociation(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            void inspectDocument(doc);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            void inspectDocument(doc);
        }),
    );

    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc) {
        void inspectDocument(activeDoc);
    }
}
