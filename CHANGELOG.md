# Change Log

## [0.1.1]

- Changed `x-data` component navigation (Cmd+click and Go to Definition) to open the matching component file first, falling back to the `Alpine.data('name', ...)` registration line when no file matches

## [0.1.0]

- Renamed the extension from `alpinejs-comment-hl` to `vscode-alpinejs-toolkit` (display name: Alpine.js Toolkit)
- Added hover documentation and attribute autocompletion for all core Alpine.js directives (via HTML custom data)
- Added magic property completions (`$el`, `$refs`, `$store`, `$watch`, `$dispatch`, ...)
- Added `$refs.` completions from `x-ref="name"` definitions in the current file
- Added `$store.` completions from `Alpine.store('name', ...)` registrations across the workspace
- Added a basic snippet set covering every directive and modifier, alongside the existing structured snippets
- Added a `:class` shorthand hint with Quick Fix: ternaries with an empty branch (e.g. `open ? 'is-open' : ''`) are underlined and can be converted to Alpine's class object syntax, with configurable severity
- Added full plugin coverage (Mask, Intersect, Resize, Persist, Focus, Collapse, Anchor, Sort): directive docs, snippets, modifiers and the `$persist`/`$focus`/`$anchor` magics
- Added an error when `x-if`, `x-for` or `x-teleport` is used on an element other than `<template>`
- Added component name completions inside `x-data="..."` and go-to-definition for `x-data` components and `$store.name` (component links now open the exact `Alpine.data(...)` line when available)
- Added `$refs` go-to-definition, find-all-references and rename (F2 renames `x-ref` and all `$refs.` usages together)
- Added directive/magic hover documentation in all supported languages (Blade, Twig, ERB, Astro, ...), not just HTML
- Added `$dispatch('...')` ↔ listener event-name pairing completions across workspace templates
- Added `$watch('...')` data-key completions and `$id('...')` scope-name completions
- Added Alpine components (`x-data`) to the file outline and breadcrumbs
- Renamed the structured snippets file to `snippets/structured.code-snippets`
- Added `alpinejs.highlighting.mode` setting: `comment` (default, original behaviour) or `always`
- Added settings to toggle each snippet set, each completion provider and the template diagnostics
- Added `alpinejs.languages` setting to control which languages the providers run in
- Fixed the diagnostics debounce so edits in one file no longer cancel pending checks in another
- Added support for Astro (`source.astro`), Phoenix HEEx/EEx (`source.heex`, `text.html.elixir`), ERB (`text.html.erb`), Django templates (`text.html.django`) and Handlebars (`text.html.handlebars`), and fixed Blade highlighting by injecting into `text.html.php.blade` (the scope used by the Laravel Blade extension)

## [1.0.1]

- added numeric attribute support (i.e. @keyup.debounce.2000ms=)

## [1.0.0]

- Initial release
