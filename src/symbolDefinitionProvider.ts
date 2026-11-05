import * as vscode from 'vscode';
import { AlpineGlobalsIndex } from './globalsIndex';
import { findComponentFiles } from './alpineUtils';
import { KeyEntry } from './dataKeys';
import {
	findComponentDeclaration,
	findComponentObjectKeys,
	findStoreObjectKeys,
	findSymbolAt
} from './symbolScope';
import { symbolDefinitionsEnabled } from './settings';

/**
 * Go-to-definition (and the Ctrl/Cmd+hover underline) for Alpine data used
 * inside attribute values: `x-for` loop variables, keys of the enclosing
 * inline `x-data` objects, keys returned by `Alpine.data(...)` or component
 * functions, and `$store.name.property`.
 */
export class AlpineSymbolDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private globalsIndex: AlpineGlobalsIndex) {}

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.DefinitionLink[] | undefined> {
		if (!symbolDefinitionsEnabled()) return undefined;

		const text = document.getText();
		const query = findSymbolAt(text, document.offsetAt(position));
		if (!query) return undefined;

		const originSelectionRange = new vscode.Range(
			document.positionAt(query.start),
			document.positionAt(query.end)
		);
		const link = (target: vscode.TextDocument, offset: number, length: number): vscode.DefinitionLink[] => {
			const range = new vscode.Range(target.positionAt(offset), target.positionAt(offset + length));
			return [{ originSelectionRange, targetUri: target.uri, targetRange: range, targetSelectionRange: range }];
		};

		if (query.kind === 'storeProperty') {
			const store = await this.globalsIndex.findDefinition('store', query.store);
			if (!store) return undefined;
			const target = await vscode.workspace.openTextDocument(store.uri);
			const key = findStoreObjectKeys(target.getText(), target.offsetAt(store.range.start))
				.find(entry => entry.name === query.name);
			return key ? link(target, key.offset, key.name.length) : undefined;
		}

		for (const scope of query.scopes) {
			if (token.isCancellationRequested) return undefined;

			if (scope.kind === 'loop' || scope.kind === 'inline') {
				const entries = scope.kind === 'loop' ? scope.names : scope.keys;
				const hit = entries.find(entry => entry.name === query.name);
				if (hit) return link(document, hit.offset, hit.name.length);
				continue;
			}

			const found = await this.findComponentKey(document, scope.name, query.name);
			if (found) return link(found.document, found.key.offset, found.key.name.length);
		}

		return undefined;
	}

	/**
	 * Looks for `key` in the data object of component `name`: first in this
	 * document (inline <script>), then at its `Alpine.data` registration,
	 * then in a file named after the component.
	 */
	private async findComponentKey(
		document: vscode.TextDocument,
		name: string,
		key: string
	): Promise<{ document: vscode.TextDocument; key: KeyEntry } | undefined> {
		const candidates: { uri: vscode.Uri }[] = [{ uri: document.uri }];

		const registration = await this.globalsIndex.findDefinition('data', name);
		if (registration) candidates.push({ uri: registration.uri });
		for (const file of await findComponentFiles(name)) candidates.push({ uri: file });

		const seen = new Set<string>();
		for (const candidate of candidates) {
			const id = candidate.uri.toString();
			if (seen.has(id)) continue;
			seen.add(id);

			const target = candidate.uri.toString() === document.uri.toString()
				? document
				: await vscode.workspace.openTextDocument(candidate.uri);
			const source = target.getText();
			const declaration = findComponentDeclaration(source, name);
			// Only a file named after the component may omit the declaration.
			if (declaration === undefined && target === document) continue;

			const hit = findComponentObjectKeys(source, declaration ?? 0).find(entry => entry.name === key);
			if (hit) return { document: target, key: hit };
		}
		return undefined;
	}
}
