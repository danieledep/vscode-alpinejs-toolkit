import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { basicSnippetsEnabled, structuredSnippetsEnabled } from './settings';

interface SnippetDefinition {
	prefix: string | string[];
	body: string | string[];
	description?: string;
}

type SnippetFile = Record<string, SnippetDefinition>;

interface LoadedSnippet {
	name: string;
	prefix: string;
	body: string;
	description: string;
	set: 'structured' | 'basic';
}

// Characters that can be part of an Alpine attribute token, e.g. "@click.prevent"
const TOKEN_CHAR = /[\w\-@:.$]/;

async function loadSnippetFile(
	filePath: string,
	set: LoadedSnippet['set']
): Promise<LoadedSnippet[]> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		const parsed: SnippetFile = JSON.parse(raw);

		return Object.entries(parsed).flatMap(([name, definition]) => {
			const prefixes = Array.isArray(definition.prefix)
				? definition.prefix
				: [definition.prefix];
			const body = Array.isArray(definition.body)
				? definition.body.join('\n')
				: definition.body;

			return prefixes.map(prefix => ({
				name,
				prefix,
				body,
				description: definition.description ?? '',
				set
			}));
		});
	} catch (error) {
		console.error(`alpinejs: unable to load snippets from ${filePath}`, error);
		return [];
	}
}

export class AlpineSnippetCompletionProvider implements vscode.CompletionItemProvider {
	private snippets: LoadedSnippet[] = [];

	static async create(extensionPath: string): Promise<AlpineSnippetCompletionProvider> {
		const provider = new AlpineSnippetCompletionProvider();
		const [structured, basic] = await Promise.all([
			loadSnippetFile(path.join(extensionPath, 'snippets/structured.code-snippets'), 'structured'),
			loadSnippetFile(path.join(extensionPath, 'snippets/basic.code-snippets'), 'basic')
		]);
		provider.snippets = [...structured, ...basic];
		return provider;
	}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.CompletionItem[] {
		const structuredOn = structuredSnippetsEnabled();
		const basicOn = basicSnippetsEnabled();
		if (!structuredOn && !basicOn) return [];

		const line = document.lineAt(position.line).text;
		const token = this.tokenBefore(line, position.character);

		const items: vscode.CompletionItem[] = [];
		for (const snippet of this.snippets) {
			if (snippet.set === 'structured' && !structuredOn) continue;
			if (snippet.set === 'basic' && !basicOn) continue;

			const range = this.replacementRange(snippet, token, position);
			if (!range) continue;

			const item = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
			item.insertText = new vscode.SnippetString(snippet.body);
			item.filterText = snippet.prefix;
			item.range = range;
			item.detail = snippet.set === 'structured'
				? 'Alpine.js snippet (structured)'
				: 'Alpine.js snippet';
			if (snippet.description) {
				item.documentation = new vscode.MarkdownString(snippet.description);
			}
			if (snippet.set === 'structured') {
				// When both sets offer the same prefix, list the structured one first.
				item.sortText = `0${snippet.prefix}`;
			}
			items.push(item);
		}

		return items;
	}

	private tokenBefore(line: string, character: number): { text: string; start: number } {
		let start = character;
		while (start > 0 && TOKEN_CHAR.test(line[start - 1])) {
			start--;
		}
		return { text: line.slice(start, character), start };
	}

	private replacementRange(
		snippet: LoadedSnippet,
		token: { text: string; start: number },
		position: vscode.Position
	): vscode.Range | undefined {
		if (snippet.prefix.startsWith('.')) {
			// Modifiers only make sense chained onto an Alpine attribute,
			// e.g. "@click.", "x-transition.", ":class." or a bare ".pre".
			const lastDot = token.text.lastIndexOf('.');
			if (lastDot === -1) return undefined;
			const base = token.text.slice(0, lastDot);
			if (base !== '' && !/^[@:]|^x-/.test(base)) return undefined;
			return new vscode.Range(
				position.line, token.start + lastDot,
				position.line, position.character
			);
		}

		// Attribute snippets: skip when the user is clearly typing a modifier chain.
		if (token.text.includes('.')) return undefined;
		return new vscode.Range(
			position.line, token.start,
			position.line, position.character
		);
	}
}
