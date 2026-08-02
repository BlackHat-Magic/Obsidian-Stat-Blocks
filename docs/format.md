# Format Tokens

Descriptions support template tokens inside `{{...}}`. Tokens are expanded before the text is rendered as Markdown.

| Token | Result |
| --- | --- |
| `{{MON}}` | Monster name, or `shortened_name` when provided. When `proper_noun = false` and a shortened name is used, `the` is prepended automatically. The first character is capitalized when the token starts a sentence. |
| `{{MONS}}` | `shortened_plural` when provided, otherwise the monster name. The first character is capitalized when the token starts a sentence. |
| `{{CHA}}` | Signed Charisma modifier, such as `+7`. The same form works for every ability: `STR`, `DEX`, `CON`, `INT`, `WIS`, and `CHA`. |
| `{{3D6}}` | Average damage plus the dice expression, such as `10 (3d6)`. Averages are rounded down. |
| `{{STR ATK}}` | Strength attack modifier, including proficiency bonus. |
| `{{DEX 2D8}}` | Dexterity-based damage, including the Dexterity modifier, such as `12 (2d8 + 3)`. |
| `{{WIS SAVE}}` | Wisdom save DC: `8 + Wisdom modifier + proficiency bonus`. |

An optional numeric modifier can be added to attack, save, and dice tokens:

```text
{{3D6 + 1}}
{{STR ATK - 2}}
{{WIS SAVE + 3}}
```

## Markdown

Descriptions, flavor text, and other rendered text are passed through Obsidian's Markdown renderer. Wiki links, hyperlinks, emphasis, and other Markdown formatting can be used directly in TOML strings.
