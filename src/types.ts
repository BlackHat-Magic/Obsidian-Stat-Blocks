export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface LanguageEntry {
  name: string;
  status: "speaks" | "understands";
  but?: string;
}

export interface ActionItem {
  name: string;
  preset?: string;
  description?: string;
  uses?: number;
  interval?: string;
  recharge_min?: number;
  recharge_max?: number;
  cost?: number | string;
  initiative?: number | string;
  trigger?: string;
  // attack preset
  reach?: number | null;
  short_range?: number | null;
  long_range?: number | null;
  ability?: AbilityKey | null;
  die_count?: number;
  die_size?: number;
  damage_type?: string;

  // spellcasting preset
  level?: number;
  class?: string;
  spells?: unknown;

  // save preset
  dc_ability?: AbilityKey;
  save?: AbilityKey;
  dice?: string;
  damage_type_save?: string;
  area?: string;
  targets?: string;
}

export interface Basics {
  size?: string;
  type?: string;
  tag?: string;
  alignment?: string;
  flavor?: string;
}

export interface Stats {
  base_ac?: number;
  add_dex?: boolean;
  max_dex?: number;
  armor?: string;
  hit_dice?: number;
  speed?: number[];
  ability_scores?: number[];
}

export interface Proficiencies {
  saves?: AbilityKey[];
  skills?: AbilityKey[];
  expertise?: AbilityKey[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: string[];
  senses?: Array<number | string>;
  challenge?: number | string;
}

export interface Monster {
  name?: string;
  shortened_name?: string;
  shortened_plural?: string;
  proper_noun?: boolean;

  is_legendary?: boolean;
  legendary_description?: string;
  is_villain?: boolean;
  villain_description?: string;
  is_mythic?: boolean;
  mythic_description?: string;

  basics?: Basics;
  stats?: Stats;
  proficiencies?: Proficiencies;

  language?: LanguageEntry[];

  ability?: ActionItem[];
  action?: ActionItem[];
  bonus_action?: ActionItem[];
  reaction?: ActionItem[];
  legendary_action?: ActionItem[];
  villain_action?: ActionItem[];
  mythic_action?: ActionItem[];
}
