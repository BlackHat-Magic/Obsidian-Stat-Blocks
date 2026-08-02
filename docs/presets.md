# Presets

Presets generate common D&D text from additional fields. Set an entry's `preset` field to one of the names below.

## `attack`

The `attack` preset adds these fields to an ability or action:

| Field | Description |
| --- | --- |
| `reach` | Melee reach in feet. Its presence adds melee attack text. |
| `short_range` | Short range of a ranged attack in feet. |
| `long_range` | Long range of a ranged attack in feet. |
| `ability` | Ability used for the attack: `str`, `dex`, `con`, `int`, `wis`, or `cha`. Defaults to Strength for melee attacks and Dexterity for ranged attacks. |
| `die_count` | Number of damage dice. |
| `die_size` | Size of each damage die. |
| `damage_type` | Damage type, such as `slashing` or `fire`. |

The attack text includes the appropriate `Melee`, `Ranged`, or `Melee or Ranged Weapon Attack` label:

```toml
[[action]]
name = "Longsword"
preset = "attack"
ability = "str"
reach = 5
die_count = 1
die_size = 8
damage_type = "slashing"
```

## `legendary_resistance`

Use `uses` and `interval` to create the usage suffix:

```toml
[[ability]]
name = "Legendary Resistance"
preset = "legendary_resistance"
uses = 3
interval = "Day"
```

This renders `Legendary Resistance (3/Day).` followed by the standard resistance text. The monster-level `proper_noun` setting controls whether `the` is added to its shortened name.

## `spellcasting`

Fields:

| Field | Description |
| --- | --- |
| `level` | Spellcaster level. |
| `ability` | Spellcasting ability, such as `int` or `wis`. |
| `class` | Spellcasting class, such as `wizard`. |
| `spells` | Nested spell data: `spells[0]` is the cantrip list; `spells[n]` is `[slot_count, prepared_spell_list]` for spell level `n`. |

Only levels present in `spells` are rendered.

## `innate_spellcasting`

Fields:

| Field | Description |
| --- | --- |
| `ability` | Innate spellcasting ability. |
| `spells` | Groups of `[uses_per_day, spell_list]`. A uses value of `-1` renders as `At will`; other values render as `N/day each`. |

The monster-level `proper_noun` setting also controls the article used in generated spellcasting text.
