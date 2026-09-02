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
  traits?: boolean;
}

interface SectionUnit {
  sectionIndex: number;
  itemIndex: number | null;
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
function sectionUnits(sections: RenderSection[]): SectionUnit[] {
  const units: SectionUnit[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    if (section.items.length === 0) {
      units.push({ sectionIndex, itemIndex: null });
      continue;
    }
    section.items.forEach((_, itemIndex) => units.push({ sectionIndex, itemIndex }));
  }
  return units;
}

function sectionsAtBoundary(sections: RenderSection[], units: SectionUnit[], split: number): [RenderSection[], RenderSection[]] {
  return [fragmentSections(sections, units.slice(0, split)), fragmentSections(sections, units.slice(split))];
}

function sectionCandidates(sections: RenderSection[]): Array<[RenderSection[], RenderSection[]]> {
  const units = sectionUnits(sections);
  if (units.length <= 1) return [[sections, []]];
  return Array.from({ length: units.length - 1 }, (_, index) => sectionsAtBoundary(sections, units, index + 1));
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
  private pendingMarkdownRenders: Array<Promise<void>> = [];

  constructor(app: App, el: HTMLElement, sourcePath: string, component: Component, monster: Monster) {
    this.app = app;
    this.el = el;
    this.sourcePath = sourcePath;
    this.component = component;
    this.monster = monster;
  }

  private renderMd(target: HTMLElement, md: string): Promise<void> {
    const render = Promise.resolve(MarkdownRenderer.render(this.app, md, target, this.sourcePath, this.component))
      .catch((error) => {
        console.error("Stat Blocks: failed to render Markdown", error);
      });
    this.pendingMarkdownRenders.push(render);
    return render;
  }

  private divider(parent: HTMLElement, cls = "stat-block__rule"): HTMLDivElement {
    return parent.createEl("div", { cls });
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
      const meta = header.createEl("div", { cls: "stat-block__meta" });
      this.renderMd(meta, `*${metaParts}*`);
    }

    // Flavor
    if (b.flavor && b.flavor.trim()) {
      const f = header.createEl("div", { cls: "stat-block__flavor" });
      this.renderMd(f, `*${b.flavor.trim()}*`);
    }

    this.divider(prelude);

    // Core statistics stay together above the ability table.
    const core = prelude.createEl("section", { cls: "stat-block__core", attr: { "aria-label": "Core statistics" } });

    // AC
    const ac = armorClass(m);
    let acText = `**Armor Class** ${ac}`;
    if (m.stats?.armor && m.stats.armor.trim()) acText += ` (${m.stats.armor.trim()})`;
    const acEl = core.createEl("div", { cls: "preview-field" });
    this.renderMd(acEl, acText);

    // HP
    const { hp, formula } = hitPoints(m);
    const hpEl = core.createEl("div", { cls: "preview-field" });
    this.renderMd(hpEl, `**Hit Points** ${hp} (${formula})`);

    // Speed
    const speeds = speedList(m);
    const speedStr = speeds.map((s) => (s.label === "walk" ? `${s.ft} ft.` : `${s.label} ${s.ft} ft.`)).join(", ");
    const spEl = core.createEl("div", { cls: "preview-field" });
    this.renderMd(spEl, `**Speed** ${speedStr}`);

    this.divider(prelude);

    // Ability table
    const scores = abilityScores(m);
    const modStr = signedAbilities(m);
    const abilitiesScroll = prelude.createEl("div", { cls: "preview-abilities__scroll" });
    const table = abilitiesScroll.createEl("table", { cls: "stat-block__abilities preview-abilities__table", attr: { "aria-label": "Ability scores" } });
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
      const svEl = fields.createEl("div", { cls: "preview-field" });
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
      const skEl = fields.createEl("div", { cls: "preview-field" });
      this.renderMd(skEl, `**Skills** ${lines.join(", ")}`);
    }

    const dr = joinList(m.proficiencies?.damage_resistances);
    if (dr) {
      const dEl = fields.createEl("div", { cls: "preview-field" });
      this.renderMd(dEl, `**Damage Resistances** ${dr}`);
    }
    const di = joinList(m.proficiencies?.damage_immunities);
    if (di) {
      const dEl = fields.createEl("div", { cls: "preview-field" });
      this.renderMd(dEl, `**Damage Immunities** ${di}`);
    }
    const ci = joinList(m.proficiencies?.condition_immunities);
    if (ci) {
      const dEl = fields.createEl("div", { cls: "preview-field" });
      this.renderMd(dEl, `**Condition Immunities** ${ci}`);
    }

