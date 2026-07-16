import * as vscode from 'vscode';
import { AlpineGlobalsIndex } from './globalsIndex';
import { findXDataComponentNames } from './alpineUtils';

const STORE_USE_REGEX = /\$store\.([A-Za-z_$][\w$]*)/g;

/**
 * Go-to-definition from `$store.name` to `Alpine.store('name', ...)` and from
 * an `x-data` component name to `Alpine.data('name', ...)`.
 */
export class AlpineGlobalsDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private globalsIndex: AlpineGlobalsIndex) {}

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Location | undefined> {
		const text = document.getText();
		const offset = document.offsetAt(position);

		const storeRegex = new RegExp(STORE_USE_REGEX.source, STORE_USE_REGEX.flags);
		let match: RegExpExecArray | null;
		while ((match = storeRegex.exec(text)) !== null) {
			const nameStart = match.index + match[0].length - match[1].length;
			if (offset >= nameStart && offset <= nameStart + match[1].length) {
				return this.globalsIndex.findDefinition('store', match[1]);
			}
		}

		for (const component of findXDataComponentNames(text)) {
			if (offset >= component.offset && offset <= component.offset + component.length) {
				return this.globalsIndex.findDefinition('data', component.name);
			}
		}

		return undefined;
	}
}
