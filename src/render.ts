import { App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import { TomlError, parse } from "smol-toml";
import type { ActionItem, AbilityKey, LanguageEntry, Monster } from "./types";
import {
  ABILITY_KEYS,
  abilityMods,
  abilityScores,
  armorClass,
  crLabel,
  displayName,
  hitPoints,
  passivePerception,
  proficiencyFromMonster,
  senseList,
  signed,
  skillAbility,
  skillDisplayName,
  speedList,
  telepathyFt,
  xpForCR,
} from "./calc";
import { finalizeDescription, itemSuffix, presetDescription } from "./presets";
import { substitute } from "./template";

const EMPTY: ActionItem[] = [];

/** Smart-join a list of damage/condition entries; entries containing commas
 *  are separated with "; " instead of ", ". */
function joinList(items: string[] | undefined | null): string {
  if (!items || items.length === 0) return "";
  const out: string[] = [];
  for (const item of items) {
    const s = String(item).trim();
    if (s === "") continue;
    if (out.length === 0) out.push(s);
    else if (/,/.test(s)) out.push(`; ${s}`);
    else out.push(`, ${s}`);
  }
  return out.join("");
}

function langLine(langs: LanguageEntry[] | undefined, telepathy: number | null): string {
  const parts: string[] = [];
  for (const l of langs ?? []) {
    const name = (l.name ?? "").trim();
    if (!name) continue;
    if (l.status === "understands") {
      const but = (l.but ?? "").trim();
      parts.push(but ? `understands ${name} but ${but}` : `understands ${name}`);
    } else {
      parts.push(name);
    }
  }
  if (telepathy != null) parts.push(`telepathy ${telepathy} ft.`);
  return parts.join(", ");
}

function signedAbilities(m: Monster): Record<AbilityKey, string> {
  const mods = abilityMods(m);
  return {
    str: signed(mods.str),
    dex: signed(mods.dex),
    con: signed(mods.con),
    int: signed(mods.int),
    wis: signed(mods.wis),
    cha: signed(mods.cha),
  };
}

function xpString(m: Monster): string {
  const xp = xpForCR(m.proficiencies?.challenge);
  return xp.toLocaleString("en-US");
}

function ensureArr<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : EMPTY as unknown as T[];
}

class StatBlockRenderer {
  private app: App;
  private el: HTMLElement;
  private sourcePath: string;
  private component: Component;
  private monster: Monster;

  constructor(app: App, el: HTMLElement, sourcePath: string, component: Component, monster: Monster) {
    this.app = app;
    this.el = el;
    this.sourcePath = sourcePath;
    this.component = component;
    this.monster = monster;
  }

  private renderMd(target: HTMLElement, md: string): void {
    MarkdownRenderer.render(this.app, md, target, this.sourcePath, this.component);
  }

  private divider(parent: HTMLElement, cls = "stat-block__divider"): HTMLHRElement {
    return parent.createEl("hr", { cls });
  }

  // AC / HP / speed rows are emitted directly via MarkdownRenderer.render,
  // so no generic label-bearing row helper is required.

