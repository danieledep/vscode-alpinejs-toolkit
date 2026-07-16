import * as vscode from 'vscode';
import { AlpineDataDocumentLinkProvider } from './documentLinkProvider';
import { AlpineDataHoverProvider } from './hoverProvider';
import { setupAlpineDiagnostics } from './diagnosticProvider';
import {
	ClassShorthandCodeActionProvider,
	setupClassShorthandHints
} from './classShorthandHints';
import { setupGrammarManager } from './grammarManager';
import { AlpineSnippetCompletionProvider } from './snippetCompletionProvider';
import { AlpineMagicCompletionProvider } from './magicCompletionProvider';
import { AlpineGlobalsIndex } from './globalsIndex';
import { AlpineEventIndex } from './eventIndex';
import { AlpineRefsNavigationProvider } from './refsNavigationProvider';
import { AlpineGlobalsDefinitionProvider } from './globalsDefinitionProvider';
import { AlpineDocsHoverProvider } from './docsHoverProvider';
import { AlpineComponentSymbolProvider } from './componentSymbolProvider';
import { documentSelector } from './settings';

export async function activate(context: vscode.ExtensionContext) {
	setupGrammarManager(context);
	setupAlpineDiagnostics(context);
	setupClassShorthandHints(context);

	const globalsIndex = new AlpineGlobalsIndex(context);
	const eventIndex = new AlpineEventIndex(context);

	const [snippetProvider, docsHoverProvider] = await Promise.all([
		AlpineSnippetCompletionProvider.create(context.extensionPath),
		AlpineDocsHoverProvider.create(context.extensionPath)
	]);
	const magicProvider = new AlpineMagicCompletionProvider(globalsIndex, eventIndex);
	const refsProvider = new AlpineRefsNavigationProvider();
	const globalsDefinitionProvider = new AlpineGlobalsDefinitionProvider(globalsIndex);
	const symbolProvider = new AlpineComponentSymbolProvider();

	// Providers are registered against the configured languages; when that
	// setting changes they are disposed and re-registered on the fly.
	let providerDisposables: vscode.Disposable[] = [];

	function registerProviders(): void {
		providerDisposables.forEach(disposable => disposable.dispose());

		const selector = documentSelector();
		providerDisposables = [
			vscode.languages.registerDocumentLinkProvider(
				selector,
				new AlpineDataDocumentLinkProvider(globalsIndex)
			),
			vscode.languages.registerHoverProvider(
				selector,
				new AlpineDataHoverProvider()
			),
			vscode.languages.registerHoverProvider(
				selector,
				docsHoverProvider
			),
			vscode.languages.registerCompletionItemProvider(
				selector,
				snippetProvider,
				':', '@', '.'
			),
			vscode.languages.registerCompletionItemProvider(
				selector,
				magicProvider,
				'$', '.', "'", '"', '@'
			),
			vscode.languages.registerCodeActionsProvider(
				selector,
				new ClassShorthandCodeActionProvider(),
				ClassShorthandCodeActionProvider.metadata
			),
			vscode.languages.registerDefinitionProvider(selector, refsProvider),
			vscode.languages.registerDefinitionProvider(selector, globalsDefinitionProvider),
			vscode.languages.registerReferenceProvider(selector, refsProvider),
			vscode.languages.registerRenameProvider(selector, refsProvider),
			vscode.languages.registerDocumentSymbolProvider(
				selector,
				symbolProvider,
				{ label: 'Alpine.js' }
			)
		];
	}

	registerProviders();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('alpinejs.languages')) {
				registerProviders();
			}
		}),
		new vscode.Disposable(() => {
			providerDisposables.forEach(disposable => disposable.dispose());
		})
	);
}

export function deactivate() {}
