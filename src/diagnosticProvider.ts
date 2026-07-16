import * as vscode from 'vscode';
import {
	supportedLanguages,
	templateRequiredSeverity,
	templateRootSeverity
} from './settings';

const TEMPLATE_DIRECTIVE_REGEX = /<template\b(?=[^>]*\bx-(?:for|if)\b)[^>]*>/gi;

const VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\/?>/g;

function countDirectChildren(text: string, startOffset: number): { childCount: number; closingTagEnd: number } {
	const tagRegex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
	tagRegex.lastIndex = startOffset;

	let depth = 0;
	let childCount = 0;
	let match: RegExpExecArray | null;

	while ((match = tagRegex.exec(text)) !== null) {
		const fullTag = match[0];
		const tagName = match[1].toLowerCase();
		const isClosing = fullTag.startsWith('</');
		const isSelfClosing = fullTag.endsWith('/>');

		if (isClosing && tagName === 'template' && depth === 0) {
			return { childCount, closingTagEnd: match.index + fullTag.length };
		}

		if (isClosing) {
			depth--;
		} else {
			if (depth === 0) {
				childCount++;
			}
			if (!isSelfClosing && !VOID_ELEMENTS.has(tagName)) {
				depth++;
			}
		}
	}

	return { childCount, closingTagEnd: text.length };
}

// Open tags, tolerating quoted attribute values that contain ">".
const OPEN_TAG_REGEX = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const TEMPLATE_ONLY_DIRECTIVE_REGEX = /\bx-(if|for|teleport)\s*=/;

function checkTemplateRequired(document: vscode.TextDocument, severity: vscode.DiagnosticSeverity): vscode.Diagnostic[] {
	const text = document.getText();
	const diagnostics: vscode.Diagnostic[] = [];
	const tagRegex = new RegExp(OPEN_TAG_REGEX.source, OPEN_TAG_REGEX.flags);

	let match: RegExpExecArray | null;
	while ((match = tagRegex.exec(text)) !== null) {
		const tagName = match[1].toLowerCase();
		if (tagName === 'template') continue;

		const attrs = match[2];
		const directive = TEMPLATE_ONLY_DIRECTIVE_REGEX.exec(attrs);
		if (!directive) continue;

		const directiveOffset = match.index + 1 + match[1].length + directive.index;
		const directiveName = `x-${directive[1]}`;
		const range = new vscode.Range(
			document.positionAt(directiveOffset),
			document.positionAt(directiveOffset + directiveName.length)
		);

		const diag = new vscode.Diagnostic(
			range,
			`${directiveName} only works on a <template> tag, not <${tagName}>.`,
			severity
		);
		diag.source = 'alpinejs';
		diagnostics.push(diag);
	}

	return diagnostics;
}

function checkTemplateRoot(document: vscode.TextDocument, severity: vscode.DiagnosticSeverity): vscode.Diagnostic[] {
	const text = document.getText();
	const diagnostics: vscode.Diagnostic[] = [];
	const regex = new RegExp(TEMPLATE_DIRECTIVE_REGEX.source, TEMPLATE_DIRECTIVE_REGEX.flags);

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const openTagStart = match.index;
		const openTagEnd = match.index + match[0].length;
		const result = countDirectChildren(text, openTagEnd);

		if (result.childCount > 1) {
			const directive = /x-(for|if)/.exec(match[0]);
			const directiveName = directive ? `x-${directive[1]}` : 'x-for/x-if';

			const range = new vscode.Range(
				document.positionAt(openTagStart),
				document.positionAt(result.closingTagEnd)
			);

			const diag = new vscode.Diagnostic(
				range,
				`<template ${directiveName}> must contain exactly one root element, but found ${result.childCount}.`,
				severity
			);
			diag.source = 'alpinejs';
			diagnostics.push(diag);
		}
	}

	return diagnostics;
}

function analyzeDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const rootSeverity = templateRootSeverity();
	if (rootSeverity !== undefined) {
		diagnostics.push(...checkTemplateRoot(document, rootSeverity));
	}
	const requiredSeverity = templateRequiredSeverity();
	if (requiredSeverity !== undefined) {
		diagnostics.push(...checkTemplateRequired(document, requiredSeverity));
	}
	return diagnostics;
}

export function setupAlpineDiagnostics(context: vscode.ExtensionContext): void {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('alpinejs');
	context.subscriptions.push(diagnosticCollection);

	const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const DEBOUNCE_MS = 500;

	function isSupported(doc: vscode.TextDocument): boolean {
		return supportedLanguages().includes(doc.languageId) && doc.uri.scheme === 'file';
	}

	function anyCheckEnabled(): boolean {
		return templateRootSeverity() !== undefined || templateRequiredSeverity() !== undefined;
	}

	function scheduleUpdate(document: vscode.TextDocument): void {
		if (!anyCheckEnabled() || !isSupported(document)) { return; }
		const key = document.uri.toString();
		const existing = debounceTimers.get(key);
		if (existing) { clearTimeout(existing); }
		debounceTimers.set(key, setTimeout(() => {
			debounceTimers.delete(key);
			diagnosticCollection.set(document.uri, analyzeDocument(document));
		}, DEBOUNCE_MS));
	}

	function immediateUpdate(document: vscode.TextDocument): void {
		if (!anyCheckEnabled() || !isSupported(document)) { return; }
		diagnosticCollection.set(document.uri, analyzeDocument(document));
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(immediateUpdate),
		vscode.workspace.onDidSaveTextDocument(immediateUpdate),
		vscode.workspace.onDidChangeTextDocument(e => scheduleUpdate(e.document)),
		vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (
				event.affectsConfiguration('alpinejs.diagnostics.templateRoot') ||
				event.affectsConfiguration('alpinejs.diagnostics.templateRequired') ||
				event.affectsConfiguration('alpinejs.languages')
			) {
				diagnosticCollection.clear();
				vscode.workspace.textDocuments.forEach(immediateUpdate);
			}
		})
	);

	vscode.workspace.textDocuments.forEach(immediateUpdate);
}
