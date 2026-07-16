import * as vscode from 'vscode';

export const CONFIG_SECTION = 'alpinejs';

export const DEFAULT_LANGUAGES = [
	'html', 'php', 'blade', 'jinja-html', 'liquid', 'nunjucks', 'njk', 'twig',
	'astro', 'phoenix-heex', 'html-eex', 'erb', 'django-html', 'handlebars'
];

export type HighlightingMode = 'comment' | 'always';

export function getConfig() {
	return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function highlightingMode(): HighlightingMode {
	return getConfig().get<HighlightingMode>('highlighting.mode', 'comment');
}

export function structuredSnippetsEnabled(): boolean {
	return getConfig().get<boolean>('snippets.structured', true);
}

export function basicSnippetsEnabled(): boolean {
	return getConfig().get<boolean>('snippets.basic', true);
}

export function magicCompletionsEnabled(): boolean {
	return getConfig().get<boolean>('completions.magics', true);
}

export function refCompletionsEnabled(): boolean {
	return getConfig().get<boolean>('completions.refs', true);
}

export function storeCompletionsEnabled(): boolean {
	return getConfig().get<boolean>('completions.stores', true);
}

function diagnosticSeverity(key: string, fallback: string): vscode.DiagnosticSeverity | undefined {
	const value = getConfig().get<string>(key, fallback);
	switch (value) {
		case 'hint': return vscode.DiagnosticSeverity.Hint;
		case 'information': return vscode.DiagnosticSeverity.Information;
		case 'warning': return vscode.DiagnosticSeverity.Warning;
		case 'error': return vscode.DiagnosticSeverity.Error;
		default: return undefined;
	}
}

export function classShorthandSeverity(): vscode.DiagnosticSeverity | undefined {
	return diagnosticSeverity('diagnostics.classShorthand', 'information');
}

export function templateRootSeverity(): vscode.DiagnosticSeverity | undefined {
	return diagnosticSeverity('diagnostics.templateRoot', 'error');
}

export function templateRequiredSeverity(): vscode.DiagnosticSeverity | undefined {
	return diagnosticSeverity('diagnostics.templateRequired', 'error');
}

export function componentCompletionsEnabled(): boolean {
	return getConfig().get<boolean>('completions.components', true);
}

export function eventCompletionsEnabled(): boolean {
	return getConfig().get<boolean>('completions.events', true);
}

export function docsHoversEnabled(): boolean {
	return getConfig().get<boolean>('hovers.docs', true);
}

export function outlineEnabled(): boolean {
	return getConfig().get<boolean>('outline.components', true);
}

export function supportedLanguages(): string[] {
	const languages = getConfig().get<string[]>('languages', DEFAULT_LANGUAGES);
	return languages.length > 0 ? languages : DEFAULT_LANGUAGES;
}

export function documentSelector(): vscode.DocumentSelector {
	return supportedLanguages().map(language => ({ language, scheme: 'file' }));
}
