// Pure helpers that work out which Alpine symbol sits under the cursor and
// which scopes (x-for loops, x-data objects, components) could define it.
// Deliberately free of any 'vscode' import so they can be tested in plain Node.

import { extractTopLevelKeyEntries, KeyEntry } from './dataKeys';

/** A scope that can define names, innermost first. Offsets are absolute. */
export type AlpineScope =
	| { kind: 'loop'; names: KeyEntry[] }
	| { kind: 'inline'; keys: KeyEntry[] }
	| { kind: 'component'; name: string };

export type SymbolQuery =
	| { kind: 'identifier'; name: string; start: number; end: number; scopes: AlpineScope[] }
	| { kind: 'storeProperty'; name: string; store: string; start: number; end: number };

const TAG_REGEX = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_REGEX = /([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|[^\s"'>]+))?/g;
const IDENTIFIER_REGEX = /[A-Za-z_$][\w$]*/g;

const VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr'
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** Alpine attributes whose values are not JavaScript expressions. */
const NON_EXPRESSION_ATTRIBUTES = new Set(['x-transition', 'x-ref', 'x-teleport', 'x-cloak', 'x-ignore']);

interface Attribute {
	name: string;
	value: string;
	/** Absolute offset of the value (just inside the quotes). */
	valueOffset: number;
}

interface Element {
	name: string;
	attributes: Attribute[];
}

function parseAttributes(source: string, sourceOffset: number): Attribute[] {
	const attributes: Attribute[] = [];
	const regex = new RegExp(ATTR_REGEX.source, ATTR_REGEX.flags);
	let match: RegExpExecArray | null;
	while ((match = regex.exec(source)) !== null) {
		const value = match[2] ?? match[3];
		if (value === undefined) continue;
		const quoteIndex = match[0].length - value.length - 1;
		attributes.push({ name: match[1], value, valueOffset: sourceOffset + match.index + quoteIndex });
	}
	return attributes;
}

function isAlpineExpressionAttribute(name: string): boolean {
	if (name.startsWith('@') || name.startsWith(':')) return true;
	if (!name.startsWith('x-')) return false;
	const base = name.split(/[:.]/)[0];
	if (NON_EXPRESSION_ATTRIBUTES.has(base)) return false;
	// `x-mask` takes a plain pattern; `x-mask:dynamic` takes an expression.
	return name !== 'x-mask';
}

/**
 * Walks the document's tags up to `offset`. Returns the open-element stack
 * (outermost first) and the element whose start tag contains `offset`.
 */
function elementsAt(text: string, offset: number): { stack: Element[]; current: Element } | undefined {
	const stack: Element[] = [];
	const regex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > offset) return undefined;
		if (match[2] === undefined) continue; // Comment.

		const closing = match[1] === '/';
		const name = match[2].toLowerCase();
		const end = match.index + match[0].length;

		if (closing) {
			const index = stack.map(element => element.name).lastIndexOf(name);
			if (index !== -1) stack.length = index;
			continue;
		}

		const attrsOffset = match.index + 1 + match[2].length;
		const element: Element = { name, attributes: parseAttributes(match[3], attrsOffset) };

		if (offset < end) return { stack, current: element };

		if (RAW_TEXT_ELEMENTS.has(name)) {
			const close = text.toLowerCase().indexOf(`</${name}`, end);
			if (close === -1 || close > offset) return undefined;
			regex.lastIndex = close;
			continue;
		}
		if (!VOID_ELEMENTS.has(name) && !match[3].trimEnd().endsWith('/')) {
			stack.push(element);
		}
	}
	return undefined;
}

/** Offset of the first non-comment, non-whitespace character. */
function skipLeadingComments(value: string): number {
	return /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/.exec(value)![0].length;
}

/** True when `index` in `value` falls inside a string literal or comment. */
function insideStringOrComment(value: string, index: number): boolean {
	let quote: string | undefined;
	for (let i = 0; i < index; i++) {
		const char = value[i];
		if (quote) {
			if (char === '\\') { i++; continue; }
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === '/' && value[i + 1] === '/') {
			const end = value.indexOf('\n', i);
			if (end === -1 || end >= index) return true;
			i = end;
			continue;
		}
		if (char === '/' && value[i + 1] === '*') {
			const end = value.indexOf('*/', i + 2);
			if (end === -1 || end + 2 > index) return true;
			i = end + 1;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') quote = char;
	}
	return quote !== undefined;
}

function loopNames(attribute: Attribute): KeyEntry[] {
	const match = /^([\s\S]*?)\s+(?:in|of)\s/.exec(attribute.value);
	if (!match) return [];
	const names: KeyEntry[] = [];
	const regex = new RegExp(IDENTIFIER_REGEX.source, IDENTIFIER_REGEX.flags);
	let name: RegExpExecArray | null;
	while ((name = regex.exec(match[1])) !== null) {
		names.push({ name: name[0], offset: attribute.valueOffset + name.index });
	}
	return names;
}

function dataScopes(attribute: Attribute): AlpineScope[] {
	const start = skipLeadingComments(attribute.value);
	const body = attribute.value.slice(start);

	if (body.startsWith('{')) {
		const scopes: AlpineScope[] = [{
			kind: 'inline',
			keys: extractTopLevelKeyEntries(body).map(key => ({
				name: key.name,
				offset: attribute.valueOffset + start + key.offset
			}))
		}];
		const spreadRegex = /\.\.\.\s*([A-Za-z_$][\w$]*)/g;
		let spread: RegExpExecArray | null;
		while ((spread = spreadRegex.exec(body)) !== null) {
			scopes.push({ kind: 'component', name: spread[1] });
		}
		return scopes;
	}

	const named = /^[A-Za-z_$][\w$]*/.exec(body);
	return named ? [{ kind: 'component', name: named[0] }] : [];
}

function scopesOf(element: Element): AlpineScope[] {
	const scopes: AlpineScope[] = [];
	for (const attribute of element.attributes) {
		if (attribute.name === 'x-for') {
			scopes.push({ kind: 'loop', names: loopNames(attribute) });
		}
	}
	for (const attribute of element.attributes) {
		if (attribute.name === 'x-data') scopes.push(...dataScopes(attribute));
	}
	return scopes;
}

/**
 * Finds the Alpine symbol at `offset` (an identifier inside an Alpine
 * attribute value) together with the scopes that could define it.
 */
export function findSymbolAt(text: string, offset: number): SymbolQuery | undefined {
	const elements = elementsAt(text, offset);
	if (!elements) return undefined;

	const attribute = elements.current.attributes.find(attr =>
		offset >= attr.valueOffset && offset <= attr.valueOffset + attr.value.length
	);
	if (!attribute || !isAlpineExpressionAttribute(attribute.name)) return undefined;

	const value = attribute.value;
	const relative = offset - attribute.valueOffset;
	let start = relative;
	let end = relative;
	while (start > 0 && /[\w$]/.test(value[start - 1])) start--;
	while (end < value.length && /[\w$]/.test(value[end])) end++;

	const name = value.slice(start, end);
	if (!/^[A-Za-z_][\w$]*$/.test(name)) return undefined; // Empty, number, or $magic.
	if (insideStringOrComment(value, start)) return undefined;

	const absolute = { start: attribute.valueOffset + start, end: attribute.valueOffset + end };
	const before = value.slice(0, start);

	if (/\.\s*$/.test(before)) {
		const store = /\$store\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*$/.exec(before);
		if (store) return { kind: 'storeProperty', name, store: store[1], ...absolute };
		// Only `this.name` refers to the component; other member access does not.
		if (!/(?:^|[^\w$.])this\s*\.\s*$/.test(before)) return undefined;
	} else if (/[{,]\s*$/.test(before) && /^\s*:(?!:)/.test(value.slice(end))) {
		// A key in an object literal such as `:class="{ active: open }"`.
		return undefined;
	}

	const scopes: AlpineScope[] = [];
	for (const element of [elements.current, ...elements.stack.slice().reverse()]) {
		scopes.push(...scopesOf(element));
	}
	return { kind: 'identifier', name, ...absolute, scopes };
}

/**
 * Finds the top-level keys of the data object a component returns, searching
 * from `anchor` (e.g. the `Alpine.data('name'` call) for the first
 * `return {`, `=> ({` or `export default {`. Offsets are absolute.
 */
export function findComponentObjectKeys(source: string, anchor = 0): KeyEntry[] {
	const regex = /return\s*\{|=>\s*\(\s*\{|export\s+default\s*\{/g;
	regex.lastIndex = anchor;
	const match = regex.exec(source);
	if (!match) return [];
	const brace = match.index + match[0].length - 1;
	return extractTopLevelKeyEntries(source.slice(brace)).map(key => ({
		name: key.name,
		offset: brace + key.offset
	}));
}

/** Top-level keys of the object passed to `Alpine.store('name', {...})`. */
export function findStoreObjectKeys(source: string, anchor: number): KeyEntry[] {
	const rest = source.slice(anchor);
	const match = /^[^,)]*,\s*\{/.exec(rest);
	if (!match) return [];
	const brace = anchor + match[0].length - 1;
	return extractTopLevelKeyEntries(source.slice(brace)).map(key => ({
		name: key.name,
		offset: brace + key.offset
	}));
}

/**
 * Offset in `source` where a component named `name` is declared:
 * `Alpine.data('name'`, `function name(` or `const name =`.
 */
export function findComponentDeclaration(source: string, name: string): number | undefined {
	const escaped = name.replace(/\$/g, '\\$');
	const patterns = [
		new RegExp(`\\bAlpine\\s*\\.\\s*data\\s*\\(\\s*['"\`]${escaped}['"\`]`),
		new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`),
		new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=`)
	];
	for (const pattern of patterns) {
		const match = pattern.exec(source);
		if (match) return match.index;
	}
	return undefined;
}
