# vscode-alpinejs-toolkit

IntelliSense tools for [Alpine.js](https://alpinejs.dev/): JavaScript syntax highlighting inside `x-` attributes, directive documentation and autocompletion, `$refs`/`$store`/magic suggestions, component file linking, snippets and template diagnostics.

Everything is built on the APIs VS Code already exposes — no language server, no background processes.

## Syntax highlighting

By default, `x-` attribute values are highlighted as JavaScript when they start with a marker comment:

```html
  x-data="{
    // javascript
    open: false
  }"
```

It also renders greyed-out comments inside `x-` attributes:

```html
  x-data="{
    // just a grey comment
    open: false
  }"
```

Set `alpinejs.highlighting.mode` to `always` to highlight every `x-` attribute value as JavaScript without needing a comment. Changing the mode prompts a window reload (TextMate grammars load once per window).

Note: `always` mode also treats template tags (Twig, Jinja, ...) inside attribute values as JavaScript — stick to `comment` mode in those files.

### Supported marker comments

```js
// js
/* js */
// javascript
/* javascript */
// MARK: js
/* MARK: js */
// MARK: javascript
/* MARK: javascript */
// #region js
/* #region js */
// #region javascript
/* #region javascript */
```

## Directive documentation & autocompletion

All core Alpine.js directives (`x-data`, `x-show`, `x-on:`, `x-bind:`, `x-model`, ...) and the official plugin directives (`x-mask`, `x-intersect`, `x-resize`, `x-trap`, `x-collapse`, `x-anchor`, `x-sort`) get hover documentation and attribute autocompletion in HTML files, powered by VS Code's built-in HTML language service via custom data — with links to the official docs. In the other supported languages (Blade, Twig, ERB, Astro, ...), the same directive and magic documentation is shown by the extension's own hover provider (`alpinejs.hovers.docs`).

## Smart completions

- Typing `$` inside an attribute value suggests Alpine magics (`$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, `$id`, `$event`, plus `$persist`, `$focus`, `$anchor` from plugins) with documentation.
- `$refs.` suggests every name defined with `x-ref="name"` in the current file.
- `$store.` suggests every store registered with `Alpine.store('name', ...)` across the workspace (scanned lazily, cached until a JS/TS file changes).
- `x-data="..."` suggests component names registered with `Alpine.data('name', ...)` across the workspace.
- `$dispatch('...')` suggests custom event names that have listeners in your templates, and `@`/`x-on:` suggests custom events dispatched somewhere in the workspace.
- `$watch('...')` suggests top-level properties of the `x-data` objects in the file; `$id('...')` suggests names declared in `x-id` arrays.

## Navigation

- Cmd+click (or Ctrl+click) on an `x-data` component name opens its `Alpine.data('name', ...)` registration at the exact line when the workspace defines one, falling back to the matching component file (camelCase or kebab-case `.js`/`.ts`). Hovering shows the resolved file path.
- Go to Definition works on `$store.name` (jumps to `Alpine.store('name', ...)`) and on `$refs.name` (jumps to the `x-ref="name"` element).
- Find All References and Rename (F2) work on `x-ref` names — renaming updates the `x-ref` attribute and every `$refs.` usage in the file together.
- Every `x-data` component appears in the file outline and breadcrumbs, named after its component function or a preview of its data keys.

## Diagnostics

- `<template x-if>` and `<template x-for>` must contain exactly one root element — the extension reports an error when they don't (`alpinejs.diagnostics.templateRoot`).
- `x-if`, `x-for` and `x-teleport` only work on `<template>` tags — using them on any other element is flagged, since Alpine silently ignores them there (`alpinejs.diagnostics.templateRequired`).

## Class shorthand hints

When a `:class` ternary with an empty branch could use Alpine's class object syntax, the extension underlines it and offers a Quick Fix:

```html
<div :class="open ? 'is-open' : ''">     →  <div :class="{ 'is-open': open }">
<div :class="open ? '' : 'is-closed'">   →  <div :class="{ 'is-closed': !open }">
```

Detection is deliberately conservative — nested ternaries, template tags and expressions it can't confidently rewrite are left alone. Control the squiggle severity (or turn it off) with `alpinejs.diagnostics.classShorthand`.

## Snippets

Two sets, individually toggleable and applied without reloading:

- **Structured** (`alpinejs.snippets.structured`) — opinionated multi-line snippets: `x-if`/`x-for` expand to full `<template>` blocks, `x-data` expands to a multi-line object, `x-transition` expands the full enter/leave stack, plus `:class`, `:style` and `@keydown` helpers.
- **Basic** (`alpinejs.snippets.basic`) — single-attribute snippets for every core and plugin directive, plus event/model/transition/plugin modifiers and key modifiers (`.prevent`, `.debounce`, `.escape`, `.threshold`, `.inert`, ...).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `alpinejs.highlighting.mode` | `comment` | `comment` requires a `// js` marker, `always` highlights every `x-` attribute value as JavaScript. |
| `alpinejs.snippets.structured` | `true` | Opinionated multi-line snippets. |
| `alpinejs.snippets.basic` | `true` | Single-attribute directive and modifier snippets. |
| `alpinejs.completions.magics` | `true` | `$magic` suggestions. |
| `alpinejs.completions.refs` | `true` | `$refs.` suggestions from `x-ref` in the current file. |
| `alpinejs.completions.stores` | `true` | `$store.` suggestions from `Alpine.store(...)` in the workspace. |
| `alpinejs.completions.components` | `true` | Component name suggestions inside `x-data="..."` from `Alpine.data(...)`. |
| `alpinejs.completions.events` | `true` | `$dispatch('...')` ↔ `@`/`x-on:` custom event pairing. |
| `alpinejs.hovers.docs` | `true` | Directive/magic documentation on hover outside plain HTML files. |
| `alpinejs.outline.components` | `true` | `x-data` components in the outline and breadcrumbs. |
| `alpinejs.diagnostics.classShorthand` | `information` | Severity of the `:class` ternary → object syntax suggestion (`off`, `hint`, `information`, `warning`, `error`). |
| `alpinejs.diagnostics.templateRoot` | `error` | Severity of the single-root-element check for `<template x-if/x-for>` (`off` disables it). |
| `alpinejs.diagnostics.templateRequired` | `error` | Severity of the check flagging `x-if`/`x-for`/`x-teleport` outside a `<template>` tag (`off` disables it). |
| `alpinejs.diagnostics.missingComponent` | `error` | Severity of the check flagging `x-data` component references with no backing file in the workspace (`off` disables it). |
| `alpinejs.languages` | html, php, blade, jinja-html, liquid, nunjucks, njk, twig, astro, phoenix-heex, html-eex, erb, django-html, handlebars | Languages the providers are active for. |

## Supported Files

- Html
- Astro
- Blade
- Django templates
- ERB (Rails)
- Handlebars
- HEEx / EEx (Phoenix)
- Jinja
- Liquid
- Nunjucks
- Php
- Twig

Language support (grammar, language id) for Astro, Blade, HEEx and the template languages comes from their own VS Code extensions — e.g. `astro-build.astro-vscode`, `onecentlin.laravel-blade`, `phoenixframework.phoenix`. This extension injects into their scopes and runs its providers on their language ids.

## Credit

This started as a fork of [Sperovita/alpinejs-syntax-highlight](https://github.com/Sperovita/alpinejs-syntax-highlight)

Based off of textmate syntaxes from [Vetur](https://github.com/vuejs/vetur)

Directive documentation adapted from the [Alpine.js docs](https://alpinejs.dev/), inspired by [pcbowers/alpine-intellisense](https://github.com/pcbowers/alpine-intellisense) and [ConnorOnTheWeb/alpinejs-tools](https://github.com/ConnorOnTheWeb/alpinejs-tools)
