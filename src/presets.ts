import type { ActionItem, AbilityKey, Monster } from "./types";
import { substitute } from "./template";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Wrap each spell name in italics unless it already carries markdown/link syntax. */
function italicSpell(name: unknown): string {
  const s = String(name ?? "").trim();
  if (s === "") return "";
  if (/[\[\]*_`]/.test(s)) return s;
  return `*${s}*`;
}

function spellList(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.map(italicSpell).filter(Boolean).join(", ");
}

/** Suffix appended to an item's name: "(3/Day)" or "(Recharge 5–6)". */
export function itemSuffix(item: ActionItem): string {
  if (item.uses != null && item.interval) {
    return ` (${item.uses}/${item.interval})`;
  }
  if (item.recharge_min != null) {
    const min = item.recharge_min;
    const max = item.recharge_max;
    if (max != null && max !== min) return ` (Recharge ${min}\u2013${max})`;
    return ` (Recharge ${min}\u20136)`;
  }
  return "";
}

function abilityLong(a: AbilityKey): string {
  return { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[a];
}

function normalizeAbility(a: string | undefined): AbilityKey {
  const s = (a ?? "").toLowerCase().trim();
  if (["str", "dex", "con", "int", "wis", "cha"].includes(s)) return s as AbilityKey;
  return "wis";
}

function subject(m: Monster, capitalize = false): string {
  const base = m.shortened_name?.trim() || m.name || "monster";
  const withArticle = Boolean(m.shortened_name?.trim() && !m.proper_noun);
  const phrase = withArticle ? `the ${base}` : base;
  return capitalize ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
}

/**
 * Synthesize the markdown description for a preset ability/action.
 * Returns null when the preset is empty/unknown, so the caller falls back
 * to the item's own `description`.
 */
export function presetDescription(item: ActionItem, m: Monster): string | null {
  const preset = (item.preset ?? "").trim().toLowerCase();
  if (preset === "" || preset === "none") return null;

  switch (preset) {
    case "attack": {
      const reach = item.reach;
      const sr = item.short_range;
      const lr = item.long_range;
      const hasMelee = reach != null;
      const hasRanged = sr != null;
      const kind = hasMelee && hasRanged ? "Melee or Ranged" : hasRanged ? "Ranged" : "Melee";

      let ability: AbilityKey;
      if (item.ability) ability = normalizeAbility(item.ability as string);
      else if (hasRanged && !hasMelee) ability = "dex";
      else ability = "str";
      const abU = ability.toUpperCase();

      const reachPart = hasMelee ? `reach ${reach} ft.` : "";
      const rangePart = hasRanged ? `range ${sr}/${lr} ft.` : "";
      let where: string;
      if (hasMelee && hasRanged) where = `${reachPart} or ${rangePart}`;
      else if (hasMelee) where = reachPart;
      else where = rangePart;

      const dice = `${item.die_count ?? 1}D${item.die_size ?? 6}`;
      const dmgType = (item.damage_type ?? "damage").trim();
      return `*${kind} Weapon Attack:* {{${abU} ATK}} to hit, ${where}, one target. *Hit:* {{${abU} ${dice}}} ${dmgType} damage.`;
    }

    case "legendary_resistance": {
      return `If ${subject(m)} fails a saving throw, it can choose to succeed instead.`;
    }

    case "spellcasting": {
      const ability = normalizeAbility(item.ability as string);
      const abU = ability.toUpperCase();
      const level = item.level ?? 1;
      const cls = item.class ?? "";
      const spells = item.spells;
      const lines: string[] = [];
      lines.push(
        `${subject(m, true)} is a ${level}-level spellcaster. Its spellcasting ability is ${abilityLong(ability)} (spell save DC {{${abU} SAVE}}, {{${abU} ATK}} to hit with spell attacks). ${subject(m, true)} has the following ${cls} spells prepared:`,
      );
      lines.push("");
      if (Array.isArray(spells)) {
        const cantrips = spells[0];
        if (Array.isArray(cantrips) && cantrips.length) {
          lines.push(`- Cantrips (at will): ${spellList(cantrips)}`);
        }
        for (let lvl = 1; lvl <= 9; lvl++) {
          const entry = spells[lvl];
          if (!Array.isArray(entry) || entry.length < 2) continue;
          const slots = entry[0];
          const prepared = entry[1];
          if (!Array.isArray(prepared) || prepared.length === 0) continue;
          lines.push(`- ${ordinal(lvl)} level (${slots} slots): ${spellList(prepared)}`);
        }
      }
      return lines.join("\n");
    }

    case "innate_spellcasting": {
      const ability = normalizeAbility(item.ability as string);
      const abU = ability.toUpperCase();
      const spells = item.spells;
      const lines: string[] = [];
      lines.push(
        `${subject(m, true)}'s innate spellcasting ability is ${abilityLong(ability)} (spell save DC {{${abU} SAVE}}, {{${abU} ATK}} to hit with spell attacks). ${subject(m, true)} can innately cast the following spells, requiring no material components:`,
      );
      lines.push("");
      if (Array.isArray(spells)) {
        for (const group of spells) {
          if (!Array.isArray(group) || group.length < 2) continue;
          const perDay = group[0];
          const names = group[1];
          if (!Array.isArray(names) || names.length === 0) continue;
          const label = Number(perDay) === -1 ? "At will" : `${perDay}/day each`;
          lines.push(`- ${label}: ${spellList(names)}`);
        }
      }
      return lines.join("\n");
    }

    default:
      return null;
  }
}

/** Substitute {{MON}} etc. in a synthesized/preset description. */
export function finalizeDescription(description: string, m: Monster): string {
  return substitute(description, m);
}
