// Pure detection logic for the :class ternary → object-syntax hint.
// Deliberately free of any 'vscode' import so it can be tested in plain Node.

export interface ShorthandCandidate {
	/** Offsets of the whole `:class="..."` attribute, used for the squiggle. */
	attrStart: number;
	attrEnd: number;
	/** Offsets of the value between the quotes, used for the rewrite. */
	valueStart: number;
	valueEnd: number;
	replacement: string;
}

// `:class=` or `x-bind:class=` followed by a quoted value (may span lines).
const CLASS_ATTR_REGEX = /(?<![\w:-])(?::|x-bind:)class\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// Bail on anything we can't reason about: template tags, template literals,
// braces (already object syntax, or object expressions).
const UNSAFE_VALUE_REGEX = /<%|`|\{|\}/;

/**
 * Converts an empty-branch ternary to Alpine's class object syntax:
 *   open ? 'is-open' : ''   →  { 'is-open': open }
 *   open ? '' : 'is-closed' →  { 'is-closed': !open }
 * Returns undefined when the value doesn't confidently match.
 */
function convertTernary(value: string, innerQuote: '"' | "'"): string | undefined {
	if (UNSAFE_VALUE_REGEX.test(value)) return undefined;

	const q = innerQuote;
	const ternary = new RegExp(
		`^\\s*([^?]+?)\\s*\\?\\s*${q}([^${q}]*)${q}\\s*:\\s*${q}([^${q}]*)${q}\\s*$`
	);

	const match = ternary.exec(value);
	if (!match) return undefined;

	const condition = match[1].trim();
	const whenTrue = match[2];
	const whenFalse = match[3];
	if (condition === '') return undefined;

	if (whenTrue.trim() !== '' && whenFalse.trim() === '') {
		return `{ ${q}${whenTrue}${q}: ${condition} }`;
	}
	if (whenTrue.trim() === '' && whenFalse.trim() !== '') {
		// Parenthesise the negated condition unless it is a simple reference.
		const negated = /^[\w$.]+$/.test(condition) ? `!${condition}` : `!(${condition})`;
		return `{ ${q}${whenFalse}${q}: ${negated} }`;
	}

	return undefined;
}

export function findClassShorthandCandidates(text: string): ShorthandCandidate[] {
	const candidates: ShorthandCandidate[] = [];
	const regex = new RegExp(CLASS_ATTR_REGEX.source, CLASS_ATTR_REGEX.flags);

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const doubleQuoted = match[1] !== undefined;
		const value = doubleQuoted ? match[1] : match[2];
		// Inner string literals must use the opposite quote to the attribute's.
		const replacement = convertTernary(value, doubleQuoted ? "'" : '"');
		if (!replacement) continue;

		const valueStart = match.index + match[0].length - value.length - 1;
		candidates.push({
			attrStart: match.index,
			attrEnd: match.index + match[0].length,
			valueStart,
			valueEnd: valueStart + value.length,
			replacement
		});
	}

	return candidates;
}