    // Senses
    const senses = senseList(m);
    const senseParts = senses.map((s) => `${s.label} ${s.ft} ft.`);
    senseParts.push(`passive Perception ${passivePerception(m)}`);
    const sEl = fields.createEl("div", { cls: "preview-field" });
    this.renderMd(sEl, `**Senses** ${senseParts.join(", ")}`);

    // Languages
    const langsLine = langLine(m.language, telepathyFt(m));
    if (langsLine) {
      const lEl = fields.createEl("div", { cls: "preview-field" });
      this.renderMd(lEl, `**Languages** ${langsLine}`);
    }

    // Challenge + Proficiency Bonus
    const cr = crLabel(m.proficiencies?.challenge);
    const xp = xpString(m);
    const chEl = prelude.createEl("div", { cls: "stat-block__challenge" });
    chEl.createEl("span", {
      text: `Challenge ${cr} (${xp} XP)`,
    });
    const pbSpan = chEl.createEl("span", { cls: "stat-block__prof-bonus" });
    pbSpan.createEl("strong", { text: "Proficiency Bonus " });
    pbSpan.append(`${signed(pb)}`);

    this.divider(prelude, "stat-block__rule stat-block__rule--thin");

    // Sections. Traits have no header in the standard 5e layout.
    const sections = this.sections();
    if (twoColumn && leftPanel && rightPanel) {
      const leftSections = leftPanel.createEl("div", { cls: "stat-block__sections" });
      const rightSections = rightPanel.createEl("div", { cls: "stat-block__sections" });
      const candidates = sectionCandidates(sections);
      const [initialLeft, initialRight] = candidates[0] ?? [sections, []];
      void Promise.allSettled(this.pendingMarkdownRenders)
        .then(() => this.renderSectionList(leftSections, initialLeft))
        .then(() => this.renderSectionList(rightSections, initialRight))
        .then(() => this.scheduleMeasuredBalance(el, leftSections, rightSections, candidates));
    } else {
      void this.renderSectionList(el, sections);
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
      { title: "", items: ensureArr(this.monster.ability), traits: true },
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

  private async renderSectionList(parent: HTMLElement, sections: RenderSection[]): Promise<void> {
    parent.empty();
    for (const section of sections) await this.renderSection(parent, section);
  }

  /**
   * Measure every legal item boundary in the real rendered panels. Text length
   * is not a useful proxy here: fonts, Markdown, wrapping, and theme CSS all
   * change the actual height. The final candidate is the one with the
   * smallest measured height difference.
   */
  private scheduleMeasuredBalance(
    statBlock: HTMLElement,
    leftSections: HTMLElement,
    rightSections: HTMLElement,
    candidates: Array<[RenderSection[], RenderSection[]]>,
  ): void {
    if (candidates.length <= 1 || typeof window.requestAnimationFrame !== "function") {
      statBlock.setAttr("data-stat-block-layout", "measured");
      return;
    }

    let measuring = false;
    let pendingInvalidation = false;
    let suppressResizeInvalidation = false;
    let measurementFrame: number | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;

    const cancelMeasurement = (): void => {
      generation += 1;
      if (measurementFrame !== null) window.cancelAnimationFrame(measurementFrame);
      measurementFrame = null;
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = null;
      measuring = false;
      pendingInvalidation = false;
      suppressResizeInvalidation = false;
    };

    const waitForFrame = (): Promise<void> => new Promise((resolve) => {
      measurementFrame = window.requestAnimationFrame(() => {
        measurementFrame = null;
        resolve();
      });
    });

    const finishMeasurement = (currentGeneration: number, differences: number[]): void => {
      if (currentGeneration !== generation || statBlock.getBoundingClientRect().width <= 0) return;
      const bestIndex = differences.reduce(
        (best, difference, index) => difference < differences[best] ? index : best,
        0,
      );
      const [bestLeft, bestRight] = candidates[bestIndex];
      void Promise.all([
        this.renderSectionList(leftSections, bestLeft),
        this.renderSectionList(rightSections, bestRight),
      ]).then(() => {
        if (currentGeneration !== generation || statBlock.getBoundingClientRect().width <= 0) return;
        statBlock.setAttr("data-stat-block-layout", "measured");
        measuring = false;
        suppressResizeInvalidation = true;
        releaseTimer = setTimeout(() => {
          suppressResizeInvalidation = false;
          releaseTimer = null;
          if (pendingInvalidation) {
            pendingInvalidation = false;
            beginMeasurement();
          }
        }, 0);
      });
    };

    const beginMeasurement = (): void => {
      if (measuring) return;
      if (measurementFrame !== null) window.cancelAnimationFrame(measurementFrame);
      measurementFrame = null;
      measuring = true;
      pendingInvalidation = false;
      const currentGeneration = ++generation;

      const sweepCandidates = async (): Promise<number[] | null> => {
        await waitForFrame();
        while (currentGeneration === generation && statBlock.getBoundingClientRect().width <= 0) {
          await waitForFrame();
        }
        if (currentGeneration !== generation) return null;

        const differences: number[] = [];
        for (const [candidateLeft, candidateRight] of candidates) {
          if (currentGeneration !== generation) return null;
          const candidate = statBlock.cloneNode(true) as HTMLElement;
          candidate.style.position = "fixed";
          candidate.style.left = "-100000px";
          candidate.style.top = "0";
          candidate.style.visibility = "hidden";
          candidate.style.pointerEvents = "none";
          candidate.style.width = `${statBlock.getBoundingClientRect().width}px`;
          candidate.style.margin = "0";
          document.body.appendChild(candidate);
          try {
            const candidateLeftSections = candidate.querySelector<HTMLElement>(".stat-block__panel--left > .stat-block__sections");
            const candidateRightSections = candidate.querySelector<HTMLElement>(".stat-block__panel--right > .stat-block__sections");
            if (!candidateLeftSections || !candidateRightSections) return null;
            await Promise.all([
              this.renderSectionList(candidateLeftSections, candidateLeft),
              this.renderSectionList(candidateRightSections, candidateRight),
            ]);
            if (currentGeneration !== generation) return null;
            await waitForFrame();
            if (currentGeneration !== generation) return null;
            const candidateLeftPanel = candidate.querySelector<HTMLElement>(".stat-block__panel--left");
            const candidateRightPanel = candidate.querySelector<HTMLElement>(".stat-block__panel--right");
            if (!candidateLeftPanel || !candidateRightPanel) return null;
            differences.push(Math.abs(
              candidateLeftPanel.getBoundingClientRect().height - candidateRightPanel.getBoundingClientRect().height,
            ));
          } finally {
            candidate.remove();
          }
        }
        return differences;
      };

      void sweepCandidates().then((differences) => {
        if (differences === null || currentGeneration !== generation) return;
        finishMeasurement(currentGeneration, differences);
      }).catch((error) => {
        if (currentGeneration !== generation) return;
        measuring = false;
        console.error("Stat Blocks: failed to measure two-column layout", error);
      });
    };

    const invalidateFromResize = (): void => {
      if (statBlock.getBoundingClientRect().width <= 0 || suppressResizeInvalidation || measuring || measurementFrame !== null) return;
      beginMeasurement();
    };

    const invalidateFromExternalChange = (): void => {
      if (statBlock.getBoundingClientRect().width <= 0 || suppressResizeInvalidation) return;
      if (measuring || measurementFrame !== null) {
        pendingInvalidation = true;
        return;
      }
      beginMeasurement();
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(invalidateFromResize) : undefined;
    resizeObserver?.observe(statBlock);
    resizeObserver?.observe(leftSections);
    resizeObserver?.observe(rightSections);
    window.addEventListener("resize", invalidateFromExternalChange);
    const fontSet = document.fonts;
    fontSet?.addEventListener("loadingdone", invalidateFromExternalChange);
    statBlock.addEventListener("load", invalidateFromExternalChange, true);

    this.component.register(() => {
      cancelMeasurement();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", invalidateFromExternalChange);
      fontSet?.removeEventListener("loadingdone", invalidateFromExternalChange);
      statBlock.removeEventListener("load", invalidateFromExternalChange, true);
    });

    beginMeasurement();
  }

  private async renderSection(parent: HTMLElement, section: RenderSection): Promise<void> {
    const sectionEl = parent.createEl("section", {
      cls: section.traits ? "preview-section preview-section--traits" : "preview-section",
    });
    if (section.title) sectionEl.createEl("h3", { text: section.title });
    if (section.intro) {
      const intro = sectionEl.createEl("div", { cls: "preview-section__intro" });
      await this.renderMd(intro, section.intro);
    }
    const items = sectionEl.createEl("div", { cls: "preview-section__items" });
    for (const item of section.items) await this.renderItem(items, item);
  }

  private async renderItem(parent: HTMLElement, item: ActionItem): Promise<void> {
    // Match the web app's action wrapper: MarkdownRenderer supplies the inner
    // paragraph while the wrapper controls the action typography and spacing.
    const action = parent.createEl("div", { cls: "preview-action" });
    await this.renderMd(action, itemMarkdown(item, this.monster));
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
