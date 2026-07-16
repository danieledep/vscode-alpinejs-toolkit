import * as vscode from 'vscode';

export interface CustomEventEntry {
	name: string;
	file: string;
}

const TEMPLATE_GLOB = '**/*.{html,htm,php,twig,liquid,njk,erb,astro,heex,hbs,jinja,j2}';
const LISTENER_REGEX = /(?:x-on:|@)([a-z][\w-]*)/g;
const DISPATCH_REGEX = /\$dispatch\(\s*['"]([\w-]+)/g;
const MAX_FILES = 300;
const MAX_FILE_SIZE = 512 * 1024;

// Standard DOM events — listeners for these are not "custom events" worth
// pairing with $dispatch.
const STANDARD_EVENTS = new Set([
	'click', 'dblclick', 'contextmenu', 'auxclick',
	'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousewheel', 'wheel',
	'keydown', 'keypress', 'keyup',
	'input', 'change', 'submit', 'reset', 'invalid', 'select', 'search',
	'focus', 'blur', 'focusin', 'focusout',
	'scroll', 'scrollend', 'resize',
	'load', 'unload', 'beforeunload', 'error', 'abort',
	'hashchange', 'popstate', 'pageshow', 'pagehide', 'storage', 'message', 'online', 'offline',
	'drag', 'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
	'copy', 'cut', 'paste',
	'touchstart', 'touchmove', 'touchend', 'touchcancel',
	'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
	'animationstart', 'animationend', 'animationiteration',
	'transitionstart', 'transitionend', 'transitionrun', 'transitioncancel',
	'canplay', 'canplaythrough', 'cuechange', 'durationchange', 'emptied', 'ended',
	'loadeddata', 'loadedmetadata', 'loadstart', 'pause', 'play', 'playing', 'progress',
	'ratechange', 'seeked', 'seeking', 'stalled', 'suspend', 'timeupdate', 'volumechange', 'waiting',
	'toggle', 'visibilitychange', 'fullscreenchange'
]);

export function isCustomEvent(name: string): boolean {
	return !STANDARD_EVENTS.has(name.toLowerCase());
}

/**
 * Lazily scans workspace templates for custom-event usage so `$dispatch('...')`
 * can suggest listened event names and `@...`/`x-on:...` can suggest
 * dispatched ones. Cached until a template file changes.
 */
export class AlpineEventIndex {
	private cache: { listened: CustomEventEntry[]; dispatched: CustomEventEntry[] } | undefined;
	private scanning: Promise<void> | undefined;

	constructor(context: vscode.ExtensionContext) {
		const invalidate = () => {
			this.cache = undefined;
		};

		const watcher = vscode.workspace.createFileSystemWatcher(TEMPLATE_GLOB);
		context.subscriptions.push(
			watcher,
			watcher.onDidChange(invalidate),
			watcher.onDidCreate(invalidate),
			watcher.onDidDelete(invalidate)
		);
	}

	async getListened(): Promise<CustomEventEntry[]> {
		await this.ensureScanned();
		return this.cache?.listened ?? [];
	}

	async getDispatched(): Promise<CustomEventEntry[]> {
		await this.ensureScanned();
		return this.cache?.dispatched ?? [];
	}

	private async ensureScanned(): Promise<void> {
		if (this.cache) return;
		if (!this.scanning) {
			this.scanning = this.scan().finally(() => {
				this.scanning = undefined;
			});
		}
		return this.scanning;
	}

	private async scan(): Promise<void> {
		const listened = new Map<string, string>();
		const dispatched = new Map<string, string>();

		const files = await vscode.workspace.findFiles(
			TEMPLATE_GLOB,
			'**/{node_modules,vendor}/**',
			MAX_FILES
		);

		for (const file of files) {
			try {
				const stat = await vscode.workspace.fs.stat(file);
				if (stat.size > MAX_FILE_SIZE) continue;

				const bytes = await vscode.workspace.fs.readFile(file);
				const text = Buffer.from(bytes).toString('utf8');
				const relative = vscode.workspace.asRelativePath(file);

				let match: RegExpExecArray | null;
				const listenerRegex = new RegExp(LISTENER_REGEX.source, LISTENER_REGEX.flags);
				while ((match = listenerRegex.exec(text)) !== null) {
					if (isCustomEvent(match[1]) && !listened.has(match[1])) {
						listened.set(match[1], relative);
					}
				}

				const dispatchRegex = new RegExp(DISPATCH_REGEX.source, DISPATCH_REGEX.flags);
				while ((match = dispatchRegex.exec(text)) !== null) {
					if (isCustomEvent(match[1]) && !dispatched.has(match[1])) {
						dispatched.set(match[1], relative);
					}
				}
			} catch {
				// Unreadable file — skip it.
			}
		}

		this.cache = {
			listened: [...listened.entries()].map(([name, file]) => ({ name, file })),
			dispatched: [...dispatched.entries()].map(([name, file]) => ({ name, file }))
		};
	}
}
