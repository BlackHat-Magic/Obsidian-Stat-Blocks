# Usage

## Install

Build the plugin from the project root:

```bash
bun install
bun run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/obsidian-stat-blocks/`. Enable **Stat Blocks** under **Settings → Community plugins**, then reload Obsidian after rebuilding.

For development, use `bun run dev` to keep a watch build running.

## Create A Stat Block

Add a fenced `monster` block to any Markdown note:

````markdown
```monster
name = "Ancient Red Dragon"

[basics]
size = "gargantuan"
type = "dragon"
alignment = "chaotic evil"
flavor = ""

[stats]
base_ac = 22
add_dex = false
armor = "natural armor"
hit_dice = 28
speed = [40, 0, 40, 80, 0]
ability_scores = [30, 10, 29, 18, 15, 23]

[proficiencies]
saves = ["dex", "con", "wis", "cha"]
skills = ["perception", "stealth"]
damage_immunities = ["fire"]
senses = [60, 120, 0, 0, 0]
challenge = 24

[[action]]
name = "Bite"
preset = ""
description = "*Melee Weapon Attack:* {{STR ATK}} to hit, reach 15 ft., one target. *Hit:* {{STR 2D10}} piercing damage plus {{4D6}} fire damage."
```
````

In Live Preview, the block becomes a rendered stat block when the cursor is outside it. Place the cursor inside the block to edit the TOML with TOML-style syntax highlighting. Reading view always shows the rendered stat block.

## Text And Links

Monster descriptions and flavor text are rendered through Obsidian's Markdown renderer. Wiki links, hyperlinks, emphasis, and other Markdown formatting remain usable inside a stat block:

```toml
flavor = "A guardian of [[Porta Ricchezze]] who follows [an old oath](https://example.com)."
description = "The monster becomes *invisible* and gains **advantage**."
```

Use escaped TOML quotes where necessary, or single-quoted TOML strings when a value contains double quotes.

## Data Layout

The main sections are:

- Top-level identity and flags: `name`, `shortened_name`, `shortened_plural`, `is_legendary`, `is_villain`, `is_mythic`, and their descriptions.
- `[basics]`: `size`, `type`, `tag`, `alignment`, `flavor`.
- `[stats]`: AC inputs, armor note, hit-dice count, speeds, and the six ability scores.
- `[proficiencies]`: saves, skills, expertise, defenses, senses, and challenge rating.
- `[[language]]`: one entry per language, with `status = "speaks"` or `status = "understands"` and an optional `but` value.
- `[[ability]]`: traits.
- `[[action]]`, `[[bonus_action]]`, `[[reaction]]`: normal combat actions.
- `[[legendary_action]]`, `[[villain_action]]`, `[[mythic_action]]`: special action sections.

See [Format Tokens](format.md) for calculated placeholders and [Presets](presets.md) for generated attacks and spellcasting text.

## Examples

- [`examples/ancient-red-dragon.toml`](../examples/ancient-red-dragon.toml) demonstrates legendary actions, recharge actions, and calculated attack/damage tokens.
- [`examples/lich.toml`](../examples/lich.toml) demonstrates a legendary spellcaster, resistances/immunities, and Markdown-formatted spell lists.
