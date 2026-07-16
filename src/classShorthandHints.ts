import * as vscode from 'vscode';
import { findClassShorthandCandidates } from './classShorthand';
import { classShorthandSeverity, supportedLanguages } from './settings';

export const CLASS_SHORTHAND_CODE = 'alpine-class-shorthand';

function analyzeDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
	const severity = classShorthandSeverity();
	if (severity === undefined) return [];

	return findClassShorthandCandidates(document.getText()).map(candidate => {
		const range = new vscode.Range(
			document.positionAt(candidate.attrStart),
			document.positionAt(candidate.attrEnd)
		);
		const diag = new vscode.Diagnostic(
			range,
			`Can be written using Alpine's class object syntax: ${candidate.replacement}`,
			severity
		);
		diag.source = 'alpinejs';
		diag.code = CLASS_SHORTHAND_CODE;
		return diag;
	});
}

export class ClassShorthandCodeActionProvider implements vscode.CodeActionProvider {
	static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
	};

	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext
	): vscode.CodeAction[] {
		const diagnostics = context.diagnostics.filter(
			diag => diag.code === CLASS_SHORTHAND_CODE
		);
		if (diagnostics.length === 0) return [];

		const candidates = findClassShorthandCandidates(document.getText());
		const actions: vscode.CodeAction[] = [];

		for (const diag of diagnostics) {
			const candidate = candidates.find(c =>
				document.positionAt(c.attrStart).isEqual(diag.range.start) &&
				document.positionAt(c.attrEnd).isEqual(diag.range.end)
			);
			if (!candidate) continue;

			const action = new vscode.CodeAction(
				'Convert to class object syntax',
				vscode.CodeActionKind.QuickFix
			);
			action.diagnostics = [diag];
			action.isPreferred = true;
			action.edit = new vscode.WorkspaceEdit();
			action.edit.replace(
				document.uri,
				new vscode.Range(
					document.positionAt(candidate.valueStart),
					document.positionAt(candidate.valueEnd)
				),
				candidate.replacement
			);
			actions.push(action);
		}

		return actions;
	}
}

export function setupClassShorthandHints(context: vscode.ExtensionContext): void {
	const collection = vscode.languages.createDiagnosticCollection('alpinejs-shorthand');
	context.subscriptions.push(collection);

	const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const DEBOUNCE_MS = 500;

	function isSupported(doc: vscode.TextDocument): boolean {
		return supportedLanguages().includes(doc.languageId) && doc.uri.scheme === 'file';
	}

	function scheduleUpdate(document: vscode.TextDocument): void {
		if (!isSupported(document)) { return; }
		const key = document.uri.toString();
		const existing = debounceTimers.get(key);
		if (existing) { clearTimeout(existing); }
		debounceTimers.set(key, setTimeout(() => {
			debounceTimers.delete(key);
			collection.set(document.uri, analyzeDocument(document));
		}, DEBOUNCE_MS));
	}

	function immediateUpdate(document: vscode.TextDocument): void {
		if (!isSupported(document)) { return; }
		collection.set(document.uri, analyzeDocument(document));
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(immediateUpdate),
		vscode.workspace.onDidSaveTextDocument(immediateUpdate),
		vscode.workspace.onDidChangeTextDocument(e => scheduleUpdate(e.document)),
		vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (
				event.affectsConfiguration('alpinejs.diagnostics.classShorthand') ||
				event.affectsConfiguration('alpinejs.languages')
			) {
				collection.clear();
				vscode.workspace.textDocuments.forEach(immediateUpdate);
			}
		})
	);

	vscode.workspace.textDocuments.forEach(immediateUpdate);
}
