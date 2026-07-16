import * as vscode from 'vscode';
import {
	componentCompletionsEnabled,
	eventCompletionsEnabled,
	magicCompletionsEnabled,
	refCompletionsEnabled,
	storeCompletionsEnabled
} from './settings';
import { AlpineGlobalsIndex } from './globalsIndex';
import { AlpineEventIndex } from './eventIndex';
import { findInlineDataKeys, findXIdNames } from './dataKeys';

const X_REF_REGEX = /x-ref\s*=\s*["']([^"']+)["']/g;

export interface AlpineMagic {
	name: string;
	description: string;
	url: string;
	plugin?: string;
}

export const MAGICS: AlpineMagic[] = [
	{
		name: '$el',
		description: 'Retrieve the current DOM node.',
		url: 'https://alpinejs.dev/magics/el'
	},
	{
		name: '$refs',
		description: 'Retrieve DOM elements marked with `x-ref` inside the component.',
		url: 'https://alpinejs.dev/magics/refs'
	},
	{
		name: '$store',
		description: 'Access a global Alpine store registered with `Alpine.store(...)`.',
		url: 'https://alpinejs.dev/magics/store'
	},
	{
		name: '$watch',
		description: 'Watch a component property and run a callback when it changes.',
		url: 'https://alpinejs.dev/magics/watch'
	},
	{
		name: '$dispatch',
		description: 'Dispatch a custom browser event from the current element.',
		url: 'https://alpinejs.dev/magics/dispatch'
	},
	{
		name: '$nextTick',
		description: 'Execute code after Alpine has finished its reactive DOM updates.',
		url: 'https://alpinejs.dev/magics/nextTick'
	},
	{
		name: '$root',
		description: 'Retrieve the root element of the current component (the closest `x-data` node).',
		url: 'https://alpinejs.dev/magics/root'
	},
	{
		name: '$data',
		description: 'Retrieve the current Alpine data scope as an object.',
		url: 'https://alpinejs.dev/magics/data'
	},
	{
		name: '$id',
		description: 'Generate an element ID that is unique within an `x-id` scope.',
		url: 'https://alpinejs.dev/magics/id'
	},
	{
		name: '$event',
		description: 'Access the browser event object inside an `x-on` expression.',
		url: 'https://alpinejs.dev/directives/on'
	},
	{
		name: '$persist',
		description: 'Persist a piece of `x-data` state across page loads, e.g. `count: $persist(0)`. Supports `.as(\'key\')` and `.using(sessionStorage)`.',
		url: 'https://alpinejs.dev/plugins/persist',
		plugin: '@alpinejs/persist'
	},
	{
		name: '$focus',
		description: 'Programmatically manage focus: `$focus.next()`, `$focus.first()`, `$focus.within($refs.list).last()`, `$focus.wrap()`, ...',
		url: 'https://alpinejs.dev/plugins/focus',
		plugin: '@alpinejs/focus'
	},
	{
		name: '$anchor',
		description: 'Access the computed anchor position (`$anchor.x`, `$anchor.y`) when using `x-anchor.no-style`.',
		url: 'https://alpinejs.dev/plugins/anchor',
		plugin: '@alpinejs/anchor'
	}
];

