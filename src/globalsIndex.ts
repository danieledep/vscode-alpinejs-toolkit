import * as vscode from 'vscode';

export type AlpineGlobalKind = 'store' | 'data';

export interface AlpineGlobalEntry {
	name: string;
	kind: AlpineGlobalKind;
	/** Workspace-relative path (or a label for inline entries), for documentation. */
	file: string;
	uri?: vscode.Uri;
	/** 0-based position of the name inside the registration call. */
	line?: number;
	character?: number;
}

const GLOBAL_REGEX = /\bAlpine\s*\.\s*(store|data)\s*\(\s*['"`]([^'"`]+)/g;
const MAX_FILES = 300;
const MAX_FILE_SIZE = 512 * 1024;

function offsetToPosition(text: string, offset: number): { line: number; character: number } {
	let line = 0;
	let lineStart = 0;
	for (let i = 0; i < offset; i++) {
		if (text.charCodeAt(i) === 10) {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, character: offset - lineStart };
}

/**
 * Lazily scans the workspace for `Alpine.store('name', ...)` and
 * `Alpine.data('name', ...)` registrations. The result is cached until a
 * JS/TS file changes, so the (bounded) scan only runs when a completion or
 * definition lookup actually asks for it.
 */
export class AlpineGlobalsIndex {
	private cache: AlpineGlobalEntry[] | undefined;
	private scanning: Promise<AlpineGlobalEntry[]> | undefined;

	constructor(context: vscode.ExtensionContext) {
		const invalidate = () => {
			this.cache = undefined;
		};

		const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,mjs,cjs,ts}');
		context.subscriptions.push(
			watcher,
			watcher.onDidChange(invalidate),
			watcher.onDidCreate(invalidate),
			watcher.onDidDelete(invalidate)
		);
	}

	async getAll(): Promise<AlpineGlobalEntry[]> {
		if (this.cache) return this.cache;
		if (!this.scanning) {
			this.scanning = this.scan().finally(() => {
				this.scanning = undefined;
			});
		}
		return this.scanning;
	}

	async getByKind(kind: AlpineGlobalKind): Promise<AlpineGlobalEntry[]> {
		return (await this.getAll()).filter(entry => entry.kind === kind);
	}

	async findDefinition(kind: AlpineGlobalKind, name: string): Promise<vscode.Location | undefined> {
		const entry = (await this.getAll()).find(e => e.kind === kind && e.name === name);
		if (!entry?.uri || entry.line === undefined || entry.character === undefined) {
			return undefined;
		}
		return new vscode.Location(
			entry.uri,
			new vscode.Position(entry.line, entry.character)
		);
	}

	private async scan(): Promise<AlpineGlobalEntry[]> {
		const entries: AlpineGlobalEntry[] = [];
		const seen = new Set<string>();

		const files = await vscode.workspace.findFiles(
			'**/*.{js,mjs,cjs,ts}',
			'**/node_modules/**',
			MAX_FILES
		);

		for (const file of files) {
			try {
				const stat = await vscode.workspace.fs.stat(file);
				if (stat.size > MAX_FILE_SIZE) continue;

				const bytes = await vscode.workspace.fs.readFile(file);
				const text = Buffer.from(bytes).toString('utf8');

				for (const entry of this.globalsInText(text, vscode.workspace.asRelativePath(file))) {
					const key = `${entry.kind}:${entry.name}`;
					if (seen.has(key)) continue;
					seen.add(key);
					entries.push({ ...entry, uri: file });
				}
			} catch {
				// Unreadable file — skip it.
			}
		}

		this.cache = entries;
		return entries;
	}

	/** Registrations found in the given text (e.g. an inline <script> tag). */
	globalsInText(text: string, label: string): AlpineGlobalEntry[] {
		const entries: AlpineGlobalEntry[] = [];
		const regex = new RegExp(GLOBAL_REGEX.source, GLOBAL_REGEX.flags);
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			const name = match[2];
			const nameOffset = match.index + match[0].length - name.length;
			const position = offsetToPosition(text, nameOffset);
			entries.push({
				name,
				kind: match[1] as AlpineGlobalKind,
				file: label,
				line: position.line,
				character: position.character
			});
		}
		return entries;
	}
}
