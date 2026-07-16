import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { docsHoversEnabled } from './settings';
import { MAGICS } from './magicCompletionProvider';

interface HtmlDataAttribute {
	name: string;
	description?: { value: string };
	references?: Array<{ name: string; url: string }>;
}

const ATTR_TOKEN_REGEX = /[@:]?[A-Za-z][\w-]*(?::[A-Za-z][\w-]*)?/;
const MAGIC_TOKEN_REGEX = /\$[A-Za-z]\w*/;

/**
 * Hover documentation for Alpine directives and magics in every supported
 * language. VS Code's HTML custom data only reaches languages served by the
 * built-in HTML service, so plain `html` is skipped here (it already gets
 * directive hovers) while Blade, Twig, ERB, Astro etc. are covered.
 */
export class AlpineDocsHoverProvider implements vscode.HoverProvider {
	private attributeDocs = new Map<string, vscode.MarkdownString>();
	private magicDocs = new Map<string, vscode.MarkdownString>();

	static async create(extensionPath: string): Promise<AlpineDocsHoverProvider> {
		const provider = new AlpineDocsHoverProvider();

		try {
			const raw = await fs.readFile(
				path.join(extensionPath, 'syntaxes/alpine.html-data.json'),
				'utf8'
			);
			const data: { globalAttributes: HtmlDataAttribute[] } = JSON.parse(raw);
			for (const attribute of data.globalAttributes) {
				if (!attribute.description) continue;
				let value = attribute.description.value;
				const reference = attribute.references?.[0];
				if (reference) {
					value += `\n\n[${reference.name}](${reference.url})`;
				}
				provider.attributeDocs.set(attribute.name, new vscode.MarkdownString(value));
			}
		} catch (error) {
			console.error('alpinejs: unable to load directive docs for hovers', error);
		}

		for (const magic of MAGICS) {
			const suffix = magic.plugin ? `\n\n*Requires the \`${magic.plugin}\` plugin.*` : '';
			provider.magicDocs.set(magic.name, new vscode.MarkdownString(
				`### ${magic.name}\n\n${magic.description}${suffix}\n\n[Alpine.js Reference](${magic.url})`
			));
		}

		return provider;
	}

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Hover | undefined {
		if (!docsHoversEnabled()) return undefined;

		const magicRange = document.getWordRangeAtPosition(position, MAGIC_TOKEN_REGEX);
		if (magicRange) {
			const docs = this.magicDocs.get(document.getText(magicRange));
			if (docs) return new vscode.Hover(docs, magicRange);
		}

		// The built-in HTML service already shows custom-data hovers in html files.
		if (document.languageId === 'html') return undefined;

		const attrRange = document.getWordRangeAtPosition(position, ATTR_TOKEN_REGEX);
		if (!attrRange) return undefined;

		const docs = this.lookupAttribute(document.getText(attrRange));
		if (!docs) return undefined;
		return new vscode.Hover(docs, attrRange);
	}

	private lookupAttribute(token: string): vscode.MarkdownString | undefined {
		// Strip modifiers: "@click.prevent" was already cut at the first "."
		// by the token regex; normalise the shorthands.
		if (token.startsWith('@')) {
			return this.attributeDocs.get('x-on:');
		}
		if (token.startsWith(':')) {
			return this.attributeDocs.get(`x-bind${token}`) ?? this.attributeDocs.get('x-bind:');
		}
		if (!token.startsWith('x-')) return undefined;

		const exact = this.attributeDocs.get(token);
		if (exact) return exact;

		const colon = token.indexOf(':');
		if (colon !== -1) {
			const base = token.slice(0, colon);
			return this.attributeDocs.get(`${base}:`) ?? this.attributeDocs.get(base);
		}
		return undefined;
	}
}
