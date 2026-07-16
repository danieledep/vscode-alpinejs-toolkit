import * as vscode from 'vscode';

const REF_DEF_REGEX = /x-ref\s*=\s*["']([^"']+)["']/g;
const REF_USE_REGEX = /\$refs\.([A-Za-z_$][\w$]*)/g;

interface RefOccurrence {
	name: string;
	/** Offsets of just the name. */
	start: number;
	end: number;
	isDefinition: boolean;
}

function findRefOccurrences(text: string): RefOccurrence[] {
	const occurrences: RefOccurrence[] = [];

	const defRegex = new RegExp(REF_DEF_REGEX.source, REF_DEF_REGEX.flags);
	let match: RegExpExecArray | null;
	while ((match = defRegex.exec(text)) !== null) {
		const name = match[1];
		const start = match.index + match[0].length - 1 - name.length;
		occurrences.push({ name, start, end: start + name.length, isDefinition: true });
	}

	const useRegex = new RegExp(REF_USE_REGEX.source, REF_USE_REGEX.flags);
	while ((match = useRegex.exec(text)) !== null) {
		const name = match[1];
		const start = match.index + match[0].length - name.length;
		occurrences.push({ name, start, end: start + name.length, isDefinition: false });
	}

	return occurrences;
}

function refAtPosition(
	document: vscode.TextDocument,
	position: vscode.Position
): { occurrence: RefOccurrence; range: vscode.Range; all: RefOccurrence[] } | undefined {
	const all = findRefOccurrences(document.getText());
	const offset = document.offsetAt(position);

	for (const occurrence of all) {
		if (offset >= occurrence.start && offset <= occurrence.end) {
			const range = new vscode.Range(
				document.positionAt(occurrence.start),
				document.positionAt(occurrence.end)
			);
			return { occurrence, range, all };
		}
	}
	return undefined;
}

/**
 * Document-local navigation for x-ref: go-to-definition and find-references
 * on `$refs.name`, and rename that keeps `x-ref="name"` and all `$refs.name`
 * usages in sync.
 */
export class AlpineRefsNavigationProvider
	implements vscode.DefinitionProvider, vscode.ReferenceProvider, vscode.RenameProvider {

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Location[] | undefined {
		const hit = refAtPosition(document, position);
		if (!hit) return undefined;

		return hit.all
			.filter(o => o.isDefinition && o.name === hit.occurrence.name)
			.map(o => new vscode.Location(
				document.uri,
				new vscode.Range(document.positionAt(o.start), document.positionAt(o.end))
			));
	}

	provideReferences(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.ReferenceContext
	): vscode.Location[] | undefined {
		const hit = refAtPosition(document, position);
		if (!hit) return undefined;

		return hit.all
			.filter(o => o.name === hit.occurrence.name)
			.filter(o => context.includeDeclaration || !o.isDefinition)
			.map(o => new vscode.Location(
				document.uri,
				new vscode.Range(document.positionAt(o.start), document.positionAt(o.end))
			));
	}

	prepareRename(
		document: vscode.TextDocument,
		position: vscode.Position
	): { range: vscode.Range; placeholder: string } {
		const hit = refAtPosition(document, position);
		if (!hit) {
			throw new Error('You can only rename Alpine.js x-ref names here.');
		}
		return { range: hit.range, placeholder: hit.occurrence.name };
	}

	provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string
	): vscode.WorkspaceEdit | undefined {
		const hit = refAtPosition(document, position);
		if (!hit) return undefined;
		if (!/^[A-Za-z_$][\w$]*$/.test(newName)) {
			throw new Error(`"${newName}" is not a valid x-ref name.`);
		}

		const edit = new vscode.WorkspaceEdit();
		for (const occurrence of hit.all) {
			if (occurrence.name !== hit.occurrence.name) continue;
			edit.replace(
				document.uri,
				new vscode.Range(
					document.positionAt(occurrence.start),
					document.positionAt(occurrence.end)
				),
				newName
			);
		}
		return edit;
	}
}
