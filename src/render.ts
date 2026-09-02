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

interface RenderSection {
  title: string;
  items: ActionItem[];
  intro?: string;
}

interface SectionUnit {
  sectionIndex: number;
  itemIndex: number | null;
  weight: number;
}

function estimatedTextWeight(value: string | undefined): number {
  if (!value) return 0;
  const lines = value.split(/\r?\n/).reduce((total, line) => {
    const length = line.trim().length;
    return total + (length === 0 ? 0.5 : Math.max(1, Math.ceil(length / 56)));
  }, 0);
  return Math.max(1, lines);
}

function itemMarkdown(item: ActionItem, monster: Monster): string {
  let name = (item.name ?? "").trim();
  let description = (item.description ?? "").trim();
  const preset = (item.preset ?? "").trim().toLowerCase();
  if (preset !== "" && preset !== "none") {
    const generated = presetDescription(item, monster);
    if (generated != null) description = generated;
    if (preset === "legendary_resistance" && !name) name = "Legendary Resistance";
  }
  name = (name + itemSuffix(item)).trim();
  if (name && !/[.!?:]$/.test(name)) name = `${name}.`;
  description = finalizeDescription(description, monster);
  return name ? `***${name}*** ${description}` : description;
}

function sectionWeight(section: RenderSection, monster: Monster): number {
  return (
    1 +
    (section.title ? 1.5 : 0) +
    estimatedTextWeight(section.intro) +
    section.items.reduce((total, item) => total + estimatedTextWeight(itemMarkdown(item, monster)), 0)
  );
}

function preludeWeight(monster: Monster): number {
  const basics = monster.basics ?? {};
  const type = [basics.type, basics.tag ? `(${basics.tag})` : ""].filter(Boolean).join(" ");
  const meta = [basics.size, type, basics.alignment].filter(Boolean).join(", ");
  const flavor = basics.flavor?.trim();
  const stats = monster.stats ?? {};
  const speed = speedList(monster).map((entry) => `${entry.label} ${entry.ft}`).join(", ");
  const fields = [
    monster.name,
    meta,
    flavor,
    `Armor Class ${armorClass(monster)}`,
    `Hit Points ${hitPoints(monster).hp}`,
    `Speed ${speed}`,
    ...(monster.proficiencies?.saves ?? []),
    ...(monster.proficiencies?.skills ?? []),
    ...(monster.proficiencies?.damage_resistances ?? []),
    ...(monster.proficiencies?.damage_immunities ?? []),
    ...(monster.proficiencies?.condition_immunities ?? []),
    ...(monster.proficiencies?.senses ?? []).map(String),
    ...(monster.language ?? []).map((language) => language.name),
    `Challenge ${crLabel(monster.proficiencies?.challenge)}`,
    `Proficiency Bonus ${proficiencyFromMonster(monster)}`,
    String(stats.ability_scores ?? []),
  ];
  return 4 + fields.reduce((total, field) => total + estimatedTextWeight(field), 0);
}

function fragmentSections(sections: RenderSection[], units: SectionUnit[]): RenderSection[] {
  const output: RenderSection[] = [];
  let cursor = 0;
  while (cursor < units.length) {
    const sectionIndex = units[cursor].sectionIndex;
    const section = sections[sectionIndex];
    if (!section) break;
    const firstItem = units[cursor].itemIndex;
    if (firstItem === null) {
      output.push(section);
      cursor += 1;
      continue;
    }
    let end = cursor + 1;
    while (end < units.length && units[end].sectionIndex === sectionIndex) end += 1;
    const lastItem = units[end - 1].itemIndex;
    if (lastItem === null) break;
    output.push({
      ...section,
      title: firstItem === 0 ? section.title : "",
      intro: firstItem === 0 ? section.intro : undefined,
      items: section.items.slice(firstItem, lastItem + 1),
    });
    cursor = end;
  }
  return output;
}

