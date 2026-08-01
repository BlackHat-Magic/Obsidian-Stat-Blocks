import type { AbilityKey, Monster } from "./types";

export const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_LONG: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ALL_SKILLS: Record<string, AbilityKey> = {
  acrobatics: "dex",
  animal_handling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleight_of_hand: "dex",
  stealth: "dex",
  survival: "wis",
};

const SKILL_DISPLAY: Record<string, string> = {
  acrobatics: "Acrobatics",
  animal_handling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleight_of_hand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

export const SIZE_HIT_DIE: Record<string, number> = {
  tiny: 4,
  small: 6,
  medium: 8,
  large: 10,
  huge: 12,
  gargantuan: 20,
};

const CR_XP: Array<[number, number]> = [
  [0, 10],
  [0.125, 25],
  [0.25, 50],
  [0.5, 100],
  [1, 200],
  [2, 450],
  [3, 700],
  [4, 1100],
  [5, 1800],
  [6, 2300],
  [7, 2900],
  [8, 3900],
  [9, 5000],
  [10, 5900],
  [11, 7200],
  [12, 8400],
  [13, 10000],
  [14, 11500],
  [15, 13000],
  [16, 15000],
  [17, 18000],
  [18, 20000],
  [19, 22000],
  [20, 25000],
  [21, 33000],
  [22, 41000],
  [23, 50000],
  [24, 62000],
  [25, 75000],
  [26, 90000],
  [27, 105000],
  [28, 120000],
  [29, 135000],
  [30, 155000],
];

export function parseCR(cr: number | string | undefined): number {
  if (cr == null) return 0;
  if (typeof cr === "number") return cr;
  const s = cr.trim().toLowerCase();
  if (s === "") return 0;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map((p) => Number(p.trim()));
    if (a != null && b != null && b !== 0) return a / b;
  }
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function crLabel(cr: number | string | undefined): string {
  const v = parseCR(cr);
  if (v === 0) return "0";
  if (v === 0.125) return "1/8";
  if (v === 0.25) return "1/4";
  if (v === 0.5) return "1/2";
  if (Number.isInteger(v)) return String(v);
  return cr == null ? "0" : String(cr);
}

export function proficiencyBonus(cr: number | string | undefined): number {
  const v = parseCR(cr);
  if (v <= 4) return 2;
  if (v <= 8) return 3;
  if (v <= 12) return 4;
  if (v <= 16) return 5;
  if (v <= 20) return 6;
  if (v <= 24) return 7;
  if (v <= 28) return 8;
  return 9;
}

export function xpForCR(cr: number | string | undefined): number {
  const v = parseCR(cr);
  let best = 0;
  for (const [threshold, xp] of CR_XP) {
    if (v >= threshold) best = xp;
  }
  return best;
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function abilityMod(score: number | undefined): number {
  const s = score ?? 10;
  return Math.floor((s - 10) / 2);
}

export function abilityMods(m: Monster): Record<AbilityKey, number> {
  const scores = m.stats?.ability_scores ?? [10, 10, 10, 10, 10, 10];
  return {
    str: abilityMod(scores[0]),
    dex: abilityMod(scores[1]),
    con: abilityMod(scores[2]),
    int: abilityMod(scores[3]),
    wis: abilityMod(scores[4]),
    cha: abilityMod(scores[5]),
  };
}

export function abilityScores(m: Monster): Record<AbilityKey, number> {
  const s = m.stats?.ability_scores ?? [10, 10, 10, 10, 10, 10];
  return {
    str: s[0] ?? 10,
    dex: s[1] ?? 10,
    con: s[2] ?? 10,
    int: s[3] ?? 10,
    wis: s[4] ?? 10,
    cha: s[5] ?? 10,
  };
}

export function proficiencyFromMonster(m: Monster): number {
  return proficiencyBonus(m.proficiencies?.challenge);
}

export function armorClass(m: Monster): number {
  const st = m.stats ?? {};
  const mods = abilityMods(m);
  let ac = st.base_ac ?? 10;
  if (st.add_dex) {
    const dex = mods.dex;
    ac += typeof st.max_dex === "number" && st.max_dex >= 0 ? Math.min(dex, st.max_dex) : dex;
  }
  return ac;
}

export function hitPoints(m: Monster): { hp: number; formula: string } {
  const size = (m.basics?.size ?? "medium").toLowerCase();
  const die = SIZE_HIT_DIE[size] ?? 8;
  const count = m.stats?.hit_dice ?? 1;
  const con = abilityMods(m).con;
  const avg = Math.floor((count * (die + 1)) / 2);
  const hp = avg + count * con;
  const bonus = count * con;
  const formula = bonus >= 0 ? `${count}d${die} + ${bonus}` : `${count}d${die} - ${Math.abs(bonus)}`;
  return { hp, formula };
}

export function saveDC(m: Monster, ability: AbilityKey): number {
  const mods = abilityMods(m);
  return 8 + mods[ability] + proficiencyFromMonster(m);
}

export function attackMod(m: Monster, ability: AbilityKey): number {
  const mods = abilityMods(m);
  return mods[ability] + proficiencyFromMonster(m);
}

export function skillAbility(skill: string): AbilityKey {
  return ALL_SKILLS[skill.toLowerCase()] ?? "wis";
}

export function skillDisplayName(skill: string): string {
  return SKILL_DISPLAY[skill.toLowerCase()] ?? skill;
}

export function passivePerception(m: Monster): number {
  const mods = abilityMods(m);
  const pb = proficiencyFromMonster(m);
  let bonus = mods.wis;
  const skills = m.proficiencies?.skills ?? [];
  const expertise = m.proficiencies?.expertise ?? [];
  if (expertise.includes("perception" as AbilityKey)) bonus += pb * 2;
  else if (skills.includes("perception" as AbilityKey)) bonus += pb;
  return 10 + bonus;
}

/** Average roll of N dice of `die` size (each die ∈ [1,die], avg (die+1)/2). */
export function diceAverage(count: number, die: number): number {
  return Math.floor((count * (die + 1)) / 2);
}

export interface SpeedEntry {
  label: string;
  ft: number | string;
}

export const SPEED_LABELS = ["walk", "burrow", "climb", "fly", "swim"];

export function speedList(m: Monster): SpeedEntry[] {
  const arr = m.stats?.speed ?? [];
  const out: SpeedEntry[] = [];
  for (let i = 0; i < SPEED_LABELS.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    const num = typeof v === "string" ? Number(v) : v;
    if (i === 0) {
      out.push({ label: SPEED_LABELS[i], ft: num });
    } else if (num > 0) {
      out.push({ label: SPEED_LABELS[i], ft: num });
    }
  }
  return out;
}

export const SENSE_LABELS = ["blindsight", "darkvision", "tremorsense", "truesight", "telepathy"];

/** Non-telepathy senses (rendered in Senses line). */
export function senseList(m: Monster): SpeedEntry[] {
  const arr = m.proficiencies?.senses ?? [];
  const out: SpeedEntry[] = [];
  for (let i = 0; i < 4; i++) {
    const v = arr[i];
    if (v == null) continue;
    const num = typeof v === "string" ? Number(v) : v;
    if (num > 0) out.push({ label: SENSE_LABELS[i], ft: num });
  }
  return out;
}

export function telepathyFt(m: Monster): number | null {
  const v = m.proficiencies?.senses?.[4];
  if (v == null) return null;
  const num = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function displayName(m: Monster): string {
  return (m.shortened_name && m.shortened_name.trim()) || m.name || "the monster";
}

export function pluralName(m: Monster): string {
  return (m.shortened_plural && m.shortened_plural.trim()) || m.name || "the monsters";
}