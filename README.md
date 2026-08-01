<div align="center">

# Obsidian Stat Blocks

Template and Plugin for Obsidian to create Stat Blocks for D&D 5e/5.5e

</div>


## Overview

A simple Obsidian plugin to render 5e/5.5e monster stat blocks specified as TOML
nicely in Obsidian vaults.

Write a fenced code block with the `monster` language:

<pre>
```monster
name = "Randhanu"

[basics]
size      = "gargantuan"
type      = "celestial"
alignment = "chaotic good"
flavor    = "A gargantuan fish ..."

[stats]
base_ac         = 15
add_dex         = true
armor           = "natural armor"
hit_dice        = 14
speed           = [0, 0, 0, 0, 90]
ability_scores  = [22, 17, 22, 18, 22, 25]

[proficiencies]
saves                  = ["dex", "con", "cha"]
skills                 = ["perception", "persuasion"]
condition_immunities   = ["charmed", "exhaustion", "frightened"]
senses                 = [0, 120, 0, 60, 120]
challenge              = 16

[[action]]
name        = "Bite"
description = "*Melee Weapon Attack:* {{STR ATK}} to hit, reach 5 ft., one target. *Hit:* {{STR 3D10}} piercing damage."
```
</pre>

While your editing cursor is **inside** the block, you get Obsidian's TOML
syntax highlighting on the raw source. As soon as the cursor leaves the block,
it is replaced by a rendered stat block (in your vault's theme colors).

See [`randhanu.toml`](./randhanu.toml) for a full example and
[`format.md`](./format.md) / [`presets.md`](./presets.md) for the
`{{...}}` token and preset syntax.

### Software Stack / Technologies Used

- Language: TypeScript
- Target: Obsidian 1.5+ (CodeMirror 6 based editor)
- Parsing: TOML via [`smol-toml`](https://www.npmjs.com/package/smol-toml)
- Editor highlighting: CM6 `ViewPlugin` with the `@codemirror/legacy-modes`
  TOML stream parser
- Rendering: `registerMarkdownCodeBlockProcessor` + `MarkdownRenderer` (so
  wiki links, hyperlinks, and markdown formatting remain live inside the
  stat block text)
- Build: esbuild, bun

## Quickstart

```bash
bun install
bun run dev     # watch build -> main.js (with inline sourcemaps)
# or
bun run build   # production build (typecheck + minified main.js)
```

To use the plugin in a vault, copy `main.js`, `manifest.json`, and
`styles.css` into `<vault>/.obsidian/plugins/obsidian-stat-blocks/` and
enable "Stat Blocks" in Settings → Community plugins. Reload Obsidian after
editing the plugin.