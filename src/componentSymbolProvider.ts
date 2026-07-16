import * as vscode from 'vscode';
import { extractTopLevelKeys } from './dataKeys';
import { outlineEnabled } from './settings';

const X_DATA_REGEX = /x-data(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?(?=[\s>=/])/g;

/**
 * Lists every Alpine component (x-data) in the file outline and breadcrumbs.
 * Named components show their name; inline objects show a preview of their
 * top-level keys.
 */
export class AlpineComponentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		if (!outlineEnabled()) return [];

		const text = document.getText();
		const symbols: vscode.DocumentSymbol[] = [];
		const regex = new RegExp(X_DATA_REGEX.source, X_DATA_REGEX.flags);

		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			const value = (match[1] ?? match[2] ?? '').trim();
			const name = this.symbolName(value);
			const detail = this.enclosingTagName(text, match.index);

			const attrRange = new vscode.Range(
				document.positionAt(match.index),
				document.positionAt(match.index + match[0].length)
			);

			symbols.push(new vscode.DocumentSymbol(
				name,
				detail ? `<${detail}>` : '',
				vscode.SymbolKind.Object,
				attrRange,
				attrRange
			));
		}

		return symbols;
	}

	private symbolName(value: string): string {
		if (value === '') return 'x-data';

		const named = /^([A-Za-z_$][\w$]*)/.exec(value);
		if (named && !value.startsWith('{')) return named[1];

		if (value.startsWith('{')) {
			const keys = extractTopLevelKeys(value);
			if (keys.length === 0) return 'x-data';
			const preview = keys.slice(0, 3).join(', ');
			return keys.length > 3 ? `{ ${preview}, … }` : `{ ${preview} }`;
		}

		return 'x-data';
	}

	private enclosingTagName(text: string, attrOffset: number): string | undefined {
		const tagStart = text.lastIndexOf('<', attrOffset);
		if (tagStart === -1) return undefined;
		const tagMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(text.slice(tagStart, tagStart + 60));
		return tagMatch?.[1];
	}
}