  render(): void {
    const m = this.monster;
    let el = this.el.createEl("div", { cls: "stat-block" });

    // Name
    const name = (m.name ?? "Monster").trim();
    el.createEl("h2", { cls: "stat-block__name", text: name });

    // Meta: size type (tag), alignment
    const b = m.basics ?? {};
    const typeStr = [b.type, b.tag ? `(${b.tag})` : ""].filter(Boolean).join(" ");
    const creatureType = [b.size, typeStr].filter(Boolean).join(" ");
    const metaParts = [creatureType, b.alignment].filter(Boolean).join(", ");
    if (metaParts) {
      const meta = el.createEl("p", { cls: "stat-block__meta" });
      this.renderMd(meta, `*${metaParts}*`);
    }

    // Flavor
    if (b.flavor && b.flavor.trim()) {
      const f = el.createEl("p", { cls: "stat-block__flavor" });
      this.renderMd(f, `*${b.flavor.trim()}*`);
    }

    this.divider(el);

    // AC
    const ac = armorClass(m);
    let acText = `**Armor Class** ${ac}`;
    if (m.stats?.armor && m.stats.armor.trim()) acText += ` (${m.stats.armor.trim()})`;
    const acEl = el.createEl("p", { cls: "stat-block__field" });
    this.renderMd(acEl, acText);

    // HP
    const { hp, formula } = hitPoints(m);
    const hpEl = el.createEl("p", { cls: "stat-block__field" });
    this.renderMd(hpEl, `**Hit Points** ${hp} (${formula})`);

    // Speed
    const speeds = speedList(m);
    const speedStr = speeds.map((s) => (s.label === "walk" ? `${s.ft} ft.` : `${s.label} ${s.ft} ft.`)).join(", ");
    const spEl = el.createEl("p", { cls: "stat-block__field" });
    this.renderMd(spEl, `**Speed** ${speedStr}`);

    this.divider(el);

    // Ability table
    const scores = abilityScores(m);
    const modStr = signedAbilities(m);
    const table = el.createEl("table", { cls: "stat-block__abilities" });
    const thead = table.createEl("thead").createEl("tr");
    const tbody = table.createEl("tbody").createEl("tr");
    for (const k of ABILITY_KEYS) {
      thead.createEl("th", { text: k.toUpperCase() });
      const td = tbody.createEl("td");
      td.createEl("span", { cls: "stat-block__ability-score", text: String(scores[k]) });
      td.createEl("span", { cls: "stat-block__ability-mod", text: ` (${modStr[k]})` });
    }

    this.divider(el);

    // Saving Throws
    const saves = m.proficiencies?.saves ?? [];
    const pb = proficiencyFromMonster(m);
    const mods = abilityMods(m);
    if (saves.length > 0) {
      const ordered = ABILITY_KEYS.filter((k) => saves.includes(k));
      const list = ordered.map((k) => `${k.toUpperCase()} ${signed(mods[k] + pb)}`).join(", ");
      const svEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(svEl, `**Saving Throws** ${list}`);
    }

    // Skills
    const skills = m.proficiencies?.skills ?? [];
    const expertise = m.proficiencies?.expertise ?? [];
    if (skills.length > 0 || expertise.length > 0) {
      const seen = new Set<string>();
      const lines: string[] = [];
      for (const s of [...skills, ...expertise]) {
        const key = String(s).toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        const ab = skillAbility(key);
        const isExp = expertise.includes(s as AbilityKey);
        const bonus = mods[ab] + (isExp ? pb * 2 : pb);
        lines.push(`${skillDisplayName(key)} ${signed(bonus)}${isExp ? " (expertise)" : ""}`);
      }
      const skEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(skEl, `**Skills** ${lines.join(", ")}`);
    }

    const dr = joinList(m.proficiencies?.damage_resistances);
    if (dr) {
      const dEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Damage Resistances** ${dr}`);
    }
    const di = joinList(m.proficiencies?.damage_immunities);
    if (di) {
      const dEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Damage Immunities** ${di}`);
    }
    const ci = joinList(m.proficiencies?.condition_immunities);
    if (ci) {
      const dEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Condition Immunities** ${ci}`);
    }

    // Senses
    const senses = senseList(m);
    const senseParts = senses.map((s) => `${s.label} ${s.ft} ft.`);
    senseParts.push(`passive Perception ${passivePerception(m)}`);
    const sEl = el.createEl("p", { cls: "stat-block__field" });
    this.renderMd(sEl, `**Senses** ${senseParts.join(", ")}`);

    // Languages
    const langsLine = langLine(m.language, telepathyFt(m));
    if (langsLine) {
      const lEl = el.createEl("p", { cls: "stat-block__field" });
      this.renderMd(lEl, `**Languages** ${langsLine}`);
    }

    // Challenge + Proficiency Bonus
    const cr = crLabel(m.proficiencies?.challenge);
    const xp = xpString(m);
    const chEl = el.createEl("p", { cls: "stat-block__field stat-block__challenge" });
    chEl.createEl("span", {
      text: `Challenge ${cr} (${xp} XP)`,
    });
    const pbSpan = chEl.createEl("span", { cls: "stat-block__prof-bonus" });
    pbSpan.createEl("strong", { text: "Proficiency Bonus " });
    pbSpan.append(`${signed(pb)}`);

    this.divider(el);

    // Sections. Traits have no header in the standard 5e layout.
    this.renderSection(el, "", ensureArr(m.ability));
    this.renderSection(el, "Actions", ensureArr(m.action));
    this.renderSection(el, "Bonus Actions", ensureArr(m.bonus_action));
    this.renderSection(el, "Reactions", ensureArr(m.reaction));

    if (ensureArr(m.legendary_action).length > 0) {
      this.renderSection(el, "Legendary Actions", ensureArr(m.legendary_action), {
        intro: substitute(m.legendary_description || this.legendaryIntro(), this.monster),
      });
    }
    if (ensureArr(m.villain_action).length > 0) {
      this.renderSection(el, "Villain Actions", ensureArr(m.villain_action), {
        intro: substitute(m.villain_description || this.defaultVillainIntro(), this.monster),
      });
    }
    if (m.is_mythic && (m.is_legendary || m.is_villain) && ensureArr(m.mythic_action).length > 0) {
      this.renderSection(el, "Mythic Actions", ensureArr(m.mythic_action), {
        intro: substitute(m.mythic_description || this.defaultMythicIntro(), this.monster),
      });
    }
  }

  private legendaryIntro(): string {
    const n = displayName(this.monster);
    return `${n} can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. ${n} regains spent legendary actions at the start of its turn.`;
  }

  private defaultVillainIntro(): string {
    return (
      `${displayName(this.monster)} uses villain actions in place of legendary actions. ` +
      "A villain action can only be taken on the villain's initiative count or as a reaction " +
      "to a trigger listed in the action. Each villain action can be used once per encounter."
    );
  }

  private defaultMythicIntro(): string {
    const n = displayName(this.monster);
    return (
      `When ${n} drops to 0 hit points, it can choose to undergo a mythic transformation instead ` +
      `of dying, reclaiming vitality. ${n} regains hit points equal to its hit point maximum, ` +
      "and gains the following mythic actions."
    );
  }

  private renderSection(
    parent: HTMLElement,
    title: string,
    items: ActionItem[],
    opts: { intro?: string } = {},
  ): void {
    if (!items || items.length === 0) return;
    if (title) parent.createEl("h3", { cls: "stat-block__section", text: title });
    if (opts.intro) {
      const ip = parent.createEl("p", { cls: "stat-block__section-intro" });
      this.renderMd(ip, opts.intro);
    }
    for (const item of items) {
      this.renderItem(parent, item);
    }
  }

  private renderItem(parent: HTMLElement, item: ActionItem): void {
    let name = (item.name ?? "").trim();
    let description = (item.description ?? "").trim();

    const preset = (item.preset ?? "").trim().toLowerCase();
    if (preset !== "" && preset !== "none") {
      const synth = presetDescription(item, this.monster);
      if (synth != null) description = synth;
      if (preset === "legendary_resistance" && !name) name = "Legendary Resistance";
    }
    name = (name + itemSuffix(item)).trim();
    if (name && !/[.!?:]$/.test(name)) name = `${name}.`;
    description = finalizeDescription(description, this.monster);

    // Render the whole trait as a single markdown paragraph so the bold/italic
    // name and the description share one <p> (same line, wrapping naturally)
    // and any markdown formatting in both still resolves.
    const md = name ? `***${name}*** ${description}` : description;
    const p = parent.createEl("p", { cls: "stat-block__trait" });
    this.renderMd(p, md);
  }
}

/** Render a stat block from raw TOML source into `el`, using `component` for
 *  the lifecycle of markdown sub-renders (links, etc.). Shared by the
 *  Reading-view code block processor and the Live Preview editor widget. */
export function renderStatBlockInto(
  app: App,
  el: HTMLElement,
  source: string,
  sourcePath: string,
  component: Component,
): void {
  el.empty();
  el.addClass("stat-block-container");
  try {
    const data = parse(source) as unknown as Monster;
    if (!data || typeof data !== "object") {
      throw new Error("Monster TOML is empty or not an object.");
    }
    const renderer = new StatBlockRenderer(app, el, sourcePath, component, data);
    renderer.render();
  } catch (err) {
    const box = el.createEl("div", { cls: "stat-block-error" });
    box.createEl("strong", { text: "Stat Blocks: could not parse monster TOML" });
    const msg = err instanceof TomlError ? err.message : err instanceof Error ? err.message : String(err);
    box.createEl("pre", { text: msg });
  }
}

/** Reading-view entry point used by registerMarkdownCodeBlockProcessor. */
export function renderStatBlock(
  app: App,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  source: string,
): void {
  const child = new MarkdownRenderChild(el);
  ctx.addChild(child);
  renderStatBlockInto(app, el, source, ctx.sourcePath, child);
}
