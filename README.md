<div align="center">

# Obsidian Stat Blocks

An Obsidian plugin for creating D&D 5e/5.5e stat blocks from TOML.

</div>

## Overview

Write a fenced `monster` code block in an Obsidian Markdown note. In Live Preview, it renders as a themed stat block when the cursor is outside the block and becomes editable TOML when the cursor enters it. Reading view always shows the rendered stat block.

Start with the [usage guide](docs/usage.md), then see the [format token reference](docs/format.md), [preset reference](docs/presets.md), or the [`Ancient Red Dragon`](examples/ancient-red-dragon.toml) and [`Lich`](examples/lich.toml) examples.

## Quickstart

```bash
bun install
bun run dev     # watch build with inline sourcemaps
# or
bun run build   # typecheck and production bundle
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/obsidian-stat-blocks/`, enable **Stat Blocks** under **Settings → Community plugins**, and reload Obsidian after rebuilding.

## Features

- TOML-backed `monster` code blocks.
- Live Preview rendering with cursor-based source editing.
- TOML syntax highlighting while editing.
- Calculated ability modifiers, attack bonuses, save DCs, damage averages, hit points, proficiency bonuses, and XP.
- Traits, actions, bonus actions, reactions, legendary actions, villain actions, and mythic actions.
- Markdown rendering inside stat block text, including wiki links, hyperlinks, emphasis, and other formatting.
- Theme-aware styling using Obsidian CSS variables.

## Project Stack

- TypeScript
- Obsidian 1.5+
- `smol-toml`
- CodeMirror 6 and `@codemirror/legacy-modes`
- esbuild
- Bun
