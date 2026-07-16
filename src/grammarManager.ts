import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { highlightingMode, HighlightingMode } from './settings';

// TextMate grammars are loaded once per window, so switching the highlighting
// mode works by overwriting the contributed grammar file with the matching
// pre-built variant and asking for a window reload.
const GRAMMAR_TARGET = 'syntaxes/injection.json';
const GRAMMAR_VARIANTS: Record<HighlightingMode, string> = {
	comment: 'syntaxes/injection.comment.json',
	always: 'syntaxes/injection.always.json'
};

async function syncGrammar(extensionPath: string): Promise<void> {
	const mode = highlightingMode();
	const sourcePath = path.join(extensionPath, GRAMMAR_VARIANTS[mode]);
	const targetPath = path.join(extensionPath, GRAMMAR_TARGET);

	try {
		const source = await fs.readFile(sourcePath, 'utf8');
		const target = await fs.readFile(targetPath, 'utf8').catch(() => '');
		if (source === target) return;

		await fs.writeFile(targetPath, source, 'utf8');
	} catch (error) {
		console.error('alpinejs: unable to update the highlighting grammar', error);
		return;
	}

	const action = await vscode.window.showInformationMessage(
		`Alpine.js highlighting mode is now "${mode}". Reload the window to apply it.`,
		'Reload Window'
	);
	if (action === 'Reload Window') {
		vscode.commands.executeCommand('workbench.action.reloadWindow');
	}
}

export function setupGrammarManager(context: vscode.ExtensionContext): void {
	// Make sure the grammar on disk matches the setting, e.g. after an
	// extension update reset it to the packaged default.
	void syncGrammar(context.extensionPath);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('alpinejs.highlighting.mode')) {
				void syncGrammar(context.extensionPath);
			}
		})
	);
}
