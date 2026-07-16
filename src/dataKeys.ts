// Pure helpers for extracting names from Alpine expressions in a document.
// Deliberately free of any 'vscode' import so they can be tested in plain Node.

/**
 * Extracts the top-level property and method names from a JavaScript object
 * literal source (starting at its opening brace). Conservative by design:
 * spread and computed keys are skipped, anything unparseable is ignored.
 */
export function extractTopLevelKeys(objectSource: string): string[] {
	const start = objectSource.indexOf('{');
	if (start === -1) return [];

	const segments: string[] = [];
	let depth = 1;
	let segmentStart = start + 1;
	let quote: string | undefined;
	let i = start + 1;

	for (; i < objectSource.length; i++) {
		const char = objectSource[i];

		if (quote) {
			if (char === '\\') { i++; continue; }
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') { quote = char; continue; }

		if (char === '{' || char === '[' || char === '(') { depth++; continue; }
		if (char === '}' || char === ']' || char === ')') {
			depth--;
			if (depth === 0) break;
			continue;
		}
		if (char === ',' && depth === 1) {
			segments.push(objectSource.slice(segmentStart, i));
			segmentStart = i + 1;
		}
	}
	segments.push(objectSource.slice(segmentStart, i));

	const keys: string[] = [];
	for (const segment of segments) {
		const trimmed = segment.trim();
		if (trimmed === '' || trimmed.startsWith('...') || trimmed.startsWith('[')) continue;

		const quoted = /^(['"])([^'"]+)\1\s*:/.exec(trimmed);
		if (quoted) {
			keys.push(quoted[2]);
			continue;
		}

		const plain = /^(?:async\s+)?(?:get\s+|set\s+)?\*?\s*([A-Za-z_$][\w$]*)/.exec(trimmed);
		if (!plain) continue;
		const name = plain[1];
		const rest = trimmed.slice(plain[0].length).trimStart();
		// Property (`open: false`), method (`toggle() {}`), or shorthand (`open`).
		if (rest.startsWith(':') || rest.startsWith('(') || rest === '') {
			keys.push(name);
		}
	}

	return [...new Set(keys)];
}

const X_DATA_ATTR_REGEX = /x-data\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const X_ID_ATTR_REGEX = /x-id\s*=\s*(?:"\s*\[([^\]]*)\]\s*"|'\s*\[([^\]]*)\]\s*')/g;

/** Union of top-level keys across all inline x-data objects in the text. */
export function findInlineDataKeys(text: string): string[] {
	const keys = new Set<string>();
	const regex = new RegExp(X_DATA_ATTR_REGEX.source, X_DATA_ATTR_REGEX.flags);
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const value = (match[1] ?? match[2]).trim();
		if (!value.startsWith('{')) continue;
		for (const key of extractTopLevelKeys(value)) keys.add(key);
	}
	return [...keys];
}

/** Names declared in x-id="['name', ...]" arrays across the text. */
export function findXIdNames(text: string): string[] {
	const names = new Set<string>();
	const regex = new RegExp(X_ID_ATTR_REGEX.source, X_ID_ATTR_REGEX.flags);
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const list = match[1] ?? match[2];
		const itemRegex = /['"]([^'"]+)['"]/g;
		let item: RegExpExecArray | null;
		while ((item = itemRegex.exec(list)) !== null) {
			names.add(item[1]);
		}
	}
	return [...names];
}