export class AlpineMagicCompletionProvider implements vscode.CompletionItemProvider {
	constructor(
		private globalsIndex: AlpineGlobalsIndex,
		private eventIndex: AlpineEventIndex
	) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[]> {
		const linePrefix = document
			.lineAt(position.line)
			.text.slice(0, position.character);

		const refsMatch = /\$refs\.(\w*)$/.exec(linePrefix);
		if (refsMatch) {
			if (!refCompletionsEnabled()) return [];
			return this.refItems(document, position, refsMatch[1].length);
		}

		const storeMatch = /\$store\.(\w*)$/.exec(linePrefix);
		if (storeMatch) {
			if (!storeCompletionsEnabled()) return [];
			return this.storeItems(document, position, storeMatch[1].length);
		}

		const dispatchMatch = /\$dispatch\(\s*['"]([\w-]*)$/.exec(linePrefix);
		if (dispatchMatch) {
			if (!eventCompletionsEnabled()) return [];
			return this.eventItems('listened', position, dispatchMatch[1].length);
		}

		const watchMatch = /\$watch\(\s*['"]([\w.]*)$/.exec(linePrefix);
		if (watchMatch) {
			return this.dataKeyItems(document, position, watchMatch[1].length);
		}

		const idMatch = /\$id\(\s*['"]([\w-]*)$/.exec(linePrefix);
		if (idMatch) {
			return this.xIdItems(document, position, idMatch[1].length);
		}

		const componentMatch = /x-data\s*=\s*["']([\w$]*)$/.exec(linePrefix);
		if (componentMatch) {
			if (!componentCompletionsEnabled()) return [];
			return this.componentItems(document, position, componentMatch[1].length);
		}

		const listenerMatch = /(?:^|[\s"'])(?:x-on:|@)([\w-]*)$/.exec(linePrefix);
		if (listenerMatch) {
			if (!eventCompletionsEnabled()) return [];
			return this.eventItems('dispatched', position, listenerMatch[1].length);
		}

		const magicMatch = /\$[\w]*$/.exec(linePrefix);
		if (magicMatch) {
			if (!magicCompletionsEnabled()) return [];
			return this.magicItems(position, magicMatch[0].length);
		}

		return [];
	}

	private replaceRange(position: vscode.Position, typedLength: number): vscode.Range {
		return new vscode.Range(
			position.line, position.character - typedLength,
			position.line, position.character
		);
	}

	private magicItems(position: vscode.Position, typedLength: number): vscode.CompletionItem[] {
		const range = this.replaceRange(position, typedLength);

		return MAGICS.map(magic => {
			const item = new vscode.CompletionItem(magic.name, vscode.CompletionItemKind.Property);
			item.range = range;
			item.detail = magic.plugin
				? `Alpine.js magic (${magic.plugin})`
				: 'Alpine.js magic';
			item.documentation = new vscode.MarkdownString(
				`${magic.description}\n\n[Alpine.js docs](${magic.url})`
			);
			// Keep suggesting after "$refs." / "$store." is committed.
			if (magic.name === '$refs' || magic.name === '$store') {
				item.command = {
					command: 'editor.action.triggerSuggest',
					title: 'Suggest'
				};
				item.insertText = `${magic.name}.`;
			}
			return item;
		});
	}

	private refItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		typedLength: number
	): vscode.CompletionItem[] {
		const range = this.replaceRange(position, typedLength);

		const names = new Set<string>();
		const regex = new RegExp(X_REF_REGEX.source, X_REF_REGEX.flags);
		let match: RegExpExecArray | null;
		while ((match = regex.exec(document.getText())) !== null) {
			names.add(match[1]);
		}

		return [...names].map(name => {
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
			item.range = range;
			item.detail = `x-ref="${name}"`;
			item.documentation = new vscode.MarkdownString(
				`Element marked with \`x-ref="${name}"\` in this file.`
			);
			return item;
		});
	}

	private async storeItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		typedLength: number
	): Promise<vscode.CompletionItem[]> {
		const range = this.replaceRange(position, typedLength);

		const workspaceStores = await this.globalsIndex.getByKind('store');
		const inlineStores = this.globalsIndex
			.globalsInText(document.getText(), vscode.workspace.asRelativePath(document.uri))
			.filter(entry => entry.kind === 'store');

		const byName = new Map<string, string>();
		for (const store of [...workspaceStores, ...inlineStores]) {
			if (!byName.has(store.name)) byName.set(store.name, store.file);
		}

		return [...byName.entries()].map(([name, file]) => {
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
			item.range = range;
			item.detail = 'Alpine.js store';
			item.documentation = new vscode.MarkdownString(
				`Registered with \`Alpine.store('${name}', ...)\` in \`${file}\`.`
			);
			return item;
		});
	}

	private async componentItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		typedLength: number
	): Promise<vscode.CompletionItem[]> {
		const range = this.replaceRange(position, typedLength);

		const workspaceComponents = await this.globalsIndex.getByKind('data');
		const inlineComponents = this.globalsIndex
			.globalsInText(document.getText(), vscode.workspace.asRelativePath(document.uri))
			.filter(entry => entry.kind === 'data');

		const byName = new Map<string, string>();
		for (const component of [...workspaceComponents, ...inlineComponents]) {
			if (!byName.has(component.name)) byName.set(component.name, component.file);
		}

		return [...byName.entries()].map(([name, file]) => {
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
			item.range = range;
			item.detail = 'Alpine.js component';
			item.insertText = name;
			item.documentation = new vscode.MarkdownString(
				`Registered with \`Alpine.data('${name}', ...)\` in \`${file}\`.`
			);
			return item;
		});
	}

	private async eventItems(
		direction: 'listened' | 'dispatched',
		position: vscode.Position,
		typedLength: number
	): Promise<vscode.CompletionItem[]> {
		const range = this.replaceRange(position, typedLength);
		const events = direction === 'listened'
			? await this.eventIndex.getListened()
			: await this.eventIndex.getDispatched();

		return events.map(event => {
			const item = new vscode.CompletionItem(event.name, vscode.CompletionItemKind.Event);
			item.range = range;
			item.detail = direction === 'listened'
				? 'Custom event with listeners'
				: 'Custom event dispatched via $dispatch';
			item.documentation = new vscode.MarkdownString(
				direction === 'listened'
					? `A listener for \`${event.name}\` exists in \`${event.file}\`.`
					: `Dispatched with \`$dispatch('${event.name}')\` in \`${event.file}\`.`
			);
			return item;
		});
	}

	private dataKeyItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		typedLength: number
	): vscode.CompletionItem[] {
		const range = this.replaceRange(position, typedLength);

		return findInlineDataKeys(document.getText()).map(key => {
			const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field);
			item.range = range;
			item.detail = 'Alpine.js data property';
			item.documentation = new vscode.MarkdownString(
				`Top-level property of an \`x-data\` object in this file.`
			);
			return item;
		});
	}

	private xIdItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		typedLength: number
	): vscode.CompletionItem[] {
		const range = this.replaceRange(position, typedLength);

		return findXIdNames(document.getText()).map(name => {
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Value);
			item.range = range;
			item.detail = 'x-id scope';
			item.documentation = new vscode.MarkdownString(
				`Declared in an \`x-id\` array in this file.`
			);
			return item;
		});
	}
}