/** Choose a deterministic item boundary for the optional two-panel layout. */
function splitSections(sections: RenderSection[], monster: Monster): [RenderSection[], RenderSection[]] {
  const units: SectionUnit[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    if (section.items.length === 0) {
      units.push({ sectionIndex, itemIndex: null, weight: sectionWeight(section, monster) });
      continue;
    }
    section.items.forEach((item, itemIndex) => {
      const extra = itemIndex === 0 ? 1 + (section.title ? 1.5 : 0) + estimatedTextWeight(section.intro) : 0;
      units.push({ sectionIndex, itemIndex, weight: extra + estimatedTextWeight(itemMarkdown(item, monster)) });
    });
  }
  if (units.length <= 1) return [sections, []];

  const total = preludeWeight(monster) + units.reduce((sum, unit) => sum + unit.weight, 0);
  let left = preludeWeight(monster);
  let split = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < units.length; index += 1) {
    left += units[index - 1].weight;
    const difference = Math.abs(left - (total - left));
    if (difference < smallestDifference) {
      smallestDifference = difference;
      split = index;
    }
  }
  return [fragmentSections(sections, units.slice(0, split)), fragmentSections(sections, units.slice(split))];
}

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
    const twoColumn = m.two_column === true;
    const el = this.el.createEl("div", { cls: "stat-block" });
    if (twoColumn) {
      el.addClass("stat-block--two-column");
      el.setAttr("data-stat-block-layout", "estimated");
    }

    let prelude = el;
    let leftPanel: HTMLElement | null = null;
    let rightPanel: HTMLElement | null = null;
    if (twoColumn) {
      const panels = el.createEl("div", { cls: "stat-block__panels" });
      leftPanel = panels.createEl("div", { cls: "stat-block__panel stat-block__panel--left" });
      rightPanel = panels.createEl("div", { cls: "stat-block__panel stat-block__panel--right" });
      prelude = leftPanel.createEl("div", { cls: "stat-block__prelude" });
    }

    // Header: name, creature type, alignment, and optional flavor.
    const header = prelude.createEl("header", { cls: "stat-block__header" });
    const name = (m.name ?? "Monster").trim();
    header.createEl("h2", { cls: "stat-block__name", text: name });

    // Meta: size type (tag), alignment
    const b = m.basics ?? {};
    const typeStr = [b.type, b.tag ? `(${b.tag})` : ""].filter(Boolean).join(" ");
    const creatureType = [b.size, typeStr].filter(Boolean).join(" ");
    const metaParts = [creatureType, b.alignment].filter(Boolean).join(", ");
    if (metaParts) {
      const meta = header.createEl("p", { cls: "stat-block__meta" });
      this.renderMd(meta, `*${metaParts}*`);
    }

    // Flavor
    if (b.flavor && b.flavor.trim()) {
      const f = header.createEl("p", { cls: "stat-block__flavor" });
      this.renderMd(f, `*${b.flavor.trim()}*`);
    }

    this.divider(prelude);

    // Core statistics stay together above the ability table.
    const core = prelude.createEl("section", { cls: "stat-block__core", attr: { "aria-label": "Core statistics" } });

    // AC
    const ac = armorClass(m);
    let acText = `**Armor Class** ${ac}`;
    if (m.stats?.armor && m.stats.armor.trim()) acText += ` (${m.stats.armor.trim()})`;
    const acEl = core.createEl("p", { cls: "stat-block__field" });
    this.renderMd(acEl, acText);

    // HP
    const { hp, formula } = hitPoints(m);
    const hpEl = core.createEl("p", { cls: "stat-block__field" });
    this.renderMd(hpEl, `**Hit Points** ${hp} (${formula})`);

    // Speed
    const speeds = speedList(m);
    const speedStr = speeds.map((s) => (s.label === "walk" ? `${s.ft} ft.` : `${s.label} ${s.ft} ft.`)).join(", ");
    const spEl = core.createEl("p", { cls: "stat-block__field" });
    this.renderMd(spEl, `**Speed** ${speedStr}`);

    this.divider(prelude);

    // Ability table
    const scores = abilityScores(m);
    const modStr = signedAbilities(m);
    const table = prelude.createEl("table", { cls: "stat-block__abilities" });
    const thead = table.createEl("thead").createEl("tr");
    const tbody = table.createEl("tbody").createEl("tr");
    for (const k of ABILITY_KEYS) {
      thead.createEl("th", { text: k.toUpperCase() });
      const td = tbody.createEl("td");
      td.createEl("span", { cls: "stat-block__ability-score", text: String(scores[k]) });
      td.createEl("span", { cls: "stat-block__ability-mod", text: ` (${modStr[k]})` });
    }

    this.divider(prelude);

    // Additional fields stay with the stat-block prelude in two-column mode.
    const fields = prelude.createEl("section", { cls: "stat-block__fields", attr: { "aria-label": "Additional statistics" } });

    // Saving Throws
    const saves = m.proficiencies?.saves ?? [];
    const pb = proficiencyFromMonster(m);
    const mods = abilityMods(m);
    if (saves.length > 0) {
      const ordered = ABILITY_KEYS.filter((k) => saves.includes(k));
      const list = ordered.map((k) => `${k.toUpperCase()} ${signed(mods[k] + pb)}`).join(", ");
      const svEl = fields.createEl("p", { cls: "stat-block__field" });
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
      const skEl = fields.createEl("p", { cls: "stat-block__field" });
      this.renderMd(skEl, `**Skills** ${lines.join(", ")}`);
    }

    const dr = joinList(m.proficiencies?.damage_resistances);
    if (dr) {
      const dEl = fields.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Damage Resistances** ${dr}`);
    }
    const di = joinList(m.proficiencies?.damage_immunities);
    if (di) {
      const dEl = fields.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Damage Immunities** ${di}`);
    }
    const ci = joinList(m.proficiencies?.condition_immunities);
    if (ci) {
      const dEl = fields.createEl("p", { cls: "stat-block__field" });
      this.renderMd(dEl, `**Condition Immunities** ${ci}`);
    }

    // Senses
    const senses = senseList(m);
    const senseParts = senses.map((s) => `${s.label} ${s.ft} ft.`);
    senseParts.push(`passive Perception ${passivePerception(m)}`);
    const sEl = fields.createEl("p", { cls: "stat-block__field" });
    this.renderMd(sEl, `**Senses** ${senseParts.join(", ")}`);

    // Languages
    const langsLine = langLine(m.language, telepathyFt(m));
    if (langsLine) {
      const lEl = fields.createEl("p", { cls: "stat-block__field" });
      this.renderMd(lEl, `**Languages** ${langsLine}`);
    }

    // Challenge + Proficiency Bonus
    const cr = crLabel(m.proficiencies?.challenge);
    const xp = xpString(m);
    const chEl = prelude.createEl("p", { cls: "stat-block__field stat-block__challenge" });
    chEl.createEl("span", {
      text: `Challenge ${cr} (${xp} XP)`,
    });
    const pbSpan = chEl.createEl("span", { cls: "stat-block__prof-bonus" });
    pbSpan.createEl("strong", { text: "Proficiency Bonus " });
    pbSpan.append(`${signed(pb)}`);

    this.divider(prelude);

    // Sections. Traits have no header in the standard 5e layout.
    const sections = this.sections();
    if (twoColumn && leftPanel && rightPanel) {
      const [leftSections, rightSections] = splitSections(sections, m);
      for (const section of leftSections) this.renderSection(leftPanel, section);
      for (const section of rightSections) this.renderSection(rightPanel, section);
    } else {
      for (const section of sections) this.renderSection(el, section);
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

  private sections(): RenderSection[] {
    const sections: RenderSection[] = [
      { title: "", items: ensureArr(this.monster.ability) },
      { title: "Actions", items: ensureArr(this.monster.action) },
      { title: "Bonus Actions", items: ensureArr(this.monster.bonus_action) },
      { title: "Reactions", items: ensureArr(this.monster.reaction) },
    ];
    if (this.monster.is_legendary && ensureArr(this.monster.legendary_action).length > 0) {
      sections.push({
        title: "Legendary Actions",
        items: ensureArr(this.monster.legendary_action),
        intro: substitute(this.monster.legendary_description || this.legendaryIntro(), this.monster),
      });
    }
    if (this.monster.is_villain && ensureArr(this.monster.villain_action).length > 0) {
      sections.push({
        title: "Villain Actions",
        items: ensureArr(this.monster.villain_action),
        intro: substitute(this.monster.villain_description || this.defaultVillainIntro(), this.monster),
      });
    }
    if (this.monster.is_mythic && (this.monster.is_legendary || this.monster.is_villain) && ensureArr(this.monster.mythic_action).length > 0) {
      sections.push({
        title: "Mythic Actions",
        items: ensureArr(this.monster.mythic_action),
        intro: substitute(this.monster.mythic_description || this.defaultMythicIntro(), this.monster),
      });
    }
    return sections.filter((section) => section.items.length > 0);
  }

  private renderSection(parent: HTMLElement, section: RenderSection): void {
    if (section.title) parent.createEl("h3", { cls: "stat-block__section", text: section.title });
    if (section.intro) {
      const ip = parent.createEl("p", { cls: "stat-block__section-intro" });
      this.renderMd(ip, section.intro);
    }
    for (const item of section.items) this.renderItem(parent, item);
  }

  private renderItem(parent: HTMLElement, item: ActionItem): void {
    // Render the whole trait as a single markdown paragraph so the bold/italic
    // name and the description share one <p> (same line, wrapping naturally)
    // and any markdown formatting in both still resolves.
    const p = parent.createEl("p", { cls: "stat-block__trait" });
    this.renderMd(p, itemMarkdown(item, this.monster));
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
